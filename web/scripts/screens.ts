// Drives the built app (pnpm web:build, pnpm web:start) in headless Chrome: takes the screenshots
// into raw/screens/, walks the list page with the keyboard alone, checks hover, picking, keyboard,
// the branch filter and the CV marks on the map in every layout, how the pages hang together
// (the CV result carries from page to page, a phone is offered the list), and times its frames.
// Usage: node web/scripts/screens.ts [shots|keyboard|layouts|pages|bench|all] [base url]
// CHROME names the browser binary, CHROME_FLAGS adds switches (for example to pick a GPU backend),
// SHOT_PREFIX goes in front of every screenshot's name.

import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launch, type Page } from "./chrome.ts";

const mode = process.argv[2] ?? "all";
const base = process.argv[3] ?? "http://127.0.0.1:4173";
const OUT = fileURLToPath(new URL("../../raw/screens/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const flags = (process.env["CHROME_FLAGS"] ?? "").split(" ").filter(Boolean);
const SHOTS = `${OUT}${process.env["SHOT_PREFIX"] ?? ""}`;

const READY =
  "!!document.querySelector('canvas.map-canvas') && !document.querySelector('.stage .note')";
const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** The CV chip on the map: there once a result is shown. */
const CV_CHIP = "!!document.querySelector('.chip a')";

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
    await page.screenshot(`${SHOTS}map-whole.png`);
    await open(page, "/?elrendezes=B&cv=it-fejleszto");
    await page.waitFor(CV_CHIP, "CV chip");
    await settle(500);
    await page.screenshot(`${SHOTS}map-whole-cv.png`);
    await open(page, "/?elrendezes=B&cv=it-fejleszto&ag=it");
    await page.waitFor(CV_CHIP, "CV chip");
    await settle(900);
    await page.screenshot(`${SHOTS}map-it-cv.png`);
    await open(page, "/?elrendezes=B&cv=it-fejleszto&ag=it&szerep=felhoarchitekt");
    await page.waitFor("!!document.querySelector('.panel')", "role card");
    await settle(900);
    await page.screenshot(`${SHOTS}map-it-selected.png`);
    await open(page, "/lista?cv=it-fejleszto", "!!document.querySelector('.cvline')");
    await page.screenshot(`${SHOTS}list-desktop-cv.png`);
    await open(page, "/oneletrajz", "!!document.querySelector('.upload')");
    await page.screenshot(`${SHOTS}cv-desktop.png`);
    await open(page, "/oneletrajz?cv=it-fejleszto", "!!document.querySelector('.cv .gap')");
    await page.screenshot(`${SHOTS}cv-desktop-result.png`);
    await open(
      page,
      "/szerep/senior-szoftverfejleszto?cv=it-fejleszto",
      "!!document.querySelector('.cv')",
    );
    await page.screenshot(`${SHOTS}role-desktop.png`);

    // One shot per layout, bare and with the demo CV marked: the whole screen, overlays and all.
    await open(page, "/");
    for (const id of await layoutIds(page)) {
      await open(page, `/?elrendezes=${id}`);
      await page.screenshot(`${SHOTS}map-layout-${id}.png`);
      await open(page, `/?elrendezes=${id}&cv=it-fejleszto`);
      await page.waitFor(CV_CHIP, "CV chip");
      await settle(500);
      await page.screenshot(`${SHOTS}map-layout-${id}-cv.png`);
    }

    await page.viewport(390, 844, true);
    await open(page, "/", "!!document.querySelector('.gate')");
    await page.screenshot(`${SHOTS}map-phone.png`);
    await open(page, "/lista", "!!document.querySelector('.list')");
    await page.screenshot(`${SHOTS}list-phone.png`);
    await open(page, "/oneletrajz?cv=it-fejleszto", "!!document.querySelector('.cv .gap')");
    await page.screenshot(`${SHOTS}cv-phone-result.png`);
    await open(page, "/oneletrajz", "!!document.querySelector('.upload')");
    await page.screenshot(`${SHOTS}cv-phone.png`);
    await open(
      page,
      "/szerep/felhoarchitekt?cv=it-fejleszto",
      "!!document.querySelector('.cv .gap')",
    );
    await page.screenshot(`${SHOTS}role-phone.png`);
  } finally {
    browser.close();
  }
}

