import { expect, it } from "vitest";
import { extractPrompt } from "../src/cv/extract.ts";

// Pins the wording only: whether the model obeys it is for a live run to check.
it("tells the extraction model that leading a project or setting standards is not level 4", () => {
  const { system } = extractPrompt("cv", "2026-10-14");
  expect(system).toMatch(/rebuild/u);
  expect(system).toMatch(/does not count/u);
});
