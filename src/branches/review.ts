// Writes the branch table as a Hungarian review page, doubtful placements first.
// Usage: node src/branches/review.ts  (expects raw/esco/esco.json from `pnpm esco`)

import { readFileSync, writeFileSync } from "node:fs";
import type { Esco, Occupation } from "../esco/model.ts";
import { branchOf, loadBranches, validateBranches } from "./branches.ts";

const OUT = "raw/branches-review.md";

/** ISCO code (any depth) → why its placement is uncertain. Shown where the table currently puts it. */
const DOUBTS: Record<string, string> = {
  "0": "A fegyveres erők nem szakterület, az ISCO rendfokozat szerint osztja őket. A rendvédelem mellé kerültek, de a katonai mérnök, pilóta vagy hírszerző a saját szakterületén is otthon lenne.",
  "1324":
    "90 foglalkozás, kb. 70 import-export és disztribúciós vezető (nagykereskedelem). Velük együtt a kereskedelembe kerülnek a közlekedési és logisztikai vezetők is: repülőtér-igazgató, vasútüzemi vezető, ellátásilánc-vezető, raktárvezető.",
  "3331":
    "40 foglalkozásból 37 import-export szakértő, ezért nagykereskedelem. A speditőr, a nemzetközi szállítmányozási koordinátor és a vámügyintéző a logisztikába, illetve a hatósági ügyintézésbe illene.",
  "1219":
    "14-ből 8 üzleti vagy igazgatási vezető (projekt, létesítmény, CSR, biztonság), de 6 üzemvezető (vegyi üzem, öntöde, erőmű, víztisztító, faüzem), akik az iparba valók.",
  "1213":
    "Vállalati stratégia és közpolitika keveredik: az EU-forrás-menedzser, szakpolitikai vezető, társadalombiztosítási vezető és turisztikai szakpolitikai igazgató a közigazgatásba illene. A többség vállalati.",
  "1349":
    "24 vegyes vezető: 10 kulturális vagy kiadói (múzeumigazgató, könyvkiadó, művészeti igazgató, könyvtárvezető, fordítóiroda-vezető), 5 közbiztonsági vagy jogi, 4 légiforgalmi, 5 egyéb. Relatív többség szerint kultúra.",
  "1431":
    "Kulturális központ, sportlétesítmény és szabadidő (6) mellett szerencsejáték (3) és szépségszalon, spa (2) vezetői.",
  "1439":
    "Utazási iroda, turisztikai információ, kemping és utazásszervező (4) mellett call center-, autószerviz- és mosodavezető.",
  "1223":
    "K+F- és termékfejlesztési vezetők. A termékmenedzserek (IKT, biztosítás, ruházat) az üzleti vagy a saját águkba is mehetnének.",
  "2434":
    "IKT-értékesítők (presales mérnök, IKT-üzletfejlesztő) az informatikában, miközben a 2433 műszaki értékesítők a kereskedelemben vannak.",
  "2163":
    "Termék- és divattervezők a designban (kultúra). Az autó- és ipari formatervező a mérnöki ágba is illene.",
  "2166":
    "Grafikusok, animátorok, multimédia-tervezők a designban. A webdesigner és a játéktervező az informatika felé is húz.",
  "2120":
    "Matematikusok és statisztikusok a természettudományban. Aktuárius és szerencsejáték-fejlesztő is van köztük, a statisztikus az adatelemzés (informatika) felé is húz.",
  "2142":
    "Építőmérnökök az építőiparban, nem a mérnöki ágban, mert a pályájuk az építésvezetés felé visz. A gépész- és villamosmérnökök viszont a mérnöki ágban maradtak.",
  "3112":
    "Építésztechnikusok: zömmel építési és infrastruktúra-ellenőrök, de 5 energetikai tanácsadó és auditor is van köztük.",
  "2164":
    "Várostervezők az építőiparban. A közlekedéstervező és a mobilitási szolgáltatásvezető a közlekedésbe is illene.",
  "2149":
    "41 máshová nem sorolható mérnök (energetikai, megújuló, minőségügyi, orvosbiológiai, nukleáris, robotikai) egyetlen gyűjtő alágban.",
  "3119":
    "Máshová nem sorolható technikusok, zömmel gyártási (bőr-, textil-, élelmiszeripari, minőségügyi) technikusok. A gyártómérnökök mellé kerültek, de az ipar is védhető.",
  "225":
    "Az állatorvosokat az ISCO az egészségügybe sorolja; a mezőgazdaságba kerültek, mert a szakterületük az állattartás.",
  "5164":
    "Hobbiállat-gondozók, kutyakiképzők, állatkerti gondozók a mezőgazdaságban, az állategészségügy mellett. A személyi szolgáltatás is lehetne.",
  "2269":
    "23 vegyes egészségügyi foglalkozás: 14 terápiás (ergoterapeuta, csontkovács, művészetterapeuta), 9 diagnosztikai (radiográfus, orvosbiológus). Többség szerint terápia.",
  "3259":
    "Vegyes egészségügyi kisegítők (aneszteziológiai és légzésterápiás asszisztens, Covid-tesztelő) az ápolás és betegellátás alatt.",
  "3257":
    "Környezet- és munkaegészségügyi ellenőrök a népegészségügyben. Hatósági munka, a közigazgatásba is mehetne.",
  "5322":
    "Otthoni gondozók: az ISCO egészségügyi gondozásnak veszi, az idősgondozás mellé kerültek.",
  "1341":
    "A gyermekgondozási vezetők és a gyermekgondozók (5311) az oktatásban, a kisgyermekkori nevelés alatt, nem a szociális ellátásban.",
  "2631":
    "Közgazdászok: hatból négy szakpolitikai (gazdaságpolitikai referens, adópolitikai elemző), ezért közpolitika. Az üzleti ág is védhető.",
  "2432":
    "PR- és kampányszakemberek: a felük politikai (kampányfelelős, pártmegbízott, választási ügynök). A kultúra kommunikáció alágába kerültek, a közigazgatás szomszédjába, de a marketing a kereskedelemben van.",
  "1222":
    "Reklám- és PR-vezetők a kommunikációban (kultúra) a PR miatt. A reklámvezető a marketinggel, a kereskedelemben is lehetne.",
  "3339":
    "Vegyes ügynökök (reklámértékesítő, árverező, tehetségügynök, szellemitulajdon-tanácsadó, kiadói jogkezelő) az értékesítés és marketing alatt.",
  "3315":
    "Becsüsök és kárszakértők: fele biztosítási kárrendezés, fele ingatlan- és vagyonbecslés.",
  "7215":
    "Kötélzetszerelők a fémipar mellett. A rendezvény-állványozó és a színpadi munkás a kultúrába, a többi az építőiparba is mehetne.",
  "723":
    "A gépjármű- (7231) és légijármű-szerelők (7232) az ipari karbantartásban. A közlekedés is védhető.",
  "7132":
    "Felületkezelők és fényezők a fémiparban (zömmel jármű- és ipari fényezés), nem az építőipari festők mellett.",
  "8343":
    "Darukezelők az építőiparban (toronydaru, autódaru); a konténerdaru-kezelő a logisztikába illene.",
  "7541": "Búvárok: az építőipari búvár mellett mentő- és begyűjtő búvár is van köztük.",
  "7544":
    "Kártevőirtók a takarítás és épületgondnokság mellett. A növényvédőszer-permetező a mezőgazdaságba is mehetne.",
  "9622": "Ezermester (alkalmi munkás) az épületgondnokság mellett. Az építőipar is lehetne.",
  "8132": "Fotó- és filmelőhívók a fotográfia mellett (kultúra), nem a vegyiparban.",
  "8157": "Mosodai gépkezelők a takarításnál, nem a textiliparban.",
  "4212":
    "Szerencsejáték (krupié, bukméker) a sport és szabadidő mellett. A vendéglátás is lehetne.",
  "9629":
    "Egyszerű szabadidős foglalkozások (jegyszedő, ruhatáros, vidámparki kezelő) a sport és szabadidő alatt; mosodai kezelő és reklámkihelyező is van köztük.",
  "5419":
    "Vegyes védelmi foglalkozások (vízimentő, parti őr, vadőr, állatvédelmi ellenőr, közterület-felügyelő) a vagyonvédelem és közbiztonság alatt.",
  "2529": "Kiberbiztonság: kilencből nyolc biztonsági foglalkozás, a tudásmérnök kilóg.",
  "5165": "Gépjárművezető-oktatók a közúti közlekedésben, nem az oktatásban.",
  "5111": "Utaskísérők a légi közlekedésben; a hajós és a vonati steward is itt van.",
  "5241": "Manökenek és modellek az előadó-művészetben.",
  "3433": "Múzeumi technikusok: taxidermista és big data archívum-könyvtáros is van köztük.",
  "2636":
    "Vallási foglalkozások (3413-mal együtt) a kultúrában, a humántudományok mellett. A szociális ellátás is lehetne.",
};

