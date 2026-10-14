// Five shots of layout A (bare, the demo CV marked, zoomed on the IT branch, a role picked, and the CV wheeled in) into
// raw/screens/<prefix>-*.png, and the number of label boxes that overlap in each.
// Usage: node web/scripts/sphere-shots.ts <prefix> [base url]

import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launch, type Page } from "./chrome.ts";

const prefix = process.argv[2] ?? "A2";
const base = process.argv[3] ?? "http://127.0.0.1:4185";
const OUT = fileURLToPath(new URL("../../raw/screens/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const flags = (process.env["CHROME_FLAGS"] ?? "").split(" ").filter(Boolean);
const READY =
  "!!document.querySelector('canvas.map-canvas') && !document.querySelector('.stage .note')";
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function open(page: Page, path: string, ready = READY) {
  await page.goto(`${base}${path}`);
  await page.waitFor(ready, `${path} ready`);
  await settle(1200);
}

/**
 * The visible map labels (a name with some opacity) that collide: two boxes closer than 1 px, or a
 * role's name lying over another marked role's dot (a state label starts 12 px right of its dot).
 */
const collisions = (page: Page) =>
  page.eval<string[]>(`(() => {
    const boxes = [...document.querySelectorAll('.labels .lbl')]
      .filter((e) => !e.hidden && Number(getComputedStyle(e).opacity) > 0.05)
      .map((e) => ({ e, t: e.textContent.trim(), r: e.getBoundingClientRect() }))
      .filter((b) => b.r.width > 0);
    const out = [];
    const pad = 1;
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r, b = boxes[j].r;
        if (a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad)
          out.push(boxes[i].t + " / " + boxes[j].t);
      }
    const dots = boxes
      .filter((b) => b.e.classList.contains("lbl-state") || b.e.classList.contains("lbl-pick"))
      .map((b) => ({ t: b.t, x: b.r.left - (b.e.classList.contains("lbl-pick") ? 14 : 12), y: b.r.top + b.r.height / 2 }));
    for (const b of boxes)
      for (const d of dots)
        if (d.t !== b.t && d.x > b.r.left - 4 && d.x < b.r.right + 4 && d.y > b.r.top - 4 && d.y < b.r.bottom + 4)
          out.push(b.t + " over the dot of " + d.t);
    return out;
  })()`);

const browser = await launch(flags);
const { page } = browser;
try {
  await page.viewport(1440, 900);
  const shots: [string, string][] = [
    ["bare", "/?elrendezes=A"],
    ["cv", "/?elrendezes=A&cv=it-fejleszto"],
    ["it", "/?elrendezes=A&cv=it-fejleszto&ag=it"],
    ["pick", "/?elrendezes=A&cv=it-fejleszto&ag=it&szerep=felhoarchitekt"],
    // The whole sphere with the CV, wheeled a little closer: the first view that names the marks.
    ["mid", "/?elrendezes=A&cv=it-fejleszto"],
  ];
  for (const [name, path] of shots) {
    await open(page, path);
    if (path.includes("cv=")) {
      await page.waitFor("!!document.querySelector('.summary')", "CV summary");
      await settle(700);
    }
    if (name === "mid") {
      for (let k = 0; k < 4; k++) {
        await page.send("Input.dispatchMouseEvent", {
          type: "mouseWheel",
          x: 520,
          y: 250,
          deltaX: 0,
          deltaY: -120,
        });
        await settle(250);
      }
      await settle(800);
    }
    await page.screenshotOf(`${OUT}${prefix}-${name}.png`, ".frame");
    const clashes = await collisions(page);
    const named = await page.eval<number>(
      "[...document.querySelectorAll('.labels .lbl-state')].filter((e) => Number(getComputedStyle(e).opacity) > 0.05).length",
    );
    console.log(
      `${name}: ${named} marked roles named, ${clashes.length} label overlaps${clashes.length ? `: ${clashes.join("; ")}` : ""}`,
    );
  }
} finally {
  browser.close();
}
