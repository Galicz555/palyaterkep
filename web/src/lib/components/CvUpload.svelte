<script lang="ts">
  // Giving the page a CV: a PDF (its text is read in the browser and put in the text box, so the
  // person sees exactly what will be sent) or pasted text. The server gets the text only. The form
  // keeps the text only while it is on the page; a result replaces the form, and with it the text.
  import { onDestroy } from "svelte";
  import { cv } from "#lib/cv.svelte.ts";
  import { PdfError, pdfText } from "#lib/pdf.ts";
  import { MESSAGES, readCvText, ReadError } from "#lib/read.ts";

  interface Props {
    /** The most characters the server reads (MAX_CV_CHARS). */
    maxChars: number;
    /** Called after a result is set, once the form is gone, to move focus on. */
    ondone: () => void;
  }
  let { maxChars, ondone }: Props = $props();

  let text = $state("");
  /** The PDF the text came from, for the status line. */
  let source = $state<string | null>(null);
  let extracting = $state(false);
  let reading = $state(false);
  let seconds = $state(0);
  let problem = $state<string | null>(null);
  /** Whether the problem is with the text (empty, too long, a PDF without text), not the service. */
  let aboutText = $state(false);
  let textarea = $state<HTMLTextAreaElement>();
  let cancel: AbortController | undefined;
  let ticker: ReturnType<typeof setInterval> | undefined;

  const count = (n: number) => n.toLocaleString("hu-HU");
  const over = $derived(text.length > maxChars);
  const tooLong = () =>
    `Az önéletrajz ${count(text.length)} karakter hosszú, de legfeljebb ${count(maxChars)} karaktert (nagyjából tíz oldalt) tudunk beolvasni. Rövidítsd, például hagyd ki a legrégebbi munkahelyeket, aztán próbáld újra.`;

  const status = $derived(
    reading
      ? "Az önéletrajz beolvasása folyamatban. Körülbelül egy percig tart, kérjük, ne zárd be az oldalt."
      : extracting
        ? "A PDF szövegének kiolvasása…"
        : source
          ? `A PDF szövege (${source}) bekerült a szövegmezőbe. Nézd át, mielőtt beolvasod.`
          : "",
  );

  const fault = (message: string) => {
    problem = message;
    aboutText = true;
  };

  async function onfile(event: Event & { currentTarget: HTMLInputElement }) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    problem = null;
    aboutText = false;
    source = null;
    extracting = true;
    try {
      text = await pdfText(file, maxChars);
      source = file.name;
      if (over) fault(tooLong());
    } catch (error) {
      fault(error instanceof PdfError ? error.message : MESSAGES.failed);
    } finally {
      extracting = false;
      // The page keeps no handle on the file, and choosing the same file again works.
      input.value = "";
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (reading || extracting) return;
    if (!text.trim()) {
      fault("Tölts fel egy PDF-et, vagy másold be az önéletrajz szövegét.");
    } else if (over) {
      fault(tooLong());
    } else {
      await read();
      return;
    }
    textarea?.focus();
  }

  async function read() {
    problem = null;
    aboutText = false;
    reading = true;
    seconds = 0;
    ticker = setInterval(() => (seconds += 1), 1000);
    cancel = new AbortController();
    try {
      cv.set(await readCvText(text, cancel.signal));
      ondone();
    } catch (error) {
      if (error instanceof ReadError) problem = error.message;
      else if (error instanceof DOMException && error.name === "AbortError") {
        problem = "A beolvasást megszakítottad. A szöveg megmaradt, újraindíthatod.";
      } else problem = MESSAGES.failed;
    } finally {
      reading = false;
      clearInterval(ticker);
    }
  }

  onDestroy(() => {
    cancel?.abort();
    clearInterval(ticker);
  });
</script>

