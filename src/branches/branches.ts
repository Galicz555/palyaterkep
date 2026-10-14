// The branch table: every ISCO unit group belongs to one sub-branch of one main branch, and a
// few occupations of mixed unit groups are placed one by one (ADR 0001).

import { readFileSync } from "node:fs";
import type { IscoGroup, Occupation, Text } from "../esco/model.ts";

export interface SubBranch {
  id: string;
  label: Text;
  /** ISCO minor (3 digits) or unit (4 digits) groups. */
  isco: string[];
  /** ESCO occupation codes placed here although their unit group is placed elsewhere. */
  occupations?: string[];
}

/** A main branch (fő ág). The array order of the table is the order around the map. */
export interface Branch {
  id: string;
  label: Text;
  subBranches: SubBranch[];
}

export interface Placement {
  branch: Branch;
  subBranch: SubBranch;
}

export const BRANCHES_FILE = "data/branches.json";

export const loadBranches = (file = BRANCHES_FILE): Branch[] =>
  JSON.parse(readFileSync(file, "utf8")) as Branch[];

/** A unit group goes to the sub-branch listing its own code, otherwise to the one listing its minor group. */
export function branchOf(branches: Branch[], unit: string): Placement {
  let byMinor: Placement | undefined;
  for (const branch of branches) {
    for (const subBranch of branch.subBranches) {
      if (subBranch.isco.includes(unit)) return { branch, subBranch };
      if (subBranch.isco.includes(unit.slice(0, 3))) byMinor = { branch, subBranch };
    }
  }
  if (!byMinor) throw new Error(`no branch for ISCO unit group ${unit}`);
  return byMinor;
}

/** An occupation goes where the table lists its ESCO code, otherwise where its unit group goes. */
export function placeOccupation(
  branches: Branch[],
  occupation: Pick<Occupation, "code" | "isco">,
): Placement {
  for (const branch of branches) {
    for (const subBranch of branch.subBranches) {
      if (subBranch.occupations?.includes(occupation.code)) return { branch, subBranch };
    }
  }
  return branchOf(branches, occupation.isco);
}

/**
 * Throws, listing every problem, unless each unit group of `iscoGroups` resolves to exactly one
 * sub-branch and each occupation placed one by one exists, is placed once, and is moved somewhere new.
 */
export function validateBranches(
  branches: Branch[],
  iscoGroups: IscoGroup[],
  occupations: Pick<Occupation, "code" | "isco">[],
): void {
  const problems: string[] = [];
  const known = new Set(iscoGroups.map((g) => g.code));
  const ids = new Set<string>();
  const listed = new Map<string, string>();

  for (const branch of branches) {
    for (const node of [branch, ...branch.subBranches]) {
      if (ids.has(node.id)) problems.push(`id ${node.id} is used twice`);
      ids.add(node.id);
    }
    for (const sub of branch.subBranches) {
      for (const code of sub.isco) {
        const prev = listed.get(code);
        if (prev) problems.push(`ISCO ${code} is listed in both ${prev} and ${sub.id}`);
        listed.set(code, sub.id);
        if (code.length !== 3 && code.length !== 4) {
          problems.push(`ISCO ${code} in ${sub.id} is neither a minor nor a unit group`);
        } else if (!known.has(code)) {
          problems.push(`ISCO ${code} in ${sub.id} does not exist in ESCO`);
        }
      }
    }
  }

  for (const { code } of iscoGroups) {
    if (code.length !== 4) continue;
    try {
      branchOf(branches, code);
    } catch (e) {
      problems.push((e as Error).message);
    }
  }

  const byCode = new Map(occupations.map((o) => [o.code, o]));
  const placed = new Map<string, string>();
  for (const sub of branches.flatMap((b) => b.subBranches)) {
    for (const code of sub.occupations ?? []) {
      const prev = placed.get(code);
      if (prev) problems.push(`occupation ${code} is listed in both ${prev} and ${sub.id}`);
      placed.set(code, sub.id);
      const occupation = byCode.get(code);
      if (!occupation) {
        problems.push(`occupation ${code} in ${sub.id} does not exist in ESCO`);
        continue;
      }
      try {
        if (branchOf(branches, occupation.isco).subBranch.id === sub.id) {
          problems.push(
            `occupation ${code} is already in ${sub.id} through ISCO ${occupation.isco}`,
          );
        }
      } catch {
        // An unplaced unit group is reported above.
      }
    }
  }

  if (problems.length > 0) throw new Error(`branch table:\n${problems.join("\n")}`);
}
