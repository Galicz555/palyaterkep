import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SpendGuard, SpendRefused } from "../src/cv/budget.ts";

let dir: string;
let clock: number;
const guards: SpendGuard[] = [];
const guard = (limits = { dailyCapUsd: 0.2, perClientPerHour: 100 }) => {
  const g = new SpendGuard(path.join(dir, "spend.db"), limits, () => clock);
  guards.push(g);
  return g;
};
const refusal = (fn: () => unknown): SpendRefused => {
  try {
    fn();
  } catch (error) {
    if (error instanceof SpendRefused) return error;
    throw error;
  }
  throw new Error("not refused");
};

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "spend-"));
  clock = Date.parse("2026-10-14T22:00:00Z");
});
afterEach(() => {
  guards.splice(0).forEach((g) => g.close());
  rmSync(dir, { recursive: true });
});

describe("SpendGuard", () => {
  it("refuses once the reservations reach the daily cap, until the day ends", () => {
    const g = guard();
    g.admit("a", 0.08);
    g.admit("b", 0.08);
    const refused = refusal(() => g.admit("c", 0.08));
    expect(refused.reason).toBe("cap");
    expect(refused.message).toMatch(/daily spend cap of \$0.2 is reached/u);
    expect(refused.retryAfterSeconds).toBe(2 * 3600);
    expect(g.spentToday()).toBeCloseTo(0.16);

    clock = Date.parse("2026-10-15T00:00:00Z");
    expect(g.admit("c", 0.08)).toEqual({ day: "2026-10-15", usd: 0.08 });
  });

  it("frees the unspent reservation on settle", () => {
    const g = guard();
    const tickets = [g.admit("a", 0.08), g.admit("b", 0.08)];
    tickets.forEach((t) => g.settle(t, 0.005));
    expect(g.spentToday()).toBeCloseTo(0.01);
    g.admit("c", 0.08);
  });

  it("settles a ticket on the day it was reserved", () => {
    const g = guard();
    const ticket = g.admit("a", 0.08);
    clock = Date.parse("2026-10-15T01:00:00Z");
    g.admit("b", 0.08);
    g.settle(ticket, 0.01);
    expect(g.spentToday()).toBeCloseTo(0.08);
  });

  it("limits each client per hour, and forgets after the hour", () => {
    const g = guard({ dailyCapUsd: 100, perClientPerHour: 2 });
    g.admit("10.0.0.1", 0.01);
    clock += 60_000;
    g.admit("10.0.0.1", 0.01);
    const refused = refusal(() => g.admit("10.0.0.1", 0.01));
    expect(refused.reason).toBe("rate");
    expect(refused.retryAfterSeconds).toBe(3600 - 60);
    g.admit("10.0.0.2", 0.01);

    clock += 3600_000 - 60_000;
    g.admit("10.0.0.1", 0.01);
  });

  it("does not count a refused request against the client or the cap", () => {
    const g = guard({ dailyCapUsd: 0.1, perClientPerHour: 1 });
    refusal(() => g.admit("a", 0.2));
    expect(g.spentToday()).toBe(0);
    g.admit("a", 0.05);
  });

  it("shares the ledger between guards on one file", () => {
    guard().admit("a", 0.15);
    expect(refusal(() => guard().admit("b", 0.08)).reason).toBe("cap");
  });
});
