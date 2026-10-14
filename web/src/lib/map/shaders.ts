// The map's shaders. Nodes and edges carry two positions and a morph weight, so a change of layout
// is one uniform per frame; the node sprite draws the body, the state halo and, for a management
// role, a wide soft haze around the body.

import { AdditiveBlending } from "three";
import { DEMAND_LINEAR } from "../demand.ts";

/** The arms of a three-armed star: the longest reaches this many body radii beyond the body. */
const ARM_REACH = 4;
const vec3 = (c: readonly number[]) => `vec3(${c.map((x) => x.toFixed(4)).join(", ")})`;

/** The haze of a management role: a fixed size on the map, whatever size its node has. */
const HAZE_DIAMETER = 6;
const HAZE_SIGMA = 1.25;
const HAZE_PEAK = 0.3;
/** The haze's strength when the points are specks (one map unit under 2.5 px), and fully zoomed. */
const HAZE_FAR = 0.15;

export const NODE_VERT = /* glsl */ `
attribute vec3 aTo; attribute float aSize; attribute float aSizeFrom; attribute float aAlpha; attribute float aShape; attribute float aMark; attribute float aManage; attribute vec3 aColor; attribute vec3 aColorFrom; attribute vec3 aArms; attribute vec3 aArmsFrom;
uniform float uMorph; uniform float uScale; uniform float uPR; uniform float uNear; uniform float uSpan; uniform float uMinPx;
varying vec3 vColor; varying float vAlpha; varying float vShape; varying float vMark; varying float vManage; varying float vPx; varying float vSize; varying float vUnit; varying vec3 vArms;
#define BODY 0.6
void main() {
  vec4 mv = modelViewMatrix * vec4(mix(position, aTo, uMorph), 1.0);
  float depth = clamp((-mv.z - uNear) / uSpan, 0.0, 1.0);
  vAlpha = aAlpha * mix(1.0, 0.72, depth);
  vColor = mix(aColorFrom, aColor, uMorph); vArms = mix(aArmsFrom, aArms, uMorph); vShape = aShape; vMark = aMark; vManage = aManage;
  // The body's sprite (its size and colour morph with the points), and the pixels one map
  // unit covers here.
  float px = min(max(mix(aSizeFrom, aSize, uMorph) * uScale / -mv.z, uMinPx) * uPR / BODY, 240.0);
  float unit = uScale / -mv.z * uPR;
  // A star's sprite is wide enough for its longest arm.
  float reach = px * BODY * 1.1 * (1.0 + ${ARM_REACH.toFixed(1)} * max(vArms.x, max(vArms.y, vArms.z)));
  float size = min(max(max(px, reach), aManage * ${HAZE_DIAMETER.toFixed(1)} * unit), 600.0);
  vPx = px; vSize = size; vUnit = unit;
  gl_PointSize = size;
  gl_Position = projectionMatrix * mv;
}`;

export const NODE_FRAG = /* glsl */ `
precision highp float;
varying vec3 vColor; varying float vAlpha; varying float vShape; varying float vMark; varying float vManage; varying float vPx; varying float vSize; varying float vUnit; varying vec3 vArms;
#define R 0.6
// Where an arm points on the screen, and its colour: the triangle of the demands, physical lower
// left, mental on top, emotional lower right, as on the disc's own triangle.
const vec2 DIR0 = vec2(-0.8660, -0.5);
const vec2 DIR1 = vec2(0.0, 1.0);
const vec2 DIR2 = vec2(0.8660, -0.5);
const vec3 ARM0 = ${vec3(DEMAND_LINEAR[0]!)};
const vec3 ARM1 = ${vec3(DEMAND_LINEAR[1]!)};
const vec3 ARM2 = ${vec3(DEMAND_LINEAR[2]!)};
// One arm, a tapering line from the centre; p is in the units of l below, length a in 0..1.
float arm(vec2 p, vec2 d, float a) {
  if (a < 0.001) return 0.0;
  float tip = R * (1.0 + ${ARM_REACH.toFixed(1)} * a);
  float t = dot(p, d);
  float s = abs(p.x * d.y - p.y * d.x);
  float w = max(0.17 * (1.0 - t / tip) + 0.03, 1.4 / vPx);
  return (1.0 - smoothstep(w * 0.55, w, s)) * smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(tip * 0.75, tip, t));
}
void main() {
  // l is the distance from the centre in units of an ordinary sprite's half width, so the body and
  // the state halo look the same whether or not the sprite is widened for a haze.
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float l = length(q) * vSize / vPx;
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
  // Management: a faint, wide, smooth glow in the node's own colour, no rim and no white core, and
  // as wide as ever when the body grows for a state. Where the points are specks and packed close
  // it would only add up to a blaze, so it comes up as the camera comes closer.
  float reach = length(q) * 0.5 * vSize / vUnit;
  float zoomed = mix(${HAZE_FAR.toFixed(2)}, 1.0, smoothstep(2.5, 8.0, vUnit));
  float haze = vManage * ${HAZE_PEAK.toFixed(2)} * zoomed * exp(-reach * reach / (2.0 * ${(HAZE_SIGMA * HAZE_SIGMA).toFixed(4)}));
  vec3 col = mix(vColor, vec3(1.0), core * 0.55);
  float a = body + halo + core * 0.6 + haze;
  // The arms of a three-armed star, dimmed where a state mark has to read; each in its own colour.
  vec2 p = vec2(q.x, -q.y) * vSize / vPx;
  float calm = 1.0 - 0.75 * vMark;
  float l0 = arm(p, DIR0, vArms.x) * calm;
  float l1 = arm(p, DIR1, vArms.y) * calm;
  float l2 = arm(p, DIR2, vArms.z) * calm;
  float lines = l0 + l1 + l2;
  vec3 all = (col * a + ARM0 * l0 + ARM1 * l1 + ARM2 * l2) / max(a + lines, 0.0001);
  a += lines;
  a *= 1.0 - smoothstep(0.82, 1.0, length(q));
  gl_FragColor = vec4(all, clamp(a, 0.0, 1.0) * vAlpha);
}`;

export const EDGE_VERT = /* glsl */ `
attribute vec3 aTo; attribute float aAlpha; attribute vec3 aColor; uniform float uMorph; varying vec3 vColor; varying float vAlpha;
void main() {
  vColor = aColor; vAlpha = aAlpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(mix(position, aTo, uMorph), 1.0);
}`;

export const EDGE_FRAG = /* glsl */ `precision highp float; varying vec3 vColor; varying float vAlpha;
void main() { gl_FragColor = vec4(vColor, vAlpha); }`;

/** A glass shell: clear in the middle, glowing where the surface turns away from the eye. */
export const SHELL_VERT = /* glsl */ `varying vec3 vN; varying vec3 vV;
void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = -mv.xyz; gl_Position = projectionMatrix * mv; }`;
export const SHELL_FRAG = /* glsl */ `precision highp float; uniform float uStrength; varying vec3 vN; varying vec3 vV;
void main() { float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.6); gl_FragColor = vec4(0.28, 0.58, 1.0, (f * 0.34 + 0.012) * uStrength); }`;

export const ADD = {
  transparent: true,
  depthWrite: false,
  depthTest: false,
  blending: AdditiveBlending,
};
