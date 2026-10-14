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

  it("reads leads as senior managers, as the curated ladders do", () => {
    for (const title of ["Tech Lead", "Team Lead", "Lead Developer", "Vezető fejlesztő"])
      expect(heldLevel(title, null, 1), title).toEqual({ level: 3, track: "management" });
    expect(heldLevel("Csoportvezető", null, 1)).toEqual({ level: 3, track: "management" });
  });

  it("gives 4 and 5 from the title, with the track", () => {
    expect(heldLevel("Staff Software Engineer", null, 1)).toEqual({
      level: 4,
      track: "individual",
    });
    expect(heldLevel("Principal Engineer", null, 1)).toEqual({ level: 4, track: "individual" });
    expect(heldLevel("Software Architect", null, 1)).toEqual({ level: 4, track: "individual" });
    expect(heldLevel("Szoftverarchitekt", null, 1)).toEqual({ level: 4, track: "individual" });
    expect(heldLevel("Engineering Manager", null, 1)).toEqual({ level: 4, track: "management" });
    expect(heldLevel("Osztályvezető", null, 1)).toEqual({ level: 4, track: "management" });
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
    expect(heldLevel("Staff nurse", null, 3)).toEqual({ level: 2, track: "individual" });
  });
});

describe("heldRole across a ladder of several occupations", () => {
  // The shape of the curated software ladder: developer rungs on one occupation, the architect, the
  // team lead and engineering manager, and the CTO on occupations of their own; a data ladder
  // joined at the medior rung.
  const rung = (occ: string, level: number, track: Role["track"], progression: string[] = []) =>
    role({
      occupation: OCC + occ,
      curated: true,
      level,
      track,
      skills: skills("code"),
      progression: progression.map((id) => `[[${id}]]`),
    });
  const ladder = buildGraph(
    new Map<string, Role>([
      ["junior", rung("dev", 1, "individual", ["medior"])],
      ["medior", rung("dev", 2, "individual", ["senior", "data-engineer"])],
      ["senior", rung("dev", 3, "individual", ["architect", "eng-manager"])],
      ["architect", rung("architect", 4, "individual", ["cto"])],
      ["team-lead", rung("manager", 3, "management", ["eng-manager"])],
      ["eng-manager", rung("manager", 4, "management", ["cto"])],
      ["cto", rung("cto", 5, "management")],
      ["data-engineer", rung("data-engineer", 3, "individual", ["data-architect"])],
      ["data-architect", rung("data-architect", 4, "individual", ["data-lead"])],
      ["data-lead", rung("data-lead", 4, "management")],
      ["data-scientist", rung("data-scientist", 3, "individual", ["data-lead"])],
    ]),
  );
  const held = (title: string, occupation: string) => {
    const { level, track } = heldLevel(title, null, 1);
    return heldRole(ladder, OCC + occupation, level, track);
  };

  it("climbs from the developer occupation to the rung the title names", () => {
    expect(held("Senior Software Engineer", "dev")).toBe("senior");
    expect(held("Principal Software Engineer", "dev")).toBe("architect");
    expect(held("Staff Engineer", "dev")).toBe("architect");
    expect(held("Tech Lead", "dev")).toBe("team-lead");
    expect(held("Engineering Manager", "dev")).toBe("eng-manager");
    expect(held("CTO", "dev")).toBe("cto");
  });

  it("stays on the occupation's own rungs when they fit", () => {
    expect(held("Team Lead", "manager")).toBe("team-lead");
    expect(held("Engineering Manager", "manager")).toBe("eng-manager");
    expect(held("CTO", "cto")).toBe("cto");
  });

  it("prefers a near rung one level off to an exact match in another ladder", () => {
    // The software team lead is the exact (3, management) match, seven steps away.
    expect(held("Lead Data Scientist", "data-scientist")).toBe("data-lead");
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

  it("never lists a rung below a held role, even by a lateral edge from another held role", () => {
    // A senior developer who was once a web developer: web's lateral edge leads to the junior rung.
    const rung = (level: number, progression: string[]) =>
      role({ occupation: OCC + "dev", curated: true, level, skills: skills("code"), progression });
    const ladder = buildGraph(
      new Map<string, Role>([
        ["junior", rung(1, ["[[medior]]"])],
        ["medior", rung(2, ["[[senior]]"])],
        ["senior", rung(3, [])],
        [
          "web",
          role({
            occupation: OCC + "web",
            level: 2,
            skills: skills("code"),
            lateral: ["[[junior]]"],
          }),
        ],
      ]),
    );
    const { reachable } = placeCv(ladder, ["senior", "web"], new Set(), 0.99);
    expect(reachable.map((r) => r.role)).toEqual([]);
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
