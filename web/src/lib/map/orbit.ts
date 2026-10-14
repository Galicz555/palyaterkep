// The 3D map. Adapted from the orbit view of the observatory dashboard (same author): one Points
// draw call for every node, one LineSegments for every edge, OrbitControls, screen-space picking,
// labels as DOM elements placed from the projected positions, frames drawn on demand.
//
// What changed: the scene is the semantic layout (lib/layout.ts) instead of a sphere of projects;
// nodes carry a state (held / covered / reachable) as colour, size and halo, because filtering
// hides and the map needs to show what a CV reads as; pan and zoom-to-cursor, because the roles
// are many and small; focus(branch) flies to a sector; nothing spins, and nothing is drawn while
// nothing moves. The GPU-yielding and the decorative sphere, rings and stars are gone.

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ground, R_HOLE, R_OUT, TRACK_HEIGHT, type Layout } from "../layout.ts";
import type { MapData } from "../model.ts";
import { BG, branchColor, MARK, MARK_COLOR } from "../palette.ts";
import { capitalise } from "../text.ts";

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
  /** Fly to a branch (index into `MapData.branches`), or back to the whole map for `null`. */
  focus(branch: number | null): void;
  zoomBy(factor: number): void;
  resize(): void;
  destroy(): void;
  /** Draws `frames` frames while turning the camera, waiting for the GPU after each. */
  benchmark(frames: number): Promise<BenchResult>;
}

const FOV = 38;
const TAU = Math.PI * 2;
/** Width of one node in map units. */
const NODE_D = 1.5;
/** Smallest node on screen, in CSS pixels, so the far ones stay visible. */
const MIN_PX = 3;
const POLAR = (46 * Math.PI) / 180;
const MIN_DIST = 14;
const MAX_DIST = 900;
const TWEEN_MS = 420;
/** A sub-branch gets its name on the rim once its slice is this wide on screen. */
const SUB_LABEL_PX = 24;
/** Height of a role name on the map, for keeping them from overlapping. */
const LABEL_H = 18;

