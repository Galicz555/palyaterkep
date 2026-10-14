import { describe, expect, it } from "vitest";
import { parseCvResult, readCvResult } from "../src/lib/cv.ts";
import type { CvResult } from "../../src/cv/result.ts";

const SKILL = "http://data.europa.eu/esco/skill/";

const result: CvResult = {
  held: [{ role: "a", evidence: ["2020–2024, A Kft."] }],
  covered: [
    { role: "a", coverage: 0.9 },
    { role: "b", coverage: 0.6 },
  ],
  reachable: [
    { role: "a", from: "b", edge: "lateral", gap: ["x"] },
    { role: "b", from: "a", edge: "lateral", gap: ["x"] },
    { role: "c", from: "a", edge: "progression", gap: ["x", "y", "z"] },
    { role: "c", from: "b", edge: "lateral", gap: ["x"] },
  ],
  skills: [{ uri: `${SKILL}s1`, evidence: ["Java"] }],
};

describe("parseCvResult", () => {
  it("accepts a result", () => {
    expect(parseCvResult(structuredClone(result))).toEqual(result);
  });

  it("names the field that is wrong", () => {
    const bad = structuredClone(result) as unknown as { covered: { coverage: number }[] };
    bad.covered[0]!.coverage = 1.5;
    expect(() => parseCvResult(bad)).toThrow(/covered\.0\.coverage/u);
    expect(() => parseCvResult({ ...result, reachable: [{ role: "c" }] })).toThrow(/reachable/u);
    expect(() => parseCvResult(null)).toThrow();
  });
});

describe("readCvResult", () => {
  const view = readCvResult(result);

  it("gives a role one state: held beats covered beats reachable", () => {
    expect(view.states.get("a")?.kind).toBe("held");
    expect(view.states.get("b")?.kind).toBe("covered");
  });

  it("keeps the nearer way to a role reached twice", () => {
    expect(view.states.get("c")).toEqual({
      kind: "reachable",
      from: "b",
      edge: "lateral",
      gap: ["x"],
    });
  });

  it("keys skills without the ESCO prefix", () => {
    expect(view.skills.has("s1")).toBe(true);
    expect(view.evidence.get("s1")).toEqual(["Java"]);
  });
});
