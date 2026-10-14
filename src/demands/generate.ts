// Scores every ESCO occupation's physical, mental and emotional demands from O*NET ratings,
// reached through the official ESCO–O*NET crosswalk (ADR 0003).
// Usage: node src/demands/generate.ts  (expects raw/onet/db_31_0_csv/ unzipped next to
// raw/onet/esco-onet-crosswalk.csv, and raw/esco/esco.json from `pnpm esco`)

import { readFileSync, writeFileSync } from "node:fs";
import { readRecords } from "../esco/csv.ts";
import type { Esco, Occupation } from "../esco/model.ts";
import { DEMANDS_FILE, DIMENSIONS, type Demands } from "./demands.ts";

type Row = Record<string, string>;
type Dimension = (typeof DIMENSIONS)[number];

const ONET = "raw/onet/db_31_0_csv";
const CROSSWALK = "raw/onet/esco-onet-crosswalk.csv";

export const SOURCE =
  "O*NET 31.0 Database by the U.S. Department of Labor, Employment and Training Administration " +
  "(CC BY 4.0), mapped through the ESCO–O*NET crosswalk (ESCO v1.1.0, O*NET-SOC 2019)";

/** The scale each O*NET file is read on: importance for activities and abilities. */
export const FILES = {
  work_context: "CX",
  work_activities: "IM",
  abilities: "IM",
} as const;

/**
 * O*NET element ID to its element name, per dimension. The name is checked against the data, so
 * a renumbered element fails the run instead of scoring something else. Why these items: ADR 0003.
 */
export const ITEMS: Record<Dimension, Record<string, string>> = {
  physical: {
    "4.C.2.d.1.b": "Spend Time Standing",
    "4.C.2.d.1.c": "Spend Time Climbing Ladders, Scaffolds, or Poles",
    "4.C.2.d.1.d": "Spend Time Walking or Running",
    "4.C.2.d.1.e": "Spend Time Kneeling, Crouching, Stooping, or Crawling",
    "4.C.2.d.1.h": "Spend Time Bending or Twisting Your Body",
    "4.A.3.a.1": "Performing General Physical Activities",
    "4.A.3.a.2": "Handling and Moving Objects",
    "1.A.3.a.1": "Static Strength",
    "1.A.3.a.3": "Dynamic Strength",
    "1.A.3.a.4": "Trunk Strength",
    "1.A.3.b.1": "Stamina",
  },
  mental: {
    "4.A.2.a.2": "Processing Information",
    "4.A.2.a.4": "Analyzing Data or Information",
    "4.A.2.b.1": "Making Decisions and Solving Problems",
    "4.A.2.b.2": "Thinking Creatively",
    "1.A.1.b.4": "Deductive Reasoning",
    "1.A.1.b.5": "Inductive Reasoning",
  },
  emotional: {
    "4.C.1.d.1": "Conflict Situations",
    "4.C.1.d.2": "Dealing With Unpleasant, Angry, or Discourteous People",
    "4.C.1.d.3": "Dealing with Violent or Physically Aggressive People",
    "4.A.4.a.5": "Assisting and Caring for Others",
    "4.A.4.a.7": "Resolving Conflicts and Negotiating with Others",
  },
};

/** Scale ID to its [minimum, maximum], from scales_reference.csv. */
export function scaleRanges(rows: Row[]): Map<string, [number, number]> {
  return new Map(rows.map((r) => [r["Scale ID"] ?? "", [Number(r.Minimum), Number(r.Maximum)]]));
}

/**
 * O*NET-SOC code to element ID to its rating scaled to 0..1, for the elements in ITEMS. Rows
 * O*NET flags as "Recommend Suppress" (too few or too inconsistent answers) or "Not Relevant"
 * are skipped.
 */
export function itemRatings(
  rows: Row[],
  scale: string,
  ranges: Map<string, [number, number]>,
  into = new Map<string, Map<string, number>>(),
): Map<string, Map<string, number>> {
  const names = new Map(Object.values(ITEMS).flatMap((items) => Object.entries(items)));
  const range = ranges.get(scale);
  if (!range) throw new Error(`scale ${scale} is not in the scale reference`);
  const [min, max] = range;

  for (const r of rows) {
    const id = r["Element ID"] ?? "";
    const name = names.get(id);
    if (name === undefined || r["Scale ID"] !== scale) continue;
    if (r["Element Name"] !== name) {
      throw new Error(`element ${id} is "${r["Element Name"]}" in O*NET, expected "${name}"`);
    }
    if (r["Recommend Suppress"] === "Y" || r["Not Relevant"] === "Y") continue;
    const value = Number(r["Data Value"]);
    if (!Number.isFinite(value) || value < min || value > max) {
      throw new Error(`${r["O*NET-SOC Code"]} ${id}: rating "${r["Data Value"]}" outside ${scale}`);
    }
    const soc = r["O*NET-SOC Code"] ?? "";
    if (!into.has(soc)) into.set(soc, new Map());
    into.get(soc)!.set(id, (value - min) / (max - min));
  }
  return into;
}

