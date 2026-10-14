// The model behind `Ask`: Claude Haiku 5.5 with structured output. Usage is recorded per call, so a
// caller can account for the spend even when reading fails part of the way.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Ask, Prompt } from "./verify.ts";

export const MODEL = "claude-haiku-5-5";
export const MAX_TOKENS = 16_000;

/** USD per million tokens, for prompts up to 100k tokens; MAX_CV_CHARS keeps every prompt there. */
const PRICE = { input: 0.1, output: 0.5 };

export interface Usage {
  input: number;
  output: number;
}

export const costUsd = (usage: Usage[]): number =>
  usage.reduce((sum, u) => sum + (u.input * PRICE.input + u.output * PRICE.output) / 1e6, 0);

/**
 * The most one CV can cost: three steps with a retry each, every call at the largest prompt
 * (30k CV characters plus 400 listed skills, well under 40k tokens) and the full output.
 */
export const CV_RESERVE_USD = costUsd(Array(6).fill({ input: 40_000, output: MAX_TOKENS }));

/** The request body for a prompt, exactly as sent. */
export const requestFor = (prompt: Prompt) =>
  ({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: "medium", format: zodOutputFormat(prompt.schema) },
    system: prompt.system,
    messages: [{ role: "user", content: prompt.user }],
  }) satisfies Anthropic.MessageCreateParamsNonStreaming;

export function claudeAsk(usage: Usage[]): Ask {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const client = new Anthropic({ apiKey, timeout: 120_000 });
  return async (prompt) => {
    const response = await client.messages.create(requestFor(prompt));
    usage.push({ input: response.usage.input_tokens, output: response.usage.output_tokens });
    if (response.stop_reason !== "end_turn") {
      throw new Error(`${prompt.name}: the model stopped with ${response.stop_reason}`);
    }
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return JSON.parse(text);
  };
}
