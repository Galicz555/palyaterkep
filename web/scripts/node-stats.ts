// How big the nodes look: for each layout, two shots of the map's stage (names hidden), with the
// nodes and without, so that only the light the nodes add is measured: the median footprint of an
// isolated node (connected pixels they light, clusters left out) and the share of the frame they
// light above a low threshold. Nodes should read as points of light.
// Usage: node web/scripts/node-stats.ts [layouts, e.g. AC] [base url] [file prefix]

import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launch } from "./chrome.ts";

const ids = (process.argv[2] ?? "AC").split("");
const base = process.argv[3] ?? "http://127.0.0.1:4186";
const prefix = process.argv[4] ?? "stats-";
const OUT = fileURLToPath(new URL("../../raw/screens/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const flags = (process.env["CHROME_FLAGS"] ?? "").split(" ").filter(Boolean);
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How much brighter (largest channel, 0 to 255) than without the nodes a pixel is when it counts as lit. */
const LIT = 24;
/** A lit patch wider or taller than this is a cluster or a guide, not one node. */
const ISOLATED = 24;

const browser = await launch(flags);
const { page } = browser;
try {
  await page.viewport(1440, 900);
  for (const id of ids) {
    await page.goto(`${base}/?elrendezes=${id}&teljesitmeny`);
    await page.waitFor(
      "!!document.querySelector('canvas.map-canvas') && !document.querySelector('.stage .note')",
      "map",
    );
    await settle(1500);
    await page.eval("document.querySelector('.labels').style.display = 'none'");
    const png = await page.screenshotOf(`${OUT}${prefix}${id}.png`, ".stage");
    await page.eval("globalThis.__terkepNodes(false)");
    await settle(400);
    const bare = await page.screenshotOf(`${OUT}${prefix}${id}-frame.png`, ".stage");
    const stats = await page.eval<Record<string, number>>(`(async () => {
      const pixels = async (png) => {
        const img = new Image();
        img.src = "data:image/png;base64," + png;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        const g = c.getContext("2d");
        g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, c.width, c.height);
      };
      const full = await pixels("${png}");
      const frame = await pixels("${bare}");
      const d = full.data, f = frame.data;
      const W = full.width, H = full.height;
      const lit = new Uint8Array(W * H);
      let n = 0;
      const top = (a, p) => Math.max(a[p*4], a[p*4+1], a[p*4+2]);
      for (let p = 0; p < W * H; p++)
        if (top(d, p) - top(f, p) > ${LIT}) { lit[p] = 1; n++; }
      const seen = new Uint8Array(W * H);
      const areas = [];
      const stack = [];
      for (let p0 = 0; p0 < W * H; p0++) {
        if (!lit[p0] || seen[p0]) continue;
        let area = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
        stack.push(p0); seen[p0] = 1;
        while (stack.length) {
          const p = stack.pop();
          const x = p % W, y = (p - x) / W;
          area++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const X = x + dx, Y = y + dy;
            if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
            const q = Y * W + X;
            if (lit[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
          }
        }
        if (x1 - x0 < ${ISOLATED} && y1 - y0 < ${ISOLATED}) areas.push(area);
      }
      areas.sort((a, b) => a - b);
      return {
        width: W, height: H,
        isolated: areas.length,
        medianFootprint: areas[Math.floor(areas.length / 2)] ?? 0,
        p90Footprint: areas[Math.floor(areas.length * 0.9)] ?? 0,
        litShare: n / (W * H),
        litPerNode: n / Number(document.querySelector('canvas.map-canvas').getAttribute('aria-label').match(/Pályatérkép: (\\d+) szerep/)[1]),
      };
    })()`);
    console.log(
      `layout ${id}: ${stats["width"]}x${stats["height"]}, isolated nodes ${stats["isolated"]}, median footprint ${stats["medianFootprint"]} px, p90 ${stats["p90Footprint"]} px, lit share ${((stats["litShare"] ?? 0) * 100).toFixed(1)}%, lit pixels per role ${(stats["litPerNode"] ?? 0).toFixed(1)}`,
    );
  }
} finally {
  browser.close();
}
