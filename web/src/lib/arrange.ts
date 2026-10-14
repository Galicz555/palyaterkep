// The layouts: where each role sits on the map, and what frames it (glossary, layout). A layout is
// a pure function of the roles; the renderer morphs between two of them and builds the frame
// (glass, guides, labels) from the spec that comes with the positions.
//
// Units are the disc's: the outermost shell and the disc's rim are R_OUT. The ground is x/z and y is
// up (see lib/layout.ts).

import { capDirection, DEMANDS, mixOf, type Mix } from "./demand.ts";
import { hash, layout as discLayout, R_OUT, type Layout } from "./layout.ts";
import type { LayoutId } from "./layouts.ts";
import type { Level, MapData } from "./model.ts";

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
  };
}

/** Shell radii by level: ordered, not measured, so they are evenly spaced from a hole outwards. */
const SHELL = [0.3, 0.48, 0.66, 0.83, 1].map((f) => f * R_OUT);
/** Roles sit just inside their shell, in a band this fraction of its radius thick. */
const SHELL_BAND = 0.07;
/** Stretches the triangle before it is laid on the cap, for mixes that crowd near the middle. */
const CAP_GAIN = 1;

function sphere(data: MapData): Arrangement {
  const positions = new Float32Array(data.roles.length * 3);
  data.roles.forEach((role, i) => {
    const dir = capDirection(mixOf(role.demands), CAP_GAIN);
    const radius = SHELL[role.level - 1]! * (1 - SHELL_BAND * hash(role.id));
    positions.set([dir[0] * radius, dir[1] * radius, dir[2] * radius], i * 3);
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
    home: { target: [0, 30, 0], az: 0, pol: deg(40), fit: [R_OUT * 1.2, R_OUT * 1.2] },
    free: true,
    extent: R_OUT,
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
