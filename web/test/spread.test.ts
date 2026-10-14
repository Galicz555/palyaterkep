import { describe, expect, it } from "vitest";
import { relax, spread } from "../src/lib/spread.ts";

describe("spread", () => {
  it("gives a role alone no offset and a group a spiral no tighter than the spacing", () => {
    const keys = ["a", "b", ...Array.from({ length: 40 }, () => "c")];
    const out = spread(keys, 2);
    expect([out[0], out[1], out[2], out[3]]).toEqual([0, 0, 0, 0]);
    const group = Array.from({ length: 40 }, (_, k) => [out[(k + 2) * 2]!, out[(k + 2) * 2 + 1]!]);
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        expect(
          Math.hypot(group[i]![0]! - group[j]![0]!, group[i]![1]! - group[j]![1]!),
        ).toBeGreaterThan(1.6);
      }
    }
  });

  it("is the same every time", () => {
    const keys = ["x", "x", "y", "x"];
    expect(spread(keys, 1.5)).toEqual(spread(keys, 1.5));
  });
});

describe("relax", () => {
  const crowd = () => {
    const p = new Float32Array(30 * 3);
    for (let i = 0; i < 30; i++) p.set([(i % 5) * 0.2, 7, Math.floor(i / 5) * 0.2], i * 3);
    return p;
  };

  it("pushes points that sit too close apart, along the chosen axes only", () => {
    const p = crowd();
    relax(p, Array(30).fill(0), [0, 2], 1.5, 40);
    for (let i = 0; i < 30; i++) {
      expect(p[i * 3 + 1]).toBe(7);
      for (let j = i + 1; j < 30; j++) {
        const d = Math.hypot(p[i * 3]! - p[j * 3]!, p[i * 3 + 2]! - p[j * 3 + 2]!);
        expect(d).toBeGreaterThan(1.2);
      }
    }
  });

  it("leaves points in different buckets alone, and repeats itself", () => {
    const a = new Float32Array([0, 0, 0, 0.1, 0, 0]);
    relax(a, [0, 1], [0, 2], 1.5);
    expect([...a]).toEqual([0, 0, 0, expect.closeTo(0.1, 5), 0, 0]);
    const b = crowd();
    const c = crowd();
    relax(b, Array(30).fill(0), [0, 2], 1.5);
    relax(c, Array(30).fill(0), [0, 2], 1.5);
    expect(b).toEqual(c);
  });
});
