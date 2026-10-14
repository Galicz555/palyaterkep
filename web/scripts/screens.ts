// Drives the built app (pnpm web:build, pnpm web:start) in headless Chrome: takes the screenshots
// into raw/screens/, walks the list view with the keyboard alone, and times frames of the map.
// Usage: node web/scripts/screens.ts [shots|keyboard|bench|all] [base url]
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

async function shots() {
  const browser = await launch(flags);
  const { page } = browser;
  try {
    await page.viewport(1440, 900);
    await open(page, "/");
    await page.screenshot(`${OUT}map-whole.png`);
    await open(page, "/?cv=it-fejleszto");
    await page.waitFor("!!document.querySelector('.summary')", "CV summary");
    await settle(500);
    await page.screenshot(`${OUT}map-whole-cv.png`);
    await open(page, "/?cv=it-fejleszto&ag=it");
    await settle(900);
    await page.screenshot(`${OUT}map-it-cv.png`);
    await open(page, "/?cv=it-fejleszto&ag=it&szerep=felhoarchitekt");
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
    await page.waitFor("typeof globalThis.__terkepBenchmark === 'function'", "benchmark hook");
    const gl = await page.eval<string>(`(() => {
      const g = document.createElement('canvas').getContext('webgl2');
      const e = g.getExtension('WEBGL_debug_renderer_info');
      return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER);
    })()`);
    const nodes = await page.eval<number>(
      "document.querySelector('.found').textContent.match(/\\d+/)[0] * 1",
    );
    const run = await page.eval<Record<string, number>>("globalThis.__terkepBenchmark(240)");
    console.log(`renderer: ${gl}`);
    console.log(`nodes: ${nodes}`);
    console.log(
      `frames: ${run["frames"]}, mean ${run["meanMs"]?.toFixed(1)} ms, p95 ${run["p95Ms"]?.toFixed(1)} ms, max ${run["maxMs"]?.toFixed(1)} ms`,
    );
    const start = Date.now();
    await page.goto(`${base}/?teljesitmeny`);
    await page.waitFor(READY, "map");
    console.log(`reload to first frame: ${Date.now() - start} ms`);
  } finally {
    browser.close();
  }
}

if (mode === "shots" || mode === "all") await shots();
if (mode === "keyboard" || mode === "all") await keyboard();
if (mode === "bench" || mode === "all") await bench();
