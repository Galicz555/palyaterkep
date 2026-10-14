import { describe, expect, it } from "vitest";
import { arranger } from "../src/lib/arrange.ts";
import { mapData } from "../src/lib/server/data.ts";

describe("the layouts on the real roles", () => {
  const data = mapData();
  const place = arranger(data);

  it("keeps every role in the band just inside its level's shell", () => {
    const sphere = place("A");
    expect(sphere.positions).toHaveLength(data.roles.length * 3);
    if (sphere.frame.kind !== "sphere") throw new Error("A is the sphere");
    const { shells } = sphere.frame;
    data.roles.forEach((role, i) => {
      const [x, y, z] = [0, 1, 2].map((k) => sphere.positions[i * 3 + k]!) as [
        number,
        number,
        number,
      ];
      const r = Math.hypot(x, y, z);
      const shell = shells[role.level - 1]!.radius;
      expect(r, role.id).toBeLessThanOrEqual(shell + 1e-6);
      expect(r, role.id).toBeGreaterThan(shell * 0.9);
    });
  });

  it("gives every layout finite positions and a camera that has something to show", () => {
    for (const id of ["A", "B"] as const) {
      const arrangement = place(id);
      expect(arrangement.positions.every(Number.isFinite)).toBe(true);
      expect(arrangement.home.fit[0]).toBeGreaterThan(0);
    }
  });
});
