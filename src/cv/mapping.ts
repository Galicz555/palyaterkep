// From the words of a CV to ESCO concepts, without a model: candidate occupations for a job title
// and candidate skills for a skill mention, by character trigrams over ESCO's Hungarian and
// English labels and alternative labels. Trigrams survive Hungarian compounds and suffixes
// ("Pythonban", "backend-fejlesztő") where whole-word matching fails. A model then chooses among
// the candidates; this module only has to put the right one in the list.

import type { Esco, Labels, Text } from "../esco/model.ts";
import type { RoleGraph } from "./states.ts";
import { words } from "./verify.ts";

/** Candidate occupations shown to the model per job. */
export const OCCUPATION_CANDIDATES = 8;
/** Candidate skills kept per skill mention, and the least trigram similarity they need. */
export const SKILL_CANDIDATES = 3;
export const SKILL_MIN_SCORE = 0.45;
/** The most skills the model is asked about in one CV. */
export const UNIVERSE_CAP = 400;
/** Roles the skill mentions point at, beyond the held ones, whose skills are asked about. */
export const MENTIONED_ROLES = 10;

export interface Hit {
  key: string;
  score: number;
}

const trigrams = (text: string): string[] => {
  const out = new Set<string>();
  for (const word of words(text).split(" ")) {
    if (!word) continue;
    const padded = ` ${word} `;
    for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  }
  return [...out];
};

/** A search over labels: each key scores the Dice similarity of its best-matching label. */
export function labelIndex(entries: Iterable<[key: string, labels: string[]]>) {
  const labelKey: number[] = [];
  const labelSize: number[] = [];
  const keys: string[] = [];
  const postings = new Map<string, number[]>();
  for (const [key, labels] of entries) {
    const k = keys.push(key) - 1;
    for (const label of new Set(labels)) {
      const grams = trigrams(label);
      if (grams.length === 0) continue;
      const id = labelKey.push(k) - 1;
      labelSize.push(grams.length);
      for (const g of grams) {
        const list = postings.get(g);
        if (list) list.push(id);
        else postings.set(g, [id]);
      }
    }
  }
  return (query: string, limit: number): Hit[] => {
    const grams = trigrams(query);
    const shared = new Map<number, number>();
    for (const g of grams)
      for (const id of postings.get(g) ?? []) shared.set(id, (shared.get(id) ?? 0) + 1);
    const best = new Map<number, number>();
    for (const [id, n] of shared) {
      const score = (2 * n) / (grams.length + labelSize[id]!);
      const k = labelKey[id]!;
      if (score > (best.get(k) ?? 0)) best.set(k, score);
    }
    return [...best]
      .map(([k, score]) => ({ key: keys[k]!, score }))
      .sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1))
      .slice(0, limit);
  };
}

/** What the prompts show of an ESCO concept. */
export interface Concept {
  hu: string;
  en: string;
  /** The first sentence of the English description; occupations only. */
  about?: string;
}

export interface Mapper {
  occupation: Map<string, Concept>;
  skill: Map<string, Concept>;
  /** Candidate occupations for a job, from its title and the model's plain-English name for it. */
  occupations(queries: string[]): string[];
  /** Candidate skills for a skill mention, best first; only skills some role needs. */
  skills(queries: string[]): string[];
}

export function buildMapper(esco: Pick<Esco, "occupations" | "skills">, graph: RoleGraph): Mapper {
  const needed = new Set([...graph.roles.values()].flatMap((r) => r.skills));
  const skills = esco.skills.filter((s) => needed.has(s.uri));
  const label = (c: { label: Text; altLabels: Labels }) => [
    c.label.hu,
    c.label.en,
    ...c.altLabels.hu,
    ...c.altLabels.en,
  ];
  const searchOccupations = labelIndex(esco.occupations.map((o) => [o.uri, label(o)]));
  const searchSkills = labelIndex(skills.map((s) => [s.uri, label(s)]));
  const merge = (
    search: (q: string, n: number) => Hit[],
    queries: string[],
    n: number,
    min = 0,
  ) => {
    const best = new Map<string, number>();
    for (const hit of queries.flatMap((q) => search(q, n)))
      best.set(hit.key, Math.max(best.get(hit.key) ?? 0, hit.score));
    return [...best]
      .filter(([, score]) => score >= min)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, n)
      .map(([key]) => key);
  };
  return {
    occupation: new Map(
      esco.occupations.map((o) => [
        o.uri,
        { hu: o.label.hu, en: o.label.en, about: o.description.en.split(/(?<=\.)\s/u)[0] ?? "" },
      ]),
    ),
    skill: new Map(skills.map((s) => [s.uri, { hu: s.label.hu, en: s.label.en }])),
    occupations: (queries) => merge(searchOccupations, queries, OCCUPATION_CANDIDATES),
    skills: (queries) => merge(searchSkills, queries, SKILL_CANDIDATES, SKILL_MIN_SCORE),
  };
}

/**
 * The skills the model is asked about, most telling first, at most `cap`: the candidates of the
 * CV's own skill mentions, the held roles' skills, their neighbours' skills (so a reachable role's
 * gap is not inflated by a skill nobody asked about), and the skills of the roles the mentions
 * point at most (so a covered role away from the held ones can be found).
 */
export function skillUniverse(
  graph: RoleGraph,
  held: string[],
  mentioned: string[],
  cap = UNIVERSE_CAP,
): string[] {
  const neighbours = held.flatMap((id) => (graph.edges.get(id) ?? []).map((e) => e.to));
  const seeds = new Set(mentioned);
  const pointedAt = [...graph.roles]
    .map(([id, role]) => ({ id, hits: role.skills.filter((s) => seeds.has(s)).length }))
    .filter((r) => r.hits >= 2)
    .sort((a, b) => b.hits - a.hits || (a.id < b.id ? -1 : 1))
    .slice(0, MENTIONED_ROLES)
    .map((r) => r.id);
  const skillsOf = (ids: string[]) => ids.flatMap((id) => graph.roles.get(id)?.skills ?? []);
  return [
    ...new Set([...mentioned, ...skillsOf(held), ...skillsOf(neighbours), ...skillsOf(pointedAt)]),
  ].slice(0, cap);
}
