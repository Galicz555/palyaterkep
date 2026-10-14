import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapData, roleDetail, roleIds, skillLabels } from "../src/lib/server/data.ts";

// What every prerendered role page is built from. It needs ESCO (pnpm esco); without it the
// tests are skipped, as the vault lint skips its ESCO checks.
const esco = existsSync(new URL("../../raw/esco/esco.json", import.meta.url));

describe.skipIf(!esco)("role pages", () => {
  it("has a page for every role, and every page's links lead to a role", () => {
    const ids = new Set(roleIds());
    expect(ids.size).toBe(mapData().roles.length);
    for (const id of ids) {
      const role = roleDetail(id);
      expect(role, id).toBeDefined();
      expect(role!.skills.length, id).toBeGreaterThan(0);
      for (const link of [...role!.lateral, ...role!.progression, ...role!.previous]) {
        expect(ids.has(link.id), `${id} → ${link.id}`).toBe(true);
      }
    }
  });

  it("names every skill a role needs in Hungarian", () => {
    const labels = skillLabels();
    for (const id of roleIds()) {
      for (const skill of roleDetail(id)!.skills) {
        expect(skill.label, `${id}: ${skill.key}`).not.toBe("");
        expect(labels[skill.key]).toBe(skill.label);
      }
    }
  });

  it("knows no role it does not have", () => {
    expect(roleDetail("nincs-ilyen-szerep")).toBeUndefined();
  });
});
