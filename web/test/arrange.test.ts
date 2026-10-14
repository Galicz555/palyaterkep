import { describe, expect, it } from "vitest";
import { arranger, type Arrangement } from "../src/lib/arrange.ts";
import { capDirection, mixOf } from "../src/lib/demand.ts";
import { mapData } from "../src/lib/server/data.ts";

// The real roles with the real demand data: a layout is only as good as it is on the 3047 roles.
const data = mapData();
const place = arranger(data);
const at = (a: Arrangement, i: number) =>
  [0, 1, 2].map((k) => a.positions[i * 3 + k]!) as [number, number, number];
const role = (id: string) => data.roles.findIndex((r) => r.id === id);

describe("the demand data on the roles", () => {
  it("reads the scores of well-known occupations onto their roles", () => {
    const [p, m, e] = data.roles[role("senior-szoftverfejleszto")]!.demands!;
    expect(m).toBeGreaterThan(0.9);
    expect(p).toBeLessThan(0.1);
    expect(e).toBeLessThan(0.1);
    const roofer = data.roles[role("tetofedo")]!.demands!;
    expect(roofer[0]).toBeGreaterThan(0.9);
    expect(roofer[1]).toBeLessThan(0.2);
    const nurse = data.roles[role("szakapolo")]!.demands!;
    expect(nurse[2]).toBeGreaterThan(0.8);
  });

  it("leaves a role without data as null, and the military officers are among them", () => {
    const without = data.roles.filter((r) => r.demands === null);
    expect(without.length).toBeGreaterThan(0);
    expect(without.length).toBeLessThan(100);
    expect(without.some((r) => r.id === "katonatiszt")).toBe(true);
  });
});

describe("layout A, the sphere", () => {
  const sphere = place("A");

  it("keeps every role in the band just inside its level's shell", () => {
    expect(sphere.positions).toHaveLength(data.roles.length * 3);
    if (sphere.frame.kind !== "sphere") throw new Error("A is the sphere");
    const { shells } = sphere.frame;
    data.roles.forEach((r, i) => {
      const radius = Math.hypot(...at(sphere, i));
      const shell = shells[r.level - 1]!.radius;
      expect(radius, r.id).toBeLessThanOrEqual(shell + 1e-6);
      expect(radius, r.id).toBeGreaterThan(shell - 12);
    });
  });

  it("points each role the way its mix says, within the spread of roles that share a score", () => {
    data.roles.forEach((r, i) => {
      const p = at(sphere, i);
      const want = capDirection(mixOf(r.demands), 0.55);
      const along = (p[0] * want[0] + p[1] * want[1] + p[2] * want[2]) / Math.hypot(...p);
      // 79 roles share one triple at worst: their spiral is about 15 units wide on a shell 30 to 100.
      expect(along, r.id).toBeGreaterThan(Math.cos((25 * Math.PI) / 180));
    });
  });

  it("does not stack two roles on one spot, though 516 triples are shared", () => {
    const seen = new Set<string>();
    data.roles.forEach((r, i) => {
      const key = at(sphere, i)
        .map((c) => (c * 4).toFixed(0))
        .join("/");
      expect(seen.has(key), r.id).toBe(false);
      seen.add(key);
    });
  });

  it("is the same picture every time", () => {
    const again = arranger(data)("A");
    expect(again.positions).toEqual(sphere.positions);
  });

  it("puts a software developer toward the mental star and a roofer toward the physical one", () => {
    if (sphere.frame.kind !== "sphere") throw new Error("A is the sphere");
    const [physical, mental] = sphere.frame.anchors.map((a) => a.at);
    const near = (p: number[], q: number[]) =>
      Math.hypot(p[0]! - q[0]!, p[1]! - q[1]!, p[2]! - q[2]!);
    const dev = at(sphere, role("senior-szoftverfejleszto"));
    expect(near(dev, mental!)).toBeLessThan(near(dev, physical!));
    const roofer = at(sphere, role("tetofedo"));
    expect(near(roofer, physical!)).toBeLessThan(near(roofer, mental!));
  });
});

describe("layout B, the disc lifted by one demand", () => {
  const flat = place("B", 0);
  it("keeps the disc's places and lifts each role by the chosen demand's rank", () => {
    for (const axis of [0, 1, 2]) {
      const lifted = place("B", axis);
      data.roles.forEach((r, i) => {
        expect(lifted.positions[i * 3], r.id).toBe(flat.positions[i * 3]);
        expect(lifted.positions[i * 3 + 2], r.id).toBe(flat.positions[i * 3 + 2]);
        const y = lifted.positions[i * 3 + 1]!;
        expect(Math.abs(y), r.id).toBeLessThanOrEqual(30 + 1e-4);
        if (r.demands) expect(y, r.id).toBeCloseTo((r.demands[axis]! - 0.5) * 60, 3);
        else expect(y, r.id).toBe(0);
      });
    }
  });

  it("puts a software developer high on mental and low on physical", () => {
    const i = role("senior-szoftverfejleszto");
    expect(place("B", 1).positions[i * 3 + 1]!).toBeGreaterThan(20);
    expect(place("B", 0).positions[i * 3 + 1]!).toBeLessThan(-20);
  });
});

