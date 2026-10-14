import { describe, expect, it } from "vitest";
import {
  BALANCED,
  CAP_ANGLE,
  capDirection,
  magnitudeOf,
  mixOf,
  triangle,
  type Mix,
} from "../src/lib/demand.ts";

const pure: Mix[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const polar = (v: number[]) => Math.acos(v[1]!);
/** The angle around the pole from one direction to another. */
const around = (a: number[], b: number[]) =>
  Math.atan2(a[0]! * b[2]! - a[2]! * b[0]!, a[0]! * b[0]! + a[2]! * b[2]!);

describe("mix and magnitude", () => {
  it("takes the three values as shares of their sum", () => {
    const mix = mixOf([0.2, 0.6, 0.2]);
    expect(mix[0]).toBeCloseTo(0.2);
    expect(mix[1]).toBeCloseTo(0.6);
    expect(mix.reduce((a, b) => a + b)).toBeCloseTo(1);
    expect(magnitudeOf([0.2, 0.6, 1])).toBeCloseTo(0.6);
  });

  it("puts a role without data, or with nothing asked, in the middle", () => {
    expect(mixOf(null)).toEqual(BALANCED);
    expect(mixOf([0, 0, 0])).toEqual(BALANCED);
  });
});

describe("the triangle on a cap", () => {
  it("has its centre at the pole and its corners at the rim, in three directions", () => {
    expect(capDirection(BALANCED)[1]).toBeCloseTo(1);
    const [p, m, e] = [capDirection(pure[0]!), capDirection(pure[1]!), capDirection(pure[2]!)];
    for (const corner of [p, m, e]) expect(polar(corner)).toBeCloseTo(CAP_ANGLE);
    expect(Math.abs(around(p, m))).toBeCloseTo((2 * Math.PI) / 3);
    expect(Math.abs(around(m, e))).toBeCloseTo((2 * Math.PI) / 3);
  });

  it("puts mental on top: its corner is north, which is -z", () => {
    const [x, , z] = capDirection([0, 1, 0]);
    expect(x).toBeCloseTo(0);
    expect(z).toBeLessThan(0);
  });

  it("moves away from the pole the further the mix is from balanced", () => {
    const along = [0, 0.2, 0.4, 0.6, 0.8, 1].map((t) =>
      polar(capDirection([(1 - t) / 3 + 0, 1 / 3 + (2 * t) / 3, (1 - t) / 3])),
    );
    for (let k = 1; k < along.length; k++) expect(along[k]!).toBeGreaterThan(along[k - 1]!);
  });

  it("keeps a stretched mix on the cap, with unit length", () => {
    const mixes: Mix[] = [
      [0.4, 0.35, 0.25],
      [0.8, 0.1, 0.1],
      [0.1, 0.1, 0.8],
    ];
    for (const m of mixes) {
      const d = capDirection(m, 3);
      expect(Math.hypot(...d)).toBeCloseTo(1);
      expect(polar(d)).toBeLessThanOrEqual(CAP_ANGLE + 1e-9);
    }
  });

  it("puts the middle of an edge halfway between the centre and a corner", () => {
    expect(Math.hypot(...triangle([0.5, 0.5, 0]))).toBeCloseTo(0.5);
  });
});