<section class="upload" aria-labelledby="cv-upload-title">
  <h2 id="cv-upload-title" tabindex="-1">Töltsd fel az önéletrajzod</h2>
  <form onsubmit={submit} novalidate>
    <div class="source">
      <label class="field">
        <span>PDF kiválasztása</span>
        <input
          type="file"
          accept="application/pdf,.pdf"
          onchange={onfile}
          aria-describedby="cv-pdf-hint"
        />
      </label>
      <p id="cv-pdf-hint" class="hint">
        Csak PDF-et tudunk beolvasni. Word-fájlt (DOCX) előbb mentsd el PDF-ként.
      </p>
    </div>

    <div class="paste">
      <label class="field">
        <span>Vagy másold ide az önéletrajz szövegét</span>
        <textarea
          bind:this={textarea}
          bind:value={text}
          oninput={() => {
            problem = null;
            aboutText = false;
            source = null;
          }}
          rows="7"
          readonly={reading}
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          aria-invalid={over || (problem !== null && aboutText)}
          aria-describedby="cv-count{problem ? ' cv-problem' : ''}"></textarea>
      </label>
      <p id="cv-count" class="count" class:bad={over}>
        {count(text.length)} / {count(maxChars)} karakter{over ? ": ez túl hosszú" : ""}
      </p>

      {#if problem}
        <p id="cv-problem" class="problem" role="alert">{problem}</p>
      {/if}

      <div class="actions">
        <button type="submit" class="button primary" aria-disabled={reading || extracting}>
          {reading ? "Beolvasás folyamatban…" : "Beolvasás"}
        </button>
        {#if reading}
          <button type="button" class="button" onclick={() => cancel?.abort()}>Mégse</button>
          <span class="elapsed" aria-hidden="true"><span class="spinner"></span>{seconds} mp</span>
        {/if}
      </div>
      <p class="status" role="status">{status}</p>
    </div>

    <!-- DRAFT: this notice has not been reviewed by a lawyer. It must be reviewed (controller,
      legal basis, processor agreement with the model provider, retention of the rate-limit hash,
      data subject rights) before this app is shown to anyone outside local development. -->
    <p class="privacy" data-draft="needs-legal-review">
      <strong>Adatkezelés.</strong> Az önéletrajzod szövegét egyszer elküldjük az Anthropic nyelvi modelljének
      (adatfeldolgozóként), hogy kiolvassa belőle a szerepeket és a készségeket. Nem tároljuk: nem mentjük
      fájlba, nem kerül a naplóba és a böngésződ tárhelyére sem, az eredmény csak az oldal memóriájában
      van, amíg el nem tünteted vagy be nem zárod az oldalt. A PDF-ből a szöveget a böngésződ olvassa
      ki, a fájlt magát nem küldjük el. A visszaélések ellen az IP-címed lenyomatát körülbelül egy óráig
      megőrizzük, hogy egy gépről ne lehessen túl sok beolvasást indítani.
    </p>
  </form>
</section>

<style>
  .upload {
    margin: 0 0 1rem;
    padding: 0.2rem 1rem 1rem;
    border: 1px solid var(--line);
    border-left: 0.35rem solid var(--accent);
    border-radius: var(--radius);
    background: var(--surface);
  }
  h2 {
    margin: 0.7rem 0 0.6rem;
    font-size: 1.15rem;
  }
  form {
    display: grid;
    gap: 0.4rem 1.5rem;
  }
  .field {
    display: grid;
    gap: 0.2rem;
    font-size: 0.9rem;
    font-weight: 600;
  }
  textarea,
  input[type="file"] {
    width: 100%;
    padding: 0.4rem 0.6rem;
    border: 1px solid var(--ink-soft);
    border-radius: var(--radius);
    background: var(--surface);
    font-family: inherit;
    font-size: 1rem;
    font-weight: 400;
  }
  input[type="file"]::file-selector-button {
    min-height: 2.25rem;
    margin-right: 0.8rem;
    padding: 0.2rem 0.8rem;
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--ink);
    font: inherit;
    cursor: pointer;
  }
  textarea {
    min-height: 7rem;
    resize: vertical;
    line-height: 1.4;
  }
  textarea[aria-invalid="true"] {
    border-color: #a02020;
    border-width: 2px;
  }
  .hint,
  .count,
  .status {
    margin: 0.3rem 0 0;
    font-size: 0.85rem;
    color: var(--ink-soft);
  }
  .count.bad {
    color: #8c1a1a;
    font-weight: 600;
  }
  .privacy {
    margin: 0.4rem 0 0;
    padding: 0.6rem 0.8rem;
    border-radius: var(--radius);
    background: var(--accent-soft);
    font-size: 0.85rem;
    line-height: 1.45;
  }
  .problem {
    margin: 0.5rem 0 0;
    padding: 0.5rem 0.8rem;
    border-left: 0.35rem solid #a02020;
    background: #fbe9e9;
    color: #6b1010;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
    margin-top: 0.6rem;
  }
  .primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
    font-weight: 600;
  }
  .primary[aria-disabled="true"] {
    opacity: 0.75;
    cursor: progress;
  }
  .elapsed {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--ink-soft);
    font-variant-numeric: tabular-nums;
  }
  .spinner {
    width: 1rem;
    height: 1rem;
    border: 3px solid var(--line);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (min-width: 60rem) {
    form {
      grid-template-columns: minmax(0, 20rem) minmax(0, 1fr);
      align-items: start;
    }
    .privacy {
      grid-column: 1 / -1;
    }
  }
</style>
