// The text of a PDF, read in the browser: the server only ever receives plain text, never a file.
// pdf.js and its worker (together about 1.7 MB) load when a file is chosen, not with the page.

/** A problem with the file itself; the message is Hungarian, says what to do, and is shown as is. */
export class PdfError extends Error {}

const PASTE = "Másold be inkább az önéletrajz szövegét a szövegmezőbe.";
export const MESSAGES = {
  tooBig: `A fájl nagyobb 10 MB-nál, egy önéletrajz ennél jóval kisebb. Válassz másik PDF-et. ${PASTE}`,
  word: `A Word-fájlt (DOCX) nem tudjuk beolvasni. Mentsd el PDF-ként, és azt tölts fel. ${PASTE}`,
  notPdf: `Ezt a fájlt nem tudjuk beolvasni, csak PDF-et. ${PASTE}`,
  scanned: `Ebben a PDF-ben nincs szöveg, valószínűleg beszkennelt kép. ${PASTE}`,
  password: `A PDF jelszóval védett. Töltsd fel jelszó nélkül. ${PASTE}`,
  broken: `A PDF-et nem sikerült megnyitni, lehet, hogy sérült. Válassz másikat. ${PASTE}`,
};

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 30;
/** Characters a PDF must hold to count as having a text layer; a CV has hundreds. */
const MIN_CHARS = 50;

const startsWith = (bytes: Uint8Array, text: string, within = 1024) =>
  new TextDecoder("latin1").decode(bytes.subarray(0, within)).includes(text);

/** What one page's text items say, as lines: pdf.js marks where a line ends. */
export function pageText(items: readonly { str?: string; hasEOL?: boolean }[]): string {
  return items
    .map((item) => `${item.str ?? ""}${item.hasEOL ? "\n" : ""}`)
    .join("")
    .replace(/[ \t]+\n/gu, "\n");
}

/**
 * The text of `file`, page after page. Stops reading once there is more than `maxChars`, so a huge
 * PDF does not hold the page up; the caller says the text is too long.
 */
export async function pdfText(file: File, maxChars: number): Promise<string> {
  if (file.size > MAX_BYTES) throw new PdfError(MESSAGES.tooBig);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!startsWith(bytes, "%PDF-")) {
    const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
    throw new PdfError(zip || /\.docx?$/iu.test(file.name) ? MESSAGES.word : MESSAGES.notPdf);
  }

  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const loading = pdfjs.getDocument({ data: bytes });
  try {
    const pdf = await loading.promise;
    const pages: string[] = [];
    let length = 0;
    for (let n = 1; n <= Math.min(pdf.numPages, MAX_PAGES) && length <= maxChars; n++) {
      const page = await pdf.getPage(n);
      const { items } = await page.getTextContent();
      const text = pageText(items as { str?: string; hasEOL?: boolean }[]);
      pages.push(text);
      length += text.length;
    }
    const text = pages.join("\n\n").trim();
    if (text.replace(/\s/gu, "").length < MIN_CHARS) throw new PdfError(MESSAGES.scanned);
    return text;
  } catch (error) {
    if (error instanceof PdfError) throw error;
    throw new PdfError(
      error instanceof Error && error.name === "PasswordException"
        ? MESSAGES.password
        : MESSAGES.broken,
    );
  } finally {
    await loading.destroy();
  }
}