/** Tab through the list page until `done` says the focused element is the one wanted. */
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
    await open(page, "/lista", "!!document.querySelector('.list')");
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
    await open(page, "/lista", "!!document.querySelector('.list')");
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
    await open(page, "/lista", "!!document.querySelector('.list')");
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
        "document.querySelector('canvas.map-canvas').getAttribute('aria-label').match(/\\d+/)[0] * 1",
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

/**
 * Near-white pixels of a PNG (base64) along a cross through each point, `half` pixels each way,
 * one count per point: a star's body and spikes, not its neighbours' (a box would saturate).
 */
const whiteAround = (page: Page, png: string, points: [number, number][], half: number) =>
  page.eval<number[]>(`(async () => {
    const img = new Image();
    img.src = "data:image/png;base64,${png}";
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0);
    const white = (x, y) => {
      const d = g.getImageData(x, y, 1, 1).data;
      return Math.min(d[0], d[1], d[2]) > 190 ? 1 : 0;
    };
    return ${JSON.stringify(points)}.map(([x, y]) => {
      let n = 0;
      for (let k = -${half}; k <= ${half}; k++) {
        const px = Math.round(x) + k, py = Math.round(y) + k;
        if (px >= 0 && px < c.width) n += white(px, Math.round(y));
        if (py >= 0 && py < c.height) n += white(Math.round(x), py);
      }
      return n;
    });
  })()`);

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

