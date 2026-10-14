// Colours the map and the list share. States use the Okabe-Ito set, chosen to stay apart for the
// common kinds of colour blindness; the map also tells them apart by size and halo, and the list
// by words.

export const BG = "#0b0d12";

export const MARK = { none: 0, held: 1, covered: 2, reachable: 3 } as const;
export type Mark = (typeof MARK)[keyof typeof MARK];

/** On the map's dark ground. */
export const MARK_COLOR = { held: "#e69f00", covered: "#2cc6a0", reachable: "#56b4e9" } as const;

/**
 * What the map puts on the screen for a linear colour (see `branchPainted`), as a CSS colour, for
 * the legend's swatches.
 */
export const paintedRgb = ([r, g, b]: readonly number[]): string =>
  `rgb(${[r, g, b].map((c) => Math.round(255 * c!)).join(" ")})`;

/**
 * One colour per branch, in branch-table order, as it should look on the map's dark ground. Picked
 * for distance, not for a hue wheel: five of the eight layouts tell branches apart by colour alone,
 * so any two sit at least 0.10 apart in OKLab (the old even-hue wheel had pairs 0.018 apart, about
 * the same colour once drawn), and as far from the three state colours. Lightness stays within
 * 0.66–0.82 so every branch reads on the dark ground and none looks like a pale no-data point.
 */
const BRANCH_SHOWN = [
  "#35dceb", // it
  "#947deb", // engineering
  "#80a108", // agriculture
  "#b28b45", // industry
  "#e16941", // construction
  "#30a5a8", // transport
  "#fe7b90", // trade
  "#feac9e", // hospitality
  "#d664a3", // health-social
  "#b1d454", // education
  "#e7a9fb", // culture
  "#aba0e5", // public
  "#a6b368", // business
] as const;

const shown = (branch: number): string => BRANCH_SHOWN[branch % BRANCH_SHOWN.length]!;

/**
 * A branch's colour for the map's shaders. three.js reads a CSS colour as sRGB and hands it to them
 * in linear light, and they write it as it is; so the colour goes in sRGB-encoded once more, and
 * comes out on screen as `branchPainted`.
 */
export const branchColor = (branch: number): string => {
  const encode = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  const hex = shown(branch);
  const channels = [1, 3, 5].map((i) => encode(parseInt(hex.slice(i, i + 2), 16) / 255));
  return `#${channels
    .map((c) =>
      Math.round(255 * c)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
};

/** A branch's colour as it shows on the map, for CSS: the legend's swatches and the list. */
export const branchPainted = (branch: number): string => shown(branch);
