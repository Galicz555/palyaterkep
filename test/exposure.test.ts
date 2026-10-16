import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXPOSURE_FILE, ExposureFile, readExposure } from "../src/exposure/exposure.ts";

describe("readExposure", () => {
  it("holds the paper's count of unit groups per gradient", () => {
    const { gradients } = ExposureFile.parse(JSON.parse(readFileSync(EXPOSURE_FILE, "utf8")));
    const counts = [1, 2, 3, 4].map((g) => Object.values(gradients).filter((v) => v === g).length);
    expect(counts).toEqual([17, 44, 38, 13]);
  });

  it("finds an ESCO code's gradient by its ISCO unit group, null outside the table", () => {
    const gradient = readExposure();
    expect(gradient("4132.1")).toBe(4);
    expect(gradient("2513.2.4")).toBe(4);
    expect(gradient("2654.1.7")).toBeNull();
  });
});
