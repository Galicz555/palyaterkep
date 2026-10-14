// Writes the role vault: one uncurated role per ESCO occupation that no curated role covers, with
// the proposed level and track, the essential skills and the computed lateral edges (docs/vault.md).
// Curated notes, and files the generator cannot read as its own, are never written or deleted.
// Usage: node src/vault/generate.ts  (expects raw/esco/esco.json and data/proposals.json)

import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadBranches, placeOccupation, type Branch } from "../branches/branches.ts";
import type { Esco, Occupation } from "../esco/model.ts";
import { link, readNote, Role, slugify, writeNote, type Track } from "./note.ts";
import { loadProposals, type Proposals } from "./propose.ts";

export const VAULT = "vault";

/** Lateral edges: IDF-weighted Jaccard of skills, at least this, between levels at most 1 apart. */
export const LATERAL_MIN = 0.12;
/** At most this many lateral edges per role. */
export const LATERAL_CAP = 6;

const LEVEL_NAMES = ["belépő", "önálló", "tapasztalt", "kiemelt", "stratégiai"];
const TRACK_NAMES: Record<Track, string> = { individual: "szakértői", management: "vezetői" };

export interface Ranked {
  id: string;
  occupation: string;
  level: number;
  skills: string[];
}

/**
 * Lateral edges between roles of different occupations whose levels are at most 1 apart. Skills
 * shared by many roles weigh less (IDF), so generic ones like "manages staff" do not link everything.
 * Candidate edges are taken strongest first while both ends have room under the cap, so every
 * edge is listed on both of its roles and no role exceeds the cap.
 */