/**
 * Raw demands of every O*NET occupation: per dimension, the mean of its items' ratings. An
 * occupation missing half or more of a dimension's items has no score; with fewer items the
 * mean would describe a different mix than everyone else's.
 */
export function socDemands(ratings: Map<string, Map<string, number>>): Map<string, Demands> {
  const out = new Map<string, Demands>();
  for (const [soc, items] of ratings) {
    const scores = DIMENSIONS.map((dimension) => {
      const ids = Object.keys(ITEMS[dimension]);
      const values = ids.flatMap((id) => (items.has(id) ? [items.get(id)!] : []));
      return values.length * 2 > ids.length ? mean(values) : undefined;
    });
    if (scores.every((s) => s !== undefined)) out.set(soc, scores as Demands);
  }
  return out;
}

/** The crosswalk table, without the metadata rows above its header. */
export function readCrosswalk(text: string): Row[] {
  const start = text.search(/^O\*NET Id,/mu);
  if (start < 0) throw new Error("crosswalk header (O*NET Id,…) not found");
  return readRecords(text.slice(start));
}

/**
 * How an occupation got its score, strongest first:
 * - `direct`: its own crosswalk matches (exact, close, narrow or broad), averaged with equal weight;
 * - `broader`: no rated match of its own, so the nearest broader ESCO occupation's direct score;
 * - `iscoMatch`: the crosswalk's O*NET occupations for its whole ISCO unit (or minor) group;
 * - `iscoGroup`: the mean direct score of the other occupations in its ISCO unit group.
 */
export type Tier = "direct" | "broader" | "iscoMatch" | "iscoGroup";

export interface Scored {
  raw: Map<string, Demands>;
  tier: Map<string, Tier>;
  /** Direct scores resting only on narrow or broad matches. */
  looseOnly: number;
}

const MATCHES = new Set(["exactMatch", "closeMatch", "narrowMatch", "broadMatch"]);
const ISCO_URI = "http://data.europa.eu/esco/isco/C";

export function scoreOccupations(
  occupations: Occupation[],
  crosswalk: Row[],
  socs: Map<string, Demands>,
): Scored {
  const direct = new Map<string, string[]>();
  const tight = new Set<string>();
  const iscoMatch = new Map<string, string[]>();
  for (const r of crosswalk) {
    const type = r["Type of Match"] ?? "";
    const uri = r["ESCO or ISCO URI"] ?? "";
    const soc = r["O*NET Id"] ?? "";
    if (type !== "exactISCO" && !MATCHES.has(type)) throw new Error(`crosswalk match "${type}"`);
    if (!socs.has(soc)) continue;
    if (type === "exactISCO") {
      if (!uri.startsWith(ISCO_URI)) throw new Error(`exactISCO row with ${uri}`);
      push(iscoMatch, uri.slice(ISCO_URI.length), soc);
    } else {
      push(direct, uri, soc);
      if (type === "exactMatch" || type === "closeMatch") tight.add(uri);
    }
  }

  const raw = new Map<string, Demands>();
  const tier = new Map<string, Tier>();
  const set = (o: Occupation, demands: Demands, how: Tier) => {
    raw.set(o.uri, demands);
    tier.set(o.uri, how);
  };
  const meanOf = (list: Demands[]) =>
    DIMENSIONS.map((_, i) => mean(list.map((d) => d[i]!))) as Demands;

  for (const o of occupations) {
    const matched = direct.get(o.uri);
    if (matched) set(o, meanOf(matched.map((soc) => socs.get(soc)!)), "direct");
  }
  const looseOnly = [...direct.keys()].filter((uri) => !tight.has(uri) && tier.has(uri)).length;

  const byCode = new Map(occupations.map((o) => [o.code, o]));
  const iscoGroup = new Map<string, Demands[]>();
  for (const o of occupations) {
    const demands = raw.get(o.uri);
    if (demands) push(iscoGroup, o.isco, demands);
  }

  for (const o of occupations) {
    if (raw.has(o.uri)) continue;
    const broader = ancestors(o.code)
      .map((code) => byCode.get(code))
      .find((b) => b && tier.get(b.uri) === "direct");
    const viaIsco = iscoMatch.get(o.isco) ?? iscoMatch.get(o.isco.slice(0, 3));
    const group = iscoGroup.get(o.isco);
    if (broader) set(o, raw.get(broader.uri)!, "broader");
    else if (viaIsco) set(o, meanOf(viaIsco.map((soc) => socs.get(soc)!)), "iscoMatch");
    else if (group) set(o, meanOf(group), "iscoGroup");
  }
  return { raw, tier, looseOnly };
}

