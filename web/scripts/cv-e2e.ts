// End to end for giving the app a CV, in headless Chrome against the built app: a PDF through the
// upload control and the same CV pasted, each read by the real route; a PDF without a text layer,
// a Word file and a text that is too long, each refused with its Hungarian message. Screenshots go
// to raw/screens/, timings and checks to stdout.
//
// The CV is the made-up one in sample-cv.ts. Reading goes to whatever model the server is set up
// with, so start it for the subscription, bound to localhost, with room for repeated runs:
//   CV_MODEL=subscription HOST=127.0.0.1 PORT=4173 CV_PER_CLIENT_PER_HOUR=30 pnpm web:start
// Usage: node web/scripts/cv-e2e.ts [base url] [real|canned]
//   real    only the two readings by the model (about 90 s)
//   canned  only what needs no model: refusals in the page and the route's answers, canned

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MESSAGES as SERVER } from "../src/lib/server/cv-route.ts";
import { MESSAGES as CLIENT } from "../src/lib/read.ts";
import { launch, type Page } from "./chrome.ts";
import { SAMPLE_CV } from "./sample-cv.ts";

const base = process.argv[2] ?? "http://127.0.0.1:4173";
const only = process.argv[3];
const OUT = fileURLToPath(new URL("../../raw/screens/", import.meta.url));
mkdirSync(OUT, { recursive: true });
const flags = (process.env["CHROME_FLAGS"] ?? "").split(" ").filter(Boolean);
const work = mkdtempSync(path.join(tmpdir(), "palyaterkep-e2e-"));

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAP_READY =
  "!!document.querySelector('canvas.map-canvas') && !document.querySelector('.stage .note')";
const SUMMARY_SHOWN =
  "[...document.querySelectorAll('.summary')].some((el) => el.offsetParent !== null)";

