import { describe, expect, it } from "vitest";
import { CvInputError, MAX_CV_CHARS, readCv } from "../src/cv/read.ts";
import type { Ask, Prompt } from "../src/cv/verify.ts";
import { buildGraph } from "../src/cv/states.ts";
import type { Role } from "../src/vault/note.ts";
import { graph, mapper, OCC, SK } from "./cv-fixture.ts";

// Synthetic. "elhárí-\ntásával" is a PDF line-break hyphenation.
const CV = `Kovács Anna

Szenior szoftverfejlesztő, Példa Kft.
2018. szeptember – jelenleg
Python-alapú szolgáltatásokat fejlesztettem, a hibákat szoftverhibák elhárí-
tásával kerestem. Automatizált teszteket írtam.

Ápoló, Szent Kórház
2012 – 2016
Betegápolás a belgyógyászaton.`;

const TODAY = "2026-10-14";

/** The id a listing line gives a label: "  o3: software developer / …" → "o3". */
const idOf = (prompt: Prompt, label: string) => {
  const match = new RegExp(`^\\s*(\\w+): ${label} /`, "mu").exec(prompt.user);
  if (!match) throw new Error(`${label} is not offered`);
  return match[1]!;
};

const goodJobs = [
  {
    title: "Szenior szoftverfejlesztő",
    occupation: "software developer",
    dates: "2018. szeptember – jelenleg",
    years: 8.1,
    responsibility: null,
  },
  { title: "Ápoló", occupation: "nurse", dates: "2012 – 2016", years: 4, responsibility: null },
];
const mentions = [
  { name: "Python", quote: "Python-alapú szolgáltatásokat" },
  { name: "debugging", quote: "szoftverhibák elhárításával" },
  { name: "patient care", quote: "Betegápolás" },
];

/** Model answers by step; every call is recorded. */
function model(answers: Record<string, ((p: Prompt) => unknown)[]>) {
  const calls: Prompt[] = [];
  const ask: Ask = async (prompt) => {
    calls.push(prompt);
    const next = answers[prompt.name]?.shift();
    if (!next) throw new Error(`unexpected call: ${prompt.name}`);
    return next(prompt);
  };
  return { ask, calls };
}

const occupations = (p: Prompt) => ({
  jobs: [
    { job: 0, occupation: idOf(p, "software developer") },
    { job: 1, occupation: idOf(p, "nurse responsible for general care") },
  ],
});
const skills = (p: Prompt) => ({
  skills: [
    { id: idOf(p, "Python \\(computer programming\\)"), quote: "Python-alapú" },
    { id: idOf(p, "debug software"), quote: "szoftverhibák elhárításával" },
    { id: idOf(p, "execute software tests"), quote: "Automatizált teszteket írtam" },
    { id: idOf(p, "provide nursing care"), quote: "Betegápolás" },
    { id: idOf(p, "report test findings"), quote: "Tesztjelentéseket írtam" },
  ],
});

