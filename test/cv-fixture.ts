// A four-role map and its ESCO slice, synthetic, for the CV tests.

import { buildMapper } from "../src/cv/mapping.ts";
import { buildGraph } from "../src/cv/states.ts";
import type { Occupation, Skill } from "../src/esco/model.ts";
import type { Role } from "../src/vault/note.ts";

export const OCC = "http://data.europa.eu/esco/occupation/";
export const SK = "http://data.europa.eu/esco/skill/";

const occupation = (id: string, hu: string, en: string, alt: string[] = []): Occupation => ({
  uri: OCC + id,
  code: "0000.1",
  isco: "0000",
  label: { hu, en },
  altLabels: { hu: [], en: alt },
  description: { hu: "", en: `${en} does things. More text.` },
  essential: [],
  optional: [],
});
const skill = (id: string, hu: string, en: string, alt: string[] = []): Skill => ({
  uri: SK + id,
  skillType: "skill/competence",
  reuseLevel: "",
  label: { hu, en },
  altLabels: { hu: [], en: alt },
  description: { hu: "", en: "" },
});
const role = (occ: string, skills: string[], lateral: string[] = []): Role => ({
  curated: false,
  occupation: OCC + occ,
  label: occ,
  level: 2,
  track: "individual",
  branch: "it",
  subBranch: "software",
  skills: skills.map((s) => SK + s),
  lateral: lateral.map((id) => `[[${id}]]`),
});

export const graph = buildGraph(
  new Map([
    ["dev", role("dev", ["python", "debug", "test"], ["tester"])],
    ["tester", role("tester", ["test", "report"], ["dev"])],
    ["nurse", role("nurse", ["care", "hygiene"])],
    ["chef", role("chef", ["cook", "hygiene", "menu"])],
  ]),
);

export const mapper = buildMapper(
  {
    occupations: [
      occupation("dev", "szoftverfejlesztő", "software developer", ["software engineer"]),
      occupation("tester", "szoftvertesztelő", "software tester"),
      occupation("architect", "szoftverarchitekt", "software architect"),
      occupation("nurse", "ápoló", "nurse responsible for general care", ["nurse"]),
      occupation("chef", "szakács", "cook"),
    ],
    skills: [
      skill("python", "Python (számítógépes programozás)", "Python (computer programming)", [
        "Python",
      ]),
      skill("debug", "szoftverhibák elhárítása", "debug software"),
      skill("test", "szoftvertesztek elvégzése", "execute software tests"),
      skill("report", "tesztjelentés", "report test findings"),
      skill("care", "betegápolás", "provide nursing care"),
      skill("hygiene", "higiénia", "hygiene"),
      skill("cook", "főzés", "cooking techniques"),
      skill("menu", "menütervezés", "plan menus"),
      skill("unused", "pythonozás", "python scripting"),
    ],
  },
  graph,
);