const problems: string[] = [];
const check = (ok: boolean, text: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${text}`);
  if (!ok) problems.push(text);
};
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

const HEADINGS = ["Összegzés", "Munkatapasztalat", "Készségek", "Tanulmányok"];
const escapeHtml = (text: string) =>
  text.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

/** The sample CV as a page that prints like a CV: a heading, section headings, bullets. */
function cvHtml(): string {
  const body = SAMPLE_CV.trim()
    .split("\n")
    .map((line, i) => {
      const text = escapeHtml(line);
      if (!line.trim()) return "";
      if (i === 0) return `<h1>${text}</h1>`;
      if (line.startsWith("- ")) return `<li>${escapeHtml(line.slice(2))}</li>`;
      if (HEADINGS.includes(line)) return `<h2>${text}</h2>`;
      return `<p>${text}</p>`;
    })
    .join("\n")
    .replace(/(<li>.*<\/li>\n?)+/gu, (list) => `<ul>${list}</ul>`);
  return `<!doctype html><meta charset="utf-8"><style>
    @page { size: A4; margin: 18mm }
    body { font: 11pt/1.4 sans-serif; color: #111 }
    h1 { font-size: 22pt; margin: 0 0 4pt } h2 { font-size: 13pt; margin: 14pt 0 4pt; border-bottom: 1px solid #999 }
    p { margin: 2pt 0 } ul { margin: 2pt 0 8pt }
  </style>${body}`;
}

async function printed(page: Page, html: string): Promise<Buffer> {
  await page.goto(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return page.pdf();
}

/** A PDF that holds a picture of the CV and no text at all, as a scan does. */
async function scannedPdf(page: Page): Promise<Buffer> {
  await page.goto("about:blank");
  const png = await page.eval<string>(`(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 800; canvas.height = 600;
    const c = canvas.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, 800, 600);
    c.fillStyle = '#000'; c.font = '28px sans-serif';
    ${JSON.stringify(SAMPLE_CV.split("\n").slice(0, 12))}.forEach((line, i) => c.fillText(line, 20, 40 + i * 40));
    return canvas.toDataURL('image/png');
  })()`);
  return printed(page, `<!doctype html><img src="${png}" style="width:100%">`);
}

type Answer = ReturnType<Parameters<Page["intercept"]>[1]>;

interface Request {
  method: string;
  url: string;
  postData?: string;
}

/** Open the app and wait for the upload form. */
async function openApp(page: Page) {
  await page.goto(`${base}/`);
  await page.waitFor("!!document.querySelector('.upload textarea')", "the upload form");
  await page.eval("window.scrollTo(0, 0)");
  await settle(300);
}

const problemText = (page: Page) =>
  page.eval<string>("document.querySelector('.upload .problem')?.textContent?.trim() ?? ''");

/** Click Beolvasás and wait for the result; returns how long it took. */
async function read(page: Page, shot: string): Promise<number> {
  const start = Date.now();
  await page.eval("document.querySelector('.upload button[type=submit]').click()");
  await page.waitFor("!!document.querySelector('.upload .elapsed')", "the reading state", 5_000);
  await settle(4_000);
  await page.screenshot(`${OUT}${shot}-reading.png`);
  await page.waitFor(
    `${SUMMARY_SHOWN} || !!document.querySelector('.upload .problem')`,
    "a result or an error",
    6 * 60_000,
  );
  return Date.now() - start;
}

async function showResult(page: Page, prefix: string) {
  await page.waitFor(MAP_READY, "the map");
  await settle(1_200);
  await page.screenshot(`${OUT}${prefix}-map.png`);
  const summary = await page.eval<string>(
    "[...document.querySelectorAll('.summary')].find((el) => el.offsetParent)?.querySelector('p')?.textContent.replace(/\\s+/g, ' ').trim()",
  );
  console.log(`     summary: ${summary}`);
  const [held, covered, reachable] = (summary.match(/\d+/gu) ?? []).map(Number);
  check((held ?? 0) > 0, `${prefix}: held roles are lit (${held})`);
  check(
    (covered ?? 0) + (reachable ?? 0) > 0,
    `${prefix}: covered ${covered}, reachable ${reachable}`,
  );
  const focused = await page.eval<boolean>(
    "document.activeElement?.classList.contains('summary') === true",
  );
  check(focused, `${prefix}: focus moved to the result summary`);

  await page.eval(
    "[...document.querySelectorAll('.modes button')].find((b) => b.textContent.trim() === 'Lista').click()",
  );
  await page.waitFor("!!document.querySelector('.cv .gap')", "gap lists in the list view");
  await page.eval("document.getElementById('cv-title').scrollIntoView()");
  await settle(500);
  await page.screenshot(`${OUT}${prefix}-list.png`);
  await page.eval("document.querySelector('.cv .gap').scrollIntoView({ block: 'center' })");
  await settle(300);
  await page.screenshot(`${OUT}${prefix}-list-gaps.png`);
  const gaps = await page.eval<number>("document.querySelectorAll('.cv .gap').length");
  const named = await page.eval<number>(
    "[...document.querySelectorAll('.cv .gap li')].filter((li) => li.textContent.includes('ismeretlen')).length",
  );
  check(gaps > 0, `${prefix}: ${gaps} gap lists in the list, ${named} skills without a name`);
}

async function main() {
  const browser = await launch(flags);
  const { page } = browser;
  const requests: Request[] = [];
  try {
    await page.send("Network.enable");
    page.on("Network.requestWillBeSent", (params) => {
      requests.push((params as { request: Request }).request);
    });

    // The files the person would have: made by printing, so the PDF has a real text layer.
    const cvPdf = path.join(work, "önéletrajz-minta.pdf");
    writeFileSync(cvPdf, await printed(page, cvHtml()));
    const scanPdf = path.join(work, "beszkennelt.pdf");
    writeFileSync(scanPdf, await scannedPdf(page));
    const docx = path.join(work, "oneletrajz.docx");
    writeFileSync(docx, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]));

    await page.viewport(1440, 900);
    await openApp(page);
    await page.screenshot(`${OUT}cv-form.png`);
    const resources = () =>
      page.eval<string[]>("performance.getEntriesByType('resource').map((e) => e.name)");
    const atStart = await resources();
    check(!atStart.some((n) => /pdf/iu.test(n)), "pdf.js is not loaded with the page");

    // The keyboard reaches the file input, the text box and the button, in that order.
    await page.eval("document.querySelector('.upload input[type=file]').focus()");
    await page.tab();
    check(
      await page.eval<boolean>("document.activeElement?.tagName === 'TEXTAREA'"),
      "Tab from the file input reaches the text box",
    );
    await page.tab();
    check(
      await page.eval<boolean>("document.activeElement?.type === 'submit'"),
      "the next Tab reaches the Beolvasás button",
    );

    if (only !== "canned") {
      // 1. A PDF through the upload control.
      const extractStart = Date.now();
      await page.setFiles("input[type=file]", [cvPdf]);
      await page.waitFor(
        "document.querySelector('.upload textarea').value.length > 500",
        "the PDF text in the text box",
        30_000,
      );
      const extractMs = Date.now() - extractStart;
      check(
        (await resources()).some((n) => /pdf\.worker/iu.test(n)),
        "pdf.js and its worker load when a file is chosen",
      );
      const extracted = await page.eval<string>("document.querySelector('.upload textarea').value");
      check(
        extracted.includes("Senior szoftverfejlesztő") &&
          extracted.includes("2021. március – jelenleg"),
        `PDF text extracted in the browser in ${seconds(extractMs)} (${extracted.length} characters)`,
      );
      check(
        /ő|ű/u.test(extracted) && !extracted.includes("�"),
        "Hungarian long vowels survive the extraction",
      );
      await page.screenshot(`${OUT}cv-pdf-extracted.png`);
      const pdfMs = await read(page, "cv-pdf");
      check((await problemText(page)) === "", `PDF read in ${seconds(pdfMs)} (click to result)`);
      await showResult(page, "cv-pdf");

      // Storage and requests: nothing kept, only text sent.
      const stored = await page.eval<string>(
        "JSON.stringify([localStorage.length, sessionStorage.length, document.cookie, location.href])",
      );
      check(
        stored === JSON.stringify([0, 0, "", `${base}/`]),
        `no browser storage, cookie or address holds anything (${stored})`,
      );
      const posts = requests.filter((r) => r.method === "POST");
      check(
        posts.length === 1 && posts[0]!.url.endsWith("/api/cv"),
        `one POST so far, to /api/cv (${posts.map((r) => r.url).join(", ")})`,
      );
      const sent = JSON.parse(posts[0]?.postData ?? "{}") as Record<string, unknown>;
      check(
        Object.keys(sent).join() === "text" && typeof sent["text"] === "string",
        "the body is {text} only, plain text, not the file",
      );
      check(
        !requests.some((r) => /pdf|\.docx/iu.test(r.postData ?? "") && r.method === "POST"),
        "no PDF bytes were sent",
      );

      // Clearing brings the form back, focus on its heading.
      await page.eval(
        "[...document.querySelectorAll('button')].find((b) => b.textContent.includes('eltüntetése')).click()",
      );
      await page.waitFor("!!document.querySelector('.upload')", "the form back");
      check(
        await page.eval<boolean>("document.activeElement?.id === 'cv-upload-title'"),
        "clearing the result puts focus on the form heading",
      );

      // 2. The same CV pasted.
      await openApp(page);
      await page.eval("document.querySelector('.upload textarea').focus()");
      await page.type(SAMPLE_CV);
      await settle(200);
      const pasteMs = await read(page, "cv-paste");
      check(
        (await problemText(page)) === "",
        `pasted text read in ${seconds(pasteMs)} (click to result)`,
      );
      await showResult(page, "cv-paste");
    }

    if (only !== "real") {
      // 3. A PDF without a text layer.
      await openApp(page);
      await page.setFiles("input[type=file]", [scanPdf]);
      await page.waitFor("!!document.querySelector('.upload .problem')", "the scanned-PDF message");
      const scanned = await problemText(page);
      check(/nincs szöveg/u.test(scanned) && /Másold be/u.test(scanned), `scanned PDF: ${scanned}`);
      check(
        (await page.eval<number>("document.querySelector('.upload textarea').value.length")) === 0,
        "scanned PDF: the text box stays empty",
      );
      await page.screenshot(`${OUT}cv-scanned.png`);

      // 4. A Word file.
      await page.setFiles("input[type=file]", [docx]);
      await page.waitFor(
        "/DOCX/u.test(document.querySelector('.upload .problem')?.textContent ?? '')",
        "the DOCX message",
      );
      const word = await problemText(page);
      check(/PDF-ként/u.test(word), `Word file: ${word}`);

      // 5. A text that is too long: refused in the page, nothing sent.
      const before = requests.filter((r) => r.method === "POST").length;
      await openApp(page);
      await page.eval("document.querySelector('.upload textarea').focus()");
      await page.type(SAMPLE_CV.repeat(Math.ceil(30_500 / SAMPLE_CV.length)));
      await page.eval("document.querySelector('.upload button[type=submit]').click()");
      await page.waitFor("!!document.querySelector('.upload .problem')", "the too-long message");
      const long = await problemText(page);
      check(
        /legfeljebb 30\s000 karakter/u.test(long) && /Rövidítsd/u.test(long),
        `too long: ${long}`,
      );
      check(
        requests.filter((r) => r.method === "POST").length === before,
        "too long: nothing was sent to the server",
      );
      await page.screenshot(`${OUT}cv-too-long.png`);

      // 6. The route's refusals and failures as the page shows them. The responses are canned, with
      // the route's own texts, so no model is called.
      let next: Answer = "pass";
      await page.intercept("*/api/cv", () => next);
      await openApp(page);
      await page.eval("document.querySelector('.upload textarea').focus()");
      await page.type("Minta Márta, szoftverfejlesztő 2019-től.");
      const body = (error: string) => JSON.stringify({ error });
      const cases: [string, Answer, string][] = [
        [
          "429",
          { status: 429, headers: { "retry-after": "2520" }, body: body(SERVER.rate(42)) },
          SERVER.rate(42),
        ],
        [
          "503",
          { status: 503, headers: { "retry-after": "39000" }, body: body(SERVER.cap) },
          SERVER.cap,
        ],
        ["500", { status: 500, body: body(SERVER.failed) }, SERVER.failed],
        ["no connection", "fail", CLIENT.offline],
      ];
      for (const [name, answer, text] of cases) {
        next = answer;
        await page.eval("document.querySelector('.upload button[type=submit]').click()");
        await page.waitFor(
          "!!document.querySelector('.upload .problem')",
          `the ${name} message`,
          10_000,
        );
        check((await problemText(page)) === text, `${name}: ${await problemText(page)}`);
        check(
          (await page.eval<string>("document.querySelector('.upload textarea').value")).startsWith(
            "Minta Márta",
          ) && (await page.eval<boolean>("!document.querySelector('.upload .elapsed')")),
          `${name}: the text is kept and the form is usable again`,
        );
        if (name === "429") await page.screenshot(`${OUT}cv-error-429.png`);
      }
      next = "hold";
      await page.eval("document.querySelector('.upload button[type=submit]').click()");
      await page.waitFor("!!document.querySelector('.upload .elapsed')", "the reading state");
      check(
        await page.eval<boolean>(
          "!document.querySelector('.upload .problem') && document.querySelector('.upload textarea').readOnly && document.querySelector('.upload button[type=submit]').getAttribute('aria-disabled') === 'true'",
        ),
        "retrying clears the old message, locks the text box and the button",
      );
      await page.eval(
        "[...document.querySelectorAll('.upload button')].find((b) => b.textContent.trim() === 'Mégse').click()",
      );
      await page.waitFor("!!document.querySelector('.upload .problem')", "the cancel message");
      const cancelled = await problemText(page);
      check(/megszakítottad/u.test(cancelled), `Mégse: ${cancelled}`);
      check(
        await page.eval<boolean>("!document.querySelector('.upload .elapsed')"),
        "Mégse ends the reading state",
      );

      // 7. A reading that succeeds, canned with the demo result: the page lights up, focus moves to
      // the summary, and clearing brings the form back with focus on its heading.
      next = {
        status: 200,
        body: readFileSync(
          new URL("../static/fixtures/it-fejleszto.json", import.meta.url),
          "utf8",
        ),
      };
      await page.eval("document.querySelector('.upload button[type=submit]').click()");
      await page.waitFor(SUMMARY_SHOWN, "the canned result");
      check(
        await page.eval<boolean>("document.activeElement?.classList.contains('summary') === true"),
        "canned result: focus moved to the result summary",
      );
      await page.waitFor(MAP_READY, "the map");
      await settle(2_500);
      await page.screenshot(`${OUT}cv-result-camera.png`);
      await page.eval(
        "[...document.querySelectorAll('button')].find((b) => b.textContent.includes('eltüntetése')).click()",
      );
      await page.waitFor("!!document.querySelector('.upload')", "the form back");
      check(
        await page.eval<boolean>("document.activeElement?.id === 'cv-upload-title'"),
        "canned result: clearing puts focus on the form heading",
      );

      // The form on a phone.
      await page.viewport(390, 844, true);
      next = "pass";
      await openApp(page);
      await page.screenshot(`${OUT}cv-phone-form.png`);
      await page.eval("document.querySelector('.upload textarea').focus()");
      await page.type(SAMPLE_CV);
      await page.eval(
        "document.querySelector('.upload button[type=submit]').scrollIntoView({ block: 'center' })",
      );
      await page.screenshot(`${OUT}cv-phone-filled.png`);
    }
  } finally {
    browser.close();
    rmSync(work, { recursive: true, force: true });
  }
  if (problems.length > 0) {
    console.log(`\n${problems.length} problem(s)`);
    process.exitCode = 1;
  }
}

await main();
