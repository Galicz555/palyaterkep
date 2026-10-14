// What the map draws around the points, one frame per layout: glass shells, guide lines, the
// tinted floor, the stars that name a layout's corners, and the labels that go with them. A frame
// belongs to its layout; changing layout builds the new one, fades it in while the old one fades
// out and is then thrown away.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  FrontSide,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from "three";
import type { FrameSpec } from "../arrange.ts";
import { ground, R_HOLE, R_OUT, type Layout } from "../layout.ts";
import type { MapData } from "../model.ts";
import { BG, branchColor } from "../palette.ts";
import { LEVEL_NAMES } from "../text.ts";
import { ADD, NODE_FRAG, NODE_VERT, SHELL_FRAG, SHELL_VERT } from "./shaders.ts";

const TAU = Math.PI * 2;

type Vec3 = [number, number, number];

/** The disc's floor sits a little below the points on it. */
export const FLOOR_Y = -1.5;
/** How flat the glass around the disc is, as a fraction of a sphere. */
const DOME = 0.5;
/** A sub-branch gets its name on the rim once its slice is this wide on screen. */
const SUB_LABEL_PX = 24;

export interface Spot {
  x: number;
  y: number;
  /** Distance from the camera; negative behind it. */
  d: number;
}

/** What a frame needs from the renderer to put its labels on the screen. */
export interface FrameCtx {
  project(x: number, y: number, z: number, out: Spot): void;
  place(e: HTMLElement, x: number, y: number, opacity: number, extra?: string): void;
  onScreen(x: number, y: number, pad?: number): boolean;
}

export interface Frame {
  /** 0 to 1: how much of the frame shows, while it fades in or out. */
  fade(amount: number): void;
  /** Puts the labels; `zoom` is 1 for the whole map and falls as the camera comes closer. */
  place(ctx: FrameCtx, zoom: number): void;
  dispose(): void;
}

export interface Host {
  scene: Scene;
  /** Holds the labels. */
  layer: HTMLElement;
  /** The node shader's uniforms, shared with the stars. */
  uniforms: Record<string, { value: number }>;
}

export const el = (tag: string, cls: string, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const mix = (a: Color, b: Color, t: number) => new Color().copy(a).lerp(b, t);

/** The things one frame made, so they can be faded and removed together. */
function parts(host: Host) {
  const objects: Object3D[] = [];
  const pins: HTMLElement[] = [];
  const fades: ((amount: number) => void)[] = [];
  const shown = { amount: 1 };
  return {
    shown,
    add<T extends Object3D>(object: T, fade: (amount: number) => void): T {
      host.scene.add(object);
      objects.push(object);
      fades.push(fade);
      return object;
    },
    pin(cls: string, text: string) {
      const e = el("div", `lbl ${cls}`, text);
      host.layer.append(e);
      pins.push(e);
      return e;
    },
    fade(amount: number) {
      shown.amount = amount;
      for (const fn of fades) fn(amount);
    },
    dispose() {
      for (const o of objects) {
        host.scene.remove(o);
        const thing = o as Mesh;
        thing.geometry?.dispose();
        for (const m of [thing.material].flat()) m?.dispose();
      }
      for (const p of pins) p.remove();
    },
  };
}

/** Lines that fade with the frame. */
function lines(points: number[], color: number, opacity: number) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  const material = new LineBasicMaterial({ color, opacity, ...ADD });
  const object = new LineSegments(geometry, material);
  object.renderOrder = 1;
  return { object, fade: (a: number) => (material.opacity = opacity * a) };
}

