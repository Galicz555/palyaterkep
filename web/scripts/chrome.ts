// A small driver for a headless Chrome over the DevTools protocol, for the screenshots and the
// frame measurements (scripts/screens.ts). Node's own WebSocket, no browser-automation library.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CHROME = process.env["CHROME"] ?? "google-chrome-stable";

type Handler = (params: Record<string, unknown>) => void;

export class Page {
  #socket: WebSocket;
  #next = 0;
  #pending = new Map<
    number,
    (message: { result?: unknown; error?: { message: string } }) => void
  >();
  #handlers = new Map<string, Handler[]>();

  constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as {
        id?: number;
        method?: string;
        params?: Record<string, unknown>;
        result?: unknown;
        error?: { message: string };
      };
      if (message.id !== undefined) this.#pending.get(message.id)?.(message);
      else if (message.method) {
        for (const handler of this.#handlers.get(message.method) ?? [])
          handler(message.params ?? {});
      }
    });
  }

  send<T = Record<string, unknown>>(method: string, params: object = {}): Promise<T> {
    const id = ++this.#next;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, (message) => {
        this.#pending.delete(id);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve((message.result ?? {}) as T);
      });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method: string): Promise<void> {
    return new Promise((resolve) => {
      const handler: Handler = () => {
        this.#handlers.set(
          method,
          (this.#handlers.get(method) ?? []).filter((h) => h !== handler),
        );
        resolve();
      };
      this.#handlers.set(method, [...(this.#handlers.get(method) ?? []), handler]);
    });
  }

  on(method: string, handler: Handler) {
    this.#handlers.set(method, [...(this.#handlers.get(method) ?? []), handler]);
  }

  async goto(url: string) {
    const loaded = this.once("Page.loadEventFired");
    await this.send("Page.navigate", { url });
    await loaded;
  }

  async eval<T = unknown>(expression: string): Promise<T> {
    const { result, exceptionDetails } = await this.send<{
      result: { value: T };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    }>("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    }
    return result.value;
  }

  async waitFor(expression: string, what: string, timeoutMs = 20_000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (await this.eval<boolean>(expression).catch(() => false)) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`timed out waiting for ${what}`);
  }

  async viewport(width: number, height: number, mobile = false) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: mobile ? 2 : 1,
      mobile,
    });
    if (mobile) await this.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  }

  async screenshot(file: string, fullPage = false) {
    const { data } = await this.send<{ data: string }>("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: fullPage,
    });
    writeFileSync(file, Buffer.from(data, "base64"));
  }

  /** `held` is whether the left button is down during a move. */
  async mouse(
    type: "mousePressed" | "mouseMoved" | "mouseReleased",
    x: number,
    y: number,
    held = false,
  ) {
    await this.send("Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button: type === "mouseMoved" && !held ? "none" : "left",
      buttons: type === "mouseReleased" || (type === "mouseMoved" && !held) ? 0 : 1,
      clickCount: type === "mouseMoved" ? 0 : 1,
    });
  }

  async click(x: number, y: number) {
    await this.mouse("mouseMoved", x, y);
    await this.mouse("mousePressed", x, y);
    await this.mouse("mouseReleased", x, y);
  }

  async drag(x0: number, y0: number, x1: number, y1: number, steps: number) {
    await this.mouse("mousePressed", x0, y0);
    for (let k = 1; k <= steps; k++) {
      await this.mouse(
        "mouseMoved",
        x0 + ((x1 - x0) * k) / steps,
        y0 + ((y1 - y0) * k) / steps,
        true,
      );
    }
    await this.mouse("mouseReleased", x1, y1);
  }

  /** One key press; `vk` is the Windows virtual key code, `text` what typing it would insert. */
  async key(key: string, code: string, vk: number, text?: string) {
    const down = { key, code, windowsVirtualKeyCode: vk, ...(text ? { text } : {}) };
    await this.send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...down });
    await this.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key,
      code,
      windowsVirtualKeyCode: vk,
    });
  }

  async tab(times = 1) {
    for (let k = 0; k < times; k++) await this.key("Tab", "Tab", 9);
  }

  async type(text: string) {
    await this.send("Input.insertText", { text });
  }

  close() {
    this.#socket.close();
  }
}

export interface Browser {
  page: Page;
  close(): void;
}

/** Starts Chrome and returns its one page. `flags` are extra command-line switches. */
export async function launch(flags: string[] = []): Promise<Browser> {
  const profile = mkdtempSync(path.join(tmpdir(), "palyaterkep-chrome-"));
  const port = 9300 + Math.floor(Math.random() * 500);
  const child: ChildProcess = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      ...flags,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let targets: { type: string; webSocketDebuggerUrl: string }[] = [];
  for (let attempt = 0; attempt < 100 && targets.length === 0; attempt++) {
    await new Promise((r) => setTimeout(r, 100));
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      targets = ((await response.json()) as typeof targets).filter((t) => t.type === "page");
    } catch {
      // Chrome is still starting.
    }
  }
  const target = targets[0];
  if (!target) {
    child.kill();
    throw new Error("Chrome did not start");
  }
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  const page = new Page(socket);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  return {
    page,
    close() {
      page.close();
      child.kill();
      // Chrome is still shutting down and may write a little more.
      rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 });
    },
  };
}
