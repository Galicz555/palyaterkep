// Where every role sits on the map. The layout is semantic, not force-directed: the angle is the
// branch, the distance from the centre is the level, the height is the track (glossary, axis).
// A pure function of the roles, so the same vault always draws the same map.
//
// The ground is the x/z plane, y is up. Angles run clockwise from north, which is -z, so on the
// default camera north is the top of the screen: x = r sin(a), z = -r cos(a).

import type { MapData } from "./model.ts";

/** The first lane starts here: a hole in the middle keeps the level-1 lane from being cramped. */
export const R_HOLE = 12;
/** The last lane ends here. Everything else is in these units. */
export const R_OUT = 100;
/** Management roles float this far above individual ones. */
export const TRACK_HEIGHT = 16;

const TAU = Math.PI * 2;
const deg = (d: number) => (d * Math.PI) / 180;

/** Empty angle between two branches / two sub-branches, so the sectors read as separate. */
const BRANCH_GAP = deg(1.2);
const SUB_GAP = deg(0.25);
/** Empty radius between two lanes, in map units. */
const LANE_GAP = 1.2;
/** Space kept free inside a cell around its roles, in map units. */
const CELL_PAD = 0.7;

/**
 * Sector widths. Half of each branch's angle is the same for all 13 branches, half follows its
 * share of the roles. Purely by count the 112 IT roles would get 13 degrees and industry 86; with
 * the blend a small branch stays readable and the density of dots differs by 2x between the
 * busiest and the quietest sector instead of 7x.
 */
const EQUAL_SHARE = 0.5;
/**
 * Branches drawn wider than their roles earn. IT is where the product starts and where the zoomed
 * view has to read best: a CV in IT lights up the most roles there, and their names are the
 * longest, so IT gets 1.8x the blended width (about 33 degrees).
 */
const FEATURED: Record<string, number> = { it: 1.8 };
/** A sub-branch's slice follows its role count plus this many, so one with 2 roles still shows. */
const SUB_PAD = 3;
/**
 * Lane radii. Levels are ordered, not measured, so how far apart the lanes are carries no meaning
 * and can serve readability. Two rules are blended: equal dot density (a lane's area follows its
 * role count, at least LANE_FLOOR of the disc: level 2 holds 1769 roles, level 5 holds 26) and
 * depth by the square root of the count (so no lane is a mere line). 0.6 of the first and 0.4 of
 * the second give each level about 8, 7, 10, 19 and 118 square units per role: the crowded levels
 * are as roomy as the middle one, instead of 2.5 times tighter under the depth rule alone.
 */
const LANE_DENSITY = 0.6;
const LANE_FLOOR = 0.06;
const LANE_CROWD = 3;

export interface Span {
  start: number;
  end: number;
}

export interface Layout {
  /** x, y, z of every role, in `MapData.roles` order. */
  positions: Float32Array;
  /** Per branch, in table order: its sector and the slices of its sub-branches. */
  branches: (Span & { subs: Span[] })[];
  /** Per level 1..5 (index 0..4): the radius range of its lane. */
  lanes: Span[];
}

const hash = (text: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0) / 4294967296;
};

/** Position on the ground for angle `a` and radius `r`. */
export const ground = (a: number, r: number): [number, number] => [
  r * Math.sin(a),
  -r * Math.cos(a),
];

