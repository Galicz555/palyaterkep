import { describe, expect, it } from "vitest";
import type { Branch } from "../src/branches/branches.ts";
import type { Esco, Occupation, Skill } from "../src/esco/model.ts";
import { lateralEdges, planVault, type Ranked } from "../src/vault/generate.ts";
import { lintVault } from "../src/vault/lint.ts";
import { readNote, Role, writeNote } from "../src/vault/note.ts";
import type { Proposals } from "../src/vault/propose.ts";

const OCC = "http://data.europa.eu/esco/occupation/";
const SKILL = "http://data.europa.eu/esco/skill/";

const skill = (id: string): Skill => ({
  uri: SKILL + id,
  skillType: "skill/competence",
  reuseLevel: "sector-specific",
  label: { hu: `${id} készség`, en: id },
  altLabels: { hu: [], en: [] },
  description: { hu: "", en: "" },
});

const occupation = (code: string, hu: string, essential: string[]): Occupation => ({
  uri: OCC + code,
  code,
  isco: code.slice(0, 4),
  label: { hu, en: hu },
  altLabels: { hu: [], en: [] },
  description: { hu: `${hu} leírása.`, en: "" },
  essential: essential.map((s) => SKILL + s),
  optional: [],
});

const branches: Branch[] = [
  {
    id: "food",
    label: { hu: "Vendéglátás", en: "Food" },
    subBranches: [{ id: "kitchen", label: { hu: "Konyha", en: "Kitchen" }, isco: ["512", "941"] }],
  },
];

const esco: Pick<Esco, "occupations" | "skills"> = {
  occupations: [
    occupation("5120.1", "szakács", ["cook", "knife", "hygiene"]),
    occupation("5120.2", "grillszakács", ["cook", "knife", "grill"]),
    occupation("9412.1", "konyhai kisegítő", ["hygiene", "dish"]),
    occupation("5120.3", "pincemester", ["wine"]),
    occupation("5120.4", "pincemester", ["wine", "cellar"]),
  ],
  skills: ["cook", "knife", "hygiene", "grill", "dish", "wine", "cellar"].map(skill),
};

const proposals: Proposals = {
  "5120.1": { level: 2, track: "individual" },
  "5120.2": { level: 2, track: "individual" },
  "9412.1": { level: 1, track: "individual" },
  "5120.3": { level: 3, track: "management" },
  "5120.4": { level: 3, track: "management" },
};

const role = (over: Partial<Role> = {}): Role => ({
  curated: true,
  occupation: `${OCC}5120.1`,
  label: "szakács",
  level: 2,
  track: "individual",
  branch: "food",
  subBranch: "kitchen",
  skills: [`${SKILL}cook`],
  lateral: [],
  ...over,
});

const apply = (vault: Map<string, string>, plan: ReturnType<typeof planVault>) => {
  const next = new Map(vault);
  for (const file of plan.remove) next.delete(file);
  for (const [file, text] of plan.write) next.set(file, text);
  return next;
};

describe("role notes", () => {
  it("read back what they were written from", () => {
    const written = role({ lateral: ["[[grillszakacs]]"], progression: ["[[sef]]"] });
    const note = readNote(writeNote(written, "# Szakács\n\nSzöveg: [[grillszakacs]]"));
    expect(Role.parse(note.frontmatter)).toEqual(written);
    expect(note.body.trim()).toBe("# Szakács\n\nSzöveg: [[grillszakacs]]");
  });

  it("have no frontmatter without a closed block", () => {
    expect(readNote("# Cím\n").frontmatter).toBeUndefined();
    expect(readNote("---\nlevel: [\n---\n").frontmatter).toBeUndefined();
  });
});

describe("lateralEdges", () => {
  const ranked = (id: string, occupation: string, level: number, skills: string[]): Ranked => ({
    id,
    occupation,
    level,
    skills,
  });

  it("links roles sharing skills, strongest first, never the same occupation or levels 2 apart", () => {
    const edges = lateralEdges(
      [
        ranked("a", "A", 2, ["x", "y", "z"]),
        ranked("b", "B", 2, ["x", "y", "w"]),
        ranked("c", "C", 3, ["x", "q"]),
        ranked("a2", "A", 3, ["x", "y", "z"]),
        ranked("d", "D", 4, ["x", "y", "z"]),
        ranked("e", "E", 2, ["v"]),
      ],
      0.1,
      6,
    );
    // IDF-weighted Jaccard: a–b and b–a2 share x, y (0.19); a2–d share all (1.0); c shares only
    // the common x (0.06); a–a2 are one occupation; a–d are two levels apart.
    expect(Object.fromEntries(edges)).toEqual({
      a: ["b"],
      b: ["a", "a2"],
      c: [],
      a2: ["d", "b"],
      d: ["a2"],
      e: [],
    });
  });

  it("drops edges under the threshold and keeps every role within the cap, listing each edge twice", () => {
    const hub = ranked("hub", "H", 2, ["s1", "s2", "s3", "s4"]);
    const spokes = ["s1", "s2", "s3", "s4"].map((s, i) => ranked(`r${i}`, `R${i}`, 2, [s]));
    const edges = lateralEdges(
      [hub, ...spokes, ranked("far", "F", 2, ["s1", "a", "b", "c"])],
      0.2,
      2,
    );
    expect(edges.get("hub")).toHaveLength(2);
    for (const [id, linked] of edges) {
      expect(linked.length).toBeLessThanOrEqual(2);
      for (const other of linked) expect(edges.get(other)).toContain(id);
    }
    expect(edges.get("far")).toEqual([]);
  });

  it("does not link roles a progression edge already links, from either end", () => {
    const junior = { ...ranked("junior", "A", 2, ["x", "y"]), progression: ["senior"] };
    const senior = ranked("senior", "B", 3, ["x", "y"]);
    const peer = ranked("peer", "C", 2, ["x", "y"]);
    const edges = lateralEdges([junior, senior, peer, ranked("other", "D", 2, ["z"])], 0.1, 6);
    expect(edges.get("junior")).toEqual(["peer"]);
    expect(edges.get("senior")).toEqual(["peer"]);
  });
});

