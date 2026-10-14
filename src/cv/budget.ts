// The spend guard in front of the paid CV reading: a daily USD cap and a per-client rate limit,
// in SQLite so they hold across restarts and processes. Admitting a request reserves its
// worst-case cost against the cap at once, so concurrent requests cannot overshoot it; settling
// replaces the reservation with what the calls cost. The figures are a fuse, not accounting.
// Clients are stored hashed and forgotten after the rate window.

import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const HOUR_MS = 3_600_000;

export interface Limits {
  dailyCapUsd: number;
  perClientPerHour: number;
}

export class SpendRefused extends Error {
  readonly reason: "rate" | "cap";
  /** For a Retry-After header. */
  readonly retryAfterSeconds: number;
  constructor(reason: "rate" | "cap", retryAfterSeconds: number, message: string) {
    super(message);
    this.reason = reason;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** What `admit` reserved, on which UTC day; hand it back to `settle`. */
export interface Ticket {
  day: string;
  usd: number;
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const hash = (client: string) => createHash("sha256").update(client).digest("hex");

export class SpendGuard {
  #db: DatabaseSync;
  #limits: Limits;
  #now: () => number;

  constructor(path: string, limits: Limits, now = () => Date.now()) {
    this.#db = new DatabaseSync(path);
    this.#limits = limits;
    this.#now = now;
    this.#db.exec(`
      PRAGMA busy_timeout = 5000;
      CREATE TABLE IF NOT EXISTS spend (day TEXT PRIMARY KEY, usd REAL NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS admits (client TEXT NOT NULL, at INTEGER NOT NULL) STRICT;
      CREATE INDEX IF NOT EXISTS admits_client_at ON admits (client, at);
    `);
  }

  /** Admits one request of `client` (an IP address, say), or throws SpendRefused. */
  admit(client: string, reserveUsd: number): Ticket {
    const now = this.#now();
    const day = utcDay(now);
    const key = hash(client);
    this.#db.exec("BEGIN IMMEDIATE");
    try {
      this.#db.prepare("DELETE FROM admits WHERE at <= ?").run(now - HOUR_MS);
      const recent = this.#db
        .prepare("SELECT count(*) AS n, min(at) AS first FROM admits WHERE client = ?")
        .get(key) as { n: number; first: number | null };
      if (recent.n >= this.#limits.perClientPerHour) {
        throw new SpendRefused(
          "rate",
          Math.ceil(((recent.first ?? now) + HOUR_MS - now) / 1000),
          `at most ${this.#limits.perClientPerHour} CV readings an hour per client`,
        );
      }
      const spent = this.#spent(day);
      if (spent + reserveUsd > this.#limits.dailyCapUsd) {
        const midnight = Date.parse(`${day}T00:00:00Z`) + 24 * HOUR_MS;
        throw new SpendRefused(
          "cap",
          Math.ceil((midnight - now) / 1000),
          `the daily spend cap of $${this.#limits.dailyCapUsd} is reached`,
        );
      }
      this.#db
        .prepare(
          "INSERT INTO spend (day, usd) VALUES (?, ?) ON CONFLICT (day) DO UPDATE SET usd = usd + excluded.usd",
        )
        .run(day, reserveUsd);
      this.#db.prepare("INSERT INTO admits (client, at) VALUES (?, ?)").run(key, now);
      this.#db.exec("COMMIT");
      return { day, usd: reserveUsd };
    } catch (error) {
      this.#db.exec("ROLLBACK");
      throw error;
    }
  }

  /** Replaces the ticket's reservation with what the request cost; call it whether or not it failed. */
  settle(ticket: Ticket, usd: number): void {
    this.#db
      .prepare("UPDATE spend SET usd = max(0, usd - ? + ?) WHERE day = ?")
      .run(ticket.usd, usd, ticket.day);
  }

  spentToday(): number {
    return this.#spent(utcDay(this.#now()));
  }

  close(): void {
    this.#db.close();
  }

  #spent(day: string): number {
    const row = this.#db.prepare("SELECT usd FROM spend WHERE day = ?").get(day) as
      { usd: number } | undefined;
    return row?.usd ?? 0;
  }
}
