// Proposes a level and a track for every ESCO occupation, on the subscription CLI, and caches the
// answers in data/proposals.json by ESCO code; a rerun only asks for codes not yet proposed.
// Usage: node src/vault/propose.ts  (expects raw/esco/esco.json from `pnpm esco`)

import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import type { Esco, Occupation } from "../esco/model.ts";
import { askCli } from "../shared/claude-cli.ts";
import { Level, Track } from "./note.ts";

export const PROPOSALS_FILE = "data/proposals.json";
const MODEL = "sonnet";
const BATCH = 40;
const PARALLEL = 4;

export const Proposal = z.object({ level: Level, track: Track });
export type Proposal = z.infer<typeof Proposal>;
export const Proposals = z.record(z.string(), Proposal);
export type Proposals = z.infer<typeof Proposals>;

export const loadProposals = (file = PROPOSALS_FILE): Proposals =>
  Proposals.parse(JSON.parse(readFileSync(file, "utf8")));

/** One entry per line, codes sorted, so a rerun's diff shows only what changed. */
export function formatProposals(proposals: Proposals): string {
  const lines = Object.entries(proposals)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([code, p]) => `  "${code}": { "level": ${p.level}, "track": "${p.track}" }`);
  return `{\n${lines.join(",\n")}\n}\n`;
}

const Answer = z.object({
  roles: z.array(z.object({ code: z.string(), level: Level, track: Track })),
});

export const PROMPT = `You place job titles on a career map. For every occupation below give a level and a track.

level: the career stage at which a person typically holds this job title, on this scale:
1 belépő: learning the work under guidance.
2 önálló: does the everyday work alone.
3 tapasztalt: handles the hard cases and helps others with them.
4 kiemelt: shapes how a team or a field of the work is done.
5 stratégiai: shapes how an organisation or a profession works.
Judge the title itself, as people who hold it typically are. Examples: kitchen assistant 1, cook 2, sous chef 3, head chef 4, chief executive officer 5. A title people keep through their whole career (software developer, nurse, lawyer, electrician) sits at its typical stage, usually 2. Helpers, assistants, trainees and apprentices are usually 1. A title that needs years of experience before anyone holds it is 3 or more.

track: "individual" when the job is doing the work itself, however senior or expert (an individual contributor); "management" when leading people (supervising, managing or directing staff) is the core of the job.

Answer for every code exactly once. Each line below is: code | Hungarian title | English title | description.`;

export const line = (o: Occupation) =>
  [o.code, o.label.hu, o.label.en, o.description.en.replace(/\s+/gu, " ")].join(" | ");

/** The answers that belong to the batch, each code once; anything else the model said is dropped. */
export function acceptAnswer(batch: string[], answer: z.infer<typeof Answer>): Proposals {
  const wanted = new Set(batch);
  const seen = new Map<string, Proposal | null>();
  for (const { code, level, track } of answer.roles) {
    if (!wanted.has(code)) continue;
    seen.set(code, seen.has(code) ? null : { level, track });
  }
  return Object.fromEntries([...seen].filter((entry): entry is [string, Proposal] => !!entry[1]));
}

// The prompt carries ESCO text only.
export async function askClaude(prompt: string, model = MODEL): Promise<z.infer<typeof Answer>> {
  return Answer.parse(await askCli(prompt, Answer, { model }));
}

if (import.meta.main) {
  const esco = JSON.parse(readFileSync("raw/esco/esco.json", "utf8")) as Esco;
  const proposals = loadProposals();
  // Sorted by code, so occupations of one ISCO group are judged side by side in one call.
  const missing = esco.occupations
    .filter((o) => !(o.code in proposals))
    .sort((a, b) => (a.code < b.code ? -1 : 1));
  const batches: Occupation[][] = [];
  for (let i = 0; i < missing.length; i += BATCH) batches.push(missing.slice(i, i + BATCH));
  console.log(`${missing.length} occupations to propose in ${batches.length} calls`);

  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++]!;
      const codes = batch.map((o) => o.code);
      try {
        const answer = await askClaude(`${PROMPT}\n\n${batch.map(line).join("\n")}`);
        const accepted = acceptAnswer(codes, answer);
        Object.assign(proposals, accepted);
        writeFileSync(PROPOSALS_FILE, formatProposals(proposals));
        const lost = codes.length - Object.keys(accepted).length;
        console.log(`${codes[0]}…: ${Object.keys(accepted).length} proposed, ${lost} left out`);
        if (lost > 0) failed++;
      } catch (error) {
        failed++;
        console.error(`${codes[0]}…: ${(error as Error).message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  const left = esco.occupations.filter((o) => !(o.code in proposals)).length;
  console.log(`${Object.keys(proposals).length} proposals, ${left} occupations without one`);
  if (failed > 0 || left > 0) process.exitCode = 1;
}