describe("planVault", () => {
  it("writes one uncurated role per occupation, naming same-titled ones by code", () => {
    const { write, remove } = planVault(new Map(), esco, branches, proposals);
    expect([...write.keys()].sort()).toEqual([
      "grillszakacs.md",
      "konyhai-kisegito.md",
      "pincemester-5120-3.md",
      "pincemester-5120-4.md",
      "szakacs.md",
    ]);
    expect(remove).toEqual([]);
    const cook = Role.parse(readNote(write.get("szakacs.md")!).frontmatter);
    expect(cook).toMatchObject({ curated: false, level: 2, branch: "food", subBranch: "kitchen" });
    expect(cook.lateral).toContain("[[grillszakacs]]");
    expect(lintVault(write, branches, esco)).toEqual([]);
  });

  it("is idempotent", () => {
    const once = apply(new Map(), planVault(new Map(), esco, branches, proposals));
    const twice = apply(once, planVault(once, esco, branches, proposals));
    expect(twice).toEqual(once);
  });

  it("leaves curated notes alone, gives their occupation no uncurated role and removes its old one", () => {
    const generated = apply(new Map(), planVault(new Map(), esco, branches, proposals));
    const curated = writeNote(role({ label: "Junior szakács", level: 1 }), "# Kézzel írva");
    const vault = new Map([...generated, ["kuralt/junior-szakacs.md", curated]]);
    const plan = planVault(vault, esco, branches, proposals);
    expect(plan.write.has("kuralt/junior-szakacs.md")).toBe(false);
    expect(plan.write.has("szakacs.md")).toBe(false);
    expect(plan.remove).toEqual(["szakacs.md"]);
    const next = apply(vault, plan);
    expect(next.get("kuralt/junior-szakacs.md")).toBe(curated);
    expect(lintVault(next, branches, esco)).toEqual([]);
  });

  it("never takes the name of a file it does not own", () => {
    const vault = new Map([["szakacs.md", "# Valaki jegyzete\n"]]);
    const plan = planVault(vault, esco, branches, proposals);
    expect(plan.write.has("szakacs.md")).toBe(false);
    expect(plan.write.has("szakacs-5120-1.md")).toBe(true);
    expect(plan.remove).toEqual([]);
  });

  it("refuses a curated note that does not fit the schema", () => {
    const vault = new Map([["x.md", "---\ncurated: true\nlevel: 9\n---\n"]]);
    expect(() => planVault(vault, esco, branches, proposals)).toThrow(
      "does not fit the role schema",
    );
  });

  it("refuses an occupation without a proposal", () => {
    const { "5120.1": _, ...rest } = proposals;
    expect(() => planVault(new Map(), esco, branches, rest)).toThrow("no proposal for 5120.1");
  });
});

describe("lintVault", () => {
  const clean = () => apply(new Map(), planVault(new Map(), esco, branches, proposals));

  it("reports a broken wikilink", () => {
    const vault = clean();
    vault.set("szakacs.md", `${vault.get("szakacs.md")}\n[[nincs-ilyen]]\n`);
    expect(lintVault(vault, branches, esco)).toEqual(["szakacs.md: broken link [[nincs-ilyen]]"]);
  });

  it("reports a note that does not fit the schema", () => {
    const vault = clean();
    vault.set("szakacs.md", vault.get("szakacs.md")!.replace("level: 2", "level: 6"));
    expect(lintVault(vault, branches, esco)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^szakacs.md: .*level/u)]),
    );
  });

  it("reports two notes with one name", () => {
    const vault = clean();
    vault.set("masolat/szakacs.md", vault.get("szakacs.md")!);
    expect(lintVault(vault, branches, esco)).toEqual(
      expect.arrayContaining(["masolat/szakacs.md: same name as szakacs.md"]),
    );
  });

  it("reports a sub-branch outside the table or outside its branch", () => {
    const vault = clean();
    vault.set("szakacs.md", vault.get("szakacs.md")!.replace("branch: food", "branch: it"));
    vault.set(
      "grillszakacs.md",
      vault.get("grillszakacs.md")!.replace("subBranch: kitchen", "subBranch: bar"),
    );
    expect(lintVault(vault, branches, esco).sort()).toEqual([
      "grillszakacs.md: unknown sub-branch bar",
      "szakacs.md: sub-branch kitchen is not in branch it",
    ]);
  });

  it("reports an occupation without its uncurated role, and one beside curated roles", () => {
    const vault = clean();
    vault.delete("konyhai-kisegito.md");
    vault.set("junior-szakacs.md", writeNote(role(), "# Junior"));
    expect(lintVault(vault, branches, esco)).toEqual(
      expect.arrayContaining([
        `occupation ${OCC}9412.1 has 0 uncurated roles`,
        `szakacs.md: uncurated role of ${OCC}5120.1, which curated roles cover`,
      ]),
    );
  });
});
