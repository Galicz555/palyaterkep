import { describe, expect, it } from "vitest";
import { pageText } from "../src/lib/pdf.ts";
import { MESSAGES, readCvText, ReadError } from "../src/lib/read.ts";

const result = { held: [], covered: [], reachable: [], skills: [] };
const answer = (status: number, body: unknown, raw = false) =>
  (async () => new Response(raw ? String(body) : JSON.stringify(body), { status })) as typeof fetch;

describe("readCvText", () => {
  it("posts the text as JSON and returns the checked result", async () => {
    let sent: { url: string; init: RequestInit } | undefined;
    const send = (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return Response.json(result);
    }) as unknown as typeof fetch;
    expect(await readCvText("Egy önéletrajz", undefined, send)).toEqual(result);
    expect(sent?.url).toBe("/api/cv");
    expect(sent?.init.method).toBe("POST");
    expect(JSON.parse(String(sent?.init.body))).toEqual({ text: "Egy önéletrajz" });
  });

  it("shows the route's own Hungarian text for a refusal", async () => {
    const send = answer(429, { error: "Próbáld újra 42 perc múlva." });
    await expect(readCvText("x", undefined, send)).rejects.toThrow("Próbáld újra 42 perc múlva.");
  });

  it("falls back to a generic text when the answer is not the route's", async () => {
    for (const send of [
      answer(502, "<html>bad gateway</html>", true),
      answer(500, { error: 5 }),
      answer(200, { held: "nem lista" }),
    ]) {
      await expect(readCvText("x", undefined, send)).rejects.toThrow(MESSAGES.failed);
    }
  });

  it("says the server cannot be reached when the request does not complete", async () => {
    const send = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const error = await readCvText("x", undefined, send).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReadError);
    expect((error as Error).message).toBe(MESSAGES.offline);
  });

  it("lets a cancel through as an abort, and gives up on a request that never answers", async () => {
    const hang = ((_: string, init: RequestInit) =>
      new Promise((_, reject) => {
        init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
      })) as unknown as typeof fetch;
    const cancel = new AbortController();
    const cancelled = readCvText("x", cancel.signal, hang).catch((e: unknown) => e);
    cancel.abort(new DOMException("cancelled", "AbortError"));
    expect(await cancelled).toMatchObject({ name: "AbortError" });

    await expect(readCvText("x", undefined, hang, 20)).rejects.toThrow(MESSAGES.slow);
  });
});

describe("pageText", () => {
  it("breaks lines where pdf.js says a line ends and trims trailing blanks", () => {
    expect(
      pageText([
        { str: "Senior " },
        { str: "szoftverfejlesztő  ", hasEOL: true },
        { str: "2021. március – jelenleg", hasEOL: true },
        {},
      ]),
    ).toBe("Senior szoftverfejlesztő\n2021. március – jelenleg\n");
  });
});
