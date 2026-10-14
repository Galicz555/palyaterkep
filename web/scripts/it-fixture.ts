// Writes the stand-in CV reading result for phase 5: an IT person with five years of backend and web
// work and some cloud. Role ids and skills come from the vault, so held, covered and reachable stay
// consistent with it; rerun after the vault is regenerated.
// Usage: node web/scripts/it-fixture.ts

import { writeFileSync } from "node:fs";
import type { CvResult } from "../../src/cv/result.ts";
import { mapData, roleDetail } from "../src/lib/server/data.ts";

const SKILL = "http://data.europa.eu/esco/skill/";
/** The coverage from which a role the person has not held counts as covered. */
const COVERED_FROM = 0.5;
const OUT = new URL("../static/fixtures/it-fejleszto.json", import.meta.url);

/** What the person did, and which of a role's skills the CV shows (every `n`-th is left out). */
const WORK = [
  {
    role: "szoftverfejleszto",
    skip: 5,
    text: "Szoftverfejlesztő, Példa Kft., 2020–2025: REST szolgáltatások Java és Spring alapon, PostgreSQL",
  },
  {
    role: "webfejleszto",
    skip: 3,
    text: "Webfejlesztő, Minta Zrt., 2018–2020: React alapú ügyfélportál, TypeScript",
  },
  {
    role: "devops-felhomernok",
    skip: 2,
    text: "Saját és céges projektek: Docker, CI/CD, felhőtelepítés",
  },
];

const skillsOf = (id: string) => roleDetail(id)?.skills.map((s) => s.key) ?? [];

const evidence = new Map<string, string[]>();
for (const { role, skip, text } of WORK) {
  skillsOf(role).forEach((key, i) => {
    if ((i + 1) % skip !== 0) evidence.set(key, [...(evidence.get(key) ?? []), text]);
  });
}

const held: CvResult["held"] = WORK.slice(0, 2).map(({ role, text }) => ({
  role,
  evidence: [text],
}));
const heldIds = new Set(held.map((h) => h.role));

const covered: CvResult["covered"] = [];
for (const { id } of mapData().roles) {
  const needs = skillsOf(id);
  if (heldIds.has(id) || needs.length === 0) continue;
  const coverage = needs.filter((key) => evidence.has(key)).length / needs.length;
  if (coverage >= COVERED_FROM)
    covered.push({ role: id, coverage: Math.round(coverage * 100) / 100 });
}
covered.sort((a, b) => b.coverage - a.coverage || a.role.localeCompare(b.role));
const reached = new Set([...heldIds, ...covered.map((c) => c.role)]);

// One edge away from a held or covered role; the nearest way in (the shortest gap) wins.
const reachable = new Map<string, CvResult["reachable"][number]>();
for (const from of reached) {
  const detail = roleDetail(from);
  if (!detail) continue;
  const edges = [
    ...detail.lateral.map((l) => ({ ...l, edge: "lateral" as const })),
    ...detail.progression.map((l) => ({ ...l, edge: "progression" as const })),
  ];
  for (const { id, edge } of edges) {
    if (reached.has(id)) continue;
    const gap = skillsOf(id)
      .filter((key) => !evidence.has(key))
      .map((key) => `${SKILL}${key}`);
    const known = reachable.get(id);
    if (!known || known.gap.length > gap.length) reachable.set(id, { role: id, from, edge, gap });
  }
}

const result: CvResult = {
  held,
  covered,
  reachable: [...reachable.values()].sort((a, b) => a.role.localeCompare(b.role)),
  skills: [...evidence].map(([key, texts]) => ({ uri: `${SKILL}${key}`, evidence: texts })),
};
writeFileSync(OUT, `${JSON.stringify(result, null, 2)}\n`);
console.log(
  `held ${held.length}, covered ${covered.length}, reachable ${result.reachable.length}, skills ${result.skills.length}`,
);