/** `2512.4.1` → [`2512.4`]; the ISCO unit group itself is not an occupation. */
const ancestors = (code: string): string[] => {
  const parts = code.split(".");
  return parts.slice(2).map((_, i) => parts.slice(0, parts.length - 1 - i).join("."));
};

/**
 * Per dimension, each occupation's mid-rank percentile among the scored ones: the lowest gets 0,
 * the highest 1, the median 0.5, and tied scores share their mean rank.
 */
export function percentiles(raw: Map<string, Demands>): Map<string, Demands> {
  const uris = [...raw.keys()];
  const out = new Map(uris.map((uri) => [uri, [0, 0, 0] as Demands]));
  DIMENSIONS.forEach((_, i) => {
    const sorted = uris.map((uri) => raw.get(uri)![i]!).sort((a, b) => a - b);
    const first = new Map<number, number>();
    const last = new Map<number, number>();
    sorted.forEach((v, k) => {
      if (!first.has(v)) first.set(v, k);
      last.set(v, k);
    });
    for (const uri of uris) {
      const v = raw.get(uri)![i]!;
      out.get(uri)![i] = (first.get(v)! + last.get(v)!) / 2 / Math.max(sorted.length - 1, 1);
    }
  });
  return out;
}

/** The demands file, one occupation a line in URI order, so a regeneration diffs line by line. */
export function formatDemands(ranks: Map<string, Demands>): string {
  const round = (v: number) => Math.round(v * 1000) / 1000;
  const lines = [...ranks]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([uri, d]) => `    ${JSON.stringify(uri)}: [${d.map(round).join(", ")}]`);
  return (
    `{\n  "source": ${JSON.stringify(SOURCE)},\n` +
    `  "dimensions": ${JSON.stringify(DIMENSIONS).replaceAll(",", ", ")},\n` +
    `  "occupations": {\n${lines.join(",\n")}\n  }\n}\n`
  );
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

function push<T>(map: Map<string, T[]>, key: string, value: T) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

if (import.meta.main) {
  const read = (file: string) => readRecords(readFileSync(`${ONET}/${file}.csv`, "utf8"));
  const ranges = scaleRanges(read("scales_reference"));
  const ratings = new Map<string, Map<string, number>>();
  for (const [file, scale] of Object.entries(FILES))
    itemRatings(read(file), scale, ranges, ratings);

  const rated = new Set([...ratings.values()].flatMap((items) => [...items.keys()]));
  const unseen = Object.values(ITEMS).flatMap((items) =>
    Object.keys(items).filter((id) => !rated.has(id)),
  );
  if (unseen.length > 0) throw new Error(`no O*NET rating for ${unseen.join(", ")}`);

  const socs = socDemands(ratings);
  const esco = JSON.parse(readFileSync("raw/esco/esco.json", "utf8")) as Esco;
  const crosswalk = readCrosswalk(readFileSync(CROSSWALK, "utf8"));
  const { raw, tier, looseOnly } = scoreOccupations(esco.occupations, crosswalk, socs);
  writeFileSync(DEMANDS_FILE, formatDemands(percentiles(raw)));

  const inCrosswalk = new Set(crosswalk.map((r) => r["ESCO or ISCO URI"]));
  const absent = esco.occupations.filter((o) => !raw.has(o.uri));
  const count = (how: Tier) => [...tier.values()].filter((t) => t === how).length;
  console.log(
    `${socs.size} of ${ratings.size} O*NET occupations rated; ` +
      `${raw.size} of ${esco.occupations.length} ESCO occupations scored -> ${DEMANDS_FILE}\n` +
      `  direct ${count("direct")} (${looseOnly} on narrow/broad matches only), ` +
      `broader ${count("broader")}, iscoMatch ${count("iscoMatch")}, iscoGroup ${count("iscoGroup")}\n` +
      `  absent ${absent.length}: ${absent.filter((o) => inCrosswalk.has(o.uri)).length} matched ` +
      `only to unrated O*NET occupations, ${absent.filter((o) => !inCrosswalk.has(o.uri)).length} not in the crosswalk`,
  );
}
