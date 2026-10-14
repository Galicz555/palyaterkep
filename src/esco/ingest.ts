// Reads the ESCO CSV packages (one per language) into one checked JSON file.
// Usage: node src/esco/ingest.ts  (expects raw/esco/<lang>/ unzipped for every language)

import { readFileSync, writeFileSync } from "node:fs";
import { readRecords } from "./csv.ts";
import { LANGS, type Esco, type Labels, type Lang, type Occupation, type Text } from "./model.ts";

type Row = Record<string, string>;
type Rows = Record<Lang, Row>;

export interface Tables {
  occupations: Row[];
  skills: Row[];
  iscoGroups: Row[];
}

const VERSION = "v1.2.1";
const DIR = "raw/esco";

/**
 * One row per concept. ESCO v1.2.1 lists a few concepts twice, as two revisions that differ only
 * in modifiedDate, which this file does not keep. A repeat with any other difference is an error.
 */
function unique(rows: Row[], key: string, what: string): Map<string, Row> {
  const map = new Map<string, Row>();
  for (const row of rows) {
    const id = row[key] ?? "";
    const prev = map.get(id);
    if (prev && Object.keys(prev).some((k) => k !== "modifiedDate" && prev[k] !== row[k])) {
      throw new Error(`${what} repeat ${key} ${id} with different content`);
    }
    if (!prev) map.set(id, row);
  }
  return map;
}

/** Pairs each concept with its row in every language package; the packages must hold the same concepts. */
function align(tables: Record<Lang, Tables>, kind: keyof Tables, key: string): Rows[] {
  const maps = LANGS.map((lang) =>
    unique(tables[lang][kind], key, `${kind} in the ${lang} package`),
  );
  const sizes = new Set(maps.map((map) => map.size));
  if (sizes.size > 1) throw new Error(`${kind}: the language packages differ in size`);

  return [...maps[0]!.keys()].map(
    (id) =>
      Object.fromEntries(
        LANGS.map((lang, i) => {
          const row = maps[i]!.get(id);
          if (!row) throw new Error(`${kind} ${id} is missing from the ${lang} package`);
          return [lang, row];
        }),
      ) as Rows,
  );
}

const text = (rows: Rows, field: string) =>
  Object.fromEntries(LANGS.map((lang) => [lang, rows[lang][field] ?? ""])) as Text;

const list = (rows: Rows, field: string) =>
  Object.fromEntries(
    LANGS.map((lang) => [
      lang,
      (rows[lang][field] ?? "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    ]),
  ) as Labels;

export function buildEsco(tables: Record<Lang, Tables>, relations: Row[]): Esco {
  const iscoGroups = align(tables, "iscoGroups", "code").map((rows) => ({
    code: rows.hu.code ?? "",
    label: text(rows, "preferredLabel"),
  }));
  const unitGroups = new Set(iscoGroups.map((g) => g.code).filter((code) => code.length === 4));

  const skills = align(tables, "skills", "conceptUri").map((rows) => ({
    uri: rows.hu.conceptUri ?? "",
    skillType: rows.hu.skillType ?? "",
    reuseLevel: rows.hu.reuseLevel ?? "",
    label: text(rows, "preferredLabel"),
    altLabels: list(rows, "altLabels"),
    description: text(rows, "description"),
  }));
  const skillUris = new Set(skills.map((s) => s.uri));

  const occupations: Occupation[] = align(tables, "occupations", "conceptUri").map((rows) => {
    const occupation = {
      uri: rows.hu.conceptUri ?? "",
      code: rows.hu.code ?? "",
      isco: rows.hu.iscoGroup ?? "",
      label: text(rows, "preferredLabel"),
      altLabels: list(rows, "altLabels"),
      description: text(rows, "description"),
      essential: [],
      optional: [],
    };
    if (!unitGroups.has(occupation.isco)) {
      throw new Error(
        `occupation ${occupation.uri} has unknown ISCO unit group "${occupation.isco}"`,
      );
    }
    return occupation;
  });
  const byUri = new Map(occupations.map((o) => [o.uri, o]));

  for (const rel of relations) {
    const occupation = byUri.get(rel.occupationUri ?? "");
    if (!occupation) throw new Error(`relation to unknown occupation ${rel.occupationUri}`);
    if (!skillUris.has(rel.skillUri ?? ""))
      throw new Error(`relation to unknown skill ${rel.skillUri}`);
    if (rel.relationType !== "essential" && rel.relationType !== "optional") {
      throw new Error(`relation type "${rel.relationType}" for ${rel.occupationUri}`);
    }
    occupation[rel.relationType].push(rel.skillUri ?? "");
  }

  for (const o of occupations) {
    if (o.essential.length === 0) throw new Error(`occupation ${o.uri} has no essential skill`);
  }

  return { version: VERSION, iscoGroups, occupations, skills };
}

if (import.meta.main) {
  const read = (lang: Lang, file: string) =>
    readRecords(readFileSync(`${DIR}/${lang}/${file}_${lang}.csv`, "utf8"));
  const tables = Object.fromEntries(
    LANGS.map((lang) => [
      lang,
      {
        occupations: read(lang, "occupations"),
        skills: read(lang, "skills"),
        iscoGroups: read(lang, "ISCOGroups"),
      },
    ]),
  ) as Record<Lang, Tables>;

  const esco = buildEsco(tables, read("hu", "occupationSkillRelations"));
  writeFileSync(`${DIR}/esco.json`, JSON.stringify(esco));
  console.log(
    `${esco.occupations.length} occupations, ${esco.skills.length} skills, ` +
      `${esco.iscoGroups.length} ISCO groups -> ${DIR}/esco.json`,
  );
}