describe("layout C, the prism", () => {
  const prism = place("C");
  it("puts each role on its level's floor, inside the triangle, near the corner of its top demand", () => {
    if (prism.frame.kind !== "prism") throw new Error("C is the prism");
    const { corners, floors } = prism.frame;
    data.roles.forEach((r, i) => {
      const [x, y, z] = at(prism, i);
      expect(y, r.id).toBe(floors[r.level - 1]!.y);
      // Inside the triangle, give or take the spiral of roles sharing a mix.
      const dist = corners.map((c) => Math.hypot(x - c.x, z - c.z));
      expect(Math.min(...dist), r.id).toBeLessThan(140);
    });
    const near = (id: string, k: number) => {
      const [x, , z] = at(prism, role(id));
      return Math.hypot(x - corners[k]!.x, z - corners[k]!.z);
    };
    expect(near("senior-szoftverfejleszto", 1)).toBeLessThan(near("senior-szoftverfejleszto", 0));
    expect(near("tetofedo", 0)).toBeLessThan(near("tetofedo", 1));
  });

  it("does not stack two roles on one spot", () => {
    const seen = new Set<string>();
    data.roles.forEach((r, i) => {
      const key = at(prism, i)
        .map((c) => (c * 20).toFixed(0))
        .join("/");
      expect(seen.has(key), r.id).toBe(false);
      seen.add(key);
    });
  });
});

describe("layout D, the tetrahedron", () => {
  const tet = place("D");
  it("puts each role inside the tetrahedron, light ones toward the light vertex", () => {
    if (tet.frame.kind !== "tetra") throw new Error("D is the tetrahedron");
    const [, , , light] = tet.frame.vertices.map((v) => v.at);
    const dist = (id: string, v: number[]) =>
      Math.hypot(...at(tet, role(id)).map((c, k) => c - v[k]!));
    // The tenth of the roles that ask the least sit nearer the light vertex than the tenth that ask most.
    const scored = data.roles
      .map((r, i) => ({
        i,
        m: r.demands ? (r.demands[0] + r.demands[1] + r.demands[2]) / 3 : null,
      }))
      .filter((x): x is { i: number; m: number } => x.m !== null)
      .sort((p, q) => p.m - q.m);
    const tenth = Math.floor(scored.length / 10);
    const mean = (xs: { i: number }[]) =>
      xs.reduce((s, x) => s + Math.hypot(...at(tet, x.i).map((c, k) => c - light![k]!)), 0) /
      xs.length;
    expect(mean(scored.slice(0, tenth))).toBeLessThan(mean(scored.slice(-tenth)) - 40);
    for (let i = 0; i < data.roles.length; i++) {
      expect(Math.hypot(...at(tet, i))).toBeLessThan(85 + 8);
    }
  });
  it("shows the level as size and keeps roles apart", () => {
    data.roles.forEach((r, i) => expect(tet.sizes![i]).toBeCloseTo(0.55 + 0.22 * (r.level - 1)));
  });
});

describe("layout F, the nebula", () => {
  const neb = place("F");
  it("is the same every time and keeps level a weak signal", () => {
    expect(place("F").positions).toEqual(neb.positions);
    const lift = [0, 0, 0, 0, 0, 0];
    const count = [0, 0, 0, 0, 0, 0];
    data.roles.forEach((r, i) => {
      lift[r.level]! += neb.positions[i * 3 + 1]!;
      count[r.level]! += 1;
    });
    // The mean height of level 5 is above level 1's, but by less than the cloud is thick.
    const gap = lift[5]! / count[5]! - lift[1]! / count[1]!;
    expect(gap).toBeGreaterThan(5);
    expect(gap).toBeLessThan(16);
  });
  it("puts a pure physical role near the physical attractor", () => {
    if (neb.frame.kind !== "nebula") throw new Error("F is the nebula");
    const [physical] = neb.frame.vertices.map((v) => v.at);
    const i = data.roles.findIndex(
      (r) => r.demands && r.demands[0] > 0.8 && r.demands[1] < 0.2 && r.demands[2] < 0.2,
    );
    expect(i).toBeGreaterThanOrEqual(0);
    const [x, , z] = at(neb, i);
    expect(Math.hypot(x! - physical![0], z! - physical![2])).toBeLessThan(40);
  });
});

describe("every layout", () => {
  it("has finite positions, a camera that has something to show and a size per role", () => {
    for (const id of ["A", "B", "C", "D", "F", "G"] as const) {
      const arrangement = place(id);
      expect(arrangement.positions.every(Number.isFinite)).toBe(true);
      expect(arrangement.home.fit[0]).toBeGreaterThan(0);
      if (arrangement.sizes) expect(arrangement.sizes).toHaveLength(data.roles.length);
    }
  });
});
