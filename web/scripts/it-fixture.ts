// Writes the stand-in CV reading result the page can load without a model: an IT person with five
// years of backend and web work and some cloud. Which skills the CV shows is made up here; where
// that puts the person on the map is the product's own rule, `placeCv`, on the real vault graph.
// Rerun after the vault is regenerated, or after the placement rules change.
// Usage: node web/scripts/it-fixture.ts

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CvResult } from "../../src/cv/result.ts";
import { loadGraph, placeCv } from "../../src/cv/states.ts";

const OUT = new URL("../static/fixtures/it-fejleszto.json", import.meta.url);

/** What the person did, and which of a role's skills the CV shows (every `skip`-th is left out). */
const WORK = [
  {
    role: "senior-szoftverfejleszto",
    skip: 5,
    held: true,
    text: "Szoftverfejlesztő, Példa Kft., 2020–2025: REST szolgáltatások Java és Spring alapon, PostgreSQL",
  },
  {
    role: "webfejleszto",
    skip: 3,
    held: true,
    text: "Webfejlesztő, Minta Zrt., 2018–2020: React alapú ügyfélportál, TypeScript",
  },
  {
    role: "devops-mernok",
    skip: 2,
    held: false,
    text: "Saját és céges projektek: Docker, CI/CD, felhőtelepítés",
  },
];

const graph = loadGraph(fileURLToPath(new URL("../../vault", import.meta.url)));

const evidence = new Map<string, string[]>();
for (const { role, skip, text } of WORK) {
  (graph.roles.get(role)?.skills ?? []).forEach((uri, i) => {
    if ((i + 1) % skip !== 0) evidence.set(uri, [...(evidence.get(uri) ?? []), text]);
  });
}

const held = WORK.filter((w) => w.held).map(({ role, text }) => ({ role, evidence: [text] }));
const placed = placeCv(
  graph,
  held.map((h) => h.role),
  new Set(evidence.keys()),
);
const result: CvResult = {
  held,
  covered: placed.covered.map((c) => ({ ...c, coverage: Math.round(c.coverage * 100) / 100 })),
  reachable: placed.reachable,
  skills: [...evidence].map(([uri, texts]) => ({ uri, evidence: texts })),
};
writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `held ${held.length}, covered ${result.covered.length}, reachable ${result.reachable.length}, skills ${result.skills.length}`,
);
