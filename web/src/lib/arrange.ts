// The layouts: where each role sits on the map, and what frames it (glossary, layout). A layout is
// a pure function of the roles; the renderer morphs between two of them and builds the frame
// (glass, guides, labels) from the spec that comes with the positions.
//
// Units are the disc's: the outermost shell and the disc's rim are R_OUT. The ground is x/z and y is
// up (see lib/layout.ts).

import {
  capDirection,
  CORNER_ANGLE,
  DEMANDS,
  demandColor,
  magnitudeOf,
  mixKey,
  mixOf,
  triangle,
  type Mix,
} from "./demand.ts";
import { hash, layout as discLayout, R_OUT, type Layout } from "./layout.ts";
import type { LayoutId } from "./layouts.ts";
import type { Level, MapData } from "./model.ts";
import { relax, spread } from "./spread.ts";

type Vec3 = [number, number, number];

/** What the renderer draws around the points. */
export type FrameSpec =
  | {
      kind: "disc";
      plan: Layout;
      /** The ruler for the height, when the layout lifts the points: half its length and its title. */
      ruler?: { half: number; title: string };
    }
  | {
      kind: "sphere";
      /** One glass shell per level, innermost first. */
      shells: { level: Level; radius: number }[];
      /** The three demand stars, in `DEMANDS` order. */
      anchors: { label: string; at: Vec3 }[];
    }
  | {
      kind: "tetra";
      /** Physical, mental, emotional and light, in that order. */
      vertices: { label: string; at: Vec3 }[];
    }
  | {
      kind: "nebula";
      /** The three attractors, in `DEMANDS` order. */
      vertices: { label: string; at: Vec3 }[];
    }
  | {
      kind: "prism";
      /** The three vertical edges, in `DEMANDS` order: where each stands on the floor plan. */
      corners: { label: string; x: number; z: number }[];
      /** One floor per level, lowest first: its height. */
      floors: { level: Level; y: number }[];
      bottom: number;
      top: number;
    };

/** Where the camera opens, and how much it has to show. */
export interface Home {
  target: Vec3;
  /** Azimuth around the up axis, 0 looking north from the south. */
  az: number;
  /** Polar angle from straight up. */
  pol: number;
  /** Half the width and half the height, in map units, that the opening view must contain. */
  fit: [number, number];
}

export interface Arrangement {
  id: LayoutId;
  /** x, y, z of every role, in `MapData.roles` order. */
  positions: Float32Array;
  frame: FrameSpec;
  home: Home;
  /** A volume the camera may circle over the poles; false keeps it above the ground. */
  free: boolean;
  /** Radius of what is drawn around the origin, for the depth fade. */
  extent: number;
  /** A multiplier of each role's node size, by role; null where the layout does not use size. */
  sizes: Float32Array | null;
  /** Linear r, g, b of every role where the layout paints by something other than the branch. */
  colors?: Float32Array;
  /** How opaque a node is: where a layout packs the roles close, they are fainter, to stay apart. */
  alpha: number;
}

const deg = (d: number) => (d * Math.PI) / 180;

/** The colour of every role's demands, in `MapData.roles` order. */
function demandColors(data: MapData): Float32Array {
  const out = new Float32Array(data.roles.length * 3);
  data.roles.forEach((r, i) => out.set(demandColor(r.demands), i * 3));
  return out;
}

function disc(id: LayoutId, plan: Layout, data: MapData, lift?: { axis: number }): Arrangement {
  let positions = plan.positions;
  let ruler: { half: number; title: string } | undefined;
  if (lift) {
    // Height is one demand, its percentile rank from the bottom to the top of the ruler; a role
    // without data stays at the middle.
    positions = new Float32Array(plan.positions);
    data.roles.forEach((role, i) => {
      positions[i * 3 + 1] = role.demands ? (role.demands[lift.axis]! - 0.5) * 2 * LIFT : 0;
    });
    ruler = { half: LIFT, title: `${DEMANDS[lift.axis]!.label} terhelés` };
  }
  const pol = deg(46);
  // The disc and the branch names beyond its rim, wide and (tilted) tall, with some perspective.
  const reach = R_OUT + 34;
  return {
    id,
    positions,
    frame: ruler ? { kind: "disc", plan, ruler } : { kind: "disc", plan },
    home: {
      target: [0, 0, 0],
      az: 0,
      pol,
      fit: [reach * 1.1, (reach * Math.cos(pol) * 1.15 + 10) / 0.95],
    },
    free: false,
    extent: R_OUT,
    sizes: null,
    alpha: 0.78,
  };
}

