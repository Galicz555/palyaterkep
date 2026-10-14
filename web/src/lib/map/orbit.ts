// The 3D map. Adapted from the orbit view of the observatory dashboard (same author): one Points
// draw call for every node, one LineSegments for every edge, OrbitControls, screen-space picking,
// labels as DOM elements placed from the projected positions, frames drawn on demand.
//
// What changed: the scene is a layout (lib/arrange.ts) instead of a sphere of projects, and the map
// morphs from one layout to the next; nodes carry a state (held / covered / reachable) as colour,
// size and halo, because filtering hides and the map needs to show what a CV reads as, and a
// management role a soft haze; pan and zoom-to-cursor, because the roles are many and small;
// focus(branch) flies to a sector or frames the branch's points; nothing spins, and nothing is
// drawn while nothing moves. The GPU-yielding and the decorative stars are gone.

import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LineSegments,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { R_HOLE, R_OUT, ground } from "../layout.ts";
import type { Arrangement } from "../arrange.ts";
import type { MapData } from "../model.ts";
import { BG, branchColor, MARK, MARK_COLOR } from "../palette.ts";
import { capitalise } from "../text.ts";
import { buildFrame, el, type Frame, type FrameCtx, type Spot } from "./frames.ts";
import { ADD, EDGE_FRAG, EDGE_VERT, NODE_BLEND, NODE_FRAG, NODE_VERT } from "./shaders.ts";

export interface MapHooks {
  onSelect(index: number | null): void;
  /** `x`, `y` are pixels inside the stage. */
  onHover(index: number | null, x: number, y: number): void;
}

export interface BenchResult {
  frames: number;
  meanMs: number;
  p95Ms: number;
  maxMs: number;
}

export interface MapView {
  /** `marks[i]` is a `Mark` of role i; `reach` are edges (role indices) the CV reads as steps. */
  setMarks(marks: Uint8Array | null, reach: [number, number][]): void;
  /** Roles with a 0 are pushed back; `null` shows all. */
  setFilter(pass: Uint8Array | null): void;
  select(index: number | null): void;
  /** Morphs the points, the frame and the camera to another layout. */
  setLayout(next: Arrangement): void;
  /** Fly to a branch (index into `MapData.branches`), or back to the whole map for `null`. */
  focus(branch: number | null): void;
  zoomBy(factor: number): void;
  resize(): void;
  destroy(): void;
  /** Draws `frames` frames while turning the camera, waiting for the GPU after each. */
  benchmark(frames: number): Promise<BenchResult>;
  /** Where role `index` is on the screen, in pixels inside the stage; null behind the camera. */
  where(index: number): [number, number] | null;
}

const FOV = 38;
const TAU = Math.PI * 2;
/** Width of one node in map units. */
const NODE_D = 1.5;
/** Smallest node on screen, in CSS pixels, so the far ones stay visible. */
const MIN_PX = 3;
const MIN_DIST = 14;
const MAX_DIST = 900;
const TWEEN_MS = 420;
/** The points, the frame and the camera take this long to settle into another layout. */
const MORPH_MS = 800;
/** A flat layout keeps the camera above the ground. */
const FLAT_POLAR = (84 * Math.PI) / 180;
/** Height of a role name on the map, for keeping them from overlapping. */
const LABEL_H = 18;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

const mix = (a: Color, b: Color, t: number) => new Color().copy(a).lerp(b, t);
const GREY = new Color("#7d8aa3");
const SELECT_COLOR = new Color("#ffffff");