const NODE_VERT = /* glsl */ `
attribute float aSize; attribute float aAlpha; attribute float aShape; attribute float aMark; attribute vec3 aColor;
uniform float uScale; uniform float uPR; uniform float uNear; uniform float uSpan; uniform float uMinPx;
varying vec3 vColor; varying float vAlpha; varying float vShape; varying float vMark; varying float vPx;
#define BODY 0.6
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float depth = clamp((-mv.z - uNear) / uSpan, 0.0, 1.0);
  vAlpha = aAlpha * mix(1.0, 0.72, depth);
  vColor = aColor; vShape = aShape; vMark = aMark;
  float px = min(max(aSize * uScale / -mv.z, uMinPx) * uPR / BODY, 240.0);
  vPx = px;
  gl_PointSize = px;
  gl_Position = projectionMatrix * mv;
}`;
const NODE_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor; varying float vAlpha; varying float vShape; varying float vMark; varying float vPx;
#define R 0.6
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float l = length(p);
  float aa = 1.2 / vPx;
  float body;
  if (vShape < 0.5) {
    body = 1.0 - smoothstep(R - aa, R + aa, l);
  } else {
    float w = max(0.12, 2.4 / vPx);
    body = 1.0 - smoothstep(-aa, aa, abs(l - (R - w)) - w);
  }
  float halo = exp(-max(l - R, 0.0) * 7.0) * (0.1 + vMark);
  float core = vMark * (1.0 - smoothstep(0.0, R * 0.7, l));
  vec3 col = mix(vColor, vec3(1.0), core * 0.55);
  float a = body + halo + core * 0.6;
  a *= 1.0 - smoothstep(0.82, 1.0, l);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0) * vAlpha);
}`;
const EDGE_VERT = /* glsl */ `
attribute float aAlpha; attribute vec3 aColor; varying vec3 vColor; varying float vAlpha;
void main() {
  vColor = aColor; vAlpha = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const EDGE_FRAG = /* glsl */ `precision highp float; varying vec3 vColor; varying float vAlpha;
void main() { gl_FragColor = vec4(vColor, vAlpha); }`;

const ADD = {
  transparent: true,
  depthWrite: false,
  depthTest: false,
  blending: AdditiveBlending,
};

const el = (tag: string, cls: string, text?: string) => {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const mix = (a: Color, b: Color, t: number) => new Color().copy(a).lerp(b, t);
const GREY = new Color("#7d8aa3");
const EDGE_COLOR = new Color("#6f86b8");
const SELECT_COLOR = new Color("#ffffff");

interface Pin {
  e: HTMLElement;
  /** Where on the map it hangs. */
  at: Vector3;
  /** Own size in pixels, measured once it is first placed. */
  w?: number;
  h?: number;
}

/** Null when this browser cannot make a WebGL context. */
export function createMap(
  stage: HTMLElement,
  data: MapData,
  plan: Layout,
  hooks: MapHooks,
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
  controls.maxPolarAngle = (84 * Math.PI) / 180;
  controls.listenToKeyEvents(canvas);
  controls.keyPanSpeed = 14;

  const { roles } = data;
  const N = roles.length;
  const nBranches = data.branches.length;
  const floorY = -TRACK_HEIGHT / 2 - 1.5;

  // Scenery: the floor tinted by sub-branch, lane and sector lines, drawn once. -----------------
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
    const p = (a: number, r: number) => ground(a, r);
    const [x00, z00] = p(a0, r0);
    const [x01, z01] = p(a0, r1);
    const [x10, z10] = p(a1, r0);
    const [x11, z11] = p(a1, r1);
    floorPos.push(x00, floorY, z00, x01, floorY, z01, x11, floorY, z11);
    floorPos.push(x00, floorY, z00, x11, floorY, z11, x10, floorY, z10);
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
    guide.push(x0, floorY, z0, x1, floorY, z1);
  });
  const ringAt = (r: number) => {
    for (let k = 0; k < 180; k++) {
      const [x0, z0] = ground((k / 180) * TAU, r);
      const [x1, z1] = ground(((k + 1) / 180) * TAU, r);
      guide.push(x0, floorY, z0, x1, floorY, z1);
    }
  };
  ringAt(R_HOLE - 0.6);
  ringAt(R_OUT + 0.6);
  plan.lanes.slice(0, -1).forEach((lane, k) => ringAt((lane.end + plan.lanes[k + 1]!.start) / 2));
  const floorGeo = new BufferGeometry();
  floorGeo.setAttribute("position", new Float32BufferAttribute(floorPos, 3));
  floorGeo.setAttribute("color", new Float32BufferAttribute(floorCol, 3));
  const floor = new Mesh(floorGeo, new MeshBasicMaterial({ vertexColors: true, depthTest: false }));
  floor.renderOrder = 0;
  const guideGeo = new BufferGeometry();
  guideGeo.setAttribute("position", new Float32BufferAttribute(guide, 3));
  const lines = new LineSegments(
    guideGeo,
    new LineBasicMaterial({ color: 0x3a4d7a, transparent: true, opacity: 0.55, depthTest: false }),
  );
  lines.renderOrder = 1;
  scene.add(floor, lines);

  // Nodes and edges. ------------------------------------------------------------------------------
  const base: Color[] = roles.map((r) => new Color(branchColor(r.branch, nBranches, r.sub)));
  const nodeGeo = new BufferGeometry();
  nodeGeo.setAttribute("position", new BufferAttribute(plan.positions, 3));
  const aColor = new BufferAttribute(new Float32Array(N * 3), 3);
  const aSize = new BufferAttribute(new Float32Array(N), 1);
  const aAlpha = new BufferAttribute(new Float32Array(N), 1);
  const aMark = new BufferAttribute(new Float32Array(N), 1);
  const aShape = new BufferAttribute(new Float32Array(N), 1);
  roles.forEach((r, i) => aShape.setX(i, r.curated ? 0 : 1));
  nodeGeo.setAttribute("aColor", aColor);
  nodeGeo.setAttribute("aSize", aSize);
  nodeGeo.setAttribute("aAlpha", aAlpha);
  nodeGeo.setAttribute("aMark", aMark);
  nodeGeo.setAttribute("aShape", aShape);
  const uniforms = {
    uScale: { value: 1000 },
    uPR: { value: 1 },
    uNear: { value: 100 },
    uSpan: { value: 200 },
    uMinPx: { value: MIN_PX },
  };
  const nodes = new Points(
    nodeGeo,
    new ShaderMaterial({ uniforms, vertexShader: NODE_VERT, fragmentShader: NODE_FRAG, ...ADD }),
  );
  nodes.frustumCulled = false;
  nodes.renderOrder = 3;

  const edges: [number, number][] = [...data.lateral, ...data.progression];
  const edgeAt = new Map<string, number[]>();
  edges.forEach(([a, b], k) => {
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    edgeAt.set(key, [...(edgeAt.get(key) ?? []), k]);
  });
  const edgePos = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], k) => {
    edgePos.set(plan.positions.subarray(a * 3, a * 3 + 3), k * 6);
    edgePos.set(plan.positions.subarray(b * 3, b * 3 + 3), k * 6 + 3);
  });
  const eColor = new BufferAttribute(new Float32Array(edges.length * 6), 3);
  const eAlpha = new BufferAttribute(new Float32Array(edges.length * 2), 1);
  const edgeGeo = new BufferGeometry();
  edgeGeo.setAttribute("position", new BufferAttribute(edgePos, 3));
  edgeGeo.setAttribute("aColor", eColor);
  edgeGeo.setAttribute("aAlpha", eAlpha);
  const edgeLines = new LineSegments(
    edgeGeo,
    new ShaderMaterial({ vertexShader: EDGE_VERT, fragmentShader: EDGE_FRAG, ...ADD }),
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
  const heldColor = new Color(MARK_COLOR.held);
  const coveredColor = new Color(MARK_COLOR.covered);
  const reachColor = new Color(MARK_COLOR.reachable);

  function paint() {
    const spotlight = selected >= 0 ? neighbours[selected]! : null;
    for (let i = 0; i < N; i++) {
      let color = base[i]!;
      let size = NODE_D;
      let alpha = 0.78;
      let mark = 0;
      const m = marks?.[i] ?? MARK.none;
      if (m === MARK.held) {
        color = heldColor;
        size *= 2.7;
        mark = 1;
        alpha = 1;
      } else if (m === MARK.covered) {
        color = coveredColor;
        size *= 2.1;
        mark = 0.75;
        alpha = 1;
      } else if (m === MARK.reachable) {
        color = reachColor;
        size *= 1.9;
        mark = 0.6;
        alpha = 1;
      } else if (marks) {
        color = mix(base[i]!, GREY, 0.6);
        alpha = 0.22;
      }
      if (pass && !pass[i]) {
        alpha *= 0.16;
        mark = 0;
      }
      if (spotlight && i !== selected && !spotlight.has(i)) alpha *= 0.45;
      if (i === selected) {
        size *= 1.5;
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
      const color = picked ? SELECT_COLOR : stepped ? reachColor : EDGE_COLOR;
      const alpha = picked ? 0.8 : stepped ? 0.6 : hidden ? 0.004 : marks ? 0.012 : 0.03;
      for (const v of [0, 1]) {
        eColor.setXYZ(k * 2 + v, color.r, color.g, color.b);
        eAlpha.setX(k * 2 + v, alpha);
      }
    }
    eColor.needsUpdate = eAlpha.needsUpdate = true;
    request();
  }

  // Labels. ---------------------------------------------------------------------------------------
  const branchPins: Pin[] = data.branches.map((branch, b) => {
    const sector = plan.branches[b]!;
    const [x, z] = ground((sector.start + sector.end) / 2, R_OUT + 5);
    const e = el("div", "lbl lbl-branch", branch.label);
    layer.append(e);
    return { e, at: new Vector3(x, floorY, z) };
  });
  const subPins = data.branches.flatMap((branch, b) =>
    branch.subBranches.map((sub, s) => {
      const slice = plan.branches[b]!.subs[s]!;
      const e = el("div", "lbl lbl-sub", sub.label);
      layer.append(e);
      return { e, b, s, mid: (slice.start + slice.end) / 2, slice };
    }),
  );
  const levelPins: Pin[] = plan.lanes.map((lane, k) => {
    const [x, z] = ground(gapBefore(0), (lane.start + lane.end) / 2);
    const e = el("div", "lbl lbl-level", String(k + 1));
    layer.append(e);
    return { e, at: new Vector3(x, floorY, z) };
  });
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
  const wholeView = () => {
    // The disc and the branch names beyond its rim, wide and (tilted) tall, with some perspective.
    const extent = R_OUT + 34;
    const aspect = W / H;
    const across = (extent * 1.1) / (tanHalf * aspect);
    const along = (extent * Math.cos(POLAR) * 1.15 + 10) / (tanHalf * 0.95);
    return { x: 0, z: 0, az: 0, pol: POLAR, dist: Math.min(MAX_DIST, Math.max(across, along)) };
  };
  interface View {
    x: number;
    z: number;
    az: number;
    pol: number;
    dist: number;
  }
  function readView(): View {
    const off = new Vector3().subVectors(camera.position, controls.target);
    const dist = off.length();
    return {
      x: controls.target.x,
      z: controls.target.z,
      az: Math.atan2(off.x, off.z),
      pol: Math.acos(Math.min(1, Math.max(-1, off.y / dist))),
      dist,
    };
  }
  function setView(v: View) {
    controls.target.set(v.x, 0, v.z);
    camera.position.set(
      v.x + v.dist * Math.sin(v.pol) * Math.sin(v.az),
      v.dist * Math.cos(v.pol),
      v.z + v.dist * Math.sin(v.pol) * Math.cos(v.az),
    );
    camera.lookAt(controls.target);
  }
  let tween: { from: View; to: View; start: number } | null = null;
  function flyTo(to: View) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      tween = null;
      setView(to);
      controls.update();
    } else {
      tween = { from: readView(), to, start: performance.now() };
    }
    request();
  }
  function stepTween(now: number) {
    if (!tween) return;
    const t = Math.min(1, (now - tween.start) / TWEEN_MS);
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const { from, to } = tween;
    let da = to.az - from.az;
    da -= TAU * Math.round(da / TAU);
    setView({
      x: from.x + (to.x - from.x) * e,
      z: from.z + (to.z - from.z) * e,
      az: from.az + da * e,
      pol: from.pol + (to.pol - from.pol) * e,
      dist: from.dist * Math.pow(to.dist / from.dist, e),
    });
    if (t >= 1) tween = null;
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
      setView(wholeView());
      controls.update();
    }
    projDirty = true;
    request();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(stage);

  // Projection and picking: screen positions of every node, only when the camera moved. ----------
  const sx = new Float32Array(N);
  const sy = new Float32Array(N);
  const sd = new Float32Array(N);
  const sr = new Float32Array(N);
  let projDirty = true;
  const v = new Vector3();
  function project(x: number, y: number, z: number, out: { x: number; y: number; d: number }) {
    v.set(x, y, z);
    const d = v.distanceTo(camera.position);
    v.project(camera);
    out.x = (v.x * 0.5 + 0.5) * W;
    out.y = (-v.y * 0.5 + 0.5) * H;
    out.d = v.z > 1 ? -1 : d;
  }
  const tmp = { x: 0, y: 0, d: 0 };
  function ensureProjected() {
    if (!projDirty) return;
    projDirty = false;
    camera.updateMatrixWorld();
    const px = H / (2 * tanHalf);
    for (let i = 0; i < N; i++) {
      project(plan.positions[i * 3]!, plan.positions[i * 3 + 1]!, plan.positions[i * 3 + 2]!, tmp);
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
    if (!raf && !destroyed) raf = requestAnimationFrame(frame);
  }
  function frame(now: number) {
    raf = 0;
    if (destroyed || W < 1) return;
    stepTween(now);
    const moving = controls.update();
    draw();
    if (moving || tween) request();
  }

  const pinPoint = { x: 0, y: 0, d: 0 };
  const centre = { x: 0, y: 0, d: 0 };
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

  /** `zoom` is 1 for the whole map and falls as the camera comes closer. */
  function placeLabels(zoom: number) {
    // Branch names beyond the rim of their sector, pushed out by their own size so they do not
    // cover the nodes; they step aside once the sub-branches are named.
    const far = Math.min(1, Math.max(0, (zoom - 0.55) / 0.3));
    project(0, floorY, 0, centre);
    branchPins.forEach((pin) => {
      project(pin.at.x, pin.at.y, pin.at.z, pinPoint);
      if (far === 0 || pinPoint.d < 0 || !onScreen(pinPoint.x, pinPoint.y, 60)) {
        pin.e.style.opacity = "0";
        return;
      }
      if (!pin.w) {
        pin.w = pin.e.offsetWidth;
        pin.h = pin.e.offsetHeight;
      }
      const dx = pinPoint.x - centre.x;
      const dy = pinPoint.y - centre.y;
      const length = Math.hypot(dx, dy) || 1;
      const push =
        ((pin.w ?? 0) / 2) * Math.abs(dx / length) + ((pin.h ?? 0) / 2) * Math.abs(dy / length);
      place(
        pin.e,
        pinPoint.x + (dx / length) * push,
        pinPoint.y + (dy / length) * push,
        far,
        " translate(-50%,-50%)",
      );
    });
    // Sub-branch names, radially along the rim, once their slice is wide enough to hold one.
    for (const pin of subPins) {
      const [ax, az] = ground(pin.mid, R_OUT + 1.5);
      const [bx, bz] = ground(pin.mid, R_OUT + 8);
      const [lx, lz] = ground(pin.slice.start, R_OUT);
      const [rx, rz] = ground(pin.slice.end, R_OUT);
      project(lx, floorY, lz, pinPoint);
      const l = { x: pinPoint.x, y: pinPoint.y };
      project(rx, floorY, rz, pinPoint);
      const width = Math.hypot(pinPoint.x - l.x, pinPoint.y - l.y);
      project(ax, floorY, az, pinPoint);
      const a = { x: pinPoint.x, y: pinPoint.y, d: pinPoint.d };
      project(bx, floorY, bz, pinPoint);
      if (zoom > 0.9 || a.d < 0 || width < SUB_LABEL_PX || !onScreen(a.x, a.y)) {
        pin.e.style.opacity = "0";
        continue;
      }
      let rot = Math.atan2(pinPoint.y - a.y, pinPoint.x - a.x);
      const flip = Math.cos(rot) < 0;
      if (flip) rot += Math.PI;
      place(
        pin.e,
        a.x,
        a.y,
        1,
        ` rotate(${rot.toFixed(3)}rad) translate(${flip ? "-100%" : "0"},-50%)`,
      );
    }
    for (const pin of levelPins) {
      project(pin.at.x, pin.at.y, pin.at.z, pinPoint);
      if (pinPoint.d < 0 || !onScreen(pinPoint.x, pinPoint.y)) pin.e.style.opacity = "0";
      else place(pin.e, pinPoint.x, pinPoint.y, 0.8, " translate(-50%,-50%)");
    }
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
    const dist = camera.position.distanceTo(controls.target);
    uniforms.uNear.value = Math.max(1, camera.position.length() - R_OUT);
    uniforms.uSpan.value = R_OUT * 2;
    projDirty = true;
    ensureProjected();
    placeLabels(dist / wholeView().dist);
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
    focus(branch) {
      if (branch === null) return flyTo(wholeView());
      const sector = plan.branches[branch]!;
      const mid = (sector.start + sector.end) / 2;
      const chord = Math.max(60, 2 * R_OUT * Math.sin((sector.end - sector.start) / 2));
      const aspect = W / H;
      const across = (chord * 1.25) / (2 * tanHalf * aspect);
      const along = (((R_OUT - R_HOLE) * Math.cos(POLAR) + 28) * 1.15) / (2 * tanHalf);
      const [x, z] = ground(mid, (R_HOLE + R_OUT) / 2 + 6);
      flyTo({
        x,
        z,
        az: -mid,
        pol: POLAR,
        dist: Math.min(MAX_DIST, Math.max(MIN_DIST, across, along)),
      });
    },
    zoomBy(factor) {
      const now = readView();
      flyTo({ ...now, dist: Math.min(MAX_DIST, Math.max(MIN_DIST, now.dist / factor)) });
    },
    resize,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      keyOff();
      controls.dispose();
      scene.traverse((o) => {
        const mesh = o as Mesh;
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
