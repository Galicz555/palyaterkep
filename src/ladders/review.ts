// Writes the curated ladders as a Hungarian review page: per ladder the roles by track and level,
// what each step adds over the one before it (the gap list a user sees), the progression edges and
// the full skill lists, with the doubtful decisions first. Exits 1 if a ladder breaks a rule.
// Usage: node src/ladders/review.ts  (expects raw/esco/esco.json from `pnpm esco`)

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Esco } from "../esco/model.ts";
import { readVault } from "../vault/generate.ts";
import { linkTarget, readNote, Role } from "../vault/note.ts";

const OUT = "raw/ladders-review.md";

/** Vault subfolder → ladder name, in page order. A curated note outside these is a problem. */
export const LADDERS: Record<string, string> = {
  szoftverfejlesztes: "Szoftverfejlesztés",
  teszteles: "Szoftvertesztelés",
  uzemeltetes: "Üzemeltetés és DevOps",
  adat: "Adat",
};

const DOUBTS = [
  "**A szakértőből vezetőbe váltás nem előrelépés-él.** A glosszárium szerint előrelépés csak kifelé, magasabb szintre vezet, a Senior szoftverfejlesztő (3) → Fejlesztési csoportvezető (3) viszont azonos szinten vált pályatípust. Ezért váltás-él köti őket, a csoportvezető ESCO-foglalkozása pedig a szoftvermenedzser, hogy a váltás két foglalkozás között legyen. A vezetői pálya a Seniortól a Fejlesztési vezetőhöz (4) vezető előrelépéssel is elérhető. Javaslat: külön él- vagy szótári fogalom a pályatípus-váltásra.",
  "**A csoportvezető és a fejlesztési vezető a „szoftvermenedzser” ESCO-foglalkozáson ül.** Az ESCO-ban nincs csapatvezető vagy engineering manager; a szoftvermenedzser (IKT alkalmazásmenedzser) a legközelebbi. Ugyanígy az adatarchitekt az „adatbázis-tervező” foglalkozáson ül (angol alternatív címkéje data architect). Ezeknek a foglalkozásoknak a saját, nem kurált szerepe eltűnik a térképről.",
  "**Az architekt a szakértői pálya 4. foka.** A staff, principal és lead fejlesztői címek is ide tartoznak; a Szoftverarchitekt az ESCO szoftverarchitekt foglalkozása (magyar ESCO-címkéje félrevezetően „szoftvermérnök”). Az 5. fok a Vállalati architekt. Az IT rendszermérnök (ICT system architect) nem kurált, váltással kapcsolódik.",
  "**Az alacsonyabb szint készségei felfelé öröklődnek, néhány gyakorlati készség a vezetői és stratégiai szinteken kiesik.** Így a hiánylista csak azt mutatja, ami a szinten új; az „Elhagyva” sor mutatja, mi esik ki (például a hibakeresés a fejlesztési vezetőnél). Programozási nyelvek egyik listában sincsenek: a hiánylista ne kérjen Javát egy TypeScript-fejlesztőtől.",
  "**Az LLM-es munkát az ESCO nem tudja kifejezni.** Az AI-mérnök listája a gépi tanulás, a természetes nyelv feldolgozása, a neurális hálók és az információkinyerés ESCO-készségeiből áll; nagy nyelvi modell, promptolás, modellértékelés nincs az ESCO-ban. Ha ez a hiánylistában számít, saját készség kell (lásd a jelentést).",
];

const LEVEL_NAMES = ["belépő", "önálló", "tapasztalt", "kiemelt", "stratégiai"];
const TRACK_NAMES = { individual: "Szakértői pályatípus", management: "Vezetői pályatípus" };

export interface LadderRole extends Role {
  id: string;
  ladder: string;
}

/** A step into a role: a progression edge, or a same-level switch from the individual track. */
export interface Step {
  from: string;
  to: string;
  kind: "progression" | "switch";
  adds: string[];
  drops: string[];
}

export function curatedRoles(files: Map<string, string>): LadderRole[] {
  const roles: LadderRole[] = [];
  for (const [file, text] of files) {
    const parsed = Role.safeParse(readNote(text).frontmatter);
    if (!parsed.success || !parsed.data.curated) continue;
    const ladder = file.includes("/") ? file.split("/")[0]! : "";
    roles.push({ ...parsed.data, id: path.basename(file, ".md"), ladder });
  }
  return roles;
}

const minus = (a: string[], b: string[]) => a.filter((x) => !b.includes(x));

/** The Hungarian definite article: „az” before a vowel. */
const article = (word: string) => (/^[aáeéiíoóöőuúüű]/iu.test(word) ? "az" : "a");

export function steps(roles: LadderRole[]): Step[] {
  const byId = new Map(roles.map((r) => [r.id, r]));
  const step = (from: LadderRole, to: LadderRole, kind: Step["kind"]): Step => ({
    from: from.id,
    to: to.id,
    kind,
    adds: minus(to.skills, from.skills),
    drops: minus(from.skills, to.skills),
  });
  const result: Step[] = [];
  for (const from of roles) {
    for (const target of from.progression ?? []) {
      const to = byId.get(linkTarget(target));
      if (to) result.push(step(from, to, "progression"));
    }
    if (from.track !== "individual") continue;
    for (const to of roles) {
      const linked = to.lateral.includes(`[[${from.id}]]`) || from.lateral.includes(`[[${to.id}]]`);
      const switches = to.track === "management" && to.level === from.level;
      if (linked && switches && to.ladder === from.ladder) result.push(step(from, to, "switch"));
    }
  }
  return result;
}

