// The branch table: every ISCO unit group belongs to one sub-branch of one main branch.

import { readFileSync } from "node:fs";
import type { IscoGroup, Text } from "../esco/model.ts";

export interface SubBranch {
  id: string;
  label: Text;
  /** ISCO minor (3 digits) or unit (4 digits) groups. */
  isco: string[];
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

/** Throws, listing every problem, unless each unit group of `iscoGroups` resolves to exactly one sub-branch. */
export function validateBranches(branches: Branch[], iscoGroups: IscoGroup[]): void {
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

  if (problems.length > 0) throw new Error(`branch table:\n${problems.join("\n")}`);
}