export function lateralEdges(
  roles: Ranked[],
  min = LATERAL_MIN,
  cap = LATERAL_CAP,
): Map<string, string[]> {
  const df = new Map<string, number>();
  for (const role of roles) for (const s of role.skills) df.set(s, (df.get(s) ?? 0) + 1);
  const weight = (skill: string) => Math.log(roles.length / (df.get(skill) ?? 1));
  const total = roles.map((role) => role.skills.reduce((sum, s) => sum + weight(s), 0));
  const holders = new Map<string, number[]>();
  roles.forEach((role, i) =>
    role.skills.forEach((s) => holders.set(s, [...(holders.get(s) ?? []), i])),
  );

  const candidates: { a: number; b: number; score: number }[] = [];
  roles.forEach((role, a) => {
    const shared = new Map<number, number>();
    for (const s of role.skills) {
      for (const b of holders.get(s) ?? [])
        if (b > a) shared.set(b, (shared.get(b) ?? 0) + weight(s));
    }
    for (const [b, common] of shared) {
      const other = roles[b]!;
      if (other.occupation === role.occupation || Math.abs(other.level - role.level) > 1) continue;
      const score = common / (total[a]! + total[b]! - common);
      if (score >= min) candidates.push({ a, b, score });
    }
  });
  candidates.sort((x, y) => y.score - x.score || x.a - y.a || x.b - y.b);

  const edges = new Map(roles.map((role) => [role.id, [] as string[]]));
  for (const { a, b } of candidates) {
    const ea = edges.get(roles[a]!.id)!;
    const eb = edges.get(roles[b]!.id)!;
    if (ea.length >= cap || eb.length >= cap) continue;
    ea.push(roles[b]!.id);
    eb.push(roles[a]!.id);
  }
  return edges;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The note of an uncurated role: the frontmatter is the data, the body renders it in Hungarian. */
export function renderRole(
  role: Role,
  occupation: Occupation,
  placement: { branch: string; subBranch: string },
  skillLabel: (uri: string) => string,
  roleLabel: (id: string) => string,
): string {
  const skills = role.skills.map(skillLabel).sort((a, b) => a.localeCompare(b, "hu"));
  const laterals = role.lateral.map((l) => l.slice(2, -2));
  const body = [
    `# ${capitalize(role.label)}`,
    `${capitalize(LEVEL_NAMES[role.level - 1]!)} szint (${role.level}), ${TRACK_NAMES[role.track]} pályatípus. _Gépi javaslat, nem ellenőrzött._`,
    `**Ág:** ${placement.branch} › ${placement.subBranch}  \n**ESCO:** [${occupation.label.hu}](${occupation.uri}) (${occupation.code})`,
    occupation.description.hu,
    `## Készségek\n\n${skills.map((s) => `- ${s}`).join("\n")}`,
    `## Váltások\n\n${laterals.map((id) => `- [[${id}|${roleLabel(id)}]]`).join("\n") || "Nincs."}`,
  ];
  return writeNote(role, body.join("\n\n"));
}

/** What the generator may write: an existing file is its own only if it says `curated: false`. */
const isGenerated = (text: string): boolean => {
  const frontmatter = readNote(text).frontmatter;
  return typeof frontmatter === "object" && frontmatter !== null && "curated" in frontmatter
    ? frontmatter.curated === false
    : false;
};

/**
 * The vault the generator wants, from the existing files (relative path → text): which files to
 * write and which of its own to delete. Curated notes stay as they are; an occupation a curated
 * role covers gets no uncurated role; a generated id never takes a curated note's name.
 */
export function planVault(
  existing: Map<string, string>,
  esco: Pick<Esco, "occupations" | "skills">,
  branches: Branch[],
  proposals: Proposals,
): { write: Map<string, string>; remove: string[] } {
  const curated = new Map<string, Role>();
  const kept = new Set<string>();
  for (const [file, text] of existing) {
    if (isGenerated(text)) continue;
    const id = path.basename(file, ".md");
    kept.add(id);
    const frontmatter = readNote(text).frontmatter;
    const role = Role.safeParse(frontmatter);
    if (role.success) curated.set(id, role.data);
    else if ((frontmatter as { curated?: unknown } | undefined)?.curated === true) {
      throw new Error(
        `${file}: a curated note that does not fit the role schema; run pnpm vault:lint`,
      );
    }
  }
  const covered = new Set([...curated.values()].map((role) => role.occupation));

  const uncovered = esco.occupations.filter((o) => !covered.has(o.uri));
  const counts = new Map<string, number>();
  for (const o of uncovered)
    counts.set(slugify(o.label.hu), (counts.get(slugify(o.label.hu)) ?? 0) + 1);
  const generated = uncovered.map((occupation) => {
    const proposal = proposals[occupation.code];
    if (!proposal) throw new Error(`no proposal for ${occupation.code}; run pnpm propose`);
    const slug = slugify(occupation.label.hu);
    const id =
      counts.get(slug) === 1 && !kept.has(slug) ? slug : `${slug}-${slugify(occupation.code)}`;
    if (kept.has(id))
      throw new Error(`generated id ${id} is taken by a file the generator does not own`);
    const { branch, subBranch } = placeOccupation(branches, occupation);
    return { id, occupation, proposal, branch, subBranch };
  });

  const ranked: Ranked[] = [
    ...[...curated].map(([id, role]) => ({ id, ...role })),
    ...generated.map((g) => ({
      id: g.id,
      occupation: g.occupation.uri,
      level: g.proposal.level,
      skills: g.occupation.essential,
    })),
  ].sort((a, b) => (a.id < b.id ? -1 : 1));
  const edges = lateralEdges(ranked);
  const labels = new Map([
    ...[...curated].map(([id, role]) => [id, role.label] as const),
    ...generated.map((g) => [g.id, g.occupation.label.hu] as const),
  ]);
  const skillLabels = new Map(esco.skills.map((s) => [s.uri, s.label.hu]));

  const write = new Map<string, string>();
  for (const g of generated) {
    const role: Role = {
      curated: false,
      occupation: g.occupation.uri,
      label: g.occupation.label.hu,
      level: g.proposal.level,
      track: g.proposal.track,
      branch: g.branch.id,
      subBranch: g.subBranch.id,
      skills: [...g.occupation.essential].sort(),
      lateral: (edges.get(g.id) ?? []).map(link),
    };
    const text = renderRole(
      role,
      g.occupation,
      { branch: g.branch.label.hu, subBranch: g.subBranch.label.hu },
      (uri) => skillLabels.get(uri) ?? uri,
      (id) => labels.get(id) ?? id,
    );
    write.set(`${g.id}.md`, text);
  }
  const remove = [...existing]
    .filter(([file, text]) => isGenerated(text) && !write.has(file))
    .map(([file]) => file);
  return { write, remove };
}

export function readVault(dir = VAULT): Map<string, string> {
  const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((f) =>
    f.endsWith(".md"),
  );
  return new Map(files.sort().map((f) => [f, readFileSync(path.join(dir, f), "utf8")]));
}

if (import.meta.main) {
  const esco = JSON.parse(readFileSync("raw/esco/esco.json", "utf8")) as Esco;
  mkdirSync(VAULT, { recursive: true });
  const existing = readVault();
  const { write, remove } = planVault(existing, esco, loadBranches(), loadProposals());
  let changed = 0;
  for (const [file, text] of write) {
    if (existing.get(file) === text) continue;
    writeFileSync(path.join(VAULT, file), text);
    changed++;
  }
  for (const file of remove) rmSync(path.join(VAULT, file));
  console.log(`${write.size} uncurated roles (${changed} written, ${remove.length} removed)`);
}
