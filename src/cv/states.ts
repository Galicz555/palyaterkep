// Where a CV lands on the map: the level of a held job, the role it maps to, and from the held
// roles and the skills the CV shows, the covered and reachable roles with their gaps. Pure; the
// terms are the glossary's.

import path from "node:path";
import { readVault, VAULT } from "../vault/generate.ts";
import { linkTarget, readNote, Role, type Track } from "../vault/note.ts";
import type { CvResult } from "./result.ts";
import { words } from "./verify.ts";

/** A role not held is covered when the CV shows at least this share of its skills. */
export const COVERAGE_THRESHOLD = 0.6;

export type EdgeKind = "lateral" | "progression";

export interface RoleGraph {
  roles: Map<string, Role>;
  /** Undirected: the union of every note's lists, listed on both ends. */
  edges: Map<string, { to: string; edge: EdgeKind }[]>;
  byOccupation: Map<string, string[]>;
}

export function buildGraph(roles: Map<string, Role>): RoleGraph {
  const edges = new Map(
    [...roles.keys()].map((id) => [id, [] as { to: string; edge: EdgeKind }[]]),
  );
  const add = (a: string, b: string, edge: EdgeKind) => {
    const list = edges.get(a);
    if (list && roles.has(b) && !list.some((e) => e.to === b && e.edge === edge))
      list.push({ to: b, edge });
  };
  const byOccupation = new Map<string, string[]>();
  for (const [id, role] of roles) {
    byOccupation.set(role.occupation, [...(byOccupation.get(role.occupation) ?? []), id]);
    for (const [kind, links] of [
      ["lateral", role.lateral],
      ["progression", role.progression ?? []],
    ] as const) {
      for (const target of links.map(linkTarget)) {
        add(id, target, kind);
        add(target, id, kind);
      }
    }
  }
  return { roles, edges, byOccupation };
}

/** The vault as a graph; `pnpm vault:lint` guarantees every note fits the schema. */
export function loadGraph(dir = VAULT): RoleGraph {
  const roles = new Map<string, Role>();
  for (const [file, text] of readVault(dir)) {
    roles.set(path.basename(file, ".md"), Role.parse(readNote(text).frontmatter));
  }
  return buildGraph(roles);
}

// Matched against the title folded to lower-case ASCII words; the highest level named wins. As the
// curated ladders read them: a lead, tech lead or "-vezető" leads a team at the senior level (3,
// management); staff and principal engineers and architects are senior individual contributors
// (4); a manager,
// head or "osztályvezető" leads team leads (4); chiefs and directors lead an organisation (5). "Staff"
// alone is no level: a staff nurse is a nurse.
const TITLE_LEVELS: [RegExp, number][] = [
  [/\b(junior|jr|intern|internship|trainee|apprentice|gyakornok|palyakezdo|kezdo)\b/u, 1],
  [/\b(medior|mid|intermediate)\b/u, 2],
  [/\b(senior|sr|szenior|tapasztalt|experienced|lead|leader)\b|vezeto\b/u, 3],
  [
    /\b(principal|head|manager|menedzser|architect)\b|architekt\b|\bstaff (engineer|developer|software)|(osztaly|reszleg|uzletag)vezeto\b/u,
    4,
  ],
  [/\b(chief|c[eitfop]o|director|vp|vice president|alelnok|ugyvezeto)\b|igazgato/u, 5],
];
const MANAGEMENT =
  /vezeto\b|\b(lead|leader|manager|menedzser|head|director|chief|c[eitfop]o|vp|vice president|alelnok)\b|igazgato/u;

export interface Responsibility {
  level: 4 | 5;
  leadsPeople: boolean;
}

/**
 * The level and track of a held job. The title decides first; if it names no level, a stated
 * responsibility can give 4 or 5; failing both, the years in the occupation: under 2 → 1, 2–5 → 2,
 * over 5 → 3. Unknown years count as none. Years never give 4 or 5.
 */
export function heldLevel(
  title: string,
  responsibility: Responsibility | null,
  years: number | null,
): { level: number; track: Track } {
  const folded = words(title);
  const byTitle = Math.max(0, ...TITLE_LEVELS.filter(([re]) => re.test(folded)).map(([, l]) => l));
  const byYears = (years ?? 0) < 2 ? 1 : (years ?? 0) <= 5 ? 2 : 3;
  const level = byTitle || responsibility?.level || byYears;
  const track =
    MANAGEMENT.test(folded) || (!byTitle && responsibility?.leadsPeople)
      ? "management"
      : "individual";
  return { level, track };
}