/** Half the height of the ruler of layout B, in map units: the 0th and 100th percentile. */
const LIFT = 30;

/** Shell radii by level: ordered, not measured, so they are evenly spaced from a hole outwards. */
const SHELL = [0.3, 0.48, 0.66, 0.83, 1].map((f) => f * R_OUT);
/**
 * Roles sit in a band just inside their shell, this thick in map units: level 2 holds 58% of the
 * roles, and on a surface they would pile up. The shells are 17 to 18 units apart.
 */
const SHELL_BAND = 8.5;
/** The middle of the triangle is pushed outwards on the cap: half the roles sit within 0.36 of it. */
const CAP_CURVE = 0.55;
/** Roles that share their scores keep this far apart on their shell, in map units. */
const SPACING = 1.7;

/** Node size by magnitude: the least demanding roles are small, the most demanding large. */
const sizeOfMagnitude = (m: number) => 0.45 + 0.8 * Math.min(1, Math.max(0, (m - 0.25) / 0.55));

/** Two unit vectors at right angles to `u` and to each other. */
function tangents(u: Vec3): [Vec3, Vec3] {
  const a: Vec3 = Math.abs(u[1]) < 0.99 ? [0, 1, 0] : [1, 0, 0];
  const c: Vec3 = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
  const n = Math.hypot(...c);
  const e1: Vec3 = [c[0] / n, c[1] / n, c[2] / n];
  const e2: Vec3 = [
    u[1] * e1[2] - u[2] * e1[1],
    u[2] * e1[0] - u[0] * e1[2],
    u[0] * e1[1] - u[1] * e1[0],
  ];
  return [e1, e2];
}

function sphere(data: MapData): Arrangement {
  const { roles } = data;
  const positions = new Float32Array(roles.length * 3);
  const sizes = new Float32Array(roles.length);
  // Roles of one level that share their scores would share a spot: they get a spiral of their own.
  const offsets = spread(
    roles.map((r) => `${r.level}|${mixKey(r.demands)}`),
    SPACING,
  );
  roles.forEach((role, i) => {
    const dir = capDirection(mixOf(role.demands), CAP_CURVE);
    const radius = SHELL[role.level - 1]! - SHELL_BAND * hash(role.id);
    const [e1, e2] = tangents(dir);
    const dx = offsets[i * 2]!;
    const dy = offsets[i * 2 + 1]!;
    const p: Vec3 = [0, 1, 2].map((k) => dir[k]! * radius + e1[k]! * dx + e2[k]! * dy) as Vec3;
    const keep = radius / Math.hypot(...p);
    positions.set([p[0] * keep, p[1] * keep, p[2] * keep], i * 3);
    sizes[i] = sizeOfMagnitude(magnitudeOf(role.demands));
  });
  // A pure demand is a corner of the triangle: the anchor stars sit there, on the outermost shell.
  const corners: Mix[] = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  return {
    id: "A",
    positions,
    frame: {
      kind: "sphere",
      shells: SHELL.map((radius, k) => ({ level: (k + 1) as Level, radius })),
      anchors: DEMANDS.map((d, k) => {
        const [x, y, z] = capDirection(corners[k]!);
        return { label: d.label, at: [x * R_OUT, y * R_OUT, z * R_OUT] };
      }),
    },
    home: { target: [0, 6, 0], az: 0, pol: deg(62), fit: [R_OUT * 1.12, R_OUT * 1.12] },
    free: true,
    extent: R_OUT,
    sizes,
    alpha: 0.6,
  };
}

/** Circumradius of the prism's triangle, and the height between two floors. */
const PRISM_R = 70;
const FLOOR_GAP = 28;