const esco = JSON.parse(readFileSync("raw/esco/esco.json", "utf8")) as Esco;
const branches = loadBranches();
validateBranches(branches, esco.iscoGroups);

const groupLabel = new Map(esco.iscoGroups.map((g) => [g.code, g.label.hu]));
const units = esco.iscoGroups
  .map((g) => g.code)
  .filter((c) => c.length === 4)
  .sort();
const byUnit = new Map<string, Occupation[]>();
for (const o of esco.occupations) byUnit.set(o.isco, [...(byUnit.get(o.isco) ?? []), o]);
const count = (codes: string[]) => codes.reduce((n, c) => n + (byUnit.get(c)?.length ?? 0), 0);
const unitsOf = new Map<string, string[]>();
for (const unit of units) {
  const id = branchOf(branches, unit).subBranch.id;
  unitsOf.set(id, [...(unitsOf.get(id) ?? []), unit]);
}

const lines = [
  "# Ágtábla ellenőrzése",
  "",
  `Generálva: \`pnpm branches:review\`, a \`data/branches.json\` és az ESCO ${esco.version} alapján.`,
  "",
  "| # | Fő ág | id | Alág | Foglalkozás |",
  "| --: | --- | --- | --: | --: |",
  ...branches.map((b, i) => {
    const codes = b.subBranches.flatMap((s) => unitsOf.get(s.id) ?? []);
    return `| ${i + 1} | ${b.label.hu} | \`${b.id}\` | ${b.subBranches.length} | ${count(codes)} |`;
  }),
  "",
  "## Kétes esetek",
  "",
];