/** A circle of `r` in the plane through the origin that has the unit `normal`. */
function circle(r: number, normal: [number, number, number], steps = 128): number[] {
  const n = new Vector3(...normal).normalize();
  const u = new Vector3(0, 1, 0).cross(n);
  if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
  u.normalize();
  const w = new Vector3().crossVectors(n, u);
  const at = (t: number) =>
    u.clone().multiplyScalar(Math.cos(t)).addScaledVector(w, Math.sin(t)).multiplyScalar(r);
  const out: number[] = [];
  for (let k = 0; k < steps; k++) {
    const a = at((k / steps) * TAU);
    const b = at(((k + 1) / steps) * TAU);
    out.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  return out;
}

/** A circle of `r` around the up axis at height `y`. */
function latitude(y: number, r: number, steps = 128): number[] {
  const out: number[] = [];
  for (let k = 0; k < steps; k++) {
    const a = (k / steps) * TAU;
    const b = ((k + 1) / steps) * TAU;
    out.push(r * Math.cos(a), y, r * Math.sin(a), r * Math.cos(b), y, r * Math.sin(b));
  }
  return out;
}

type Parts = ReturnType<typeof parts>;

/** A glass shell: clear in the middle, glowing where the surface turns away. `squash` flattens it. */
function glass(p: Parts, radius: number, strength: number, squash = 1) {
  const material = new ShaderMaterial({
    uniforms: { uStrength: { value: strength } },
    vertexShader: SHELL_VERT,
    fragmentShader: SHELL_FRAG,
    ...ADD,
    side: FrontSide,
  });
  const mesh = new Mesh(new SphereGeometry(radius, 64, 40), material);
  mesh.scale.y = squash;
  mesh.renderOrder = 0;
  p.add(mesh, (a) => (material.uniforms["uStrength"]!.value = strength * a));
}

/** Latitudes and meridians every 30 degrees. */
function graticule(p: Parts, radius: number, squash: number, opacity: number) {
  const grid: number[] = [];
  for (const lat of [-60, -30, 0, 30, 60]) {
    const angle = (lat * Math.PI) / 180;
    grid.push(...latitude(Math.sin(angle) * radius, Math.cos(angle) * radius));
  }
  for (let m = 0; m < 6; m++) {
    const a = (m / 6) * Math.PI;
    grid.push(...circle(radius, [Math.cos(a), 0, -Math.sin(a)]));
  }
  const wire = lines(grid, 0x2b5a8c, opacity);
  wire.object.scale.y = squash;
  p.add(wire.object, wire.fade);
}

function disc(spec: Extract<FrameSpec, { kind: "disc" }>, data: MapData, host: Host): Frame {
  const { plan, ruler } = spec;
  const p = parts(host);
  const nBranches = data.branches.length;
  const bg = new Color(BG);
  const floorPos: number[] = [];
  const floorCol: number[] = [];
  const guide: number[] = [];
  /** The angle in the middle of the empty strip before sector `b`. */
  const gapBefore = (b: number) => {
    const prev = plan.branches[(b + nBranches - 1) % nBranches]!;
    return (plan.branches[b]!.start + prev.end - (b === 0 ? TAU : 0)) / 2;
  };
  const quad = (a0: number, a1: number, r0: number, r1: number, c: Color) => {
    const [x00, z00] = ground(a0, r0);
    const [x01, z01] = ground(a0, r1);
    const [x10, z10] = ground(a1, r0);
    const [x11, z11] = ground(a1, r1);
    floorPos.push(x00, FLOOR_Y, z00, x01, FLOOR_Y, z01, x11, FLOOR_Y, z11);
    floorPos.push(x00, FLOOR_Y, z00, x11, FLOOR_Y, z11, x10, FLOOR_Y, z10);
    for (let k = 0; k < 6; k++) floorCol.push(c.r, c.g, c.b);
  };
  plan.branches.forEach((sector, b) => {
    sector.subs.forEach((slice, s) => {
      const tint = mix(bg, new Color(branchColor(b, nBranches, s)), s % 2 ? 0.17 : 0.1);
      const steps = Math.max(1, Math.ceil((slice.end - slice.start) / ((2 * Math.PI) / 180)));
      for (let k = 0; k < steps; k++) {
        const a0 = slice.start + ((slice.end - slice.start) * k) / steps;
        const a1 = slice.start + ((slice.end - slice.start) * (k + 1)) / steps;
        quad(a0, a1, R_HOLE - 0.6, R_OUT + 0.6, tint);
      }
    });
    // Sector lines, in the middle of the gap before each sector.
    const [x0, z0] = ground(gapBefore(b), R_HOLE - 0.6);
    const [x1, z1] = ground(gapBefore(b), R_OUT + 0.6);
    guide.push(x0, FLOOR_Y, z0, x1, FLOOR_Y, z1);
  });
  const ringAt = (r: number) => {
    for (let k = 0; k < 180; k++) {
      const [x0, z0] = ground((k / 180) * TAU, r);
      const [x1, z1] = ground(((k + 1) / 180) * TAU, r);
      guide.push(x0, FLOOR_Y, z0, x1, FLOOR_Y, z1);
    }
  };
  ringAt(R_HOLE - 0.6);
  ringAt(R_OUT + 0.6);
  plan.lanes.slice(0, -1).forEach((lane, k) => ringAt((lane.end + plan.lanes[k + 1]!.start) / 2));

  const floorGeo = new BufferGeometry();
  floorGeo.setAttribute("position", new Float32BufferAttribute(floorPos, 3));
  floorGeo.setAttribute("color", new Float32BufferAttribute(floorCol, 3));
  const floorMat = new MeshBasicMaterial({ vertexColors: true, depthTest: false });
  const floor = new Mesh(floorGeo, floorMat);
  floor.renderOrder = 0;
  p.add(floor, (a) => {
    floorMat.transparent = a < 1;
    floorMat.opacity = a;
  });
  const guides = lines(guide, 0x3a4d7a, 0.55);
  p.add(guides.object, guides.fade);
  // The disc stands in a flattened glass sphere, the observatory's look.
  glass(p, R_OUT + 4, 0.8, DOME);
  graticule(p, R_OUT + 4, DOME, 0.1);

  const branchPins = data.branches.map((branch, b) => {
    const sector = plan.branches[b]!;
    const [x, z] = ground((sector.start + sector.end) / 2, R_OUT + 5);
    return { e: p.pin("lbl-branch", branch.label), at: new Vector3(x, FLOOR_Y, z), w: 0, h: 0 };
  });
  const subPins = data.branches.flatMap((branch, b) =>
    branch.subBranches.map((sub, s) => {
      const slice = plan.branches[b]!.subs[s]!;
      return { e: p.pin("lbl-sub", sub.label), mid: (slice.start + slice.end) / 2, slice };
    }),
  );
  const levelPins = plan.lanes.map((lane, k) => {
    const [x, z] = ground(gapBefore(0), (lane.start + lane.end) / 2);
    return { e: p.pin("lbl-level", String(k + 1)), at: new Vector3(x, FLOOR_Y, z) };
  });

  // A ruler for the height through the empty middle, when the points are lifted by a demand.
  const rulerPins: { e: HTMLElement; at: Vector3; dx: string }[] = [];
  if (ruler) {
    const x = 0;
    const { half } = ruler;
    const ticks = [-half, 0, half];
    const line = [x, -half, 0, x, half, 0];
    for (const y of ticks) line.push(x - 2, y, 0, x + 2, y, 0);
    const bar = lines(line, 0x6f94c8, 0.7);
    p.add(bar.object, bar.fade);
    const names = ["alacsony", "közepes", "magas"];
    ticks.forEach((y, k) =>
      rulerPins.push({
        e: p.pin("lbl-shell", names[k]!),
        at: new Vector3(x, y, 0),
        dx: " translate(8px,-50%)",
      }),
    );
    rulerPins.push({
      e: p.pin("lbl-anchor", ruler.title),
      at: new Vector3(x, half + 6, 0),
      dx: " translate(-50%,-100%)",
    });
  }

  const spot: Spot = { x: 0, y: 0, d: 0 };
  const centre: Spot = { x: 0, y: 0, d: 0 };
  return {
    fade: p.fade,
    dispose: p.dispose,
    place(ctx, zoom) {
      const f = p.shown.amount;
      // Branch names beyond the rim of their sector, pushed out by their own size so they do not
      // cover the nodes; they step aside once the sub-branches are named.
      const far = Math.min(1, Math.max(0, (zoom - 0.55) / 0.3));
      ctx.project(0, FLOOR_Y, 0, centre);
      for (const pin of branchPins) {
        ctx.project(pin.at.x, pin.at.y, pin.at.z, spot);
        if (far === 0 || spot.d < 0 || !ctx.onScreen(spot.x, spot.y, 60)) {
          pin.e.style.opacity = "0";
          continue;
        }
        if (!pin.w) {
          pin.w = pin.e.offsetWidth;
          pin.h = pin.e.offsetHeight;
        }
        const dx = spot.x - centre.x;
        const dy = spot.y - centre.y;
        const length = Math.hypot(dx, dy) || 1;
        const push = (pin.w / 2) * Math.abs(dx / length) + (pin.h / 2) * Math.abs(dy / length);
        ctx.place(
          pin.e,
          spot.x + (dx / length) * push,
          spot.y + (dy / length) * push,
          far * f,
          " translate(-50%,-50%)",
        );
      }
      // Sub-branch names, radially along the rim, once their slice is wide enough to hold one.
      for (const pin of subPins) {
        const [ax, az] = ground(pin.mid, R_OUT + 1.5);
        const [bx, bz] = ground(pin.mid, R_OUT + 8);
        const [lx, lz] = ground(pin.slice.start, R_OUT);
        const [rx, rz] = ground(pin.slice.end, R_OUT);
        ctx.project(lx, FLOOR_Y, lz, spot);
        const l = { x: spot.x, y: spot.y };
        ctx.project(rx, FLOOR_Y, rz, spot);
        const width = Math.hypot(spot.x - l.x, spot.y - l.y);
        ctx.project(ax, FLOOR_Y, az, spot);
        const a = { x: spot.x, y: spot.y, d: spot.d };
        ctx.project(bx, FLOOR_Y, bz, spot);
        if (zoom > 0.9 || a.d < 0 || width < SUB_LABEL_PX || !ctx.onScreen(a.x, a.y)) {
          pin.e.style.opacity = "0";
          continue;
        }
        let rot = Math.atan2(spot.y - a.y, spot.x - a.x);
        const flip = Math.cos(rot) < 0;
        if (flip) rot += Math.PI;
        ctx.place(
          pin.e,
          a.x,
          a.y,
          f,
          ` rotate(${rot.toFixed(3)}rad) translate(${flip ? "-100%" : "0"},-50%)`,
        );
      }
      for (const pin of levelPins) {
        ctx.project(pin.at.x, pin.at.y, pin.at.z, spot);
        if (spot.d < 0 || !ctx.onScreen(spot.x, spot.y)) pin.e.style.opacity = "0";
        else ctx.place(pin.e, spot.x, spot.y, 0.8 * f, " translate(-50%,-50%)");
      }
      for (const pin of rulerPins) {
        ctx.project(pin.at.x, pin.at.y, pin.at.z, spot);
        if (spot.d < 0 || !ctx.onScreen(spot.x, spot.y)) pin.e.style.opacity = "0";
        else ctx.place(pin.e, spot.x, spot.y, 0.85 * f, pin.dx);
      }
    },
  };
}

/** Bright stars at the corners of a layout: big glowing points, drawn with the nodes' shader. */
function stars(p: Parts, host: Host, at3: Vec3[]) {
  const n = at3.length;
  const geometry = new BufferGeometry();
  const at = new Float32Array(at3.flat());
  geometry.setAttribute("position", new BufferAttribute(at, 3));
  geometry.setAttribute("aTo", new BufferAttribute(at.slice(), 3));
  const colors = new Float32Array(Array.from({ length: n }, () => [0.82, 0.9, 1]).flat());
  geometry.setAttribute("aColor", new BufferAttribute(colors, 3));
  geometry.setAttribute("aColorFrom", new BufferAttribute(colors.slice(), 3));
  const sizes = new Float32Array(n).fill(5);
  geometry.setAttribute("aSize", new BufferAttribute(sizes, 1));
  geometry.setAttribute("aSizeFrom", new BufferAttribute(sizes.slice(), 1));
  const alpha = new BufferAttribute(new Float32Array(n).fill(1), 1);
  geometry.setAttribute("aAlpha", alpha);
  geometry.setAttribute("aMark", new BufferAttribute(new Float32Array(n).fill(1), 1));
  geometry.setAttribute("aShape", new BufferAttribute(new Float32Array(n), 1));
  geometry.setAttribute("aManage", new BufferAttribute(new Float32Array(n), 1));
  const points = new Points(
    geometry,
    new ShaderMaterial({
      uniforms: host.uniforms,
      vertexShader: NODE_VERT,
      fragmentShader: NODE_FRAG,
      ...ADD,
    }),
  );
  points.frustumCulled = false;
  points.renderOrder = 3;
  p.add(points, (a) => {
    alpha.array.fill(a);
    alpha.needsUpdate = true;
  });
}

/** The glass sphere of the reference: shells that glow at the rim, a faint lat/long grid, rings. */
function sphere(spec: Extract<FrameSpec, { kind: "sphere" }>, host: Host): Frame {
  const p = parts(host);
  const outer = spec.shells.at(-1)!.radius;
  spec.shells.forEach((shell, k) => glass(p, shell.radius, k === spec.shells.length - 1 ? 1 : 0.4));
  graticule(p, outer, 1, 0.2);
  // Two rings beyond the glass, as in the reference.
  const ring = lines(latitude(0, outer * 1.18, 180), 0x3d7fc4, 0.34);
  p.add(ring.object, ring.fade);
  const tilted = lines(circle(outer * 1.04, [0.25, 0.3, 1], 180), 0x2f6aa6, 0.3);
  p.add(tilted.object, tilted.fade);

  // The three stars of the demands: the corners the mixes are pulled towards.
  stars(
    p,
    host,
    spec.anchors.map((a) => a.at),
  );

  const anchorPins = spec.anchors.map((a) => ({
    e: p.pin("lbl-anchor", a.label),
    at: new Vector3(...a.at),
    w: 0,
    h: 0,
  }));
  // The level names run down one meridian on the side facing the camera, just below the data.
  const shellPins = spec.shells.map((shell) => {
    const polar = ((spec.labelPolar ?? 72) * Math.PI) / 180;
    const r = shell.radius;
    return {
      e: p.pin("lbl-shell", `${shell.level} ${LEVEL_NAMES[shell.level]}`),
      at: new Vector3(0, Math.cos(polar) * r, Math.sin(polar) * r),
    };
  });

  const spot: Spot = { x: 0, y: 0, d: 0 };
  const centre: Spot = { x: 0, y: 0, d: 0 };
  return {
    fade: p.fade,
    dispose: p.dispose,
    place(ctx) {
      const f = p.shown.amount;
      ctx.project(0, 0, 0, centre);
      for (const pin of anchorPins) {
        ctx.project(pin.at.x, pin.at.y, pin.at.z, spot);
        if (spot.d < 0 || !ctx.onScreen(spot.x, spot.y, 60)) {
          pin.e.style.opacity = "0";
          continue;
        }
        if (!pin.w) {
          pin.w = pin.e.offsetWidth;
          pin.h = pin.e.offsetHeight;
        }
        // Away from the middle of the sphere, past the star and its glow.
        const dx = spot.x - centre.x;
        const dy = spot.y - centre.y;
        const length = Math.hypot(dx, dy) || 1;
        const push = (pin.w / 2) * Math.abs(dx / length) + (pin.h / 2) * Math.abs(dy / length) + 14;
        ctx.place(
          pin.e,
          spot.x + (dx / length) * push,
          spot.y + (dy / length) * push,
          f,
          " translate(-50%,-50%)",
        );
      }
      for (const pin of shellPins) {
        ctx.project(pin.at.x, pin.at.y, pin.at.z, spot);
        if (spot.d < 0 || !ctx.onScreen(spot.x, spot.y)) pin.e.style.opacity = "0";
        else ctx.place(pin.e, spot.x, spot.y, 0.75 * f, " translate(8px,-50%)");
      }
    },
  };
}

/** A glass triangular prism: edges, a plate per floor, faint sides, the corners named. */
function prism(spec: Extract<FrameSpec, { kind: "prism" }>, host: Host): Frame {
  const p = parts(host);
  const { corners, floors, bottom, top } = spec;
  const loop = (y: number) => {
    const out: number[] = [];
    corners.forEach((c, k) => {
      const n = corners[(k + 1) % 3]!;
      out.push(c.x, y, c.z, n.x, y, n.z);
    });
    return out;
  };
  // The three vertical edges and the outline of the base, the top and every floor.
  const edges: number[] = [];
  for (const c of corners) edges.push(c.x, bottom, c.z, c.x, top, c.z);
  const outline = lines([...edges, ...loop(bottom), ...loop(top)], 0x4b86c8, 0.7);
  p.add(outline.object, outline.fade);
  const plates = lines(
    floors.flatMap((f) => loop(f.y)),
    0x2b5a8c,
    0.4,
  );
  p.add(plates.object, plates.fade);
  // Faint glass: the three sides and a plate on every floor, additive.
  const glassPos: number[] = [];
  corners.forEach((c, k) => {
    const n = corners[(k + 1) % 3]!;
    glassPos.push(c.x, bottom, c.z, n.x, bottom, n.z, n.x, top, n.z);
    glassPos.push(c.x, bottom, c.z, n.x, top, n.z, c.x, top, c.z);
  });
  for (const f of floors) {
    const [a, b, c] = corners as [(typeof corners)[0], (typeof corners)[0], (typeof corners)[0]];
    glassPos.push(a.x, f.y, a.z, b.x, f.y, b.z, c.x, f.y, c.z);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(glassPos, 3));
  const material = new MeshBasicMaterial({
    color: 0x2f6aa6,
    opacity: 0.045,
    side: DoubleSide,
    ...ADD,
  });
  const glassMesh = new Mesh(geometry, material);
  glassMesh.renderOrder = 0;
  p.add(glassMesh, (a) => (material.opacity = 0.045 * a));

  const cornerPins = corners.map((c) => ({
    e: p.pin("lbl-anchor", c.label),
    at: new Vector3(c.x, top + 6, c.z),
  }));
  // The floors are named along the first edge, outside it.
  const first = corners[0]!;
  const floorPins = floors.map((f) => ({
    e: p.pin("lbl-shell", `${f.level} ${LEVEL_NAMES[f.level]}`),
    at: new Vector3(first.x * 1.12, f.y, first.z * 1.12),
  }));
  const spot: Spot = { x: 0, y: 0, d: 0 };
  const centre: Spot = { x: 0, y: 0, d: 0 };
  return {
    fade: p.fade,
    dispose: p.dispose,
    place(ctx) {
      const f = p.shown.amount;
      ctx.project(0, (bottom + top) / 2, 0, centre);
      for (const pin of cornerPins) {
        ctx.project(pin.at.x, pin.at.y, pin.at.z, spot);
        if (spot.d < 0 || !ctx.onScreen(spot.x, spot.y, 60)) {
          pin.e.style.opacity = "0";
          continue;
        }
        const dx = spot.x - centre.x;
        const dy = Math.min(spot.y - centre.y, -4);
        const length = Math.hypot(dx, dy) || 1;
        ctx.place(
          pin.e,
          spot.x + (dx / length) * 24,
          spot.y + (dy / length) * 14,
          f,
          " translate(-50%,-50%)",
        );
      }
      for (const pin of floorPins) {
        ctx.project(pin.at.x, pin.at.y, pin.at.z, spot);
        if (spot.d < 0 || !ctx.onScreen(spot.x, spot.y)) pin.e.style.opacity = "0";
        else ctx.place(pin.e, spot.x, spot.y, 0.8 * f, " translate(-100%,-50%) translate(-8px,0)");
      }
    },
  };
}

/** A glass tetrahedron: six edges, four faint faces, a star and a name at each vertex. */
function tetra(spec: Extract<FrameSpec, { kind: "tetra" | "nebula" }>, host: Host): Frame {
  const p = parts(host);
  const v = spec.vertices.map((x) => x.at);
  if (spec.kind === "tetra") solid(p, v);
  stars(p, host, v);
  return pinned(p, spec.vertices);
}

function solid(p: Parts, v: Vec3[]) {
  const edges: number[] = [];
  const faces: number[] = [];
  for (let a = 0; a < 4; a++) {
    for (let b = a + 1; b < 4; b++) edges.push(...v[a]!, ...v[b]!);
  }
  for (const skip of [0, 1, 2, 3]) faces.push(...v.filter((_, k) => k !== skip).flat());
  const outline = lines(edges, 0x4b86c8, 0.7);
  p.add(outline.object, outline.fade);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(faces, 3));
  const material = new MeshBasicMaterial({
    color: 0x2f6aa6,
    opacity: 0.05,
    side: DoubleSide,
    ...ADD,
  });
  const glassMesh = new Mesh(geometry, material);
  glassMesh.renderOrder = 0;
  p.add(glassMesh, (a) => (material.opacity = 0.05 * a));
}

