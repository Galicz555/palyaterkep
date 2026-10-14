// A CV reading result (src/cv/result.ts) as the map, the list and the role pages use it.
// The result arrives from outside (a fixture file now, the reading route later), so it is
// checked at the door; nothing past `parseCvResult` has to doubt its shape.

import * as z from "zod/mini";
import type { CvResult } from "../../../src/cv/result.ts";
import { skillKey } from "./model.ts";

export type { CvResult };

const Evidence = z.array(z.string());

// `satisfies` keeps this in step with the interface: a field added to CvResult fails the type check here.
const CvSchema = z.object({
  held: z.array(z.object({ role: z.string(), evidence: Evidence })),
  covered: z.array(z.object({ role: z.string(), coverage: z.number().check(z.gte(0), z.lte(1)) })),
  reachable: z.array(
    z.object({
      role: z.string(),
      from: z.string(),
      edge: z.enum(["lateral", "progression"]),
      gap: z.array(z.string()),
    }),
  ),
  skills: z.array(z.object({ uri: z.string(), evidence: Evidence })),
}) satisfies z.ZodMiniType<CvResult>;

/** Throws an Error whose message says in Hungarian what is wrong with `json`. */
export function parseCvResult(json: unknown): CvResult {
  const parsed = CvSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join(".") || "a fájl";
    throw new Error(`Az eredmény nem a várt alakú (${where}).`);
  }
  return parsed.data;
}

/** What the CV says about one role. A role is in one state: held beats covered beats reachable. */
export type RoleState =
  | { kind: "held"; evidence: string[] }
  | { kind: "covered"; coverage: number }
  | { kind: "reachable"; from: string; edge: "lateral" | "progression"; gap: string[] };

export interface CvView {
  /** By role id. */
  states: Map<string, RoleState>;
  /** Keys (`skillKey`) of the skills the CV shows. */
  skills: Set<string>;
  /** Evidence by skill key. */
  evidence: Map<string, string[]>;
}

export function readCvResult(result: CvResult): CvView {
  const states = new Map<string, RoleState>();
  for (const { role, evidence } of result.held) states.set(role, { kind: "held", evidence });
  for (const { role, coverage } of result.covered) {
    if (!states.has(role)) states.set(role, { kind: "covered", coverage });
  }
  for (const { role, from, edge, gap } of result.reachable) {
    const known = states.get(role);
    // Reached from two roles: keep the one with the shorter gap, the nearer step.
    if (known && (known.kind !== "reachable" || known.gap.length <= gap.length)) continue;
    states.set(role, { kind: "reachable", from, edge, gap });
  }
  return {
    states,
    skills: new Set(result.skills.map((s) => skillKey(s.uri))),
    evidence: new Map(result.skills.map((s) => [skillKey(s.uri), s.evidence])),
  };
}
