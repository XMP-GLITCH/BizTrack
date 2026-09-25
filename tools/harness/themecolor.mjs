/**
 * Does the status bar colour track the app?
 *
 *   node tools/harness/themecolor.mjs
 *
 * Three questions, because two of them can pass while the third fails:
 *   1. light install  -> meta is the light page colour
 *   2. toggle to dark -> meta follows, without a reload
 *   3. dark install   -> meta is ALREADY dark at DOMContentLoaded, i.e. before
 *      React has rendered. This is the one that matters on a phone: get it
 *      wrong and every cold start flashes a light status bar.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { readFileSync } from "node:fs";
import { launch, attach } from "./cdp.mjs";
import { books, storageBlob } from "./books.mjs";

const PORT = 4323;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const LIGHT = "#FAF8F4", DARK = "#1A0E0A";

const main = async () => {
  const server = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", shell: true });
  let up = false;
  for (let i = 0; i < 120 && !up; i++) { try { up = (await fetch(ORIGIN + "/")).ok; } catch { await sleep(250); } }
  if (!up) { server.kill(); throw new Error("preview never answered"); }

  const chrome = await launch({ port: 9448 });
  const cdp = await attach(chrome.base);
  const meta = () => cdp.evaluate(
    `document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || null`);
  let bad = 0;
  const check = (label, got, want) => {
    const ok = got === want;
    if (!ok) bad++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${label.padEnd(34)} ${JSON.stringify(got)}  want ${want}`);
  };

  try {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 820, deviceScaleFactor: 2, mobile: true });

    // Record the value at DOMContentLoaded -- after the pre-paint script, before React.
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `
      window.__early = null;
      document.addEventListener('DOMContentLoaded', () => {
        window.__early = document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || 'missing';
      });
    ` });

    const seed = async (dark) => {
      await cdp.send("Page.navigate", { url: ORIGIN + "/" });
      await sleep(600);
      const blob = JSON.parse(storageBlob(books()));
      blob.state.isDarkMode = dark;
      await cdp.evaluate(`(async () => {
        for (const r of await (navigator.serviceWorker?.getRegistrations?.() ?? [])) await r.unregister();
        if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
        localStorage.clear();
        localStorage.setItem('biztrack-storage-v3', ${JSON.stringify(JSON.stringify(blob))});
        localStorage.setItem('biztrack-analytics-consent', 'false');
        return true;
      })()`);
      await cdp.send("Page.navigate", { url: ORIGIN + "/" });
      for (let i = 0; i < 160; i++) {
        const r = await cdp.evaluate(`(() => ({ app: !!document.querySelector('.bt-app'),
                                                splash: !!document.getElementById('splash-screen') }))`);
        if (r.app && !r.splash) break;
        await sleep(125);
      }
    };

    await seed(false);
    check("light install, after mount", await meta(), LIGHT);

    // Toggle through the store the app itself persists to, then let React react.
    await cdp.evaluate(`(() => {
      const s = JSON.parse(localStorage.getItem('biztrack-storage-v3'));
      s.state.isDarkMode = true;
      localStorage.setItem('biztrack-storage-v3', JSON.stringify(s));
      return true;
    })()`);
    await seed(true);
    check("dark install, after mount", await meta(), DARK);

    // typeof, not a falsy read: "never installed" and "saw nothing" are
    // different findings, and a null default cannot tell them apart.
    const earlyType = await cdp.evaluate(`typeof window.__early`);
    const early = await cdp.evaluate(`window.__early`);
    if (earlyType === "undefined") {
      console.log("  FAIL shim never installed -- absence, not a result"); bad++;
    } else {
      check("dark install, at DOMContentLoaded", early, DARK);
    }
  } finally {
    cdp.close(); chrome.proc.kill(); server.kill();
  }
  console.log(bad ? `\n  ${bad} FAILED` : "\n  all clean");
  process.exit(bad ? 1 : 0);
};
main().catch((e) => { console.error("  FAILED: " + e.message); process.exit(1); });
