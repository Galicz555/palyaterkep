// Colours the map and the list share. States use the Okabe-Ito set, chosen to stay apart for the
// common kinds of colour blindness; the map also tells them apart by size and halo, and the list
// by words.

export const BG = "#0b1020";

export const MARK = { none: 0, held: 1, covered: 2, reachable: 3 } as const;
export type Mark = (typeof MARK)[keyof typeof MARK];

/** On the map's dark ground. */
export const MARK_COLOR = { held: "#e69f00", covered: "#2cc6a0", reachable: "#56b4e9" } as const;

/** One hue per branch, in table order around the wheel, so neighbouring fields look related. */
export const branchColor = (branch: number, branches: number, sub = 0): string =>
  `hsl(${Math.round((205 + (360 * branch) / branches) % 360)}, 68%, ${58 + (sub % 2) * 9}%)`;