function prism(data: MapData): Arrangement {
  const { roles } = data;
  const positions = new Float32Array(roles.length * 3);
  // Roles of one floor with one mix would share a spot: they get a spiral of their own.
  const offsets = spread(
    roles.map((r) => `${r.level}|${mixKey(r.demands)}`),
    SPACING,
  );
  roles.forEach((role, i) => {
    const [east, north] = triangle(mixOf(role.demands));
    positions.set(
      [
        east * PRISM_R + offsets[i * 2]!,
        (role.level - 1) * FLOOR_GAP,
        -north * PRISM_R + offsets[i * 2 + 1]!,
      ],
      i * 3,
    );
  });
  // Mixes close together still crowd a floor: push neighbours on one floor 1.5 units apart.
  relax(
    positions,
    roles.map((r) => r.level),
    [0, 2],
    1.5,
  );
  const top = 4 * FLOOR_GAP + 10;
  return {
    id: "C",
    positions,
    frame: {
      kind: "prism",
      corners: DEMANDS.map((d, k) => ({
        label: d.label,
        x: Math.sin(CORNER_ANGLE[k]!) * PRISM_R,
        z: -Math.cos(CORNER_ANGLE[k]!) * PRISM_R,
      })),
      floors: [1, 2, 3, 4, 5].map((level) => ({
        level: level as Level,
        y: (level - 1) * FLOOR_GAP,
      })),
      bottom: -10,
      top,
    },
    home: { target: [0, 50, -4], az: deg(18), pol: deg(64), fit: [PRISM_R * 1.5, PRISM_R * 1.55] },
    free: true,
    extent: PRISM_R * 1.4,
    sizes: null,
    alpha: 0.62,
  };
}

/** Circumradius of the tetrahedron. */
const TETRA_R = 85;

/**
 * How much of a role's place goes to the light vertex: none for the most demanding, 85% for the
 * least. Magnitudes run from 0.3 to 0.72 for nine roles in ten.
 */
const lightOf = (m: number) => 0.85 * Math.min(1, Math.max(0, (0.78 - m) / 0.5));

function tetra(data: MapData): Arrangement {
  const { roles } = data;
  const base = (TETRA_R * Math.sqrt(8)) / 3;
  // A regular tetrahedron around the origin: the three demands on a floor, the light vertex above.
  const vertices: Vec3[] = [
    ...CORNER_ANGLE.map((a): Vec3 => [Math.sin(a) * base, -TETRA_R / 3, -Math.cos(a) * base]),
    [0, TETRA_R, 0],
  ];
  const positions = new Float32Array(roles.length * 3);
  const sizes = new Float32Array(roles.length);
  const offsets = spread(
    roles.map((r) => `${mixKey(r.demands)}|${Math.round(magnitudeOf(r.demands) * 50)}|${r.level}`),
    SPACING,
  );
  roles.forEach((role, i) => {
    const mix = mixOf(role.demands);
    const light = lightOf(magnitudeOf(role.demands));
    const weights = [...mix.map((w) => w * (1 - light)), light];
    for (let k = 0; k < 3; k++) {
      positions[i * 3 + k] = vertices.reduce((s, v, j) => s + weights[j]! * v[k]!, 0);
    }
    positions[i * 3]! += offsets[i * 2]!;
    positions[i * 3 + 2]! += offsets[i * 2 + 1]!;
    // Level has no axis here: it is the size.
    sizes[i] = 0.55 + 0.22 * (role.level - 1);
  });
  relax(
    positions,
    roles.map(() => 0),
    [0, 1, 2],
    1.4,
  );
  return {
    id: "D",
    positions,
    frame: {
      kind: "tetra",
      vertices: [...DEMANDS.map((d) => d.label), "Könnyű"].map((label, k) => ({
        label,
        at: vertices[k]!,
      })),
    },
    home: { target: [0, 0, 0], az: deg(20), pol: deg(68), fit: [TETRA_R * 1.7, TETRA_R * 1.45] },
    free: true,
    extent: TETRA_R * 1.2,
    sizes,
    alpha: 0.62,
  };
}

/** Where the three attractors stand in the nebula, and how thick it is at most. */
const NEBULA_R = 78;
const NEBULA_HEIGHT = 16;

