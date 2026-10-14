import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { branchOf, loadBranches, validateBranches, type Branch } from "../src/branches/branches.ts";
import type { Esco, IscoGroup } from "../src/esco/model.ts";

const group = (code: string): IscoGroup => ({ code, label: { hu: code, en: code } });
const iscoGroups = ["2", "25", "251", "2511", "2512", "133", "1330"].map(group);

function table(): Branch[] {
  return [
    {
      id: "it",
      label: { hu: "Informatika", en: "IT" },
      subBranches: [
        { id: "software", label: { hu: "Szoftver", en: "Software" }, isco: ["251", "1330"] },
        { id: "analysis", label: { hu: "Elemzés", en: "Analysis" }, isco: ["2511"] },
      ],
    },
  ];
}

describe("branchOf", () => {
  it("prefers a listed unit group over its listed minor group", () => {
    expect(branchOf(table(), "2511").subBranch.id).toBe("analysis");
    expect(branchOf(table(), "2512").subBranch.id).toBe("software");
    expect(branchOf(table(), "2512").branch.id).toBe("it");
  });

  it("throws for a unit group no sub-branch covers", () => {
    expect(() => branchOf(table(), "5120")).toThrow("no branch for ISCO unit group 5120");
  });
});

describe("validateBranches", () => {
  it("accepts a table that resolves every unit group", () => {
    expect(() => validateBranches(table(), iscoGroups)).not.toThrow();
  });

  it("rejects a unit group left without a branch", () => {
    const t = table();
    t[0]!.subBranches[0]!.isco = ["251"];
    expect(() => validateBranches(t, iscoGroups)).toThrow("no branch for ISCO unit group 1330");
  });

  it("rejects a code listed twice", () => {
    const t = table();
    t[0]!.subBranches[1]!.isco.push("251");
    expect(() => validateBranches(t, iscoGroups)).toThrow(
      "ISCO 251 is listed in both software and analysis",
    );
  });

  it("rejects a code missing from ESCO", () => {
    const t = table();
    t[0]!.subBranches[1]!.isco.push("2519");
    expect(() => validateBranches(t, iscoGroups)).toThrow(
      "ISCO 2519 in analysis does not exist in ESCO",
    );
  });

  it("rejects a major or sub-major group", () => {
    const t = table();
    t[0]!.subBranches[1]!.isco.push("25");
    expect(() => validateBranches(t, iscoGroups)).toThrow("neither a minor nor a unit group");
  });

  it("rejects an id used twice", () => {
    const t = table();
    t[0]!.subBranches[1]!.id = "it";
    expect(() => validateBranches(t, iscoGroups)).toThrow("id it is used twice");
  });
});

const ESCO = "raw/esco/esco.json";

describe.skipIf(!existsSync(ESCO))("the real branch table", () => {
  it("resolves every ISCO unit group of ESCO", () => {
    const esco = JSON.parse(readFileSync(ESCO, "utf8")) as Esco;
    expect(() => validateBranches(loadBranches(), esco.iscoGroups)).not.toThrow();
  });
});
