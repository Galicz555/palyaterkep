// One shot of each layout's map frame, bare and with the demo CV, into a directory of your choice,
// for comparing two builds of the map pixel by pixel.
// Usage: node web/scripts/layout-shots.ts <dir> [base url] [layouts, e.g. BCDFGJK]

import { mkdirSync } from "node:fs";
import { launch } from "./chrome.ts";

const dir = `${process.argv[2] ?? "."}/`;
const base = process.argv[3] ?? "http://127.0.0.1:4185";
const ids = (process.argv[4] ?? "BCDFGJK").split("");
mkdirSync(dir, { recursive: true });
const flags = (process.env["CHROME_FLAGS"] ?? "").split(" ").filter(Boolean);
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

const browser = await launch(flags);
const { page } = browser;
try {
  await page.viewport(1440, 900);
  for (const id of ids) {
    for (const [name, query] of [
      ["", ""],
      ["-cv", "&cv=it-fejleszto"],
    ] as const) {
      await page.goto(`${base}/?elrendezes=${id}${query}`);
      await page.waitFor("!!document.querySelector('canvas.map-canvas')", "map");
      if (query) await page.waitFor("!!document.querySelector('.summary')", "CV summary");
      await settle(1500);
      await page.screenshotOf(`${dir}layout-${id}${name}.png`, ".frame");
    }
  }
} finally {
  browser.close();
}
