import { describe, expect, it } from "vitest";
import type { Occupation, Skill } from "../src/esco/model.ts";
import { buildMapper, labelIndex, skillUniverse } from "../src/cv/mapping.ts";
import { buildGraph } from "../src/cv/states.ts";
import type { Role } from "../src/vault/note.ts";

const OCC = "http://data.europa.eu/esco/occupation/";
const SK = "http://data.europa.eu/esco/skill/";

const occupation = (id: string, hu: string, en: string, alt: string[] = []): Occupation => ({
  uri: OCC + id,
  code: "0000.1",
  isco: "0000",
  label: { hu, en },
  altLabels: { hu: [], en: alt },
  description: { hu: "", en: `${en} does things. More text.` },
  essential: [],
  optional: [],
});
const skill = (id: string, hu: string, en: string, alt: string[] = []): Skill => ({
  uri: SK + id,
  skillType: "skill/competence",
  reuseLevel: "",
  label: { hu, en },
  altLabels: { hu: [], en: alt },
  description: { hu: "", en: "" },
});
const role = (occ: string, skills: string[], lateral: string[] = []): Role => ({
  curated: false,
  occupation: OCC + occ,
  label: occ,
  level: 2,
  track: "individual",
  branch: "it",
  subBranch: "software",
  skills: skills.map((s) => SK + s),
  lateral: lateral.map((id) => `[[${id}]]`),
});

const graph = buildGraph(
  new Map([
    ["dev", role("dev", ["python", "debug", "test"], ["tester"])],
    ["tester", role("tester", ["test", "report"], ["dev"])],
    ["nurse", role("nurse", ["care", "hygiene"])],
    ["chef", role("chef", ["cook", "hygiene", "menu"])],
  ]),
);
const mapper = buildMapper(
  {
    occupations: [
      occupation("dev", "szoftverfejlesztő", "software developer", ["software engineer"]),
      occupation("tester", "szoftvertesztelő", "software tester"),
      occupation("nurse", "ápoló", "nurse responsible for general care", ["nurse"]),
      occupation("chef", "szakács", "cook"),
    ],
    skills: [
      skill("python", "Python (számítógépes programozás)", "Python (computer programming)", [
        "Python",
      ]),
      skill("debug", "szoftverhibák elhárítása", "debug software"),
      skill("test", "szoftvertesztek elvégzése", "execute software tests"),
      skill("report", "tesztjelentés", "report test findings"),
      skill("care", "betegápolás", "provide nursing care"),
      skill("hygiene", "higiénia", "hygiene"),
      skill("cook", "főzés", "cooking techniques"),
      skill("menu", "menütervezés", "plan menus"),
      skill("unused", "pythonozás", "python scripting"),
    ],
  },
  graph,
);

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
