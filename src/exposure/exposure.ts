// Exposure to generative AI (MI-érintettség): the ILO's gradient for each ISCO-08 unit group, 1 to 4,
// shared by every ESCO occupation in the group (ADR 0004). Transcribed from the paper's Table A1.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export type Gradient = 1 | 2 | 3 | 4;

/** The gradient the map shows as replaceable: the highest, most tasks consistently exposed. */
export const REPLACEABLE: Gradient = 4;

export const EXPOSURE_FILE = "data/genai-exposure.json";

export const ExposureFile = z.strictObject({
  source: z.string().min(1),
  gradients: z.record(
    z.string().regex(/^\d{4}$/),
    z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  ),
});

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

/** ESCO code (`2512.4.1`) to its gradient; null where the ILO finds minimal or no exposure. */
export function readExposure(
  file = path.join(repositoryRoot(), EXPOSURE_FILE),
): (code: string) => Gradient | null {
  const { gradients } = ExposureFile.parse(JSON.parse(readFileSync(file, "utf8")));
  return (code) => gradients[code.slice(0, 4)] ?? null;
}
