// One structured-output call on the subscription CLI, for dev-time work: the model gets no tools,
// MCP servers, hooks or CLAUDE.md, only the system prompt, the input and the JSON schema.

import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { z } from "zod";

const TIMEOUT_MS = 5 * 60_000;

/** The structured output, not yet checked against `schema`; the caller parses it. */
export async function askCli(
  input: string,
  schema: z.ZodType,
  { model, system }: { model: string; system?: string },
): Promise<unknown> {
  const json: Record<string, unknown> = z.toJSONSchema(schema);
  // The CLI's validator does not resolve the draft 2020-12 meta-schema URI zod stamps on.
  delete json.$schema;
  const args = ["-p", "--safe-mode", "--tools", "", "--strict-mcp-config"];
  args.push("--no-session-persistence", "--model", model, "--output-format", "json");
  args.push("--json-schema", JSON.stringify(json));
  if (system) args.push("--system-prompt", system);

  const envelope = z
    .object({
      is_error: z.boolean(),
      result: z.string().optional(),
      structured_output: z.unknown(),
    })
    .parse(JSON.parse(await run(args, input)));
  if (envelope.is_error) throw new Error(`claude -p failed: ${envelope.result ?? "no detail"}`);
  return envelope.structured_output;
}

const run = (args: string[], input: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn("claude", args, { cwd: tmpdir(), timeout: TIMEOUT_MS });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) resolve(Buffer.concat(out).toString("utf8"));
      else {
        const detail = Buffer.concat([...err, ...out])
          .toString("utf8")
          .slice(0, 2000);
        reject(new Error(`claude exited with ${code ?? signal ?? "?"}: ${detail}`));
      }
    });
    child.stdin.end(input);
  });
