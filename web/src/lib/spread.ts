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
