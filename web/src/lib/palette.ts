// Colours the map and the list share. States use the Okabe-Ito set, chosen to stay apart for the
// common kinds of colour blindness; the map also tells them apart by size and halo, and the list
// by words.

export const BG = "#0b0d12";

export const MARK = { none: 0, held: 1, covered: 2, reachable: 3 } as const;
export type Mark = (typeof MARK)[keyof typeof MARK];

/** On the map's dark ground. */
export const MARK_COLOR = { held: "#e69f00", covered: "#2cc6a0", reachable: "#56b4e9" } as const;

const branchHsl = (branch: number, branches: number, sub: number): [number, number, number] => [
  Math.round((205 + (360 * branch) / branches) % 360),
  68,
  58 + (sub % 2) * 9,
];

/** One hue per branch, in table order around the wheel, so neighbouring fields look related. */
export const branchColor = (branch: number, branches: number, sub = 0): string => {
  const [h, s, l] = branchHsl(branch, branches, sub);
  return `hsl(${h}, ${s}%, ${l}%)`;
};

/**
 * What the map's shaders put on the screen for `branchColor`: three.js hands them the colour in
 * linear light and they write it as it is, so a point shows deeper than the same CSS colour does.
 * For the legend's swatches, which have to match the points.
 */
export function branchPainted(branch: number, branches: number, sub = 0): string {
  const [h, s, l] = branchHsl(branch, branches, sub);
  const k = s / 100;
  const light = l / 100;
  const a = k * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const m = (n + h / 30) % 12;
    const c = light - a * Math.max(-1, Math.min(m - 3, 9 - m, 1));
    return Math.round(255 * (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  };
  return `rgb(${channel(0)} ${channel(8)} ${channel(4)})`;
}
