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
import { heldLevel, heldRole, placeCv, type RoleGraph } from "./states.ts";
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
 * The role each mapped job was held in. Years add up across the jobs of one occupation, since
 * experience carries over between employers. Jobs landing on one role share its entry.
 */
function heldRoles(
  graph: RoleGraph,
  jobs: Job[],
  chosen: Map<number, string | null>,
): CvResult["held"] {
  const yearsIn = new Map<string, number>();
  jobs.forEach((job, i) => {
    const occupation = chosen.get(i);
    if (occupation) yearsIn.set(occupation, (yearsIn.get(occupation) ?? 0) + (job.years ?? 0));
  });
  const held = new Map<string, string[]>();
  jobs.forEach((job, i) => {
    const occupation = chosen.get(i);
    if (!occupation) return;
    const { level, track } = heldLevel(
      job.title,
      job.responsibility,
      yearsIn.get(occupation) ?? null,
    );
    const role = heldRole(graph, occupation, level, track);
    if (!role) return;
    const evidence = [job.title, job.dates, job.responsibility?.quote].filter(
      (e): e is string => !!e,
    );
    held.set(role, [...new Set([...(held.get(role) ?? []), ...evidence])]);
  });
  return [...held].map(([role, evidence]) => ({ role, evidence }));
}
