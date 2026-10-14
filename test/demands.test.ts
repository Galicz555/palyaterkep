import { describe, expect, it } from "vitest";
import { readDemands, type Demands } from "../src/demands/demands.ts";
import {
  itemRatings,
  percentiles,
  readCrosswalk,
  scoreOccupations,
} from "../src/demands/generate.ts";
import type { Occupation } from "../src/esco/model.ts";

const URI = "http://data.europa.eu/esco/occupation/";

describe("percentiles", () => {
  it("ranks lowest 0, highest 1, and gives ties their mean rank", () => {
    const raw = new Map<string, Demands>([
      ["a", [0.1, 0.5, 0.2]],
      ["b", [0.3, 0.5, 0.1]],
      ["c", [0.3, 0.5, 0.9]],
    ]);
    const ranks = percentiles(raw);
    expect(ranks.get("a")).toEqual([0, 0.5, 0.5]);
    expect(ranks.get("b")).toEqual([0.75, 0.5, 0]);
    expect(ranks.get("c")).toEqual([0.75, 0.5, 1]);
  });
});

describe("itemRatings", () => {
  const ranges = new Map<string, [number, number]>([["IM", [1, 5]]]);
  const row = (soc: string, value: string, suppress = "N", notRelevant = "") => ({
    "O*NET-SOC Code": soc,
    "Element ID": "4.A.2.b.2",
    "Element Name": "Thinking Creatively",
    "Scale ID": "IM",
    "Data Value": value,
    "Recommend Suppress": suppress,
    "Not Relevant": notRelevant,
  });

  it("scales a rating to 0..1 and skips the rows O*NET flags", () => {
    const ratings = itemRatings(
      [row("1", "4"), row("2", "4", "Y"), row("3", "4", "N", "Y")],
      "IM",
      ranges,
    );
    expect([...ratings.keys()]).toEqual(["1"]);
    expect(ratings.get("1")?.get("4.A.2.b.2")).toBe(0.75);
  });

  it("rejects an element whose name has changed", () => {
    const renamed = { ...row("1", "4"), "Element Name": "Something Else" };
    expect(() => itemRatings([renamed], "IM", ranges)).toThrow("expected");
  });
});

describe("scoreOccupations", () => {
  const occupation = (code: string, isco: string): Occupation => ({
    uri: URI + code,
    code,
    isco,
    label: { hu: code, en: code },
    altLabels: { hu: [], en: [] },
    description: { hu: "", en: "" },
    essential: [],
    optional: [],
  });
  const socs = new Map<string, Demands>([
    ["A", [0.2, 0.4, 0.6]],
    ["B", [0.4, 0.6, 0.8]],
    ["C", [0.9, 0.1, 0.1]],
  ]);
  const crosswalk = readCrosswalk(
    "Mapping project name,x,,\n,,,\n" +
      "O*NET Id,ESCO or ISCO URI,Type of Match\n" +
      `A,${URI}1111.1,exactMatch\n` +
      `B,${URI}1111.1,broadMatch\n` +
      `C,http://data.europa.eu/esco/isco/C222,exactISCO\n` +
      `UNRATED,${URI}3333.1,closeMatch\n`,
  );
  const occupations = [
    occupation("1111.1", "1111"),
    occupation("1111.1.1", "1111"),
    occupation("1111.2", "1111"),
    occupation("2221.1", "2221"),
    occupation("3333.1", "3333"),
  ];
  const { raw, tier, looseOnly } = scoreOccupations(occupations, crosswalk, socs);

  it("averages every direct match with equal weight", () => {
    expect(tier.get(URI + "1111.1")).toBe("direct");
    expect(raw.get(URI + "1111.1")?.map((v) => v.toFixed(2))).toEqual(["0.30", "0.50", "0.70"]);
    expect(looseOnly).toBe(0);
  });

  it("falls back to the broader occupation, then the ISCO match, then the unit group", () => {
    expect(tier.get(URI + "1111.1.1")).toBe("broader");
    expect(tier.get(URI + "2221.1")).toBe("iscoMatch");
    expect(raw.get(URI + "2221.1")).toEqual([0.9, 0.1, 0.1]);
    expect(tier.get(URI + "1111.2")).toBe("iscoGroup");
  });

  it("leaves an occupation matched only to unrated O*NET occupations out", () => {
    expect(raw.has(URI + "3333.1")).toBe(false);
  });
});