export function layout(data: MapData): Layout {
  const { branches, roles } = data;
  const total = roles.length;

  // Lanes: where each level's lane ends is a blend of two rules (see LANE_DENSITY).
  const perLevel = [0, 0, 0, 0, 0];
  for (const role of roles) perLevel[role.level - 1]! += 1;
  const crowd = Math.max(...perLevel, 1);
  const depthShare = perLevel.map((n) => 1 + LANE_CROWD * Math.sqrt(n / crowd));
  const depthSum = depthShare.reduce((a, b) => a + b, 0);
  const discArea = R_OUT * R_OUT - R_HOLE * R_HOLE;
  const areaShare = perLevel.map((n) => Math.max(n / Math.max(total, 1), LANE_FLOOR));
  const areaSum = areaShare.reduce((a, b) => a + b, 0);
  const bounds = [R_HOLE];
  let counted = 0;
  let deep = 0;
  perLevel.forEach((_, k) => {
    counted += areaShare[k]! / areaSum;
    deep += depthShare[k]! / depthSum;
    const byDensity = Math.sqrt(R_HOLE * R_HOLE + counted * discArea);
    const byDepth = R_HOLE + deep * (R_OUT - R_HOLE);
    bounds.push(LANE_DENSITY * byDensity + (1 - LANE_DENSITY) * byDepth);
  });
  const lanes: Span[] = perLevel.map((_, k) => ({
    start: k === 0 ? R_HOLE : bounds[k]! + LANE_GAP / 2,
    end: k === perLevel.length - 1 ? R_OUT : bounds[k + 1]! - LANE_GAP / 2,
  }));

  // Sectors: the first branch (IT) is centred on north.
  const perBranch = branches.map(() => 0);
  const perSub = branches.map((b) => b.subBranches.map(() => 0));
  for (const role of roles) {
    perBranch[role.branch]! += 1;
    perSub[role.branch]![role.sub]! += 1;
  }
  const raw = perBranch.map(
    (n, b) =>
      ((1 - EQUAL_SHARE) * (n / Math.max(total, 1)) + EQUAL_SHARE / branches.length) *
      (FEATURED[branches[b]!.id] ?? 1),
  );
  const rawSum = raw.reduce((a, b) => a + b, 0);
  const weights = raw.map((w) => w / rawSum);
  const arc = TAU - BRANCH_GAP * branches.length;
  const spans: Layout["branches"] = [];
  let angle = -(arc * (weights[0] ?? 0)) / 2;
  branches.forEach((branch, b) => {
    const width = arc * weights[b]!;
    const subTotal = perSub[b]!.reduce((s, n) => s + n + SUB_PAD, 0);
    const room = width - SUB_GAP * (branch.subBranches.length - 1);
    const subs: Span[] = [];
    let a = angle;
    perSub[b]!.forEach((n) => {
      const w = (room * (n + SUB_PAD)) / subTotal;
      subs.push({ start: a, end: a + w });
      a += w + SUB_GAP;
    });
    spans.push({ start: angle, end: angle + width, subs });
    angle += width + BRANCH_GAP;
  });

  // Cells: the roles of one sub-branch and one level share a block of the map. Individual roles
  // come first, so management roles take the outer rows; their height keeps the two tracks apart.
  const cells = new Map<string, number[]>();
  roles.forEach((role, i) => {
    const key = `${role.branch}/${role.sub}/${role.level}`;
    const cell = cells.get(key);
    if (cell) cell.push(i);
    else cells.set(key, [i]);
  });
  const positions = new Float32Array(total * 3);
  for (const [key, members] of cells) {
    const [b, s, level] = key.split("/").map(Number) as [number, number, number];
    const slice = spans[b]!.subs[s]!;
    const lane = lanes[level - 1]!;
    members.sort((p, q) => Number(roles[p]!.management) - Number(roles[q]!.management));
    const placed = fill(members.length, slice, lane);
    members.forEach((i, k) => {
      const [a, radius, wobble] = placed[k]!;
      // A small deterministic nudge, so the blocks do not read as a grid.
      const id = roles[i]!.id;
      const [x, z] = ground(
        a + ((hash(id) - 0.5) * wobble) / radius,
        radius + (hash(`${id}/r`) - 0.5) * wobble,
      );
      positions.set([x, roles[i]!.management ? TRACK_HEIGHT / 2 : -TRACK_HEIGHT / 2, z], i * 3);
    });
  }
  return { positions, branches: spans, lanes };
}

/**
 * `count` points evenly over the block between `slice` (angles) and `lane` (radii): staggered
 * rows, as many rows as keeps the points about equally far apart along and across.
 * Returns [angle, radius, nudge size] per point.
 */
function fill(count: number, slice: Span, lane: Span): [number, number, number][] {
  const r0 = lane.start + CELL_PAD;
  const r1 = lane.end - CELL_PAD;
  const middle = (r0 + r1) / 2;
  const pad = CELL_PAD / middle;
  const a0 = slice.start + pad;
  const a1 = slice.end - pad;
  const width = Math.max(0.01, (a1 - a0) * middle);
  const depth = Math.max(0.01, r1 - r0);
  const rows = Math.min(count, Math.max(1, Math.round(Math.sqrt((count * depth) / width))));
  const base = Math.floor(count / rows);
  const extra = count % rows;
  const gap = Math.sqrt((width * depth) / count);
  const out: [number, number, number][] = [];
  for (let row = 0; row < rows; row++) {
    const inRow = base + (row < extra ? 1 : 0);
    const radius = r0 + (depth * (row + 0.5)) / rows;
    for (let i = 0; i < inRow; i++) {
      const across = inRow === 1 ? 0.5 : (i + (row % 2 ? 0.75 : 0.25)) / inRow;
      out.push([a0 + (a1 - a0) * across, radius, Math.min(gap * 0.2, CELL_PAD)]);
    }
  }
  return out;
}
