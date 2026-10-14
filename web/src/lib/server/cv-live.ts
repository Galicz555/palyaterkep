// The route's real dependencies: the graph and mapper (about 1.5 s to build, so once per process),
// the spend guard in a SQLite file under raw/, and the model chosen by the environment.
//
//   CV_MODEL=subscription   the subscription CLI, for local dev only
//   ANTHROPIC_API_KEY       the Claude API, otherwise
//   CV_DAILY_CAP_USD        the most the API readings may cost a UTC day (default 2)
//   CV_PER_CLIENT_PER_HOUR  readings one client address may start an hour (default 10)
//
// Nothing here runs at import: SvelteKit imports route modules while building.

import path from "node:path";
import { SpendGuard } from "../../../../src/cv/budget.ts";
import { claudeAsk, subscriptionAsk, type Usage } from "../../../../src/cv/claude.ts";
import { buildMapper } from "../../../../src/cv/mapping.ts";
import { loadGraph } from "../../../../src/cv/states.ts";
import type { Ask } from "../../../../src/cv/verify.ts";
import { VAULT } from "../../../../src/vault/generate.ts";
import type { CvRouteDeps } from "./cv-route.ts";
import { esco, ROOT } from "./data.ts";

const SPEND_DB = "raw/cv-spend.sqlite";

function positive(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number`);
  return value;
}

export function liveAsk(usage: Usage[]): Ask {
  const model = process.env["CV_MODEL"];
  if (model === "subscription") return subscriptionAsk();
  if (model !== undefined) throw new Error("CV_MODEL can only be 'subscription' or unset");
  if (!process.env["ANTHROPIC_API_KEY"]) {
    throw new Error("no model: set ANTHROPIC_API_KEY, or CV_MODEL=subscription for local dev");
  }
  return claudeAsk(usage);
}

let loaded: ReturnType<CvRouteDeps["reader"]> | undefined;
const reader: CvRouteDeps["reader"] = () => {
  loaded ??= Promise.resolve()
    .then(() => {
      const graph = loadGraph(path.join(ROOT, VAULT));
      return { graph, mapper: buildMapper(esco(), graph) };
    })
    .catch((error: unknown) => {
      loaded = undefined;
      throw error;
    });
  return loaded;
};

let deps: CvRouteDeps | undefined;
export function liveDeps(): CvRouteDeps {
  deps ??= {
    guard: new SpendGuard(path.join(ROOT, SPEND_DB), {
      dailyCapUsd: positive("CV_DAILY_CAP_USD", 2),
      perClientPerHour: positive("CV_PER_CLIENT_PER_HOUR", 10),
    }),
    reader,
    ask: liveAsk,
    today: () => new Date().toISOString().slice(0, 10),
    log: (event) => console.log(JSON.stringify({ at: new Date().toISOString(), ...event })),
  };
  return deps;
}

/** At server start: load the graph and open the guard now, and say at once if no model is set. */
export function warm(): void {
  try {
    liveAsk([]);
    liveDeps();
  } catch (error) {
    console.error(`cv reading is not ready: ${error instanceof Error ? error.message : error}`);
  }
  reader().catch((error: unknown) => console.error("cv reading is not ready:", error));
}
