import { describe, expect, it } from "vitest";
import { SpendGuard } from "../../src/cv/budget.ts";
import { costUsd, CV_RESERVE_USD, type Usage } from "../../src/cv/claude.ts";
import { MAX_CV_CHARS } from "../../src/cv/read.ts";
import type { Ask, Prompt } from "../../src/cv/verify.ts";
import { graph, mapper } from "../../test/cv-fixture.ts";
import { handleCv, MESSAGES, scrub, type CvRouteDeps } from "../src/lib/server/cv-route.ts";

// Synthetic. The names and the employer must never reach the log.
const CV = `Titkos Teszt Elek

Szenior szoftverfejlesztő, Zöldfülű Zrt.
2018. szeptember – jelenleg
Python-alapú szolgáltatásokat fejlesztettem. Automatizált teszteket írtam.`;
const SECRETS = ["Titkos", "Teszt Elek", "Zöldfülű", "Python-alapú", "Automatizált teszteket"];

/** The id a listing line gives a label: "  o3: software developer / …" → "o3". */
const idOf = (prompt: Prompt, label: string) => {
  const match = new RegExp(`^\\s*(\\w+): ${label} /`, "mu").exec(prompt.user);
  if (!match) throw new Error(`${label} is not offered`);
  return match[1]!;
};

// One real job and one real skill, plus claims the verify gate drops. The fabricated quotes are
// built from the CV's own words, as a model's near-misses are.
const extraction = {
  jobs: [
    {
      title: "Szenior szoftverfejlesztő",
      occupation: "software developer",
      dates: "2018. szeptember – jelenleg",
      years: 8,
      responsibility: null,
    },
    {
      title: "Vezető fejlesztő, Zöldfülű Zrt. Titkos Teszt Elek",
      occupation: "software developer",
      dates: null,
      years: null,
      responsibility: null,
    },
  ],
  skills: [{ name: "Python", quote: "Python-alapú szolgáltatásokat" }],
};

/** What the model answers, step by step; each call costs 1000 input and 500 output tokens. */
const answer = (prompt: Prompt): unknown => {
  switch (prompt.name) {
    case "extract":
      return extraction;
    case "occupations":
      return { jobs: [{ job: 0, occupation: idOf(prompt, "software developer") }] };
    case "skills":
      return {
        skills: [
          { id: idOf(prompt, "Python \\(computer programming\\)"), quote: "Python-alapú" },
          { id: idOf(prompt, "execute software tests"), quote: "Automatizált teszteket Zöldfülű" },
        ],
      };
    default:
      throw new Error(`unexpected step ${prompt.name}`);
  }
};

interface Setup {
  perClientPerHour?: number;
  dailyCapUsd?: number;
  model?: (prompt: Prompt) => unknown;
  /** Replaces the whole model lookup, to make it fail before any call. */
  ask?: CvRouteDeps["ask"];
}

