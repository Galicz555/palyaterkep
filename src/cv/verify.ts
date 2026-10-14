// The verify gate: a model may only claim what it can quote from the CV, and code checks the quote.
// Text taken from a PDF breaks words across lines ("fejlesz-\ntő"), renders ő as õ or ô, and spaces
// punctuation unpredictably, so quotes are compared on letters and digits only, without diacritics,
// in lower case. The evidence kept is the CV's own text at the match, not the model's copy of it.

import { z } from "zod";

/** The CV reduced to letters and digits, and where each of them came from in the CV. */
export interface Folded {
  source: string;
  text: string;
  origin: number[];
}

// NFKD splits ő into o and a combining mark, which the letter filter then drops.
const fold1 = (ch: string) => ch.normalize("NFKD").toLowerCase();

export function fold(source: string): Folded {
  let text = "";
  const origin: number[] = [];
  let at = 0;
  for (const ch of source) {
    for (const c of fold1(ch)) {
      if (/[\p{L}\p{N}]/u.test(c)) {
        text += c;
        origin.push(at);
      }
    }
    at += ch.length;
  }
  return { source, text, origin };
}

/** A quote this short matches almost anything; "CTO" and "2019" are the shortest worth having. */
const MIN_QUOTE = 2;

/** The CV text the quote was copied from, or undefined if the CV does not contain it. */
export function findQuote(quote: string, cv: Folded): string | undefined {
  const needle = fold(quote).text;
  if (needle.length < MIN_QUOTE) return undefined;
  const start = cv.text.indexOf(needle);
  if (start < 0) return undefined;
  const from = cv.origin[start]!;
  let to = cv.origin[start + needle.length - 1]!;
  to += cv.source.codePointAt(to)! > 0xffff ? 2 : 1;
  while (to < cv.source.length && /\p{M}/u.test(cv.source[to]!)) to++;
  return cv.source.slice(from, to).replace(/\s+/gu, " ");
}

/** One model call: what the model is asked, and the shape its JSON answer must have. */
export interface Prompt<T = unknown> {
  name: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
}

/** Sends a prompt to a model with structured output and returns the parsed, unvalidated JSON. */
export type Ask = (prompt: Prompt) => Promise<unknown>;

export interface Checked<R> {
  kept: R;
  /** One line per dropped claim, phrased so the model can fix it. */
  problems: string[];
}

// The first answer plus one corrective retry.
const TRIES = 2;

/**
 * Ask → validate → check, with one corrective retry that tells the model what failed. Claims that
 * still fail after the retry are dropped; the rest are kept. An answer that never fits the schema
 * throws, since nothing from it can be trusted.
 */
export async function askVerified<T, R>(
  ask: Ask,
  prompt: Prompt<T>,
  check: (answer: T) => Checked<R>,
): Promise<Checked<R>> {
  let feedback = "";
  for (let attempt = 1; ; attempt++) {
    const user = feedback
      ? `${prompt.user}\n\nYour previous answer had these problems. Answer again in full, fixing them:\n${feedback}`
      : prompt.user;
    const parsed = prompt.schema.safeParse(await ask({ ...prompt, user }));
    if (!parsed.success) {
      if (attempt === TRIES) {
        throw new Error(`${prompt.name}: the answer does not fit the schema`, {
          cause: parsed.error,
        });
      }
      feedback = `- the JSON does not fit the schema: ${z.prettifyError(parsed.error)}`;
      continue;
    }
    const checked = check(parsed.data);
    if (checked.problems.length === 0 || attempt === TRIES) return checked;
    feedback = checked.problems.map((p) => `- ${p}`).join("\n");
  }
}
