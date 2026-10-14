import { describe, expect, it } from "vitest";
import { checkExtraction, extractPrompt, yearsFromDates } from "../src/cv/extract.ts";
import { fold } from "../src/cv/verify.ts";

// Pins the wording only: whether the model obeys it is for a live run to check.
it("tells the extraction model that leading a project or setting standards is not level 4", () => {
  const { system } = extractPrompt("cv", "2026-10-14");
  expect(system).toMatch(/rebuild/u);
  expect(system).toMatch(/does not count/u);
});

describe("yearsFromDates", () => {
  const today = "2026-10-14";

  it("counts the months of a range with both ends included", () => {
    expect(yearsFromDates("09/2021 – 05/2022", today)).toBe(9 / 12);
    expect(yearsFromDates("2021. 09. – 2022. 05.", today)).toBe(9 / 12);
    expect(yearsFromDates("2021-09 - 2022-05", today)).toBe(9 / 12);
  });

  it("runs an open range to the current month", () => {
    expect(yearsFromDates("04/2025 – Present", today)).toBe(19 / 12);
    expect(yearsFromDates("2025. 04. – jelenleg", today)).toBe(19 / 12);
  });

  it("leaves ranges without months, or running backwards, to the model", () => {
    expect(yearsFromDates("2019 – 2023", today)).toBeUndefined();
    expect(yearsFromDates("05/2022 – 09/2021", today)).toBeUndefined();
    expect(yearsFromDates("04/2025", today)).toBeUndefined();
  });
});

it("takes a job's years from its dates, not from the model, when the dates name months", () => {
  const cv = fold("Software Engineer\n09/2021 – 05/2022\nBuilt things.");
  const { kept } = checkExtraction(
    {
      jobs: [
        {
          title: "Software Engineer",
          occupation: "software developer",
          dates: "09/2021 – 05/2022",
          years: 0.6,
          responsibility: null,
        },
      ],
      skills: [],
    },
    cv,
    "2026-10-14",
  );
  expect(kept.jobs[0]?.years).toBe(9 / 12);
});