function route({ perClientPerHour = 100, dailyCapUsd = 10, model = answer, ask }: Setup = {}) {
  const guard = new SpendGuard(":memory:", { dailyCapUsd, perClientPerHour });
  const usage: Usage[] = [];
  const log: Record<string, unknown>[] = [];
  const deps: CvRouteDeps = {
    guard,
    reader: async () => ({ graph, mapper }),
    ask:
      ask ??
      ((spent) => {
        const record: Ask = async (prompt) => {
          const next = { input: 1000, output: 500 };
          spent.push(next);
          usage.push(next);
          return model(prompt);
        };
        return record;
      }),
    today: () => "2026-10-14",
    log: (event) => log.push(event),
  };
  const post = (body: unknown, client = "10.0.0.1", contentType = "application/json") =>
    handleCv(
      new Request("http://localhost/api/cv", {
        method: "POST",
        headers: { "content-type": contentType },
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
      client,
      deps,
    );
  return { post, guard, usage, log };
}

const json = async (response: Response) => (await response.json()) as Record<string, unknown>;

describe("POST /api/cv", () => {
  it("answers 200 with the result, settles the real cost and logs counts only", async () => {
    const { post, guard, usage, log } = route();
    const response = await post({ text: CV });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const result = await json(response);
    expect(result["held"]).toEqual([
      { role: "dev", evidence: ["Szenior szoftverfejlesztő", "2018. szeptember – jelenleg"] },
    ]);
    expect(result["skills"]).toEqual([
      { uri: expect.stringContaining("python"), evidence: ["Python-alapú"] },
    ]);
    expect(usage.length).toBeGreaterThanOrEqual(3);
    expect(guard.spentToday()).toBeCloseTo(costUsd(usage), 9);
    expect(guard.spentToday()).toBeLessThan(CV_RESERVE_USD);
    expect(log.at(-1)).toMatchObject({
      event: "cv-read",
      status: 200,
      calls: usage.length,
      held: 1,
      covered: 0,
    });
  });

  it.each([
    ["empty text", { text: "  \n " }, "application/json"],
    ["text over the limit", { text: "a".repeat(MAX_CV_CHARS + 1) }, "application/json"],
  ])("answers 400 for %s, and charges nothing", async (_, body, type) => {
    const { post, guard, usage } = route();
    const response = await post(body, "10.0.0.1", type);
    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({ error: MESSAGES.input });
    expect(usage).toEqual([]);
    expect(guard.spentToday()).toBe(0);
  });

  it.each([
    ["no text field", { cv: "x" }, "application/json"],
    ["a text that is not a string", { text: 5 }, "application/json"],
    ["a body that is not JSON", "not json", "application/json"],
    ["a body that is not declared as JSON", '{"text":"x"}', "text/plain"],
  ])("answers 400 for %s without admitting the request", async (_, body, type) => {
    const { post, guard } = route({ perClientPerHour: 1 });
    expect((await post(body, "10.0.0.1", type)).status).toBe(400);
    expect(guard.spentToday()).toBe(0);
    // The one slot is still free.
    expect((await post({ text: CV })).status).toBe(200);
  });

  it("answers 429 with Retry-After once a client has used its readings, other clients not", async () => {
    const { post } = route({ perClientPerHour: 2 });
    expect((await post({ text: CV })).status).toBe(200);
    expect((await post({ text: CV })).status).toBe(200);
    const refused = await post({ text: CV });
    expect(refused.status).toBe(429);
    const seconds = Number(refused.headers.get("retry-after"));
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(3600);
    expect((await json(refused))["error"]).toMatch(/Próbáld újra \d+ perc múlva/u);
    expect((await post({ text: CV }, "10.0.0.2")).status).toBe(200);
  });

  it("answers 503 with Retry-After when the day's cap would be passed, without calling the model", async () => {
    const { post, usage } = route({ dailyCapUsd: CV_RESERVE_USD / 2 });
    const refused = await post({ text: CV });
    expect(refused.status).toBe(503);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await json(refused)).toEqual({ error: MESSAGES.cap });
    expect(usage).toEqual([]);
  });

  it("answers 500 with a generic text when the model fails, and still settles what was spent", async () => {
    const { post, guard, usage } = route({
      model: (prompt) => {
        if (prompt.name === "extract") return extraction;
        throw new Error("the model is down");
      },
    });
    const response = await post({ text: CV });
    expect(response.status).toBe(500);
    expect(await json(response)).toEqual({ error: MESSAGES.failed });
    expect(usage.length).toBeGreaterThan(0);
    expect(guard.spentToday()).toBeCloseTo(costUsd(usage), 9);
  });

  it("answers 500 without using a slot when no model is configured", async () => {
    const { post, log } = route({
      perClientPerHour: 1,
      ask: () => {
        throw new Error("no model: set ANTHROPIC_API_KEY");
      },
    });
    expect((await post({ text: CV })).status).toBe(500);
    expect((await post({ text: CV })).status).toBe(500);
    expect(log.at(-1)).toMatchObject({
      event: "cv-error",
      error: expect.stringContaining("no model"),
    });
  });

  it("keeps the CV text out of the log: dropped claims and errors lose their quotes", async () => {
    const ok = route();
    expect((await ok.post({ text: CV })).status).toBe(200);
    const failing = route({
      model: (prompt) => {
        if (prompt.name === "extract") return extraction;
        throw new SyntaxError(
          `Unexpected token, "Titkos Teszt Elek, Zöldfülű Zrt." is not valid JSON`,
        );
      },
    });
    expect((await failing.post({ text: CV })).status).toBe(500);

    // Not vacuous: the log does carry the dropped claims and the error, in their cut-down form.
    const dropped = ok.log.filter((e) => e["event"] === "cv-dropped");
    expect(dropped.length).toBeGreaterThanOrEqual(2);
    expect(dropped.map((e) => e["claim"])).toContain('jobs[1].title "…" does not occur in the CV');
    expect(failing.log.at(-1)).toMatchObject({
      event: "cv-error",
      error: 'SyntaxError: Unexpected token, "…" is not valid JSON',
    });

    const text = JSON.stringify([...ok.log, ...failing.log]).toLowerCase();
    for (const secret of SECRETS) expect(text).not.toContain(secret.toLowerCase());
  });
});

describe("scrub", () => {
  it("cuts quoted spans, an unclosed one to the end, and the length", () => {
    expect(scrub('a "b" c „d” e “f” g')).toBe('a "…" c "…" e "…" g');
    expect(scrub('Unexpected token, "Zöldfülű Zrt. 2018')).toBe('Unexpected token, "…"');
    expect(scrub('{"result":"he said \\"Titkos\\" twice"}')).not.toContain("Titkos");
    expect(scrub("x".repeat(1000))).toHaveLength(300);
  });
});
