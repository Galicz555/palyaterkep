// The map's shaders. Nodes and edges carry two positions and a morph weight, so a change of layout
// is one uniform per frame; the node sprite draws a star: a small bright core with a tight tail,
// four spikes for a held role, three arms where a layout draws them.

import { AdditiveBlending, CustomBlending, OneFactor, OneMinusSrcAlphaFactor } from "three";
import { DEMAND_LINEAR } from "../demand.ts";

/** The arms of a three-armed star: the longest reaches this many body radii beyond the body. */
const ARM_REACH = 4;
const vec3 = (c: readonly number[]) => `vec3(${c.map((x) => x.toFixed(4)).join(", ")})`;

/**
 * A node is a star: a small bright core and a tight tail, nothing wider. The sprite is this many
 * core diameters wide, which is just room for the tail to fade out.
 */
const SPRITE = 2.6;
/** The largest a plain node and a marked one grow on the screen, in CSS pixels, however close. */
export const MAX_PX = 12;
export const MAX_MARK_PX = 30;
/** A management role is this much larger (a share of its diameter) and brighter than a plain one. */
const MANAGE_GROW = 0.4;
const MANAGE_GAIN = 0.6;
/** The four-point spikes of a held role: their length in core radii, and how bright they are. */
const SPIKE_REACH = 6.0;
const SPIKE_GAIN = 1.0;
/** How much of its brightness a point on the far side of the map keeps. */
const FAR = 0.5;
/** A role the ILO finds strongly replaceable burns out: seconds the blast runs, and how far it reaches (CSS px). */
export const BLAST_S = 1.2;
const BLAST_REACH = 56;
/** The role a blast has left: its star keeps this much of its size and alpha, and a faint ring stays. */
const REMNANT_SIZE = 0.5;
const REMNANT_ALPHA = 0.35;
/** A role the CV marks keeps its mark legible on the remnant. */
const REMNANT_ALPHA_MARKED = 0.9;

export const NODE_VERT = /* glsl */ `
attribute vec3 aTo; attribute float aSize; attribute float aSizeFrom; attribute float aAlpha; attribute float aMark; attribute float aManage; attribute vec3 aColor; attribute vec3 aColorFrom; attribute vec3 aArms; attribute vec3 aArmsFrom; attribute float aBoom;
uniform float uMorph; uniform float uScale; uniform float uPR; uniform float uNear; uniform float uSpan; uniform float uMinPx; uniform float uTime; uniform float uCalm;
varying vec3 vColor; varying float vAlpha; varying float vMark; varying float vManage; varying float vPx; varying float vSize; varying vec3 vArms; varying float vT; varying float vSeed;
void main() {
  vec4 mv = modelViewMatrix * vec4(mix(position, aTo, uMorph), 1.0);
  float depth = clamp((-mv.z - uNear) / uSpan, 0.0, 1.0);
  // A marked role keeps its full brightness at any depth: it has to read as white.
  vAlpha = aAlpha * mix(1.0, ${FAR.toFixed(2)}, depth * (1.0 - step(0.01, aMark)));
  vColor = mix(aColorFrom, aColor, uMorph); vArms = mix(aArmsFrom, aArms, uMorph); vMark = aMark;
  // A marked role's size and brightness say its state, so management adds nothing there.
  vManage = aManage * (1.0 - step(0.01, aMark));
  // The core's diameter in device pixels (its size and colour morph with the points), kept small
  // however close the camera comes: a star does not swell into a blob.
  float cap = (aMark > 0.0 ? ${MAX_MARK_PX.toFixed(1)} : ${MAX_PX.toFixed(1)}) * uPR;
  float px = min(max(mix(aSizeFrom, aSize, uMorph) * uScale / -mv.z, uMinPx) * uPR * (1.0 + ${MANAGE_GROW.toFixed(2)} * vManage), cap);
  // A role the ILO finds strongly replaceable: seconds since its blast began (negative before, or
  // never), and what is left of its star afterwards.
  float t = uTime - aBoom;
  vT = t; vSeed = aBoom;
  float rem = smoothstep(0.1, 0.9, t);
  px *= mix(1.0, mix(${REMNANT_SIZE.toFixed(2)}, 1.0, step(0.01, aMark)), rem);
  // The sprite is wide enough for the tail, a held role's spikes and a three-armed star's longest arm.
  float spiked = step(0.95, aMark);
  float reach = px * 1.1 * (1.0 + ${ARM_REACH.toFixed(1)} * max(vArms.x, max(vArms.y, vArms.z)));
  // ...and wide enough for the blast while it runs, then for the ring the remnant keeps.
  float live = step(0.0, t);
  float ember = max(px * 0.95, 7.0 * uPR) + 3.0 * uPR;
  float blastR = max(ember, ${BLAST_REACH.toFixed(1)} * uPR * (1.0 - uCalm) * step(t, ${BLAST_S.toFixed(1)}));
  float size = min(max(max(max(px * ${SPRITE.toFixed(1)}, reach), spiked * px * ${(1.25 * SPIKE_REACH).toFixed(2)}), live * 2.0 * blastR), 600.0);
  vPx = px; vSize = size;
  gl_PointSize = size;
  gl_Position = projectionMatrix * mv;
}`;

