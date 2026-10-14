import { describe, expect, it } from "vitest";
import { buildEsco, type Tables } from "../src/esco/ingest.ts";

const OCC = "esco:occupation/dev";
const PY = "esco:skill/python";
const MENTOR = "esco:skill/mentor";

function tables(lang: "hu" | "en"): Tables {
  const hu = lang === "hu";
  return {
    iscoGroups: [
      { code: "2", preferredLabel: hu ? "Szakemberek" : "Professionals" },
      { code: "2512", preferredLabel: hu ? "Szoftverfejlesztők" : "Software developers" },
    ],
    skills: [
      {
        conceptUri: PY,
        skillType: "knowledge",
        reuseLevel: "cross-sector",
        preferredLabel: "Python",
        altLabels: "",
        description: "",
      },
      {
        conceptUri: MENTOR,
        skillType: "skill/competence",
        reuseLevel: "transversal",
        preferredLabel: hu ? "mentorál" : "mentor individuals",
        altLabels: "",
        description: "",
      },
    ],
    occupations: [
      {
        conceptUri: OCC,
        code: "2512.4",
        iscoGroup: "2512",
        preferredLabel: hu ? "szoftverfejlesztő" : "software developer",
        altLabels: hu ? "programozó\n szoftvermérnök \n" : "programmer",
        description: hu ? "Szoftvert fejleszt." : "Develops software.",
      },
    ],
  };
}

const relations = [
  { occupationUri: OCC, relationType: "essential", skillUri: PY },
  { occupationUri: OCC, relationType: "optional", skillUri: MENTOR },
];

describe("buildEsco", () => {
  it("merges both languages and groups skills by relation type", () => {
    const esco = buildEsco({ hu: tables("hu"), en: tables("en") }, relations);
    expect(esco.occupations).toEqual([
      {
        uri: OCC,
        code: "2512.4",
        isco: "2512",
        label: { hu: "szoftverfejlesztő", en: "software developer" },
        altLabels: { hu: ["programozó", "szoftvermérnök"], en: ["programmer"] },
        description: { hu: "Szoftvert fejleszt.", en: "Develops software." },
        essential: [PY],
        optional: [MENTOR],
      },
    ]);
    expect(esco.iscoGroups[1]).toEqual({
      code: "2512",
      label: { hu: "Szoftverfejlesztők", en: "Software developers" },
    });
  });

  it("rejects a concept missing from one language package", () => {
    const en = tables("en");
    en.skills = en.skills.slice(0, 1);
    expect(() => buildEsco({ hu: tables("hu"), en }, relations)).toThrow("differ in size");
  });

  it("rejects a relation to an unknown skill", () => {
    const bad = [
      ...relations,
      { occupationUri: OCC, relationType: "essential", skillUri: "esco:skill/x" },
    ];
    expect(() => buildEsco({ hu: tables("hu"), en: tables("en") }, bad)).toThrow(
      "unknown skill esco:skill/x",
    );
  });

  it("rejects an occupation outside the ISCO unit groups", () => {
    const [hu, en] = [tables("hu"), tables("en")];
    for (const t of [hu, en]) t.occupations[0]!.iscoGroup = "2";
    expect(() => buildEsco({ hu, en }, relations)).toThrow('unknown ISCO unit group "2"');
  });

  it("rejects an occupation without an essential skill", () => {
    const optionalOnly = relations.filter((r) => r.relationType === "optional");
    expect(() => buildEsco({ hu: tables("hu"), en: tables("en") }, optionalOnly)).toThrow(
      "has no essential skill",
    );
  });
});
