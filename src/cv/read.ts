// Reading a CV: plain text in, CvResult out. Three model calls, each with at most one corrective
// retry; everything between them is code. The CV text is held only for the duration of the call.

import {
  checkExtraction,
  extractPrompt,
  occupationPrompt,
  skillPrompt,
  type Job,
} from "./extract.ts";
import { skillUniverse, type Mapper } from "./mapping.ts";
import type { CvResult } from "./result.ts";
import { behindRoles, heldLevel, heldRole, placeCv, type RoleGraph } from "./states.ts";
import { askVerified, fold, type Ask } from "./verify.ts";

/** About ten pages; also keeps every prompt under the model's 100k-token price step. */
export const MAX_CV_CHARS = 30_000;

/** The CV text cannot be read: empty or too long. Safe to show the user. */
export class CvInputError extends Error {}

export interface Reader {
  ask: Ask;
  graph: RoleGraph;
  mapper: Mapper;
  /** YYYY-MM-DD; "present" in a date range means this day. */
  today: string;
}

export interface Reading {
  result: CvResult;
  /** Every claim the verify gate dropped, for logs and calibration; never shown to the user. */
  dropped: string[];
}

export async function readCv(
  text: string,
  { ask, graph, mapper, today }: Reader,
): Promise<Reading> {
  if (!text.trim()) throw new CvInputError("the CV text is empty");
  if (text.length > MAX_CV_CHARS) {
    throw new CvInputError(`the CV text is longer than ${MAX_CV_CHARS} characters`);
  }
  const cv = fold(text);
  const dropped: string[] = [];

  const extraction = await askVerified(ask, extractPrompt(text, today), (x) =>
    checkExtraction(x, cv, today),
  );
  dropped.push(...extraction.problems);
  const { jobs, mentions } = extraction.kept;

  let chosen = new Map<number, string | null>();
  if (jobs.length > 0) {
    const candidates = jobs.map((job) => mapper.occupations([job.title, job.occupation]));
    const step = occupationPrompt(text, jobs, candidates, mapper);
    const choices = await askVerified(ask, step.prompt, step.check);
    dropped.push(...choices.problems);
    chosen = choices.kept;
  }
  const held = heldRoles(graph, jobs, chosen);

  const universe = skillUniverse(
    graph,
    held.map((h) => h.role),
    mentions.flatMap((m) => mapper.skills([m.quote, m.name])),
  );
  let shown = new Map<string, string[]>();
  if (universe.length > 0) {
    const step = skillPrompt(text, cv, universe, mapper);
    const skills = await askVerified(ask, step.prompt, step.check);
    dropped.push(...skills.problems);
    shown = skills.kept;
  }

  const placed = placeCv(
    graph,
    held.map((h) => h.role),
    new Set(shown.keys()),
  );
  return {
    result: {
      held,
      ...placed,
      skills: [...shown].map(([uri, evidence]) => ({ uri, evidence })),
    },
    dropped,
  };
}

/**
 * The role each mapped occupation was held in. The jobs of one occupation are pooled: years add up
 * across employers, since experience carries over, and the level is taken once, from the strongest
 * signal (title, else responsibility, else the pooled years) of any of its jobs. On one ladder only
 * the highest held rung stays; rungs below it are behind the person, and their evidence moves up.
 */
function heldRoles(
  graph: RoleGraph,
  jobs: Job[],
  chosen: Map<number, string | null>,
): CvResult["held"] {
  const byOccupation = new Map<string, Job[]>();
  jobs.forEach((job, i) => {
    const occupation = chosen.get(i);
    if (occupation) byOccupation.set(occupation, [...(byOccupation.get(occupation) ?? []), job]);
  });
  const held = new Map<string, string[]>();
  for (const [occupation, group] of byOccupation) {
    const years = group.reduce((sum, job) => sum + (job.years ?? 0), 0);
    const { level, track } = group
      .map((job) => heldLevel(job.title, job.responsibility, years))
      .reduce((best, next) => (next.level > best.level ? next : best));
    const role = heldRole(graph, occupation, level, track);
    if (!role) continue;
    const evidence = group
      .flatMap((job) => [job.title, job.dates, job.responsibility?.quote])
      .filter((e): e is string => !!e);
    held.set(role, [...new Set([...(held.get(role) ?? []), ...evidence])]);
  }
  const behind = behindRoles(graph, [...held.keys()]);
  for (const [role, evidence] of held) {
    if (!behind.has(role)) continue;
    held.delete(role);
    const above = [...held.keys()].find((id) => behindRoles(graph, [id]).has(role))!;
    held.set(above, [...new Set([...held.get(above)!, ...evidence])]);
  }
  return [...held].map(([role, evidence]) => ({ role, evidence }));
}
