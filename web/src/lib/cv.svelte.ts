// The CV reading result the whole app shows, and how one gets in.
//
// Phase 6 will read a CV on the server and call `cv.set(result)`. Until then a result comes from a
// JSON file: `?cv=it-fejleszto` loads `static/fixtures/it-fejleszto.json`. The result lives in
// memory only: it holds quotes from a person's CV, so it is not written to storage.

import { parseCvResult, readCvResult, type CvResult, type CvView } from "./cv.ts";
import { skillKey } from "./model.ts";

let result = $state.raw<CvResult | null>(null);
let error = $state<string | null>(null);
let labels = $state.raw<Record<string, string> | null>(null);
let labelsRequested = false;
const view = $derived(result ? readCvResult(result) : null);

/** The skill names are a few hundred kB, so they load when there is a result to show them for. */
async function loadLabels() {
  if (labelsRequested) return;
  labelsRequested = true;
  try {
    const response = await fetch("/skills.json");
    if (!response.ok) throw new Error(String(response.status));
    labels = (await response.json()) as Record<string, string>;
  } catch {
    labelsRequested = false;
  }
}

export const cv = {
  get result() {
    return result;
  },
  get view(): CvView | null {
    return view;
  },
  /** Hungarian text of why no result is shown, if loading one failed. */
  get error() {
    return error;
  },
  /** The Hungarian name of an ESCO skill; undefined while the names load or for an unknown skill. */
  label(uri: string): string | undefined {
    return labels?.[skillKey(uri)] || undefined;
  },
  /** Whether the skill names have arrived. */
  get labelsLoaded() {
    return labels !== null;
  },
  set(next: CvResult) {
    result = next;
    error = null;
    void loadLabels();
  },
  clear() {
    result = null;
    error = null;
  },
  /** Loads `static/fixtures/<name>.json`; a failure sets `error` and leaves no result. */
  async loadFixture(name: string) {
    try {
      if (!/^[a-z0-9-]+$/u.test(name)) throw new Error("érvénytelen név");
      const response = await fetch(`/fixtures/${name}.json`);
      if (!response.ok) throw new Error(`nincs ilyen fájl (${response.status})`);
      const json: unknown = await response.json().catch(() => {
        throw new Error("a fájl nem JSON");
      });
      cv.set(parseCvResult(json));
    } catch (e) {
      result = null;
      error = `Az önéletrajz-eredmény nem tölthető be: ${e instanceof Error ? e.message : e}`;
    }
  },
};
