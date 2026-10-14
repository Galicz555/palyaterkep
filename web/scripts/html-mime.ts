// Adds `.html` to the MIME table of the built server. The adapter builds that table from file
// extensions, and records prerendered pages by their extensionless paths, so `.html` never gets
// in: every prerendered page goes out without a content type, which Chromium sniffs and Firefox
// downloads as a file. Runs after `vite build`; fails the build if the table is not where it was.

import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../build/adapter-node.js", import.meta.url);
const TABLE = "mime_types = {";

const code = readFileSync(FILE, "utf8");
if (!code.includes(TABLE)) throw new Error(`${FILE.pathname}: no "${TABLE}" to add .html to`);
if (!code.includes('".html":')) {
  writeFileSync(FILE, code.replace(TABLE, `${TABLE}".html":"text/html",`));
}
