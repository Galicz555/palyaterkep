// How layout A spreads the roles over its cap: the median and 90th percentile of the distance from
// the pole (as a share of the cap's rim) and the share of equal-area cells of the cap that hold a
// role. Usage: node web/scripts/sphere-stats.ts

import { arranger } from "../src/lib/arrange.ts";
import { CAP_ANGLE } from "../src/lib/demand.ts";
import { mapData } from "../src/lib/server/data.ts";

const RINGS = 16;
const SECTORS = 48;
const data = mapData();
const a = arranger(data)("A");
const radii: number[] = [];
const cells = new Set<string>();
data.roles.forEach((r, i) => {
  if (!r.demands) return;
  const [x, y, z] = [0, 1, 2].map((k) => a.positions[i * 3 + k]!) as [number, number, number];
  const polar = Math.acos(y / Math.hypot(x, y, z));
  radii.push(polar / CAP_ANGLE);
  const azimuth = (Math.atan2(x, -z) + 2 * Math.PI) % (2 * Math.PI);
  // Rings of equal solid angle, so a spread-out cloud fills as many cells as it covers area.
  const area = (1 - Math.cos(Math.min(polar, CAP_ANGLE - 1e-9))) / (1 - Math.cos(CAP_ANGLE));
  cells.add(`${Math.floor((azimuth / (2 * Math.PI)) * SECTORS)}/${Math.floor(area * RINGS)}`);
});
radii.sort((p, q) => p - q);
const at = (f: number) => radii[Math.floor(f * (radii.length - 1))]!.toFixed(3);
console.log(
  `roles with data ${radii.length}: cap radius median ${at(0.5)}, p90 ${at(0.9)}; cells ${cells.size}/${RINGS * SECTORS} = ${(cells.size / (RINGS * SECTORS)).toFixed(3)}`,
);