for (const [code, reason] of Object.entries(DOUBTS)) {
  const unit = units.find((u) => u.startsWith(code));
  if (!unit || !groupLabel.has(code)) throw new Error(`doubt about unknown ISCO group ${code}`);
  const { branch, subBranch } = branchOf(branches, unit);
  lines.push(
    `- **${code}** ${groupLabel.get(code)} → ${branch.label.hu} / ${subBranch.label.hu}. ${reason}`,
  );
}

const empty = units.filter((u) => !byUnit.has(u));
lines.push(
  "",
  `Foglalkozás nélküli egységcsoportok (a helyük nem számít): ${empty.join(", ")}.`,
  "",
);

const isDoubtful = (unit: string) => Object.keys(DOUBTS).some((code) => unit.startsWith(code));
const examples = (unit: string) =>
  (byUnit.get(unit) ?? [])
    .toSorted((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }))
    .slice(0, 3)
    .map((o) => o.label.hu)
    .join(", ");

branches.forEach((branch, i) => {
  const codes = branch.subBranches.flatMap((s) => unitsOf.get(s.id) ?? []);
  lines.push(`## ${i + 1}. ${branch.label.hu} (\`${branch.id}\`): ${count(codes)} foglalkozás`, "");
  for (const sub of branch.subBranches) {
    const subUnits = unitsOf.get(sub.id) ?? [];
    lines.push(
      `### ${sub.label.hu} (\`${sub.id}\`): ${count(subUnits)} foglalkozás`,
      "",
      `Listázott ISCO-kódok: ${sub.isco.join(", ")}`,
      "",
    );
    for (const unit of subUnits) {
      const n = byUnit.get(unit)?.length ?? 0;
      const flag = isDoubtful(unit) ? " _(kétes)_" : "";
      lines.push(
        `- **${unit}** ${groupLabel.get(unit)} (${n})${flag}${n ? `: ${examples(unit)}` : ""}`,
      );
    }
    lines.push("");
  }
});

writeFileSync(OUT, lines.join("\n"));
console.log(`${branches.length} main branches, ${units.length} unit groups -> ${OUT}`);
