// Drives the built app (pnpm web:build, pnpm web:start) in headless Chrome: takes the screenshots
// into raw/screens/, walks the list view with the keyboard alone, checks hover, picking, keyboard,
// the branch filter and the CV marks on the map in every layout, and times its frames.
// Usage: node web/scripts/screens.ts [shots|keyboard|layouts|bench|all] [base url]
// CHROME names the browser binary, CHROME_FLAGS adds switches (for example to pick a GPU backend).

import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launch, type Page } from "./chrome.ts";

const mode = process.argv[2] ?? "all";
const base = process.argv[3] ?? "http://127.0.0.1:4173";
const OUT = fileURLToPath(new URL("../../raw/screens/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const flags = (process.env["CHROME_FLAGS"] ?? "").split(" ").filter(Boolean);

const READY =
  "!!document.querySelector('canvas.map-canvas') && !document.querySelector('.stage .note')";
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function open(page: Page, path: string, ready = READY) {
  await page.goto(`${base}${path}`);
  await page.waitFor(ready, `${path} ready`);
  await settle(900);
}

/** The layouts the dropdown offers, in its order. */
const layoutIds = (page: Page) =>
  page.eval<string[]>(
    "[...document.querySelectorAll('select option')].map((o) => o.value).filter((v) => /^[A-Z]$/.test(v))",
  );

async function shots() {
  const browser = await launch(flags);
  const { page } = browser;
  try {
    await page.viewport(1440, 900);
    await open(page, "/?elrendezes=B");
    await page.screenshot(`${OUT}map-whole.png`);
    await open(page, "/?elrendezes=B&cv=it-fejleszto");
    await page.waitFor("!!document.querySelector('.summary')", "CV summary");
    await settle(500);
    await page.screenshot(`${OUT}map-whole-cv.png`);
    await open(page, "/?elrendezes=B&cv=it-fejleszto&ag=it");
    await settle(900);
    await page.screenshot(`${OUT}map-it-cv.png`);
    await open(page, "/?elrendezes=B&cv=it-fejleszto&ag=it&szerep=felhoarchitekt");
    await page.waitFor("!!document.querySelector('.panel .gap')", "gap list in the panel");
    await settle(900);
    await page.screenshot(`${OUT}map-it-selected.png`);
    await open(page, "/?cv=it-fejleszto&nezet=list", "!!document.querySelector('.cv .gap')");
    await page.screenshot(`${OUT}list-desktop-cv.png`);
    await open(
      page,
      "/szerep/senior-szoftverfejleszto?cv=it-fejleszto",
      "!!document.querySelector('.cv')",
    );
    await page.screenshot(`${OUT}role-desktop.png`);

    // One shot per layout, bare and with the demo CV marked, of the map's frame alone.
    for (const id of await layoutIds(page)) {
      await open(page, `/?elrendezes=${id}`);
      await page.screenshotOf(`${OUT}map-layout-${id}.png`, ".frame");
      await open(page, `/?elrendezes=${id}&cv=it-fejleszto`);
      await page.waitFor("!!document.querySelector('.summary')", "CV summary");
      await settle(500);
      await page.screenshotOf(`${OUT}map-layout-${id}-cv.png`, ".frame");
    }

    await page.viewport(390, 844, true);
    await open(page, "/", "!!document.querySelector('.list')");
    await page.screenshot(`${OUT}list-phone.png`);
    await open(page, "/?cv=it-fejleszto", "!!document.querySelector('.cv .gap')");
    await page.eval("document.getElementById('cv-title').scrollIntoView()");
    await settle(300);
    await page.screenshot(`${OUT}list-phone-cv.png`);
    await open(
      page,
      "/szerep/felhoarchitekt?cv=it-fejleszto",
      "!!document.querySelector('.cv .gap')",
    );
    await page.screenshot(`${OUT}role-phone.png`);
  } finally {
    browser.close();
  }
}

/** Tab through the list view until `done` says the focused element is the one wanted. */
async function tabTo(page: Page, done: string, what: string, limit = 80) {
  for (let n = 0; n <= limit; n++) {
    if (n > 0) await page.tab();
    if (
      await page.eval<boolean>(`(() => { const a = document.activeElement; return ${done}; })()`)
    ) {
      return n;
    }
  }
  throw new Error(`keyboard: never reached ${what} in ${limit} tabs`);
}

async function keyboard() {
  const browser = await launch(flags);
  const { page } = browser;
  const problems: string[] = [];
  const check = (ok: boolean, text: string) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${text}`);
    if (!ok) problems.push(text);
  };
  try {
    await page.viewport(1440, 900);
    await open(page, "/?nezet=list", "!!document.querySelector('.list')");
    await page.tab();
    check(
      await page.eval<boolean>(
        "document.activeElement?.textContent?.includes('Ugrás a tartalomra')",
      ),
      "first Tab lands on the skip link",
    );
    const stops: string[] = [];
    for (let n = 0; n < 6; n++) {
      await page.tab();
      stops.push(
        await page.eval<string>("document.activeElement?.textContent?.trim().slice(0, 30)"),
      );
    }
    console.log(`     next stops: ${stops.join(" | ")}`);

    // Jump to a branch with the keyboard: the link opens it.
    const jumps = await tabTo(
      page,
      "a.closest('.jump') && a.textContent.includes('Informatika')",
      "the IT jump link",
    );
    await page.key("Enter", "Enter", 13, "\r");
    await settle(200);
    check(
      await page.eval<boolean>("document.getElementById('ag-it')?.open === true"),
      `Enter on the IT jump link (${jumps} Tabs in) opens the IT branch`,
    );
    const summary = await tabTo(page, "a.tagName === 'SUMMARY'", "a branch summary");
    check(
      await page.eval<boolean>("document.activeElement.textContent.includes('Informatika')"),
      `the next Tabs reach the IT summary (${summary} Tabs)`,
    );
    await page.tab();
    check(
      await page.eval<boolean>(
        "!!document.activeElement.closest('#ag-it') && document.activeElement.tagName === 'A'",
      ),
      "the Tab after it lands on the first role link inside the branch",
    );
    const name = await page.eval<string>("document.activeElement.textContent.trim()");
    await page.key("Enter", "Enter", 13, "\r");
    await page.waitFor("location.pathname.startsWith('/szerep/')", "role page");
    await page.waitFor("!!document.querySelector('h1')", "role heading");
    const heading = await page.eval<string>("document.querySelector('h1').textContent");
    check(
      heading.toLowerCase().startsWith(name.toLowerCase()),
      `Enter opens the role page: ${heading}`,
    );

    // Space on a summary opens and closes its branch.
    await open(page, "/?nezet=list", "!!document.querySelector('.list')");
    await page.eval("document.querySelector('#ag-it summary').focus()");
    await page.key(" ", "Space", 32, " ");
    await settle(200);
    check(
      await page.eval<boolean>("document.getElementById('ag-it').open === true"),
      "Space on a summary opens it",
    );
    await page.key(" ", "Space", 32, " ");
    await settle(200);
    check(
      await page.eval<boolean>("document.getElementById('ag-it').open === false"),
      "Space again closes it",
    );

    // Search narrows the list and opens what matches.
    await open(page, "/?nezet=list", "!!document.querySelector('.list')");
    await page.eval("document.querySelector('input[type=search]').focus()");
    await page.type("szoftverfejl");
    await settle(500);
    const found = await page.eval<string>("document.querySelector('.found').textContent");
    const opened = await page.eval<boolean>("document.getElementById('ag-it')?.open === true");
    check(
      opened && /szűrésben/u.test(found),
      `typing a search narrows and opens the list (${found.trim()})`,
    );
  } finally {
    browser.close();
  }
  if (problems.length > 0) process.exitCode = 1;
}

async function bench() {
  const browser = await launch(flags);
  const { page } = browser;
  try {
    await page.viewport(1440, 900);
    await open(page, "/?teljesitmeny&cv=it-fejleszto");
    const gl = await page.eval<string>(`(() => {
      const g = document.createElement('canvas').getContext('webgl2');
      const e = g.getExtension('WEBGL_debug_renderer_info');
      return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
    })()`);
    console.log(`renderer: ${gl}`);
    for (const id of await layoutIds(page)) {
      await open(page, `/?elrendezes=${id}&teljesitmeny&cv=it-fejleszto`);
      await page.waitFor("typeof globalThis.__terkepBenchmark === 'function'", "benchmark hook");
      const nodes = await page.eval<number>(
        "document.querySelector('.found').textContent.match(/\\d+/)[0] * 1",
      );
      const run = await page.eval<Record<string, number>>("globalThis.__terkepBenchmark(240)");
      console.log(
        `layout ${id}: ${nodes} nodes, frames: ${run["frames"]}, mean ${run["meanMs"]?.toFixed(1)} ms, p95 ${run["p95Ms"]?.toFixed(1)} ms, max ${run["maxMs"]?.toFixed(1)} ms`,
      );
    }
    const start = Date.now();
    await page.goto(`${base}/?teljesitmeny`);
    await page.waitFor(READY, "map");
    console.log(`reload to first frame: ${Date.now() - start} ms`);
  } finally {
    browser.close();
  }
}

/** What the screen shows for a colour: the map's shaders write linear values as they are. */
const shown = (hex: string) =>
  [1, 3, 5]
    .map((k) => parseInt(hex.slice(k, k + 2), 16) / 255)
    .map((c) => Math.round(255 * (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)));

/** How many pixels of a PNG (base64) lie near each colour. */
const countColours = (page: Page, png: string, colours: number[][]) =>
  page.eval<number[]>(`(async () => {
    const img = new Image();
    img.src = "data:image/png;base64,${png}";
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const want = ${JSON.stringify(colours)};
    const n = want.map(() => 0);
    for (let i = 0; i < d.length; i += 4)
      want.forEach((w, k) => {
        if (Math.hypot(d[i] - w[0], d[i + 1] - w[1], d[i + 2] - w[2]) < 70) n[k] += 1;
      });
    return n;
  })()`);

/** In every layout: hover, picking, the keyboard, the branch filter and the CV's marks work. */
async function layouts() {
  const browser = await launch(flags);
  const { page } = browser;
  const problems: string[] = [];
  const check = (ok: boolean, text: string) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${text}`);
    if (!ok) problems.push(text);
  };
  page.on("Runtime.exceptionThrown", (p) => problems.push(`page error: ${JSON.stringify(p)}`));
  const ROLE = "senior-szoftverfejleszto";
  try {
    await page.viewport(1440, 900);
    await open(page, "/?teljesitmeny&cv=it-fejleszto");
    for (const id of await layoutIds(page)) {
      await open(page, `/?elrendezes=${id}&teljesitmeny&cv=it-fejleszto`);
      await page.waitFor("typeof globalThis.__terkepWhere === 'function'", "where hook");
      await page.waitFor("!!document.querySelector('.summary')", "CV summary");
      await settle(600);
      const stage = () =>
        page.eval<{ x: number; y: number; w: number; h: number }>(`(() => {
          const r = document.querySelector('canvas.map-canvas').getBoundingClientRect();
          return { x: r.x, y: r.y, w: r.width, h: r.height };
        })()`);
      /** The held role's place on the page, or null when it is not on the screen. */
      const at = async () => {
        const r = await stage();
        const w = await page.eval<[number, number] | null>(`globalThis.__terkepWhere("${ROLE}")`);
        return w ? { x: r.x + w[0], y: r.y + w[1] } : null;
      };

      // The CV's marks show: held, covered and reachable each colour a good few pixels.
      const picture = await page.screenshotOf(`${OUT}check-layout-${id}.png`, ".stage");
      const [held, covered, reachable] = await countColours(page, picture, [
        shown("#e69f00"),
        shown("#2cc6a0"),
        shown("#56b4e9"),
      ]);
      check(
        held! > 25 && covered! > 25 && reachable! > 25,
        `${id}: the marks show (held ${held}, covered ${covered}, reachable ${reachable} pixels)`,
      );

      const spot = await at();
      check(spot !== null, `${id}: the held role has a place on the screen`);
      if (spot) {
        await page.mouse("mouseMoved", spot.x, spot.y);
        await settle(150);
        const tip = await page.eval<string>("document.querySelector('.tip')?.textContent ?? ''");
        check(
          /senior szoftverfejleszt/iu.test(tip),
          `${id}: hovering shows the tip (${tip.trim().slice(0, 40)})`,
        );
        await page.click(spot.x, spot.y);
        await settle(250);
        const panel = await page.eval<string>(
          "document.querySelector('.panel h2')?.textContent ?? ''",
        );
        check(
          /senior szoftverfejleszt/iu.test(panel),
          `${id}: clicking opens its panel (${panel.trim()})`,
        );
      }

      // The arrow keys move the view.
      await page.eval("document.querySelector('canvas.map-canvas').focus()");
      const before = await page.screenshotOf(`${OUT}check-layout-${id}.png`, ".stage");
      for (let k = 0; k < 4; k++) await page.key("ArrowRight", "ArrowRight", 39);
      await settle(700);
      const after = await page.screenshotOf(`${OUT}check-layout-${id}.png`, ".stage");
      check(before !== after, `${id}: the arrow keys move the view`);

      // The branch filter narrows, and the camera shows that branch.
      await page.eval(`(() => {
        const s = [...document.querySelectorAll('select')].find((e) => e.textContent.includes('Minden ág'));
        s.value = "0";
        s.dispatchEvent(new Event("change", { bubbles: true }));
      })()`);
      await settle(1500);
      const found = await page.eval<string>("document.querySelector('.found').textContent");
      check(/szűrésben/u.test(found), `${id}: the branch filter narrows (${found.trim()})`);
      const spot2 = await at();
      const box = await stage();
      check(
        spot2 !== null &&
          spot2.x > box.x &&
          spot2.x < box.x + box.w &&
          spot2.y > box.y &&
          spot2.y < box.y + box.h,
        `${id}: the camera shows the IT branch's roles`,
      );
    }
  } finally {
    browser.close();
  }
  if (problems.length > 0) process.exitCode = 1;
}

if (mode === "shots" || mode === "all") await shots();
if (mode === "keyboard" || mode === "all") await keyboard();
if (mode === "layouts" || mode === "all") await layouts();
if (mode === "bench" || mode === "all") await bench();
