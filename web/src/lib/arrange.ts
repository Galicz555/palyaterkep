// The layouts: where each role sits on the map, and what frames it (glossary, layout). A layout is
// a pure function of the roles; the renderer morphs between two of them and builds the frame
// (glass, guides, labels) from the spec that comes with the positions.
//
// Units are the disc's: the outermost shell and the disc's rim are R_OUT. The ground is x/z and y is
// up (see lib/layout.ts).

import { capDirection, DEMANDS, magnitudeOf, mixKey, mixOf, type Mix } from "./demand.ts";
import { hash, layout as discLayout, R_OUT, type Layout } from "./layout.ts";
import type { LayoutId } from "./layouts.ts";
import type { Level, MapData } from "./model.ts";
import { spread } from "./spread.ts";

type Vec3 = [number, number, number];

/** What the renderer draws around the points. */
export type FrameSpec =
  | { kind: "disc"; plan: Layout }
  | {
      kind: "sphere";
      /** One glass shell per level, innermost first. */
      shells: { level: Level; radius: number }[];
      /** The three demand stars, in `DEMANDS` order. */
      anchors: { label: string; at: Vec3 }[];
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
  /** How opaque a node is: where a layout packs the roles close, they are fainter, to stay apart. */
  alpha: number;
}

const deg = (d: number) => (d * Math.PI) / 180;

function disc(id: LayoutId, plan: Layout): Arrangement {
  const pol = deg(46);
  // The disc and the branch names beyond its rim, wide and (tilted) tall, with some perspective.
  const reach = R_OUT + 34;
  return {
    id,
    positions: plan.positions,
    frame: { kind: "disc", plan },
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

/** The disc is worked out once and shared by the layouts that stand on it. */
export function arranger(data: MapData): (id: LayoutId) => Arrangement {
  let plan: Layout | undefined;
  const made = new Map<LayoutId, Arrangement>();
  return (id) => {
    let arrangement = made.get(id);
    if (!arrangement) {
      plan ??= discLayout(data);
      arrangement = id === "A" ? sphere(data) : disc(id, plan);
      made.set(id, arrangement);
    }
    return arrangement;
  };
}
