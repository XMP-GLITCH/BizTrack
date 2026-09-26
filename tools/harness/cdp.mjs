/**
 * A minimal Chrome DevTools Protocol client.
 *
 * No Puppeteer, no dependency: node 22 ships a native WebSocket and CDP is a
 * JSON protocol over one socket. That is the whole reason this project has
 * always driven Chrome this way, and it is why rebuilding a harness is an
 * afternoon rather than a project.
 *
 * Traps this file exists to encode, every one of them paid for once already:
 *
 *  - `Page.addScriptToEvaluateOnNewDocument` is INERT until `Page.enable` has
 *    been sent. A shim that never installed reports exactly what a shim that
 *    saw nothing reports.
 *  - A metrics override dies with the socket that set it, so measuring "at
 *    320" from a second connection silently measures the real window.
 *  - `Runtime.evaluate` on an async function serialises the Promise as `{}`
 *    unless `awaitPromise` is set -- an unfinished answer that reads as an
 *    empty one.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

export async function launch({ port = 9444, headless = true } = {}) {
  // Forward slashes on purpose: Windows accepts them, and a path separator
  // is one more thing a quoting layer can eat. It ate this one on the first
  // run of this harness, twice.
  const exe = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const dir = (process.env.TEMP || ".") + "/bt-harness-" + port;
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${dir}`,
    "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--disable-background-networking",
    // The app pings the REAL Supabase project every five minutes with whatever
    // token it finds. Harmless, but it is the source of the 401s a previous
    // session mistook for a second tab.
    "--host-resolver-rules=MAP *.supabase.co 127.0.0.1",
    ...(headless ? ["--headless=new"] : []),
    "about:blank",
  ];
  const proc = spawn(exe, args, { stdio: "ignore", detached: false });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${base}/json/version`);
      if (r.ok) return { proc, port, base };
    } catch { /* not up yet */ }
    await sleep(100);
  }
  proc.kill();
  throw new Error("Chrome did not open a debugging port");
}

export async function attach(base) {
  const list = await (await fetch(`${base}/json/list`)).json();
  const page = list.find((t) => t.type === "page");
  if (!page) throw new Error("no page target");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error("ws failed")); });

  let id = 0;
  const pending = new Map();
  // EVENTS WERE BEING DROPPED. Only replies carry an `id`, so a handler that
  // looks at nothing else throws away console output and every other
  // notification -- which is how a probe ends up reporting "it failed" with no
  // way to say why, when the page had already logged the cause.
  const logs = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.method === "Runtime.consoleAPICalled") {
      const text = (msg.params.args || [])
        .map((a) => (a.value !== undefined ? String(a.value)
                   : a.description !== undefined ? a.description
                   : a.preview ? JSON.stringify(a.preview.properties) : a.type))
        .join(" ");
      logs.push(msg.params.type + ": " + text);
      return;
    }
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      logs.push("uncaught: " + (d.exception?.description || d.text));
      return;
    }
    if (msg.id && pending.has(msg.id)) {
      const { ok, no } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? no(new Error(msg.method + ": " + msg.error.message)) : ok(msg.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((ok, no) => { pending.set(++id, { ok, no }); ws.send(JSON.stringify({ id, method, params })); });

  // Page.enable BEFORE anything relies on page-scoped features.
  await send("Page.enable");
  await send("Runtime.enable");

  // awaitPromise is always on: an async probe otherwise answers {}.
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", {
      expression, awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error("page threw: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    }
    return r.result.value;
  };

  // `logs` is live: read it after a step to see what the PAGE said.
  return { send, evaluate, logs, close: () => ws.close() };
}

export { sleep };
