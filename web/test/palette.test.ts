import { readFileSync } from "node:fs";
import { Color } from "three";
import { describe, expect, it } from "vitest";
import { branchColor, branchPainted } from "../src/lib/palette.ts";

const branches = JSON.parse(
  readFileSync(new URL("../../data/branches.json", import.meta.url), "utf8"),
) as unknown[];

describe("branch palette", () => {
  it("gives every branch of the table a colour of its own", () => {
    const colours = branches.map((_, b) => branchPainted(b));
    expect(new Set(colours).size).toBe(branches.length);
  });

  it("hands the shaders the shown colour sRGB-encoded once more", () => {
    // #35dceb: 0x35 = 53 → 53/255 encoded → 126.
    expect(branchColor(0)).toBe("#7eeff6");
  });

  it("reaches the shaders as the shown colour, in a form three.js parses", () => {
    // The shaders write the linear value as it is, so it must equal the shown sRGB value.
    const { r, g, b } = new Color(branchColor(0));
    expect([r, g, b].map((c) => Math.round(255 * c))).toEqual([0x35, 0xdc, 0xeb]);
  });
});