/** Null when this browser cannot make a WebGL context. */
export function createMap(
  stage: HTMLElement,
  data: MapData,
  hooks: MapHooks,
  first: Arrangement,
): MapView | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }
  renderer.setClearColor(new Color(BG), 1);
  const canvas = renderer.domElement;
  canvas.className = "map-canvas";
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    `Pályatérkép: ${data.roles.length} szerep. A térkép egérrel és érintéssel mozgatható, a nyilak a nézetet tolják. A szerepeket a Lista nézet is felsorolja, billentyűzettel és képernyőolvasóval is használhatóan.`,
  );
  const layer = el("div", "labels");
  layer.setAttribute("aria-hidden", "true");
  const hoverMark = el("div", "mark mark-hover");
  const selectMark = el("div", "mark mark-select");
  hoverMark.hidden = selectMark.hidden = true;
  layer.append(hoverMark, selectMark);
  stage.prepend(canvas);
  stage.append(layer);

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 4, 3000);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.rotateSpeed = 0.6;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  controls.minDistance = MIN_DIST;
  controls.maxDistance = MAX_DIST;
  controls.maxPolarAngle = first.free ? Math.PI : FLAT_POLAR;
  controls.listenToKeyEvents(canvas);
  controls.keyPanSpeed = 14;

  const { roles } = data;
  const N = roles.length;
  const nBranches = data.branches.length;
  let arr = first;

  // Nodes and edges. Both hold two positions and a morph weight: `position` is where they were,
  // `aTo` where they are going, `uMorph` how far along. `cur` is where each node is right now, for
  // picking and labels.
  const branchBase = roles.map((r) => new Color(branchColor(r.branch, nBranches, r.sub)));
  /** What each role is painted when nothing marks it: the branch's colour, or the layout's own. */
  const base: Color[] = branchBase.map((c) => c.clone());
  const recolour = (a: Arrangement) =>
    base.forEach((c, i) =>
      a.colors
        ? c.setRGB(a.colors[i * 3]!, a.colors[i * 3 + 1]!, a.colors[i * 3 + 2]!)
        : c.copy(branchBase[i]!),
    );
  recolour(first);
  const cur = new Float32Array(first.positions);
  const nodeFrom = new BufferAttribute(new Float32Array(first.positions), 3);
  const nodeTo = new BufferAttribute(new Float32Array(first.positions), 3);
  const nodeGeo = new BufferGeometry();
  nodeGeo.setAttribute("position", nodeFrom);
  nodeGeo.setAttribute("aTo", nodeTo);
  const aColor = new BufferAttribute(new Float32Array(N * 3), 3);
  const aSize = new BufferAttribute(new Float32Array(N), 1);
  const aSizeFrom = new BufferAttribute(new Float32Array(N), 1);
  const aColorFrom = new BufferAttribute(new Float32Array(N * 3), 3);
  const aArms = new BufferAttribute(new Float32Array(N * 3), 3);
  const aArmsFrom = new BufferAttribute(new Float32Array(N * 3), 3);
  const aAlpha = new BufferAttribute(new Float32Array(N), 1);
  const aMark = new BufferAttribute(new Float32Array(N), 1);
  const aShape = new BufferAttribute(new Float32Array(N), 1);
  const aManage = new BufferAttribute(new Float32Array(N), 1);
  roles.forEach((r, i) => {
    aShape.setX(i, r.curated ? 0 : 1);
    aManage.setX(i, r.management ? 1 : 0);
  });
  nodeGeo.setAttribute("aColor", aColor);
  nodeGeo.setAttribute("aSize", aSize);
  nodeGeo.setAttribute("aSizeFrom", aSizeFrom);
  nodeGeo.setAttribute("aColorFrom", aColorFrom);
  nodeGeo.setAttribute("aArms", aArms);
  nodeGeo.setAttribute("aArmsFrom", aArmsFrom);
  /** The three arms of every role's star, where the layout draws stars: else none. */
  const growArms = (a: Arrangement) => {
    (aArms.array as Float32Array).set(a.arms ?? new Float32Array(N * 3));
    aArms.needsUpdate = true;
  };
  growArms(first);
  (aArmsFrom.array as Float32Array).set(aArms.array);
  nodeGeo.setAttribute("aAlpha", aAlpha);
  nodeGeo.setAttribute("aMark", aMark);
  nodeGeo.setAttribute("aShape", aShape);
  nodeGeo.setAttribute("aManage", aManage);
  /** The order the nodes are drawn in: the roles' own, unless the soft look sorts them far to near. */
  const order = new Uint32Array(N).map((_, i) => i);
  const orderAttr = new BufferAttribute(order, 1);
  nodeGeo.setIndex(orderAttr);
  const uniforms = {
    uMorph: { value: 1 },
    uScale: { value: 1000 },
    uPR: { value: 1 },
    uNear: { value: 100 },
    uSpan: { value: 200 },
    uMinPx: { value: MIN_PX },
    uSoft: { value: first.soft ? 1 : 0 },
  };
  const nodes = new Points(
    nodeGeo,
    new ShaderMaterial({
      uniforms,
      vertexShader: NODE_VERT,
      fragmentShader: NODE_FRAG,
      ...NODE_BLEND,
    }),
  );
  nodes.frustumCulled = false;
  nodes.renderOrder = 3;

  const edges: [number, number][] = [...data.lateral, ...data.progression];
  const edgeFrom = new BufferAttribute(new Float32Array(edges.length * 6), 3);
  const edgeTo = new BufferAttribute(new Float32Array(edges.length * 6), 3);
  /** Both ends of every edge, from the positions of the nodes. */
  const edgeEnds = (positions: Float32Array, out: BufferAttribute) => {
    const array = out.array as Float32Array;
    edges.forEach(([a, b], k) => {
      array.set(positions.subarray(a * 3, a * 3 + 3), k * 6);
      array.set(positions.subarray(b * 3, b * 3 + 3), k * 6 + 3);
    });
    out.needsUpdate = true;
  };
  edgeEnds(first.positions, edgeFrom);
  edgeEnds(first.positions, edgeTo);
  const eColor = new BufferAttribute(new Float32Array(edges.length * 6), 3);
  const eAlpha = new BufferAttribute(new Float32Array(edges.length * 2), 1);
  const edgeGeo = new BufferGeometry();
  edgeGeo.setAttribute("position", edgeFrom);
  edgeGeo.setAttribute("aTo", edgeTo);
  edgeGeo.setAttribute("aColor", eColor);
  edgeGeo.setAttribute("aAlpha", eAlpha);
  const edgeLines = new LineSegments(
    edgeGeo,
    new ShaderMaterial({ uniforms, vertexShader: EDGE_VERT, fragmentShader: EDGE_FRAG, ...ADD }),
  );
  edgeLines.frustumCulled = false;
  edgeLines.renderOrder = 2;
  scene.add(edgeLines, nodes);

  const neighbours: Set<number>[] = roles.map(() => new Set());
  for (const [a, b] of edges) {
    neighbours[a]!.add(b);
    neighbours[b]!.add(a);
  }

  // State: what the CV says, the filter, the selection. -------------------------------------------
  let marks: Uint8Array | null = null;
  let reach: [number, number][] = [];
  let pass: Uint8Array | null = null;
  let selected = -1;
  let hovered = -1;
  let focused: number | null = null;
  /** A role without demand data is drawn as a pale ghost, so it reads as no data, not balanced. */
  const noData = roles.map((r) => r.demands === null);
  const heldColor = new Color(MARK_COLOR.held);
  const coveredColor = new Color(MARK_COLOR.covered);
  const reachColor = new Color(MARK_COLOR.reachable);

  function paint() {
    const spotlight = selected >= 0 ? neighbours[selected]! : null;
    for (let i = 0; i < N; i++) {
      let color = base[i]!;
      let size = NODE_D * (arr.sizes?.[i] ?? 1);
      let alpha = arr.alpha;
      let mark = 0;
      const m = marks?.[i] ?? MARK.none;
      if (m === MARK.held) {
        color = heldColor;
        size = NODE_D * 2.7;
        mark = 1;
        alpha = 1;
      } else if (m === MARK.covered) {
        color = coveredColor;
        size = NODE_D * 2.1;
        mark = 0.75;
        alpha = 1;
      } else if (m === MARK.reachable) {
        color = reachColor;
        size = NODE_D * 1.9;
        mark = 0.6;
        alpha = 1;
      } else if (marks) {
        color = mix(base[i]!, GREY, 0.6);
        alpha = 0.22;
      } else if (noData[i]) {
        color = mix(base[i]!, GREY, 0.7);
        alpha = 0.55;
      }
      if (pass && !pass[i]) {
        alpha *= 0.16;
        mark = 0;
      }
      if (spotlight && !m && i !== selected && !spotlight.has(i)) alpha *= 0.45;
      if (i === selected) {
        size = Math.max(size * 1.5, NODE_D * 1.8);
        mark = 1;
        alpha = 1;
      }
      aColor.setXYZ(i, color.r, color.g, color.b);
      aSize.setX(i, size);
      aAlpha.setX(i, alpha);
      aMark.setX(i, mark);
    }
    aColor.needsUpdate = aSize.needsUpdate = aAlpha.needsUpdate = aMark.needsUpdate = true;

    const reachKeys = new Set(reach.map(([a, b]) => `${Math.min(a, b)}:${Math.max(a, b)}`));
    for (let k = 0; k < edges.length; k++) {
      const [a, b] = edges[k]!;
      const picked = selected >= 0 && (a === selected || b === selected);
      const stepped = reachKeys.has(`${Math.min(a, b)}:${Math.max(a, b)}`);
      const hidden = pass && !(pass[a] && pass[b]);
      const alpha = picked ? 0.8 : stepped ? 0.6 : hidden ? 0.004 : marks ? 0.012 : 0.03;
      // An ordinary edge runs from one end's branch colour to the other's.
      for (const v of [0, 1]) {
        const color = picked ? SELECT_COLOR : stepped ? reachColor : base[v === 0 ? a : b]!;
        eColor.setXYZ(k * 2 + v, color.r, color.g, color.b);
        eAlpha.setX(k * 2 + v, alpha);
      }
    }
    eColor.needsUpdate = eAlpha.needsUpdate = true;
    request();
  }

  // The frame around the points, and the labels of the roles the CV marks. ------------------------
  const host = { scene, layer, uniforms };
  let frame: Frame = buildFrame(first.frame, data, host);
  let leaving: Frame | null = null;
  let markPins: { e: HTMLElement; i: number; rank: number; w?: number }[] = [];
  const selectPin = el("div", "lbl lbl-pick");
  selectPin.hidden = true;
  layer.append(selectPin);

  function rebuildMarkPins() {
    for (const p of markPins) p.e.remove();
    markPins = [];
    if (!marks) return;
    for (let i = 0; i < N; i++) {
      const m = marks[i];
      if (!m) continue;
      const e = el(
        "div",
        `lbl lbl-state lbl-${m === MARK.held ? "held" : m === MARK.covered ? "covered" : "reach"}`,
        capitalise(roles[i]!.label),
      );
      layer.append(e);
      markPins.push({ e, i, rank: m });
    }
    markPins.sort((a, b) => a.rank - b.rank);
  }

  // Camera. ---------------------------------------------------------------------------------------
  let W = 1;
  let H = 1;
  const tanHalf = Math.tan((FOV * Math.PI) / 360);
  interface View {
    x: number;
    y: number;
    z: number;
    az: number;
    pol: number;
    dist: number;
  }
  /** The layout's opening view, with the distance that shows what it asks to see. */
  const homeView = (): View => {
    const { target, az, pol, fit } = arr.home;
    const dist = Math.max(fit[0] / (tanHalf * (W / H)), fit[1] / tanHalf);
    return { x: target[0], y: target[1], z: target[2], az, pol, dist: Math.min(MAX_DIST, dist) };
  };
  function readView(): View {
    const off = new Vector3().subVectors(camera.position, controls.target);
    const dist = off.length();
    return {
      x: controls.target.x,
      y: controls.target.y,
      z: controls.target.z,
      az: Math.atan2(off.x, off.z),
      pol: Math.acos(Math.min(1, Math.max(-1, off.y / dist))),
      dist,
    };
  }
  function setView(v: View) {
    controls.target.set(v.x, v.y, v.z);
    camera.position.set(
      v.x + v.dist * Math.sin(v.pol) * Math.sin(v.az),
      v.y + v.dist * Math.cos(v.pol),
      v.z + v.dist * Math.sin(v.pol) * Math.cos(v.az),
    );
    camera.lookAt(controls.target);
  }
  let tween: {
    from: View;
    to: View;
    start: number;
    ms: number;
    done: (() => void) | undefined;
  } | null = null;
  function flyTo(to: View, ms = TWEEN_MS, done?: () => void) {
    if (reducedMotion()) {
      tween = null;
      setView(to);
      controls.update();
      done?.();
    } else {
      tween = { from: readView(), to, start: performance.now(), ms, done };
    }
    request();
  }
  function stepTween(now: number) {
    if (!tween) return;
    const t = Math.min(1, (now - tween.start) / tween.ms);
    const e = ease(t);
    const { from, to } = tween;
    let da = to.az - from.az;
    da -= TAU * Math.round(da / TAU);
    setView({
      x: from.x + (to.x - from.x) * e,
      y: from.y + (to.y - from.y) * e,
      z: from.z + (to.z - from.z) * e,
      az: from.az + da * e,
      pol: from.pol + (to.pol - from.pol) * e,
      dist: from.dist * Math.pow(to.dist / from.dist, e),
    });
    if (t >= 1) {
      tween.done?.();
      tween = null;
    }
  }
  /** Where the camera goes to show one branch: its sector on the disc, else its points. */
  function branchView(branch: number | null): View {
    if (branch === null) return homeView();
    const aspect = W / H;
    if (arr.frame.kind === "disc") {
      const sector = arr.frame.plan.branches[branch]!;
      const mid = (sector.start + sector.end) / 2;
      const chord = Math.max(60, 2 * R_OUT * Math.sin((sector.end - sector.start) / 2));
      const pol = arr.home.pol;
      const across = (chord * 1.25) / (2 * tanHalf * aspect);
      const along = (((R_OUT - R_HOLE) * Math.cos(pol) + 28) * 1.15) / (2 * tanHalf);
      const [x, z] = ground(mid, (R_HOLE + R_OUT) / 2 + 6);
      return {
        x,
        y: 0,
        z,
        az: -mid,
        pol,
        dist: Math.min(MAX_DIST, Math.max(MIN_DIST, across, along)),
      };
    }
    // Where the layout puts the branch's points: their middle, and the distance that holds nine in
    // ten of them (a few strays would otherwise push the camera back), seen from where we look.
    const mine: number[] = [];
    roles.forEach((r, i) => {
      if (r.branch === branch) mine.push(i);
    });
    if (mine.length === 0) return homeView();
    const mean = [0, 1, 2].map(
      (k) => mine.reduce((sum, i) => sum + arr.positions[i * 3 + k]!, 0) / mine.length,
    );
    const away = mine
      .map((i) => Math.hypot(...[0, 1, 2].map((k) => arr.positions[i * 3 + k]! - mean[k]!)))
      .sort((p, q) => p - q);
    const radius = Math.max(8, away[Math.floor(away.length * 0.9)]! * 1.15);
    const here = readView();
    return {
      x: mean[0]!,
      y: mean[1]!,
      z: mean[2]!,
      az: here.az,
      pol: here.pol,
      dist: Math.min(MAX_DIST, Math.max(MIN_DIST, radius / (tanHalf * Math.min(1, aspect)))),
    };
  }
  let fitted = false;
  function resize() {
    W = stage.clientWidth;
    H = stage.clientHeight;
    if (W < 1 || H < 1) return;
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(W, H, false);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    uniforms.uScale.value = H / (2 * tanHalf);
    uniforms.uPR.value = pr;
    if (!fitted) {
      fitted = true;
      setView(homeView());
      controls.update();
    }
    projDirty = true;
    request();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(stage);

  // Morph: the points, and the frame around them, move from one layout to the next. ---------------
  let morph: { start: number; softFrom: number; softTo: number } | null = null;
  function stepMorph(now: number) {
    if (!morph) return;
    const t = Math.min(1, (now - morph.start) / MORPH_MS);
    const e = ease(t);
    uniforms.uMorph.value = e;
    uniforms.uSoft.value = morph.softFrom + (morph.softTo - morph.softFrom) * e;
    const from = nodeFrom.array as Float32Array;
    const to = nodeTo.array as Float32Array;
    for (let k = 0; k < cur.length; k++) cur[k] = from[k]! + (to[k]! - from[k]!) * e;
    frame.fade(e);
    leaving?.fade(1 - e);
    if (t >= 1) {
      morph = null;
      leaving?.dispose();
      leaving = null;
    }
    projDirty = true;
  }
  function setLayout(next: Arrangement) {
    if (next === arr) return;
    const sameLayout = next.id === arr.id;
    // From where the points are right now, even in the middle of another morph; their sizes
    // and colours go from what they show now.
    (aSizeFrom.array as Float32Array).set(aSize.array);
    (aColorFrom.array as Float32Array).set(aColor.array);
    (aArmsFrom.array as Float32Array).set(aArms.array);
    aSizeFrom.needsUpdate = aColorFrom.needsUpdate = aArmsFrom.needsUpdate = true;
    (nodeFrom.array as Float32Array).set(cur);
    (nodeTo.array as Float32Array).set(next.positions);
    nodeFrom.needsUpdate = nodeTo.needsUpdate = true;
    edgeEnds(cur, edgeFrom);
    edgeEnds(next.positions, edgeTo);
    leaving?.dispose();
    leaving = frame;
    const softFrom = uniforms.uSoft.value;
    arr = next;
    if (!next.soft) {
      order.forEach((_, k) => (order[k] = k));
      orderAttr.needsUpdate = true;
    }
    recolour(next);
    growArms(next);
    paint();
    frame = buildFrame(next.frame, data, host);
    if (reducedMotion()) {
      cur.set(next.positions);
      uniforms.uMorph.value = 1;
      uniforms.uSoft.value = next.soft ? 1 : 0;
      leaving.dispose();
      leaving = null;
      frame.fade(1);
      morph = null;
    } else {
      uniforms.uMorph.value = 0;
      frame.fade(0);
      morph = { start: performance.now(), softFrom, softTo: next.soft ? 1 : 0 };
    }
    if (next.free) controls.maxPolarAngle = Math.PI;
    // Staying in one layout (B with another demand) keeps the camera where the person put it.
    if (!sameLayout) {
      flyTo(
        branchView(focused),
        MORPH_MS,
        next.free ? undefined : () => (controls.maxPolarAngle = FLAT_POLAR),
      );
    }
    projDirty = true;
    request();
  }

  // Projection and picking: screen positions of every node, only when the camera moved. ----------
  const sx = new Float32Array(N);
  const sy = new Float32Array(N);
  const sd = new Float32Array(N);
  const sr = new Float32Array(N);
  let projDirty = true;
  const v = new Vector3();
  function project(x: number, y: number, z: number, out: Spot) {
    v.set(x, y, z);
    const d = v.distanceTo(camera.position);
    v.project(camera);
    out.x = (v.x * 0.5 + 0.5) * W;
    out.y = (-v.y * 0.5 + 0.5) * H;
    out.d = v.z > 1 ? -1 : d;
  }
  const tmp: Spot = { x: 0, y: 0, d: 0 };
  function ensureProjected() {
    if (!projDirty) return;
    projDirty = false;
    camera.updateMatrixWorld();
    const px = H / (2 * tanHalf);
    for (let i = 0; i < N; i++) {
      project(cur[i * 3]!, cur[i * 3 + 1]!, cur[i * 3 + 2]!, tmp);
      sx[i] = tmp.x;
      sy[i] = tmp.y;
      sd[i] = tmp.d;
      const body = Math.max(aSize.getX(i) * (px / Math.max(1, tmp.d)), MIN_PX);
      // A finger is wider than a node.
      sr[i] = Math.max(body / 2 + 2, coarse ? 12 : 6);
    }
  }
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  function pickAt(x: number, y: number): number {
    ensureProjected();
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < N; i++) {
      if (sd[i]! < 0 || (pass && !pass[i])) continue;
      const d = Math.hypot(sx[i]! - x, sy[i]! - y);
      if (d > sr[i]!) continue;
      const score = d / sr[i]! + sd[i]! * 0.0004;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  const ptr = { x: 0, y: 0, down: null as { x: number; y: number } | null };
  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    ptr.x = e.clientX - r.left;
    ptr.y = e.clientY - r.top;
    if (e.buttons !== 0 || e.pointerType === "touch") return;
    const i = pickAt(ptr.x, ptr.y);
    if (i !== hovered) {
      hovered = i;
      canvas.style.cursor = i >= 0 ? "pointer" : "";
      request();
    }
    hooks.onHover(i >= 0 ? i : null, ptr.x, ptr.y);
  });
  canvas.addEventListener("pointerleave", () => {
    hovered = -1;
    hooks.onHover(null, 0, 0);
    request();
  });
  canvas.addEventListener("pointerdown", (e) => {
    ptr.down = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener("pointerup", (e) => {
    const d = ptr.down;
    ptr.down = null;
    if (!d || e.button !== 0 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
    const r = canvas.getBoundingClientRect();
    const i = pickAt(e.clientX - r.left, e.clientY - r.top);
    hooks.onSelect(i >= 0 ? i : null);
  });
  controls.addEventListener("change", () => {
    projDirty = true;
    request();
  });

  // Frame loop: draw when something moved, stop when nothing does. ------------------------------
  let raf = 0;
  let destroyed = false;
  function request() {
    if (!raf && !destroyed) raf = requestAnimationFrame(frameLoop);
  }
  function frameLoop(now: number) {
    raf = 0;
    if (destroyed || W < 1) return;
    stepTween(now);
    stepMorph(now);
    const moving = controls.update();
    draw();
    if (moving || tween || morph) request();
  }

  function placeMark(e: HTMLElement, i: number) {
    if (i < 0 || sd[i]! < 0 || (pass && !pass[i])) {
      e.hidden = true;
      return;
    }
    const r = Math.max(12, sr[i]! * 1.3);
    e.hidden = false;
    e.style.width = e.style.height = `${r * 2}px`;
    e.style.transform = `translate3d(${sx[i]! - r}px,${sy[i]! - r}px,0)`;
  }
  function place(e: HTMLElement, x: number, y: number, opacity: number, extra = "") {
    e.style.opacity = opacity.toFixed(2);
    e.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)${extra}`;
  }
  function onScreen(x: number, y: number, pad = 24) {
    return x > -pad && x < W + pad && y > -pad && y < H + pad;
  }
  /** Far to near, so a near point covers a far one, and the marked ones last, on top of the field. */
  const sortKeys = new Float64Array(N);
  function sortNodes() {
    for (let i = 0; i < N; i++) {
      const front = marks?.[i] || i === selected ? 1e6 : 0;
      sortKeys[i] = Math.round((front - sd[i]! + 2e6) * 16) * N + i;
    }
    sortKeys.sort();
    for (let k = 0; k < N; k++) order[k] = sortKeys[k]! % N;
    orderAttr.needsUpdate = true;
  }

  const frameCtx: FrameCtx = { project, place, onScreen };

  /** `zoom` is 1 for the whole map and falls as the camera comes closer. */
  function placeLabels(zoom: number) {
    frame.place(frameCtx, zoom);
    leaving?.place(frameCtx, zoom);
    // Roles the CV marks get a name when zoomed in, nearest to the top of the list first and
    // never on top of another name.
    const taken: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (const pin of markPins) {
      const i = pin.i;
      // The picked role has its own, bolder name.
      const visible =
        zoom < 0.6 &&
        i !== selected &&
        sd[i]! > 0 &&
        onScreen(sx[i]!, sy[i]!, 0) &&
        (!pass || pass[i]);
      if (!visible) {
        pin.e.style.opacity = "0";
        continue;
      }
      if (!pin.w) pin.w = pin.e.offsetWidth;
      const box = {
        x0: sx[i]! + 12,
        x1: sx[i]! + 12 + (pin.w ?? 0),
        y0: sy[i]! - LABEL_H / 2,
        y1: sy[i]! + LABEL_H / 2,
      };
      const clash = taken.some(
        (t) => box.x0 < t.x1 && box.x1 > t.x0 && box.y0 < t.y1 && box.y1 > t.y0,
      );
      if (clash) {
        pin.e.style.opacity = "0";
        continue;
      }
      taken.push(box);
      place(pin.e, sx[i]!, sy[i]!, 1, " translate(12px,-50%)");
    }
    if (selected >= 0 && sd[selected]! > 0) {
      selectPin.hidden = false;
      selectPin.textContent = capitalise(roles[selected]!.label);
      place(selectPin, sx[selected]!, sy[selected]!, 1, " translate(14px,-130%)");
    } else selectPin.hidden = true;
  }

  function draw() {
    camera.updateMatrixWorld();
    uniforms.uNear.value = Math.max(1, camera.position.length() - arr.extent);
    uniforms.uSpan.value = arr.extent * 2;
    projDirty = true;
    ensureProjected();
    if (arr.soft) sortNodes();
    placeLabels(camera.position.distanceTo(controls.target) / homeView().dist);
    placeMark(selectMark, selected);
    placeMark(hoverMark, hovered === selected ? -1 : hovered);
    renderer.render(scene, camera);
  }

  paint();
  resize();

  const keyOff = () => controls.stopListenToKeyEvents();

  return {
    setMarks(next, steps) {
      marks = next;
      reach = steps;
      rebuildMarkPins();
      paint();
    },
    setFilter(next) {
      pass = next;
      paint();
    },
    select(index) {
      selected = index ?? -1;
      paint();
    },
    setLayout,
    focus(branch) {
      focused = branch;
      flyTo(branchView(branch));
    },
    zoomBy(factor) {
      const now = readView();
      flyTo({ ...now, dist: Math.min(MAX_DIST, Math.max(MIN_DIST, now.dist / factor)) });
    },
    resize,
    where(index) {
      ensureProjected();
      return sd[index]! < 0 ? null : [sx[index]!, sy[index]!];
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      keyOff();
      controls.dispose();
      frame.dispose();
      leaving?.dispose();
      scene.traverse((o) => {
        const mesh = o as Points;
        mesh.geometry?.dispose();
        for (const m of [mesh.material].flat()) m?.dispose();
      });
      renderer.dispose();
      canvas.remove();
      layer.remove();
    },
    async benchmark(frames) {
      const times: number[] = [];
      const probe = new Uint8Array(4);
      const start = readView();
      for (let f = 0; f < frames; f++) {
        await new Promise((done) => requestAnimationFrame(done));
        setView({
          ...start,
          az: start.az + (f / frames) * 1.2,
          dist: start.dist * (1 - 0.3 * Math.sin((f / frames) * Math.PI)),
        });
        controls.update();
        const t0 = performance.now();
        draw();
        // Reading one pixel back makes the browser wait until the GPU has drawn the frame.
        const gl = renderer.getContext();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probe);
        times.push(performance.now() - t0);
      }
      setView(start);
      controls.update();
      request();
      const sorted = [...times].sort((a, b) => a - b);
      return {
        frames,
        meanMs: times.reduce((a, b) => a + b, 0) / frames,
        p95Ms: sorted[Math.floor(frames * 0.95)] ?? 0,
        maxMs: sorted.at(-1) ?? 0,
      };
    },
  };
}
