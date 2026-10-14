// Build-time data: the vault, the branch table and ESCO, read once through the same parsing the
// vault lint uses (src/vault, src/branches). Runs while the pages are prerendered, never in the browser.
// Paths are relative to the repository root, found from this file so it works from vite, vitest
// and the built server alike.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BRANCHES_FILE, loadBranches } from "../../../../src/branches/branches.ts";
import { readDemands } from "../../../../src/demands/demands.ts";
import type { Esco, Occupation, Skill } from "../../../../src/esco/model.ts";
import { readVault, VAULT } from "../../../../src/vault/generate.ts";
import { linkTarget, readNote, Role } from "../../../../src/vault/note.ts";
import type { Level, MapData, RoleDetail, RoleLink } from "../model.ts";
import { skillKey } from "../model.ts";

/** The nearest ancestor holding pnpm-workspace.yaml. */
function repositoryRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
    const up = path.dirname(dir);
    if (up === dir) throw new Error("repository root (pnpm-workspace.yaml) not found");
    dir = up;
  }
  return dir;
}

export const ROOT = repositoryRoot();
const ESCO_FILE = "raw/esco/esco.json";

interface Loaded {
  data: MapData;
  /** The notes behind `data.roles`, same order. */
  notes: Role[];
  index: Map<string, number>;
  adjacent: Set<number>[];
}

interface EscoIndex {
  esco: Esco;
  occupations: Map<string, Occupation>;
  skills: Map<string, Skill>;
}

let loaded: Loaded | undefined;
let escoLoaded: EscoIndex | undefined;

function load(): Loaded {
  if (loaded) return loaded;
  const branches = loadBranches(path.join(ROOT, BRANCHES_FILE));
  const branchIndex = new Map(branches.map((b, i) => [b.id, i]));
  const subIndex = branches.map((b) => new Map(b.subBranches.map((s, i) => [s.id, i])));

  const entries = [...readVault(path.join(ROOT, VAULT))].map(([file, text]) => {
    const parsed = Role.safeParse(readNote(text).frontmatter);
    if (!parsed.success) throw new Error(`${file}: not a role note (run pnpm vault:lint)`);
    const note = parsed.data;
    const branch = branchIndex.get(note.branch);
    const sub = branch === undefined ? undefined : subIndex[branch]?.get(note.subBranch);
    if (branch === undefined || sub === undefined) {
      throw new Error(`${file}: ${note.branch}/${note.subBranch} is not in the branch table`);
    }
    return { id: path.basename(file, ".md"), note, branch, sub };
  });
  entries.sort(
    (a, b) =>
      a.branch - b.branch ||
      a.sub - b.sub ||
      a.note.level - b.note.level ||
      a.note.label.localeCompare(b.note.label, "hu"),
  );

  const demands = readDemands();
  const index = new Map(entries.map((e, i) => [e.id, i]));
  const target = (link: string) => {
    const i = index.get(linkTarget(link));
    if (i === undefined) throw new Error(`broken link ${link}`);
    return i;
  };
  const lateral = new Map<string, [number, number]>();
  const progression: [number, number][] = [];
  entries.forEach(({ note }, i) => {
    for (const link of note.lateral) {
      const j = target(link);
      lateral.set(`${Math.min(i, j)}:${Math.max(i, j)}`, [Math.min(i, j), Math.max(i, j)]);
    }
    for (const link of note.progression ?? []) progression.push([i, target(link)]);
  });
  const adjacent = entries.map(() => new Set<number>());
  for (const [a, b] of lateral.values()) {
    adjacent[a]?.add(b);
    adjacent[b]?.add(a);
  }

  loaded = {
    data: {
      branches: branches.map((b) => ({
        id: b.id,
        label: b.label.hu,
        subBranches: b.subBranches.map((s) => ({ id: s.id, label: s.label.hu })),
      })),
      roles: entries.map(({ id, note, branch, sub }) => ({
        id,
        label: note.label,
        level: note.level as Level,
        management: note.track === "management",
        curated: note.curated,
        branch,
        sub,
        demands: demands.get(note.occupation) ?? null,
      })),
      lateral: [...lateral.values()],
      progression,
    },
    notes: entries.map((e) => e.note),
    index,
    adjacent,
  };
  return loaded;
}

function loadEsco(): EscoIndex {
  if (escoLoaded) return escoLoaded;
  let text: string;
  try {
    text = readFileSync(path.join(ROOT, ESCO_FILE), "utf8");
  } catch {
    throw new Error(`${ESCO_FILE} is missing: build ESCO first (pnpm esco)`);
  }
  const esco = JSON.parse(text) as Esco;
  escoLoaded = {
    esco,
    occupations: new Map(esco.occupations.map((o) => [o.uri, o])),
    skills: new Map(esco.skills.map((s) => [s.uri, s])),
  };
  return escoLoaded;
}

export const mapData = (): MapData => load().data;
export const roleIds = (): string[] => load().data.roles.map((r) => r.id);
export const escoVersion = (): string => loadEsco().esco.version;
export const esco = (): Esco => loadEsco().esco;

/** ESCO skill key → Hungarian label, for every skill some role needs. */
export function skillLabels(): Record<string, string> {
  const { notes } = load();
  const { skills } = loadEsco();
  const labels: Record<string, string> = {};
  for (const note of notes) {
    for (const uri of note.skills) labels[skillKey(uri)] = skills.get(uri)?.label.hu ?? "";
  }
  return labels;
}

/** One role's page: undefined when the vault has no such role. */
export function roleDetail(id: string): RoleDetail | undefined {
  const { data, notes, index, adjacent } = load();
  const i = index.get(id);
  const role = data.roles[i ?? -1];
  const note = notes[i ?? -1];
  if (i === undefined || !role || !note) return undefined;
  const { occupations, skills } = loadEsco();
  const occupation = occupations.get(note.occupation);
  const branch = data.branches[role.branch];
  const subBranch = branch?.subBranches[role.sub];
  if (!occupation || !branch || !subBranch) throw new Error(`${id}: occupation or branch missing`);

  const link = (j: number): RoleLink => {
    const other = data.roles[j];
    if (!other) throw new Error(`${id}: no role ${j}`);
    return { id: other.id, label: other.label, level: other.level };
  };
  // The note's own edges come strongest first; edges only other notes list follow, by name.
  const own = note.lateral.map((l) => index.get(linkTarget(l))).filter((j) => j !== undefined);
  const incoming = [...adjacent[i]!]
    .filter((j) => !own.includes(j))
    .sort((a, b) => data.roles[a]!.label.localeCompare(data.roles[b]!.label, "hu"));

  return {
    ...link(i),
    management: role.management,
    curated: role.curated,
    branch: { id: branch.id, label: branch.label },
    subBranch: { id: subBranch.id, label: subBranch.label },
    description: occupation.description.hu,
    code: occupation.code,
    skills: note.skills
      .map((uri) => {
        const skill = skills.get(uri);
        return {
          key: skillKey(uri),
          label: skill?.label.hu ?? "",
          knowledge: skill?.skillType === "knowledge",
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "hu")),
    lateral: [...own, ...incoming].map(link),
    progression: (note.progression ?? []).map((l) => link(index.get(linkTarget(l))!)),
    previous: data.progression
      .filter(([, to]) => to === i)
      .map(([from]) => link(from))
      .sort((a, b) => a.label.localeCompare(b.label, "hu")),
  };
}