/**
 * The role a held occupation maps to. Without curated roles, its one uncurated role. With them,
 * the curated role closest to the level and track among the occupation's own and those its rungs
 * reach by progression, since a ladder chains occupations (a principal developer is held as
 * „Szoftverarchitekt”, an ESCO occupation of its own). Closest: a track mismatch costs 10, each
 * level apart 2, each progression step away 1, so a near rung one level off beats an exact match
 * in another ladder.
 */
export function heldRole(
  graph: RoleGraph,
  occupation: string,
  level: number,
  track: Track,
): string | undefined {
  const ids = graph.byOccupation.get(occupation) ?? [];
  const own = ids.filter((id) => graph.roles.get(id)!.curated);
  if (own.length === 0) return ids[0];
  const steps = new Map(own.map((id) => [id, 0]));
  for (const id of steps.keys()) {
    for (const { to, edge } of graph.edges.get(id) ?? []) {
      if (edge === "progression" && graph.roles.get(to)!.curated && !steps.has(to))
        steps.set(to, steps.get(id)! + 1);
    }
  }
  const cost = (id: string) => {
    const role = graph.roles.get(id)!;
    return (role.track === track ? 0 : 10) + 2 * Math.abs(role.level - level) + steps.get(id)!;
  };
  return [...steps.keys()].sort((a, b) => cost(a) - cost(b) || (a < b ? -1 : 1))[0];
}

/** Rungs below any of the given roles along progression edges: behind the person on their ladder. */
export function behindRoles(graph: RoleGraph, from: string[]): Set<string> {
  const behind = new Set<string>();
  const below = [...from];
  while (below.length > 0) {
    const id = below.pop()!;
    for (const { to, edge } of graph.edges.get(id) ?? []) {
      const lower = graph.roles.get(to)!.level < graph.roles.get(id)!.level;
      if (edge === "progression" && lower && !behind.has(to)) {
        behind.add(to);
        below.push(to);
      }
    }
  }
  return behind;
}

/**
 * Covered: roles neither held nor behind a held role whose skills the CV shows at or above the
 * threshold. Reachable: roles one
 * edge from a held or covered role, neither themselves, with the skills the CV does not show; a
 * held role's own skills are not part of a gap from it, since holding the role shows them. A
 * progression edge only counts outwards, to a higher level, and rungs below a held role on its
 * ladder are behind the person, so no edge makes them reachable. Each reachable role is listed
 * once, from a held role before a covered one and by progression before lateral.
 */
export function placeCv(
  graph: RoleGraph,
  held: string[],
  shown: Set<string>,
  threshold = COVERAGE_THRESHOLD,
): Pick<CvResult, "covered" | "reachable"> {
  const heldSet = new Set(held);
  const behind = behindRoles(graph, held);
  const covered: CvResult["covered"] = [];
  for (const [id, role] of graph.roles) {
    if (heldSet.has(id) || behind.has(id)) continue;
    const coverage = role.skills.filter((s) => shown.has(s)).length / role.skills.length;
    if (coverage >= threshold) covered.push({ role: id, coverage });
  }
  covered.sort((a, b) => b.coverage - a.coverage || (a.role < b.role ? -1 : 1));

  const placed = new Set([...heldSet, ...covered.map((c) => c.role), ...behind]);
  const best = new Map<string, { from: string; edge: EdgeKind; rank: number }>();
  for (const [from, rankFrom] of [
    ...held.map((id) => [id, 0] as const),
    ...covered.map((c) => [c.role, 2] as const),
  ]) {
    const level = graph.roles.get(from)!.level;
    for (const { to, edge } of graph.edges.get(from) ?? []) {
      if (placed.has(to)) continue;
      if (edge === "progression" && graph.roles.get(to)!.level <= level) continue;
      const rank = rankFrom + (edge === "progression" ? 0 : 1);
      if ((best.get(to)?.rank ?? Infinity) > rank) best.set(to, { from, edge, rank });
    }
  }
  const reachable = [...best].map(([role, { from, edge }]) => {
    const known = new Set(heldSet.has(from) ? graph.roles.get(from)!.skills : []);
    const gap = graph.roles.get(role)!.skills.filter((s) => !shown.has(s) && !known.has(s));
    return { role, from, edge, gap };
  });
  reachable.sort((a, b) => a.gap.length - b.gap.length || (a.role < b.role ? -1 : 1));
  return { covered, reachable };
}
