// Job demands (terhelés): how physical, mental and emotional an occupation's work is, as
// percentile ranks across the scored ESCO occupations (ADR 0003). Written by `pnpm demands`.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const DIMENSIONS = ["physical", "mental", "emotional"] as const;
export type Demands = [number, number, number];

export const DEMANDS_FILE = "data/demands.json";

const Rank = z.number().min(0).max(1);

export const DemandsFile = z.strictObject({
  source: z.string().min(1),
  dimensions: z.tuple([z.literal("physical"), z.literal("mental"), z.literal("emotional")]),
  occupations: z.record(
    z.string().startsWith("http://data.europa.eu/esco/occupation/"),
    z.tuple([Rank, Rank, Rank]),
  ),
});
export type DemandsFile = z.infer<typeof DemandsFile>;

/** The nearest ancestor of this file holding pnpm-workspace.yaml, so vite, vitest and node agree. */
function repositoryRoot(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
    const up = path.dirname(dir);
    if (up === dir) throw new Error("repository root (pnpm-workspace.yaml) not found");
    dir = up;
  }
  return dir;
}

/** Occupation URI to [physical, mental, emotional]. An occupation without O*NET data is absent. */
export function readDemands(
  file = path.join(repositoryRoot(), DEMANDS_FILE),
): Map<string, Demands> {
  const parsed = DemandsFile.parse(JSON.parse(readFileSync(file, "utf8")));
  return new Map(Object.entries(parsed.occupations));
}