export const NODE_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor; varying float vAlpha; varying float vMark; varying float vManage; varying float vPx; varying float vSize; varying vec3 vArms; varying float vT; varying float vSeed;
uniform float uPR; uniform float uCalm;
float hash(float n) { return fract(sin(n * 127.1 + 1.7) * 43758.5453); }
// The blast of a replaceable role, in CSS pixels from its centre (p) and seconds (t) since it began:
// a white-hot flash with a soft orange halo and a few streaks, a blue-white shockwave ring that
// widens and turns orange as it fades, and sparks flung outwards. Added to what is behind.
vec3 blast(vec2 p, float t, float seed) {
  float d = length(p);
  float fade = clamp(1.0 - t / ${BLAST_S.toFixed(1)}, 0.0, 1.0);
  float flash = 0.9 * exp(-t * 7.0) * exp(-d / (4.0 + 12.0 * t));
  float halo = 0.2 * exp(-t * 4.5) * exp(-d / (12.0 + 14.0 * t));
  float rays = pow(abs(cos(atan(p.y, p.x) * 5.0 + seed * 20.0)), 20.0) * exp(-d / 20.0) * exp(-t * 7.0) * 0.8;
  float radius = ${BLAST_REACH.toFixed(1)} * 0.85 * (1.0 - exp(-t * 3.0));
  float width = 1.2 + 3.0 * fade;
  float u = (d - radius) / width;
  float ring = exp(-u * u) * pow(fade, 1.5) * 1.1;
  float sparks = 0.0;
  for (int k = 0; k < 14; k++) {
    float fk = float(k);
    float a = hash(fk * 7.3 + seed * 31.0) * 6.2832;
    float r = ${BLAST_REACH.toFixed(1)} * 0.7 * (0.35 + 0.65 * hash(fk * 3.1 + seed * 17.0)) * (1.0 - exp(-t * 2.6));
    vec2 dv = p - vec2(cos(a), sin(a)) * r;
    sparks += exp(-dot(dv, dv) / 1.6) * fade;
  }
  vec3 hot = vec3(1.0, 0.97, 0.9);
  vec3 orange = vec3(1.0, 0.5, 0.2);
  vec3 blue = vec3(0.62, 0.8, 1.0);
  return hot * flash + orange * (halo + rays * 0.8) + mix(blue, orange, 1.0 - fade) * ring + vec3(1.0, 0.6, 0.25) * sparks * 0.7;
}
// Where an arm points on the screen, and its colour: the triangle of the demands, physical lower
// left, mental on top, emotional lower right, as on the disc's own triangle.
const vec2 DIR0 = vec2(-0.8660, -0.5);
const vec2 DIR1 = vec2(0.0, 1.0);
const vec2 DIR2 = vec2(0.8660, -0.5);
const vec3 ARM0 = ${vec3(DEMAND_LINEAR[0]!)};
const vec3 ARM1 = ${vec3(DEMAND_LINEAR[1]!)};
const vec3 ARM2 = ${vec3(DEMAND_LINEAR[2]!)};
// One arm, a tapering line from the centre; p is in the arm's own units (a body radius is 0.6, and
// a pixel 1 / pxArm), length a in 0..1.
float arm(vec2 p, vec2 d, float a, float pxArm) {
  if (a < 0.001) return 0.0;
  float tip = 0.6 * (1.0 + ${ARM_REACH.toFixed(1)} * a);
  float t = dot(p, d);
  float s = abs(p.x * d.y - p.y * d.x);
  float w = max(0.17 * (1.0 - t / tip) + 0.03, 1.4 / pxArm);
  return (1.0 - smoothstep(w * 0.55, w, s)) * smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(tip * 0.75, tip, t));
}
void main() {
  // p is the distance from the centre in core radii, so the core looks the same at every sprite
  // width; one pixel is 2 / vPx of it.
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  vec2 p = vec2(q.x, -q.y) * vSize / vPx;
  float l = length(p);
  float aa = 2.0 / vPx;
  float body = 1.0 - smoothstep(0.7 - aa, 1.0 + aa, l);
  // A tight tail, and a hot centre that is whiter, most for a management role.
  float tail = 0.16 * exp(-max(l - 0.9, 0.0) * 4.5);
  float hot = 1.0 - smoothstep(0.0, 0.6, l);
  vec3 col = mix(vColor, vec3(1.0), hot * (0.35 + ${MANAGE_GAIN.toFixed(2)} * 0.5 * vManage));
  float a = (body + tail) * (1.0 + ${MANAGE_GAIN.toFixed(2)} * vManage);
  // A held role's four spikes, thin and crisp, along the screen's axes.
  float spiked = step(0.95, vMark);
  vec2 ap = abs(p);
  float wd = max(0.08, 2.6 / vPx);
  float spike = (1.0 - smoothstep(0.0, wd, ap.y)) * pow(1.0 - smoothstep(0.0, ${SPIKE_REACH.toFixed(1)}, ap.x), 2.0)
              + (1.0 - smoothstep(0.0, wd, ap.x)) * pow(1.0 - smoothstep(0.0, ${SPIKE_REACH.toFixed(1)}, ap.y), 2.0);
  a += spiked * spike * ${SPIKE_GAIN.toFixed(1)};
  // The arms of a three-armed star, dimmed where a state mark has to read; each in its own colour.
  vec2 pa = p * 0.6;
  float pxArm = vPx / 0.6;
  float calm = 1.0 - 0.75 * vMark;
  float l0 = arm(pa, DIR0, vArms.x, pxArm) * calm;
  float l1 = arm(pa, DIR1, vArms.y, pxArm) * calm;
  float l2 = arm(pa, DIR2, vArms.z, pxArm) * calm;
  float lines = l0 + l1 + l2;
  vec3 all = (col * a + ARM0 * l0 + ARM1 * l1 + ARM2 * l2) / max(a + lines, 0.0001);
  a += lines;
  a *= 1.0 - smoothstep(0.82, 1.0, length(q));
  // Premultiplied, drawn over what is behind: where stars crowd, the nearer covers the farther
  // instead of the sum going white.
  float A = clamp(a, 0.0, 1.0) * mix(vAlpha, 1.0, 0.5 * vManage);
  // After its blast a replaceable role is a dim ember: its star faint and warm (a role the CV marks
  // keeps its mark), with a thin ring round it.
  float rem = smoothstep(0.1, 0.9, vT);
  float marked = step(0.01, vMark);
  all = mix(all, vec3(0.62, 0.42, 0.34), 0.65 * rem * (1.0 - marked));
  A *= mix(1.0, mix(${REMNANT_ALPHA.toFixed(2)}, ${REMNANT_ALPHA_MARKED.toFixed(2)}, marked), rem);
  vec3 glow = vec3(0.0);
  if (vT >= 0.0) {
    vec2 pc = vec2(q.x, -q.y) * vSize * 0.5 / uPR;
    float d = length(pc);
    float rr = max(vPx * 0.95 / uPR, 7.0);
    glow = vec3(1.0, 0.5, 0.3) * (1.0 - smoothstep(0.0, 1.1, abs(d - rr))) * 0.5 * rem;
    if (uCalm < 0.5 && vT < ${BLAST_S.toFixed(1)}) glow += blast(pc, vT, vSeed);
    glow *= 1.0 - smoothstep(0.85, 1.0, length(q));
  }
  gl_FragColor = vec4(all * A + glow, A);
}`;

export const EDGE_VERT = /* glsl */ `
attribute vec3 aTo; attribute float aAlpha; attribute vec3 aColor; attribute float aBoom; uniform float uMorph; uniform float uTime; varying vec3 vColor; varying float vAlpha;
void main() {
  vColor = aColor;
  // An edge that touches a replaceable role dims as that role burns out.
  vAlpha = aAlpha * mix(1.0, 0.12, smoothstep(0.3, 1.2, uTime - aBoom));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(mix(position, aTo, uMorph), 1.0);
}`;

export const EDGE_FRAG = /* glsl */ `precision highp float; varying vec3 vColor; varying float vAlpha;
void main() { gl_FragColor = vec4(vColor, vAlpha); }`;

/** A glass shell: clear in the middle, glowing where the surface turns away from the eye. */
export const SHELL_VERT = /* glsl */ `varying vec3 vN; varying vec3 vV;
void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
export const SHELL_FRAG = /* glsl */ `precision highp float; uniform float uStrength; varying vec3 vN; varying vec3 vV;
void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.6); gl_FragColor = vec4(0.28, 0.58, 1.0, (f * 0.34 + 0.012) * uStrength); }`;

/** What the node shader writes is premultiplied, so this is ordinary alpha blending. */
export const NODE_BLEND = {
  transparent: true,
  depthWrite: false,
  depthTest: false,
  blending: CustomBlending,
  blendSrc: OneFactor,
  blendDst: OneMinusSrcAlphaFactor,
};

export const ADD = {
  transparent: true,
  depthWrite: false,
  depthTest: false,
  blending: AdditiveBlending,
};