/** The roles of each state in the demo CV, for the check that the three whites differ. */
const demo = JSON.parse(
  readFileSync(new URL("../static/fixtures/it-fejleszto.json", import.meta.url), "utf8"),
) as {
  held: { role: string }[];
  covered: { role: string }[];
  reachable: { role: string }[];
};
const heldIds = demo.held.map((h) => h.role);
const coveredIds = demo.covered.map((h) => h.role).filter((r) => !heldIds.includes(r));
const reachableIds = demo.reachable
  .map((h) => h.role)
  .filter((r) => !heldIds.includes(r) && !coveredIds.includes(r));

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
      await page.waitFor(CV_CHIP, "CV chip");
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

      // The CV's marks show as white, and the three states differ: around a held role more
      // white is lit than around a covered one, and around a covered one more than around a
      // reachable one (the median of the ones that are on the screen; names hidden).
      await page.eval("document.querySelector('.labels').style.display = 'none'");
      const picture = await page.screenshotOf(`${OUT}check-layout-${id}.png`, ".stage");
      await page.eval("document.querySelector('.labels').style.display = ''");
      const box0 = await stage();
      const whites: Record<string, number> = {};
      for (const [kind, ids] of [
        ["held", heldIds],
        ["covered", coveredIds],
        ["reachable", reachableIds],
      ] as const) {
        const at2 = await page.eval<([number, number] | null)[]>(
          `${JSON.stringify(ids)}.map((id) => globalThis.__terkepWhere(id))`,
        );
        const inside = at2.filter(
          (w): w is [number, number] =>
            w !== null && w[0] > 20 && w[0] < box0.w - 20 && w[1] > 20 && w[1] < box0.h - 20,
        );
        whites[kind] =
          inside.length === 0 ? 0 : median(await whiteAround(page, picture, inside, 24));
      }
      check(
        whites["held"]! > whites["covered"]! && whites["covered"]! > whites["reachable"]!,
        `${id}: the three white states differ (white pixels on a cross through held ${whites["held"]}, covered ${whites["covered"]}, reachable ${whites["reachable"]})`,
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

      // B has a second control, for the demand that gives the height; it writes the address.
      const hasAxis = await page.eval<boolean>("!!document.querySelector('.axis')");
      check(hasAxis === (id === "B"), `${id}: the height control shows in B only`);
      if (hasAxis) {
        await page.eval(
          "[...document.querySelectorAll('.axis button')].find((b) => b.textContent.includes('Szellemi')).click()",
        );
        await settle(300);
        check(
          await page.eval<boolean>("location.search.includes('tengely=szellemi')"),
          `${id}: choosing a demand for the height writes it to the address`,
        );
      }

      // A link that names a branch shows it: the chip says so, and the camera is on its roles.
      await open(page, `/?elrendezes=${id}&teljesitmeny&cv=it-fejleszto&ag=it`);
      await page.waitFor("typeof globalThis.__terkepWhere === 'function'", "where hook");
      await page.waitFor(CV_CHIP, "CV chip");
      await settle(1500);
      const chip = await page.eval<string>("document.querySelector('.chip')?.textContent ?? ''");
      check(
        /Informatika/u.test(chip),
        `${id}: the branch from the address is shown (${chip.trim()})`,
      );
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

/** How the pages hang together: what is on each, and a CV result carried from page to page. */
async function pages() {
  const browser = await launch(flags);
  const { page } = browser;
  const problems: string[] = [];
  const check = (ok: boolean, text: string) => {
    console.log(`${ok ? "ok  " : "FAIL"} ${text}`);
    if (!ok) problems.push(text);
  };
  page.on("Runtime.exceptionThrown", (p) => problems.push(`page error: ${JSON.stringify(p)}`));
  try {
    await page.viewport(1440, 900);
    await open(page, "/");
    check(
      await page.eval<boolean>(
        "!document.querySelector('.list, form, footer, textarea, input[type=search]') && document.documentElement.scrollHeight <= innerHeight",
      ),
      "the map page is the map alone: no list, form or footer, and it does not scroll",
    );
    check(
      await page.eval<boolean>(
        "!!document.querySelector('.legend') && !!document.querySelector('.zoom') && !!document.querySelector('nav a[href=\"/lista\"]')",
      ),
      "the map page has its legend, zoom buttons and nav",
    );

    // A result read on the CV page shows on the map and in the list without a reload and
    // without anything written to storage.
    await open(page, "/oneletrajz?cv=it-fejleszto", "!!document.querySelector('.summary')");
    await page.eval("window.__sameDocument = true");
    await page.eval("document.querySelector('nav a[href=\"/\"]').click()");
    await page.waitFor(READY, "map after navigating");
    await page.waitFor(CV_CHIP, "CV chip after navigating");
    check(
      await page.eval<boolean>("window.__sameDocument === true"),
      "the result went to the map by client navigation, not a reload",
    );
    check(
      await page.eval<boolean>("/betöltött/u.test(document.querySelector('.chip a').textContent)"),
      "the result is on the map",
    );
    await page.eval("document.querySelector('nav a[href=\"/lista\"]').click()");
    await page.waitFor("!!document.querySelector('.cvline')", "result line on the list");
    check(true, "the result is on the list");
    check(
      await page.eval<boolean>(
        "localStorage.length === 0 && Object.keys(sessionStorage).every((k) => k.startsWith('sveltekit:')) && !JSON.stringify(sessionStorage).includes('szoftver')",
      ),
      "nothing of the result is stored in the browser (the router's own scroll notes aside)",
    );

    // A phone is offered the list, and can still ask for the map.
    await page.viewport(390, 844, true);
    await open(page, "/", "!!document.querySelector('.gate')");
    check(
      await page.eval<boolean>(
        "!!document.querySelector('.gate a[href=\"/lista\"]') && !document.querySelector('canvas.map-canvas')",
      ),
      "a phone gets the choice, and the renderer is not started",
    );
    await page.eval("document.querySelector('.gate button').click()");
    await page.waitFor(READY, "map on request");
    check(true, "the map opens on request");
  } finally {
    browser.close();
  }
  if (problems.length > 0) process.exitCode = 1;
}

if (mode === "shots" || mode === "all") await shots();
if (mode === "keyboard" || mode === "all") await keyboard();
if (mode === "layouts" || mode === "all") await layouts();
if (mode === "pages" || mode === "all") await pages();
if (mode === "bench" || mode === "all") await bench();