/**
 * Every rule a ladder breaks: a curated note outside a ladder folder, a progression edge that does
 * not lead further out to a curated role, a step adding fewer than two skills, and a role its
 * ladder's bottom does not reach through steps.
 */
export function ladderProblems(roles: LadderRole[], all: Step[]): string[] {
  const problems: string[] = [];
  const byId = new Map(roles.map((r) => [r.id, r]));
  for (const role of roles) {
    if (!(role.ladder in LADDERS)) problems.push(`${role.id}: not in a known ladder folder`);
    for (const target of role.progression ?? []) {
      const to = byId.get(linkTarget(target));
      if (!to) problems.push(`${role.id}: progression to ${target}, which is not curated`);
      else if (to.level <= role.level) {
        problems.push(`${role.id} → ${to.id}: progression to level ${to.level}, not further out`);
      }
    }
  }
  for (const s of all) {
    if (s.adds.length < 2) problems.push(`${s.from} → ${s.to}: adds ${s.adds.length} skills`);
  }
  for (const ladder of new Set(roles.map((r) => r.ladder))) {
    const own = roles.filter((r) => r.ladder === ladder);
    const bottom = Math.min(...own.map((r) => r.level));
    const reached = new Set(own.filter((r) => r.level === bottom).map((r) => r.id));
    for (let grew = true; grew;) {
      grew = false;
      for (const s of all) {
        if (reached.has(s.from) && byId.get(s.to)?.ladder === ladder && !reached.has(s.to)) {
          reached.add(s.to);
          grew = true;
        }
      }
    }
    for (const r of own)
      if (!reached.has(r.id)) problems.push(`${r.id}: not reached from ${ladder}'s bottom`);
  }
  return problems;
}

export function renderReview(
  roles: LadderRole[],
  skillLabel: (uri: string) => string,
  occupationLabel: (uri: string) => string,
  roleLabel: (id: string) => string,
): { page: string; problems: string[] } {
  const all = steps(roles);
  const problems = ladderProblems(roles, all);
  const labels = (uris: string[]) =>
    uris
      .map(skillLabel)
      .sort((a, b) => a.localeCompare(b, "hu"))
      .join("; ") || "–";
  const lines = [
    "# IT-létrák: ellenőrző oldal",
    "",
    `A \`vault/\` kurált jegyzeteiből generálva (\`pnpm ladders:review\`): ${Object.keys(LADDERS).length} létra, ${roles.length} szerep. Minden szerepnél először az áll, amit az előző fokhoz képest hozzátesz: ez a hiánylista, amit a felhasználó lát.`,
    "",
  ];
  if (problems.length > 0) lines.push("## Hibák", "", ...problems.map((p) => `- ${p}`), "");
  lines.push("## Kétes döntések", "", ...DOUBTS.map((d, i) => `${i + 1}. ${d}`), "");

  for (const [folder, name] of Object.entries(LADDERS)) {
    const own = roles.filter((r) => r.ladder === folder);
    if (own.length === 0) continue;
    lines.push(`## ${name}`, "");
    for (const track of ["individual", "management"] as const) {
      const onTrack = own
        .filter((r) => r.track === track)
        .sort((a, b) => a.level - b.level || a.label.localeCompare(b.label, "hu"));
      if (onTrack.length === 0) continue;
      lines.push(`### ${TRACK_NAMES[track]}`, "");
      for (const role of onTrack) {
        lines.push(
          `#### ${role.level} ${LEVEL_NAMES[role.level - 1]} · ${role.label}`,
          "",
          `\`${role.id}\` · ESCO: ${occupationLabel(role.occupation)}`,
          "",
        );
        for (const s of all.filter((x) => x.to === role.id)) {
          const how = s.kind === "switch" ? "váltás" : "előrelépés";
          lines.push(
            `**Új ${article(roleLabel(s.from))} ${roleLabel(s.from)} után (${how}, +${s.adds.length}):** ${labels(s.adds)}`,
            "",
          );
          if (s.drops.length > 0)
            lines.push(`_Elhagyva (−${s.drops.length}):_ ${labels(s.drops)}`, "");
        }
        const next = (role.progression ?? []).map((l) => roleLabel(linkTarget(l)));
        const lateral = role.lateral.map((l) => roleLabel(linkTarget(l)));
        lines.push(
          `**Előrelépés:** ${next.join(", ") || "–"}  `,
          `**Váltások:** ${lateral.join(", ") || "–"}`,
          "",
          `<details><summary>Teljes készséglista (${role.skills.length})</summary>`,
          "",
          labels(role.skills),
          "",
          "</details>",
          "",
        );
      }
    }
  }
  return { page: lines.join("\n"), problems };
}

if (import.meta.main) {
  const esco = JSON.parse(readFileSync("raw/esco/esco.json", "utf8")) as Esco;
  const files = readVault();
  const roleLabels = new Map<string, string>();
  for (const [file, text] of files) {
    const label = (readNote(text).frontmatter as { label?: unknown } | undefined)?.label;
    if (typeof label === "string") roleLabels.set(path.basename(file, ".md"), label);
  }
  const skills = new Map(esco.skills.map((s) => [s.uri, s.label.hu]));
  const occupations = new Map(esco.occupations.map((o) => [o.uri, `${o.label.hu} (${o.code})`]));
  const { page, problems } = renderReview(
    curatedRoles(files),
    (uri) => skills.get(uri) ?? uri,
    (uri) => occupations.get(uri) ?? uri,
    (id) => roleLabels.get(id) ?? id,
  );
  writeFileSync(OUT, page);
  for (const problem of problems) console.error(problem);
  console.log(`${OUT}: ${problems.length} problems`);
  if (problems.length > 0) process.exitCode = 1;
}