/**
 * Each role is pulled towards the demands it asks most of: its mix is sharpened (squared) and
 * placed between the three attractors, then the cloud is twisted, the further out the more, so it
 * winds into arms, and a hash of the role's id frays it. There is no simulation: the same roles
 * give the same cloud. Level is a weak signal here: a lift of 3 units per level over a cloud that
 * is 16 units thick, and a slightly larger node.
 */
function nebula(data: MapData): Arrangement {
  const { roles } = data;
  const positions = new Float32Array(roles.length * 3);
  const sizes = new Float32Array(roles.length);
  roles.forEach((role, i) => {
    const mix = mixOf(role.demands);
    const sharp = mix.map((w) => w * w);
    const total = sharp[0]! + sharp[1]! + sharp[2]!;
    let east = 0;
    let north = 0;
    for (let k = 0; k < 3; k++) {
      east += (sharp[k]! / total) * Math.sin(CORNER_ANGLE[k]!);
      north += (sharp[k]! / total) * Math.cos(CORNER_ANGLE[k]!);
    }
    const r = Math.hypot(east, north);
    const turn = 1.15 * r;
    // The fray sums two hashes (bell-shaped) and is wider at the attractors: they are balls, not points.
    const fray = 9 * (0.8 + 0.2 * 4 * r * (1 - r)) + 12 * Math.max(0, (r - 0.7) / 0.3) ** 2;
    const jx = hash(role.id + "x") + hash(role.id + "y") - 1;
    const jz = hash(role.id + "z") + hash(role.id + "w") - 1;
    const x = east * Math.cos(turn) + north * Math.sin(turn);
    const z = -north * Math.cos(turn) + east * Math.sin(turn);
    const thick = NEBULA_HEIGHT * (1 - 0.55 * r);
    const jy = (hash(role.id + "v") + hash(role.id + "u") - 1) * thick;
    positions.set(
      [x * NEBULA_R + jx * fray, (role.level - 3) * 3 + jy, z * NEBULA_R + jz * fray],
      i * 3,
    );
    sizes[i] = 0.75 + 0.1 * (role.level - 1);
  });
  relax(
    positions,
    roles.map(() => 0),
    [0, 1, 2],
    1.3,
  );
  // The cloud leans towards its heavier attractors: the camera looks at its middle, not the origin.
  const centre: Vec3 = [0, 0, 0];
  for (let i = 0; i < roles.length; i++) {
    for (let k = 0; k < 3; k++) centre[k]! += positions[i * 3 + k]! / roles.length;
  }
  return {
    id: "F",
    positions,
    frame: {
      kind: "nebula",
      vertices: DEMANDS.map((d, k) => ({
        label: d.label,
        at: [
          Math.sin(CORNER_ANGLE[k]! + 1.15) * NEBULA_R,
          0,
          -Math.cos(CORNER_ANGLE[k]! + 1.15) * NEBULA_R,
        ] as Vec3,
      })),
    },
    home: { target: centre, az: 0, pol: deg(50), fit: [NEBULA_R * 1.25, NEBULA_R * 1.1] },
    free: true,
    extent: NEBULA_R * 1.2,
    sizes,
    alpha: 0.55,
  };
}

/** The disc is worked out once and shared by the layouts that stand on it. */
export function arranger(data: MapData): (id: LayoutId, axis?: number) => Arrangement {
  let plan: Layout | undefined;
  const made = new Map<string, Arrangement>();
  const build = (id: LayoutId, axis: number): Arrangement => {
    plan ??= discLayout(data);
    switch (id) {
      case "A":
        return sphere(data);
      case "B":
        return disc(id, plan, data, { axis });
      case "C":
        return prism(data);
      case "D":
        return tetra(data);
      case "F":
        return nebula(data);
      case "G":
        return { ...disc(id, plan, data), colors: demandColors(data) };
    }
  };
  return (id, axis = 0) => {
    // Only B depends on the axis.
    const key = id === "B" ? `${id}${axis}` : id;
    let arrangement = made.get(key);
    if (!arrangement) {
      arrangement = build(id, axis);
      made.set(key, arrangement);
    }
    return arrangement;
  };
}