// The committed file against orderings a careers adviser would sign.
describe("data/demands.json anchors", () => {
  const demands = readDemands();
  const anchors = {
    nurse: "8d3e8aaa-791b-4c75-a465-f3f827028f50",
    policeOfficer: "5793c124-c037-47b2-85b6-dd4a705968dc",
    socialWorker: "4b05bef2-ded4-4b09-ab94-f4c6a555a775",
    roofer: "b4c6d1b0-929e-48be-9f67-47bd8c30658b",
    bricklayer: "05f321f8-055b-407d-bf19-e0ddabda56b7",
    buildingCleaner: "303a1e34-cb16-4054-b323-81e5eec17397",
    domesticCleaner: "cbad55a4-c7cf-4ab6-9540-eac72b26729b",
    accountant: "eda0d957-3c3c-4139-b89a-a18bc9e18897",
    softwareDeveloper: "f2b15a0e-e65a-438a-affb-29b9d50b77d1",
    mathematician: "72628f3a-fd49-499a-9741-870b0a1fcef2",
    statistician: "ac8b3cd1-a127-4e6a-8208-5cfcf7111955",
    librarian: "60f7eb23-a7ea-4cbe-98a5-1248291f62d5",
    archivist: "e3b08984-19fe-4d51-a1b0-990676fc7234",
  };
  type Anchor = keyof typeof anchors;
  const score = (anchor: Anchor, dimension: 0 | 1 | 2) => {
    const d = demands.get(URI + anchors[anchor]);
    if (!d) throw new Error(`${anchor} has no demands`);
    return d[dimension];
  };
  const above = (dimension: 0 | 1 | 2, high: Anchor[], low: Anchor[]) => {
    for (const h of high) {
      for (const l of low) {
        expect(score(h, dimension), `${h} above ${l}`).toBeGreaterThan(score(l, dimension));
      }
    }
  };

  it("physical: building trades and cleaning above desk work", () => {
    above(
      0,
      ["roofer", "bricklayer", "buildingCleaner", "domesticCleaner"],
      ["accountant", "softwareDeveloper", "mathematician", "statistician", "librarian"],
    );
  });

  it("mental: software and mathematics above cleaning and building trades", () => {
    above(
      1,
      ["softwareDeveloper", "mathematician", "statistician"],
      ["buildingCleaner", "domesticCleaner", "roofer", "bricklayer", "accountant"],
    );
    above(1, ["accountant"], ["buildingCleaner", "domesticCleaner"]);
  });

  it("emotional: care, social work and policing above desk and technical work", () => {
    above(
      2,
      ["nurse", "socialWorker", "policeOfficer"],
      ["softwareDeveloper", "accountant", "mathematician", "statistician", "archivist", "roofer"],
    );
  });

  it("each anchor's strongest demand is the one its work is known for", () => {
    const strongest = (anchor: Anchor) => {
      const d = [0, 1, 2].map((i) => score(anchor, i as 0 | 1 | 2));
      return ["physical", "mental", "emotional"][d.indexOf(Math.max(...d))];
    };
    for (const a of ["roofer", "bricklayer", "buildingCleaner", "domesticCleaner"] as Anchor[]) {
      expect(strongest(a), a).toBe("physical");
    }
    for (const a of ["softwareDeveloper", "mathematician", "statistician"] as Anchor[]) {
      expect(strongest(a), a).toBe("mental");
    }
    for (const a of ["nurse", "socialWorker", "policeOfficer"] as Anchor[]) {
      expect(strongest(a), a).toBe("emotional");
    }
  });
});
