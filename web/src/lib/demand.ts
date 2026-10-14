// What a role asks of a person (glossary, demand), as the layouts need it: the three values as a
// mix (their shares of the sum) and a magnitude (their mean), and the mix as a place on a triangle.
// Pure maths, shared by the layouts that place roles by their demands.

import type { Demands } from "./model.ts";

export const DEMANDS = [
  { key: "physical", label: "Fizikai" },
  { key: "mental", label: "Szellemi" },
  { key: "emotional", label: "Érzelmi" },
] as const;

export type Mix = [number, number, number];

/** A role without data sits in the middle of the triangle. */
export const BALANCED: Mix = [1 / 3, 1 / 3, 1 / 3];

/** The three values as shares of their sum (barycentric coordinates). */
export function mixOf(demands: Demands | null): Mix {
  if (!demands) return BALANCED;
  const sum = demands[0] + demands[1] + demands[2];
  return sum > 0 ? [demands[0] / sum, demands[1] / sum, demands[2] / sum] : BALANCED;
}

/**
 * The mix to the nearest percent, as a key: roles with one key land on one spot. Scores in the same
 * proportion (0.07 / 0.70 / 0.07 and 0.08 / 0.86 / 0.08) have one mix, and so one key.
 */
export const mixKey = (demands: Demands | null): string =>
  demands
    ? mixOf(demands)
        .map((share) => Math.round(share * 100))
        .join("/")
    : "none";

/** The mean of the three values: 0 asks for nothing, 1 asks the most of everyone; 0.5 without data. */
export const magnitudeOf = (demands: Demands | null): number =>
  demands ? (demands[0] + demands[1] + demands[2]) / 3 : 0.5;

const deg = (d: number) => (d * Math.PI) / 180;

/** Where each demand's corner lies around the triangle, clockwise from north: mental on top. */
export const CORNER_ANGLE = [deg(240), deg(0), deg(120)] as const;

/**
 * A mix as a point on the triangle whose corners lie on the unit circle: [east, north], 0 at the
 * balanced centre, length 1 at a corner, 0.5 in the middle of an edge.
 */
export function triangle(mix: Mix): [number, number] {
  let east = 0;
  let north = 0;
  for (let k = 0; k < 3; k++) {
    east += mix[k]! * Math.sin(CORNER_ANGLE[k]!);
    north += mix[k]! * Math.cos(CORNER_ANGLE[k]!);
  }
  return [east, north];
}

/**
 * The demands' colours (sRGB). Their hues, 0, 263 and 313 degrees, keep clear of the CV states'
 * amber (41), green (166) and sky blue (202), so a mix is never mistaken for a state.
 */
export const DEMAND_HEX = ["#ff3b3b", "#9b5cff", "#ff5ad2"] as const;

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
/** The same colours in linear light, which is what the renderer mixes and writes. */
export const DEMAND_LINEAR: readonly [number, number, number][] = DEMAND_HEX.map(
  (hex) =>
    [1, 3, 5].map((at) => linear(parseInt(hex.slice(at, at + 2), 16) / 255)) as [
      number,
      number,
      number,
    ],
);

/** What a role without data is painted: a dull grey, which the map greys further. */
const NO_DATA_COLOR: [number, number, number] = [0.3, 0.3, 0.34];

/**
 * A mix with its differences exaggerated: the shares move `gain` times further from an even third
 * (and stay non-negative and sum to one). Half of the roles lie within 0.36 of the triangle's
 * centre, and an unstretched blend of three hues there is a grey.
 */
export function stretched(mix: Mix, gain = 2.2): Mix {
  const raw = mix.map((w) => Math.max(0, 1 / 3 + gain * (w - 1 / 3)));
  const sum = raw[0]! + raw[1]! + raw[2]!;
  return [raw[0]! / sum, raw[1]! / sum, raw[2]! / sum];
}

/** The colour of a role's demands: its stretched mix blended from the three demand colours, linear. */
export function demandColor(demands: Demands | null): [number, number, number] {
  if (!demands) return NO_DATA_COLOR;
  const mix = stretched(mixOf(demands));
  return [0, 1, 2].map((c) => mix.reduce((s, w, k) => s + w * DEMAND_LINEAR[k]![c]!, 0)) as [
    number,
    number,
    number,
  ];
}

/** The polar angle, from the pole, of the cap's rim: where a pure demand lands. */
export const CAP_ANGLE = deg(84);

/**
 * The triangle laid on a spherical cap (y is the pole, north is -z): a balanced mix lands on the
 * pole and a pure demand at CAP_ANGLE from it, in its corner's direction, so the mixes spread over
 * a good part of a hemisphere. The distance from the pole follows the distance from the triangle's
 * centre (azimuthal equidistant), so what is close on the triangle stays close on the sphere.
 * `curve` below 1 pushes the middle outwards (the distance from the centre is raised to it), for
 * mixes that crowd near the middle; the centre and the corners stay where they are.
 */
export function capDirection(mix: Mix, curve = 1): [number, number, number] {
  const [east, north] = triangle(mix);
  const polar = Math.pow(Math.min(1, Math.hypot(east, north)), curve) * CAP_ANGLE;
  const azimuth = Math.atan2(east, north);
  const ring = Math.sin(polar);
  return [ring * Math.sin(azimuth), Math.cos(polar), -ring * Math.cos(azimuth)];
}
