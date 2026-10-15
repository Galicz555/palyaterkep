import { describe, expect, it } from "vitest";
import { labelIndex, skillUniverse } from "../src/cv/mapping.ts";
import { graph, mapper, OCC, SK } from "./cv-fixture.ts";

describe("labelIndex", () => {
  it("scores a key by its best label", () => {
    const search = labelIndex([
      ["a", ["software developer", "programmer"]],
      ["b", ["software tester"]],
    ]);
    expect(search("programmer", 5)[0]).toEqual({ key: "a", score: 1 });
    expect(search("software developer", 5).map((h) => h.key)).toEqual(["a", "b"]);
  });
});

describe("buildMapper", () => {
  it("finds an occupation from a Hungarian title with a seniority word, and from English", () => {
    expect(mapper.occupations(["Szenior szoftverfejlesztő"])[0]).toBe(OCC + "dev");
    expect(mapper.occupations(["Senior Software Engineer"])[0]).toBe(OCC + "dev");
    expect(mapper.occupations(["Ápoló", "nurse"])[0]).toBe(OCC + "nurse");
  });

  it("names the alternative label a job matched, never a main label", () => {
    expect(mapper.matchedLabel(OCC + "dev", ["Senior Software Engineer"])).toBe(
      "software engineer",
    );
    expect(mapper.matchedLabel(OCC + "dev", ["Szoftverfejlesztő"])).toBeUndefined();
    expect(mapper.matchedLabel(OCC + "tester", ["Senior Software Engineer"])).toBeUndefined();
  });

  it("finds a skill from an inflected Hungarian mention", () => {
    expect(mapper.skills(["Pythonban"])[0]).toBe(SK + "python");
    expect(mapper.skills(["szoftverhibák elhárításában"])).toContain(SK + "debug");
  });

  it("offers only skills some role needs, and none below the similarity floor", () => {
    expect(mapper.skills(["python scripting"])).not.toContain(SK + "unused");
    expect(mapper.skills(["quantum chromodynamics"])).toEqual([]);
  });

  it("keeps the labels and the first sentence of the description for the prompts", () => {
    expect(mapper.occupation.get(OCC + "chef")).toEqual({
      hu: "szakács",
      en: "cook",
      about: "cook does things.",
    });
    expect(mapper.skill.get(SK + "unused")).toBeUndefined();
  });
});

describe("skillUniverse", () => {
  it("orders mentions, held roles, their neighbours, then roles the mentions point at", () => {
    const u = skillUniverse(graph, ["dev"], [SK + "hygiene", SK + "menu"]);
    expect(u).toEqual(
      ["hygiene", "menu", "python", "debug", "test", "report", "cook"].map((s) => SK + s),
    );
  });

  it("stops at the cap", () => {
    expect(skillUniverse(graph, ["dev"], [SK + "care"], 2)).toEqual([SK + "care", SK + "python"]);
  });
});
