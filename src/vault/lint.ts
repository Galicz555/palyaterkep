// Checks the role vault against its schema (docs/vault.md), the branch table and, when it has been
// built, ESCO. Usage: node src/vault/lint.ts

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { loadBranches, type Branch } from "../branches/branches.ts";
import type { Esco } from "../esco/model.ts";
import { readVault } from "./generate.ts";
import { readNote, Role } from "./note.ts";

const WIKILINK = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/gu;

/**
 * Every problem of the vault (relative path → text): a note that does not fit the schema, two
 * notes with one name (Obsidian links by name), a wikilink to no note, a branch or sub-branch the
 * table does not have. With ESCO: an occupation or skill ESCO does not have, and an occupation
 * without exactly one uncurated role, or with an uncurated role beside curated ones.
 */
export function lintVault(
  files: Map<string, string>,
  branches: Branch[],
  esco?: Pick<Esco, "occupations" | "skills">,
): string[] {
  const problems: string[] = [];
  const ids = new Map<string, string>();
  for (const file of files.keys()) {
    const id = path.basename(file, ".md");
    const other = ids.get(id);
    if (other !== undefined) problems.push(`${file}: same name as ${other}`);
    ids.set(id, file);
  }

  const subBranches = new Map(
    branches.flatMap((b) => b.subBranches.map((s) => [s.id, b.id] as const)),
  );
  const skills = new Set(esco?.skills.map((s) => s.uri));
  const roles = new Map<string, { generated: string[]; curated: string[] }>(
    esco?.occupations.map((o) => [o.uri, { generated: [], curated: [] }]),
  );
  for (const [file, text] of files) {
    for (const [, target = ""] of text.matchAll(WIKILINK)) {
      if (!ids.has(target.trim())) problems.push(`${file}: broken link [[${target}]]`);
    }
    const parsed = Role.safeParse(readNote(text).frontmatter);
    if (!parsed.success) {
      problems.push(`${file}: ${z.prettifyError(parsed.error).replace(/\n/gu, " ")}`);
      continue;
    }
    const role = parsed.data;
    const branch = subBranches.get(role.subBranch);
    if (branch === undefined) problems.push(`${file}: unknown sub-branch ${role.subBranch}`);
    else if (branch !== role.branch) {
      problems.push(`${file}: sub-branch ${role.subBranch} is not in branch ${role.branch}`);
    }
    if (!esco) continue;
    const occupation = roles.get(role.occupation);
    if (!occupation) problems.push(`${file}: unknown occupation ${role.occupation}`);
    else occupation[role.curated ? "curated" : "generated"].push(file);
    for (const skill of role.skills) {
      if (!skills.has(skill)) problems.push(`${file}: unknown skill ${skill}`);
    }
  }

  for (const [uri, { generated, curated }] of roles) {
    if (curated.length > 0 && generated.length > 0) {
      problems.push(`${generated.join(", ")}: uncurated role of ${uri}, which curated roles cover`);
    } else if (curated.length === 0 && generated.length !== 1) {
      problems.push(`occupation ${uri} has ${generated.length} uncurated roles`);
    }
  }
  return problems;
}

if (import.meta.main) {
  const ESCO = "raw/esco/esco.json";
  const esco = existsSync(ESCO) ? (JSON.parse(readFileSync(ESCO, "utf8")) as Esco) : undefined;
  if (!esco) console.log(`${ESCO} not built: occupations and skills not checked`);
  const files = readVault();
  const problems = lintVault(files, loadBranches(), esco);
  for (const problem of problems) console.error(problem);
  console.log(`${files.size} notes, ${problems.length} problems`);
  if (problems.length > 0 || files.size === 0) process.exitCode = 1;
}
