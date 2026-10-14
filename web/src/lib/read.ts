// Sends the CV text to the reading route (src/routes/api/cv). The text goes in the request body and
// nowhere else: not the address, not storage.

import { parseCvResult, type CvResult } from "./cv.ts";

/** Why no result came, in Hungarian, safe to show as is. */
export class ReadError extends Error {}

export const MESSAGES = {
  failed: "Az önéletrajz beolvasása nem sikerült. Próbáld újra egy kicsit később.",
  offline: "Nem érjük el a szervert. Ellenőrizd a kapcsolatot, és próbáld újra.",
  slow: "A beolvasás szokatlanul sokáig tart, ezért leálltunk. Próbáld újra egy kicsit később.",
};

/** A reading takes about a minute; this is for one that never comes back. */
export const TIMEOUT_MS = 5 * 60_000;

/** Throws ReadError, or an AbortError when `cancel` was used. */
export async function readCvText(
  text: string,
  cancel?: AbortSignal,
  send: typeof fetch = fetch,
  timeoutMs = TIMEOUT_MS,
): Promise<CvResult> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = cancel ? AbortSignal.any([cancel, timeout]) : timeout;
  let response: Response;
  try {
    response = await send("/api/cv", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal,
    });
  } catch (error) {
    if (cancel?.aborted) throw error;
    throw new ReadError(timeout.aborted ? MESSAGES.slow : MESSAGES.offline);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { error?: unknown } | null)?.error;
    throw new ReadError(typeof message === "string" ? message : MESSAGES.failed);
  }
  try {
    return parseCvResult(body);
  } catch {
    throw new ReadError(MESSAGES.failed);
  }
}
