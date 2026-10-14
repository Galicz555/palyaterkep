import { describe, expect, it } from "vitest";
import { curatedRoles, renderReview } from "../src/ladders/review.ts";
import { writeNote, type Role } from "../src/vault/note.ts";

const OCC = "http://data.europa.eu/esco/occupation/";
const SKILL = "http://data.europa.eu/esco/skill/";

const note = (over: Partial<Role>): string =>
  writeNote(
    {
      curated: true,
      occupation: `${OCC}dev`,
      label: "x",
      level: 1,
      track: "individual",
      branch: "it",
      subBranch: "software",
      skills: [],
      lateral: [],
      ...over,
      ...(over.skills ? { skills: over.skills.map((s) => SKILL + s) } : {}),
    },
    "",
  );

const review = (files: [string, string][]) =>
  renderReview(
    curatedRoles(new Map(files)),
    (uri) => uri.slice(SKILL.length),
    (uri) => uri,
    (id) => id,
  );

describe("ladder review", () => {
  const junior = note({ label: "Junior", skills: ["code"], progression: ["[[medior]]"] });
  const medior = note({ label: "Medior", level: 2, skills: ["code", "design", "test"] });
  const lead = note({
    label: "Lead",
    level: 2,
    track: "management",
    occupation: `${OCC}manager`,
    skills: ["code", "design", "test", "lead", "plan"],
    lateral: ["[[medior]]"],
  });

  it("shows what each step adds, a progression and a same-level switch to the other track", () => {
    const { page, problems } = review([
      ["szoftverfejlesztes/junior.md", junior],
      ["szoftverfejlesztes/medior.md", medior],
      ["szoftverfejlesztes/lead.md", lead],
      ["generated.md", note({ curated: false })],
    ]);
    expect(problems).toEqual([]);
    expect(page).toContain("**Új a junior után (előrelépés, +2):** design; test");
    expect(page).toContain("**Új a medior után (váltás, +2):** lead; plan");
  });

  it("reports a thin step, a step that does not lead further out, and a role nothing reaches", () => {
    const { problems } = review([
      ["szoftverfejlesztes/junior.md", junior],
      ["szoftverfejlesztes/medior.md", note({ level: 1, skills: ["code", "design"] })],
      ["szoftverfejlesztes/lone.md", note({ level: 3, skills: ["code"] })],
      ["mashol/stray.md", note({ skills: ["code"] })],
    ]);
    expect(problems).toEqual([
      "junior → medior: progression to level 1, not further out",
      "stray: not in a known ladder folder",
      "junior → medior: adds 1 skills",
      "lone: not reached from szoftverfejlesztes's bottom",
    ]);
  });
});
