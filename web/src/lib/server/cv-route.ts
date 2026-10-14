// The CV reading route: plain text in, CvResult out. Everything the route needs from the outside
// arrives in `CvRouteDeps`, so the tests run it with a fake model and an in-memory spend guard.
//
// The CV text lives only in this function's locals. The log gets counts, timings, the claims the
// verify gate dropped and the errors, each with its quoted spans cut out, since those quote the
// CV or the model's copy of it. Responses are never cached.

import { SpendGuard, SpendRefused, type Ticket } from "../../../../src/cv/budget.ts";
import { costUsd, CV_RESERVE_USD, type Usage } from "../../../../src/cv/claude.ts";
import type { Mapper } from "../../../../src/cv/mapping.ts";
import { CvInputError, MAX_CV_CHARS, readCv } from "../../../../src/cv/read.ts";
import type { RoleGraph } from "../../../../src/cv/states.ts";
import type { Ask } from "../../../../src/cv/verify.ts";

export interface CvRouteDeps {
  guard: SpendGuard;
  /** The graph and mapper; loaded once per server process, awaited per request. */
  reader: () => Promise<{ graph: RoleGraph; mapper: Mapper }>;
  /** The model for one request; records API usage into `usage`. Throws when none is configured. */
  ask: (usage: Usage[]) => Ask;
  /** YYYY-MM-DD. */
  today: () => string;
  log: (event: Record<string, unknown>) => void;
}

export const MESSAGES = {
  badRequest: "A kérés nem olvasható. Frissítsd az oldalt, és próbáld újra.",
  input: `Az önéletrajz szövege üres vagy túl hosszú (legfeljebb ${MAX_CV_CHARS.toLocaleString("hu-HU")} karakter).`,
  rate: (minutes: number) =>
    `Rövid idő alatt túl sok önéletrajzot olvastál be erről a gépről. Próbáld újra ${minutes} perc múlva.`,
  cap: "A mai napra elfogyott a beolvasásra szánt keret. Próbáld újra holnap.",
  failed: "Az önéletrajz beolvasása most nem sikerült. Próbáld újra egy kicsit később.",
};

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
const fail = (status: number, error: string, headers?: Record<string, string>) =>
  reply(status, { error }, headers);

/**
 * Every quoted span cut out (an unclosed one to the end; a backslash escapes inside one, as in
 * JSON), and the rest cut to a log line's size.
 */
export const scrub = (text: string): string =>
  text.replace(/["“„”](?:\\.|[^"“”\\])*(?:["“”]|$)/gu, '"…"').slice(0, 300);

/** The `text` of a JSON body, or undefined for anything else. */
async function textOf(request: Request): Promise<string | undefined> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return undefined;
  const body: unknown = await request.json().catch(() => undefined);
  const text = (body as { text?: unknown } | null | undefined)?.text;
  return typeof text === "string" ? text : undefined;
}

/** `client` tells one caller from another for the rate limit (an IP address). */
export async function handleCv(
  request: Request,
  client: string,
  deps: CvRouteDeps,
): Promise<Response> {
  const started = performance.now();
  const ms = () => Math.round(performance.now() - started);
  const text = await textOf(request);
  if (text === undefined) {
    deps.log({ event: "cv-refused", status: 400, why: "bad request" });
    return fail(400, MESSAGES.badRequest);
  }

  const usage: Usage[] = [];
  let calls = 0;
  let ticket: Ticket | undefined;
  try {
    const { graph, mapper } = await deps.reader();
    const model = deps.ask(usage);
    const ask: Ask = (prompt) => {
      calls += 1;
      return model(prompt);
    };
    // Admitted only once the model is known to be there, so a misconfigured server costs no one a slot.
    ticket = deps.guard.admit(client, CV_RESERVE_USD);
    const { result, dropped } = await readCv(text, {
      ask,
      graph,
      mapper,
      today: deps.today(),
    });
    for (const line of dropped) deps.log({ event: "cv-dropped", claim: scrub(line) });
    deps.log({
      event: "cv-read",
      status: 200,
      ms: ms(),
      calls,
      usd: costUsd(usage),
      dropped: dropped.length,
      held: result.held.length,
      covered: result.covered.length,
      reachable: result.reachable.length,
    });
    return reply(200, result);
  } catch (error) {
    if (error instanceof SpendRefused) {
      const status = error.reason === "rate" ? 429 : 503;
      deps.log({ event: "cv-refused", status, why: error.reason });
      const message =
        error.reason === "rate"
          ? MESSAGES.rate(Math.ceil(error.retryAfterSeconds / 60))
          : MESSAGES.cap;
      return fail(status, message, { "retry-after": String(error.retryAfterSeconds) });
    }
    if (error instanceof CvInputError) {
      deps.log({ event: "cv-refused", status: 400, why: "input" });
      return fail(400, MESSAGES.input);
    }
    const name = error instanceof Error ? error.name : typeof error;
    const message = error instanceof Error ? scrub(error.message) : "";
    deps.log({ event: "cv-error", status: 500, ms: ms(), calls, error: `${name}: ${message}` });
    return fail(500, MESSAGES.failed);
  } finally {
    // Whatever happened, the reservation becomes what the calls really cost.
    if (ticket) {
      try {
        deps.guard.settle(ticket, costUsd(usage));
      } catch (error) {
        deps.log({ event: "cv-settle-failed", error: scrub(String(error)) });
      }
    }
  }
}