/** The names of the vertices, pushed outwards from the middle of the frame. */
function pinned(p: Parts, vertices: { label: string; at: Vec3 }[]): Frame {
  const pins = vertices.map((x) => ({
    e: p.pin("lbl-anchor", x.label),
    at: new Vector3(...x.at),
  }));
  const spot: Spot = { x: 0, y: 0, d: 0 };
  const centre: Spot = { x: 0, y: 0, d: 0 };
  return {
    fade: p.fade,
    dispose: p.dispose,
    place(ctx) {
      const f = p.shown.amount;
      ctx.project(0, 0, 0, centre);
      for (const pin of pins) {
        ctx.project(pin.at.x, pin.at.y, pin.at.z, spot);
        if (spot.d < 0 || !ctx.onScreen(spot.x, spot.y, 60)) {
          pin.e.style.opacity = "0";
          continue;
        }
        const dx = spot.x - centre.x;
        const dy = spot.y - centre.y;
        const length = Math.hypot(dx, dy) || 1;
        ctx.place(
          pin.e,
          spot.x + (dx / length) * 62,
          spot.y + (dy / length) * 22,
          f,
          " translate(-50%,-50%)",
        );
      }
    },
  };
}

export function buildFrame(spec: FrameSpec, data: MapData, host: Host): Frame {
  if (spec.kind === "disc") return disc(spec, data, host);
  if (spec.kind === "sphere") return sphere(spec, host);
  return spec.kind === "tetra" || spec.kind === "nebula" ? tetra(spec, host) : prism(spec, host);
}
