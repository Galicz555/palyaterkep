import { describe, expect, it } from "vitest";
import { layout, R_HOLE, R_OUT } from "../src/lib/layout.ts";
import { mapData } from "../src/lib/server/data.ts";

// The real vault: the layout is only as good as it is on the 3039 roles it draws.
const data = mapData();
const map = layout(data);
const angle = (i: number) => {
  const x = map.positions[i * 3]!;
  const z = map.positions[i * 3 + 2]!;
  return Math.atan2(x, -z);
};
const radius = (i: number) => Math.hypot(map.positions[i * 3]!, map.positions[i * 3 + 2]!);

describe("layout", () => {
  it("places every role inside the disc", () => {
    expect(map.positions).toHaveLength(data.roles.length * 3);
    for (let i = 0; i < data.roles.length; i++) {
      expect(radius(i)).toBeGreaterThan(R_HOLE);
      expect(radius(i)).toBeLessThan(R_OUT);
    }
  });

  it("draws the level as distance: every lane lies outside the one before", () => {
    for (let level = 1; level < 5; level++) {
      const inner = data.roles.flatMap((r, i) => (r.level === level ? [radius(i)] : []));
      const outer = data.roles.flatMap((r, i) => (r.level === level + 1 ? [radius(i)] : []));
      expect(Math.max(...inner)).toBeLessThan(Math.min(...outer));
    }
  });

  it("draws the branch as angle: sub-branch slices sit in their sector, sectors in table order", () => {
    const sectors = map.branches;
    for (let b = 1; b < sectors.length; b++) {
      expect(sectors[b]!.start).toBeGreaterThan(sectors[b - 1]!.end);
    }
    expect(sectors.at(-1)!.end).toBeLessThan(Math.PI * 2 + sectors[0]!.start);
    data.roles.forEach((role, i) => {
      const slice = sectors[role.branch]!.subs[role.sub]!;
      // The sectors run from IT (centred on north) clockwise past 180 degrees: unwrap to match.
      const a = angle(i) < slice.start - Math.PI ? angle(i) + Math.PI * 2 : angle(i);
      expect(a, role.id).toBeGreaterThanOrEqual(slice.start);
      expect(a, role.id).toBeLessThanOrEqual(slice.end);
    });
  });

  it("puts IT, the first branch, on north", () => {
    const it = map.branches[0]!;
    expect(data.branches[0]!.id).toBe("it");
    expect((it.start + it.end) / 2).toBeCloseTo(0, 6);
  });

  it("keeps the disc flat: the track is a glow, not a height", () => {
    for (let i = 0; i < data.roles.length; i++) expect(map.positions[i * 3 + 1]).toBe(0);
  });

  it("does not stack two roles on one spot", () => {
    const seen = new Set<string>();
    for (let i = 0; i < data.roles.length; i++) {
      const key = `${(map.positions[i * 3]! * 10).toFixed(0)}/${(map.positions[i * 3 + 2]! * 10).toFixed(0)}`;
      expect(seen.has(key), data.roles[i]!.id).toBe(false);
      seen.add(key);
    }
  });
});
