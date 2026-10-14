import { describe, expect, it } from "vitest";
import { buildGraph, heldLevel, heldRole, placeCv } from "../src/cv/states.ts";
import type { Role } from "../src/vault/note.ts";

const OCC = "http://data.europa.eu/esco/occupation/";
const SK = "http://data.europa.eu/esco/skill/";
const skills = (...names: string[]) => names.map((n) => SK + n);

const role = (over: Partial<Role> & Pick<Role, "occupation" | "skills">): Role => ({
  curated: false,
  label: "x",
  level: 2,
  track: "individual",
  branch: "it",
  subBranch: "software",
  lateral: [],
  ...over,
});

// A curated developer ladder (1 → 2 → 3, plus a management step), and an uncurated tester and
// analyst linked laterally into it.
const graph = buildGraph(
  new Map<string, Role>([
    [
      "dev-1",
      role({
        occupation: OCC + "dev",
        curated: true,
        level: 1,
        skills: skills("code", "git"),
        progression: ["[[dev-2]]"],
      }),
    ],
    [
      "dev-2",
      role({
        occupation: OCC + "dev",
        curated: true,
        level: 2,
        skills: skills("code", "git", "test"),
        progression: ["[[dev-3]]"],
      }),
    ],
    [
      "dev-3",
      role({
        occupation: OCC + "dev",
        curated: true,
        level: 3,
        skills: skills("code", "git", "test", "design"),
        progression: ["[[dev-lead]]"],
      }),
    ],
    [
      "dev-lead",
      role({
        occupation: OCC + "dev",
        curated: true,
        level: 4,
        track: "management",
        skills: skills("code", "lead", "hire"),
      }),
    ],
    [
      "tester",
      role({
        occupation: OCC + "test",
        level: 2,
        skills: skills("test", "git", "report", "plan", "automate"),
        lateral: ["[[dev-2]]"],
      }),
    ],
    [
      "analyst",
      role({
        occupation: OCC + "analyst",
        level: 2,
        skills: skills("report", "plan", "sql"),
        lateral: ["[[dev-3]]"],
      }),
    ],
  ]),
);

describe("heldLevel", () => {
  it("takes the level from the title first", () => {
    expect(heldLevel("Junior Developer", null, 9)).toEqual({ level: 1, track: "individual" });
    expect(heldLevel("Medior fejlesztő", null, 0.5).level).toBe(2);
    expect(heldLevel("Szenior szoftverfejlesztő", null, 1).level).toBe(3);
    expect(heldLevel("Sr. Software Engineer", null, null).level).toBe(3);
  });

  it("gives 4 and 5 from the title, with the track", () => {
    expect(heldLevel("Tech Lead", null, 1)).toEqual({ level: 4, track: "individual" });
    expect(heldLevel("Vezető fejlesztő", null, 1)).toEqual({ level: 4, track: "individual" });
    expect(heldLevel("Csoportvezető", null, 1)).toEqual({ level: 4, track: "management" });
    expect(heldLevel("Head of Engineering", null, 1)).toEqual({ level: 4, track: "management" });
    expect(heldLevel("Ügyvezető", null, 1)).toEqual({ level: 5, track: "management" });
    expect(heldLevel("CTO", null, 1)).toEqual({ level: 5, track: "management" });
    expect(heldLevel("Gazdasági igazgató", null, 1).level).toBe(5);
  });

  it("falls back to a stated responsibility, then to years", () => {
    expect(heldLevel("Fejlesztő", { level: 4, leadsPeople: true }, 1)).toEqual({
      level: 4,
      track: "management",
    });
    expect(heldLevel("Senior Developer", { level: 5, leadsPeople: true }, 1)).toEqual({
      level: 3,
      track: "individual",
    });
    expect(heldLevel("Szakács", null, 1.9).level).toBe(1);
    expect(heldLevel("Szakács", null, 2).level).toBe(2);
    expect(heldLevel("Szakács", null, 5).level).toBe(2);
    expect(heldLevel("Szakács", null, 5.5).level).toBe(3);
    expect(heldLevel("Szakács", null, null).level).toBe(1);
  });

  it("never gives 4 or 5 from years", () => {
    expect(heldLevel("Ápoló", null, 30).level).toBe(3);
  });

  it("does not read a level from a word that only contains a keyword", () => {
    expect(heldLevel("Midwife", null, 1).level).toBe(1);
    expect(heldLevel("Leading Seaman", null, 3).level).toBe(2);
  });
});

describe("heldRole", () => {
  it("picks the ladder role at the level and track", () => {
    expect(heldRole(graph, OCC + "dev", 2, "individual")).toBe("dev-2");
    expect(heldRole(graph, OCC + "dev", 4, "management")).toBe("dev-lead");
  });

  it("falls back to the same track at the nearest level", () => {
    expect(heldRole(graph, OCC + "dev", 5, "individual")).toBe("dev-3");
    expect(heldRole(graph, OCC + "dev", 3, "management")).toBe("dev-lead");
  });

  it("maps an occupation without a ladder to its one role, whatever the level", () => {
    expect(heldRole(graph, OCC + "test", 5, "management")).toBe("tester");
    expect(heldRole(graph, OCC + "nothing", 2, "individual")).toBeUndefined();
  });
});

describe("placeCv", () => {
  it("finds covered roles at the threshold and reachable roles with their gaps", () => {
    const shown = new Set(skills("code", "git", "test", "report", "plan"));
    const { covered, reachable } = placeCv(graph, ["dev-2"], shown);
    // tester: 4 of 5 skills; analyst: 2 of 3; dev-1: all; dev-3: 3 of 4.
    expect(covered).toEqual([
      { role: "dev-1", coverage: 1 },
      { role: "tester", coverage: 0.8 },
      { role: "dev-3", coverage: 0.75 },
      { role: "analyst", coverage: 2 / 3 },
    ]);
    // dev-lead is one progression from dev-3, which is covered.
    expect(reachable).toEqual([
      { role: "dev-lead", from: "dev-3", edge: "progression", gap: skills("lead", "hire") },
    ]);
  });

  it("leaves a role below the threshold uncovered and lists it as reachable", () => {
    // dev-3: 2 of 4 skills.
    const shown = new Set(skills("code", "git"));
    const { covered, reachable } = placeCv(graph, ["dev-2"], shown);
    expect(covered.map((c) => c.role)).toEqual(["dev-1"]);
    expect(reachable).toEqual([
      { role: "dev-3", from: "dev-2", edge: "progression", gap: skills("test", "design") },
      {
        role: "tester",
        from: "dev-2",
        edge: "lateral",
        gap: skills("test", "report", "plan", "automate"),
      },
    ]);
  });

  it("does not list a lower rung as reachable by progression", () => {
    const { reachable } = placeCv(graph, ["dev-3"], new Set(), 0.99);
    expect(reachable.map((r) => r.role)).toEqual(["analyst", "dev-lead"]);
  });

  it("covers a role at exactly the threshold", () => {
    const { covered } = placeCv(graph, [], new Set(skills("test", "git", "report")));
    expect(covered).toContainEqual({ role: "tester", coverage: 0.6 });
  });

  it("prefers a held source to a covered one, even over a progression", () => {
    // dev-2 is covered (2 of 3) and leads to dev-3 by progression; held analyst reaches it laterally.
    const { reachable } = placeCv(graph, ["analyst"], new Set(skills("code", "git")));
    expect(reachable.find((r) => r.role === "dev-3")).toMatchObject({
      from: "analyst",
      edge: "lateral",
    });
  });
});
