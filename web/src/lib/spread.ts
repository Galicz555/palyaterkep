// Roles whose occupation shares its scores with others (a broader occupation's, or an ISCO group's
// mean) land on exactly the same spot in a layout that places by the scores alone: 79 on one point
// at worst. This gives each of them a place of its own around that spot, the same one every time.

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/**
 * Per role, the offset [dx, dy] from the spot its key says: roles with one key follow a sunflower
 * spiral, so n of them fill a disc of radius about `spacing` times the square root of n and no two
 * are closer than about `spacing`. The k-th role with a key always gets the k-th place, so the same
 * roles in the same order draw the same picture; a role alone with its key gets no offset.
 */
export function spread(keys: string[], spacing: number): Float32Array {
  const out = new Float32Array(keys.length * 2);
  const seen = new Map<string, number>();
  keys.forEach((key, i) => {
    const k = seen.get(key) ?? 0;
    seen.set(key, k + 1);
    const r = spacing * Math.sqrt(k);
    out[i * 2] = r * Math.cos(k * GOLDEN_ANGLE);
    out[i * 2 + 1] = r * Math.sin(k * GOLDEN_ANGLE);
  });
  return out;
}

/**
 * Nudges points that sit closer than `gap` apart until they do not, a few steps of pushing each
 * pair half the overlap away from each other, in place. Only points with the same bucket meet, and
 * only the coordinates in `axes` move (0 x, 1 y, 2 z). Deterministic: the order is the points'.
 * `positions` holds x, y, z per point.
 */
export function relax(
  positions: Float32Array,
  buckets: number[],
  axes: number[],
  gap: number,
  steps = 12,
): void {
  const n = buckets.length;
  for (let step = 0; step < steps; step++) {
    const cells = new Map<string, number[]>();
    const cell = (i: number) =>
      `${buckets[i]}|${axes.map((k) => Math.floor(positions[i * 3 + k]! / gap)).join(",")}`;
    for (let i = 0; i < n; i++) {
      const key = cell(i);
      const list = cells.get(key);
      if (list) list.push(i);
      else cells.set(key, [i]);
    }
    const push = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const base = axes.map((k) => Math.floor(positions[i * 3 + k]! / gap));
      // The cell of this point and the ones around it, in the moving axes.
      const around = axes.reduce<number[][]>(
        (acc, _, a) => acc.flatMap((c) => [-1, 0, 1].map((d) => [...c, base[a]! + d])),
        [[]],
      );
      for (const c of around) {
        for (const j of cells.get(`${buckets[i]}|${c.join(",")}`) ?? []) {
          if (j <= i) continue;
          let d2 = 0;
          for (const k of axes) d2 += (positions[i * 3 + k]! - positions[j * 3 + k]!) ** 2;
          if (d2 >= gap * gap) continue;
          const d = Math.sqrt(d2);
          // Exactly one place: push along an axis picked from the pair, so it is the same each time.
          const unit = axes.map((k, a) =>
            d > 1e-6
              ? (positions[i * 3 + k]! - positions[j * 3 + k]!) / d
              : a === (i + j) % axes.length
                ? 1
                : 0,
          );
          const move = (gap - d) / 2;
          axes.forEach((k, a) => {
            push[i * 3 + k]! += unit[a]! * move;
            push[j * 3 + k]! -= unit[a]! * move;
          });
        }
      }
    }
    for (let i = 0; i < positions.length; i++) positions[i]! += push[i]!;
  }
}