describe("readCv", () => {
  it("reads a CV into held, covered, reachable and skills, dropping fabricated claims", async () => {
    const fabricated = {
      jobs: [
        ...goodJobs,
        {
          title: "Vezető fejlesztő, Google",
          occupation: "software developer",
          dates: null,
          years: null,
          responsibility: null,
        },
      ],
      skills: [...mentions, { name: "Kubernetes", quote: "Kubernetes" }],
    };
    const { ask, calls } = model({
      extract: [() => fabricated, () => ({ jobs: goodJobs, skills: fabricated.skills })],
      occupations: [occupations],
      skills: [skills, skills],
    });

    const { result, dropped } = await readCv(CV, { ask, graph, mapper, today: TODAY });

    expect(calls.map((c) => c.name)).toEqual([
      "extract",
      "extract",
      "occupations",
      "skills",
      "skills",
    ]);
    expect(calls[1]!.user).toContain(`jobs[2].title "Vezető fejlesztő, Google" does not occur`);
    expect(dropped).toEqual([
      'skills[3].quote "Kubernetes" does not occur in the CV',
      expect.stringMatching(/the quote "Tesztjelentéseket írtam" does not occur in the CV$/u),
    ]);
    expect(result.held).toEqual([
      {
        role: "dev",
        evidence: ["Szenior szoftverfejlesztő", "2018. szeptember – jelenleg"],
      },
      { role: "nurse", evidence: ["Ápoló", "2012 – 2016"] },
    ]);
    expect(result.skills).toEqual([
      { uri: SK + "python", evidence: ["Python-alapú"] },
      { uri: SK + "debug", evidence: ["szoftverhibák elhárí- tásával"] },
      { uri: SK + "test", evidence: ["Automatizált teszteket írtam"] },
      { uri: SK + "care", evidence: ["Betegápolás"] },
    ]);
    // tester shows 1 of 2 skills: below the threshold, one lateral step from dev.
    expect(result.covered).toEqual([]);
    expect(result.reachable).toEqual([
      { role: "tester", from: "dev", edge: "lateral", gap: [SK + "report"] },
    ]);
  });

  it("drops years that do not fit the dates, an unquoted responsibility, and an occupation not among the candidates", async () => {
    const nurse = {
      ...goodJobs[1]!,
      years: 12,
      responsibility: { organisation: false, leadsPeople: true, quote: "Az osztályt vezettem" },
    };
    const { ask } = model({
      extract: [() => ({ jobs: [nurse], skills: [] }), () => ({ jobs: [nurse], skills: [] })],
      occupations: [() => ({ jobs: [{ job: 0, occupation: "o99" }] }), () => ({ jobs: [] })],
      skills: [],
    });
    const { result, dropped } = await readCv(CV, { ask, graph, mapper, today: TODAY });
    expect(dropped).toEqual([
      'jobs[0].years 12 does not fit the dates "2012 – 2016"',
      'jobs[0].responsibility.quote "Az osztályt vezettem" does not occur in the CV',
      "job 0 has no answer",
    ]);
    expect(result).toEqual({ held: [], covered: [], reachable: [], skills: [] });
  });

  it("adds up years across the jobs of one occupation to pick the ladder rung", async () => {
    const rung = (level: number, next?: string): Role => ({
      curated: true,
      occupation: OCC + "dev",
      label: `dev ${level}`,
      level,
      track: "individual",
      branch: "it",
      subBranch: "software",
      skills: [SK + "python"],
      lateral: [],
      ...(next ? { progression: [`[[${next}]]`] } : {}),
    });
    const ladder = buildGraph(
      new Map([
        ["dev-1", rung(1, "dev-2")],
        ["dev-2", rung(2, "dev-3")],
        ["dev-3", rung(3)],
      ]),
    );
    const text = "Fejlesztő, A Kft.\n2015 – 2018\n\nFejlesztő, B Kft.\n2018 – 2022";
    const job = (dates: string, years: number) => ({
      title: "Fejlesztő",
      occupation: "software developer",
      dates,
      years,
      responsibility: null,
    });
    const { ask } = model({
      extract: [() => ({ jobs: [job("2015 – 2018", 3), job("2018 – 2022", 4)], skills: [] })],
      occupations: [
        (p) => ({
          jobs: [0, 1].map((i) => ({ job: i, occupation: idOf(p, "software developer") })),
        }),
      ],
      skills: [() => ({ skills: [] })],
    });
    const { result } = await readCv(text, { ask, graph: ladder, mapper, today: TODAY });
    expect(result.held).toEqual([
      { role: "dev-3", evidence: ["Fejlesztő", "2015 – 2018", "2018 – 2022"] },
    ]);
  });

  it("refuses an empty or too long CV before any call", async () => {
    const { ask, calls } = model({});
    const reader = { ask, graph, mapper, today: TODAY };
    await expect(readCv(" \n", reader)).rejects.toThrow(CvInputError);
    await expect(readCv("x".repeat(MAX_CV_CHARS + 1), reader)).rejects.toThrow(CvInputError);
    expect(calls).toEqual([]);
  });
});
