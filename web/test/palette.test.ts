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

  it("reaches the shaders as the shown colour, in a form three.js parses", () => {
    // The shaders write the linear value as it is, so it must equal the shown sRGB value.
    const { r, g, b } = new Color(branchColor(0));
    // Within one step of 255: the colour passes through 8 bits twice.
    [r, g, b].forEach((c, i) => expect(Math.abs(255 * c - [0x2f, 0x7b, 0xff][i]!)).toBeLessThan(1));
  });
});
