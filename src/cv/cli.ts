// Reads a plain-text CV against the map and prints the CvResult with Hungarian labels. Dropped
// claims and the spend go to stderr.
// Usage: pnpm cv <cv.txt> [--dry-run | --subscription]
//   --dry-run       print the first model request, exactly as it would be sent, and stop: no API
//                   call. The second and third requests are built from the first one's answer.
//   --subscription  send the prompts to the subscription CLI instead of the API: no API spend.
// Expects raw/esco/esco.json; a live API run needs ANTHROPIC_API_KEY and spends money.

import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { Esco } from "../esco/model.ts";
import { claudeAsk, costUsd, requestFor, subscriptionAsk, type Usage } from "./claude.ts";
import { extractPrompt } from "./extract.ts";
import { buildMapper } from "./mapping.ts";
import { CvInputError, MAX_CV_CHARS, readCv } from "./read.ts";
import { loadGraph } from "./states.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { "dry-run": { type: "boolean" }, subscription: { type: "boolean" } },
});
if (positionals.length !== 1) {
  console.error("usage: pnpm cv <cv.txt> [--dry-run | --subscription]");
  process.exit(2);
}
const text = readFileSync(positionals[0]!, "utf8");
const today = new Date().toISOString().slice(0, 10);

if (values["dry-run"]) {
  if (text.length > MAX_CV_CHARS) {
    console.error(`the CV text is longer than ${MAX_CV_CHARS} characters`);
    process.exit(1);
  }
  const request = requestFor(extractPrompt(text, today));
  console.log(JSON.stringify(request, null, 2));
  const chars = request.system.length + text.length;
  console.error(
    `\n${chars} characters of prompt (very roughly ${Math.round(chars / 3)} tokens); not sent.`,
  );
  process.exit(0);
}

const esco = JSON.parse(readFileSync("raw/esco/esco.json", "utf8")) as Esco;
const graph = loadGraph();
const mapper = buildMapper(esco, graph);
const usage: Usage[] = [];
try {
  const { result, dropped } = await readCv(text, {
    ask: values.subscription ? subscriptionAsk() : claudeAsk(usage),
    graph,
    mapper,
    today,
  });
  const role = (id: string) => graph.roles.get(id)?.label ?? id;
  const skill = (uri: string) => ({ uri, label: mapper.skill.get(uri)?.hu ?? uri });
  const labelled = {
    held: result.held.map((h) => ({ ...h, label: role(h.role) })),
    covered: result.covered.map((c) => ({ ...c, label: role(c.role) })),
    reachable: result.reachable.map((r) => ({
      ...r,
      label: role(r.role),
      fromLabel: role(r.from),
      gap: r.gap.map(skill),
    })),
    skills: result.skills.map((s) => ({ ...skill(s.uri), evidence: s.evidence })),
  };
  console.log(JSON.stringify(labelled, null, 2));
  for (const line of dropped) console.error(`dropped: ${line}`);
} catch (error) {
  console.error(error instanceof CvInputError ? error.message : error);
  process.exitCode = 1;
} finally {
  if (values.subscription) console.error("subscription run: no API spend");
  else {
    const tokens = usage.reduce((s, u) => ({ in: s.in + u.input, out: s.out + u.output }), {
      in: 0,
      out: 0,
    });
    console.error(
      `${usage.length} calls, ${tokens.in} input + ${tokens.out} output tokens, $${costUsd(usage).toFixed(4)}`,
    );
  }
}
