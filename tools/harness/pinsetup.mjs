/**
 * Walk the passcode setup the way a person does, and photograph every step.
 *
 *   node tools/harness/pinsetup.mjs
 *
 * Every click reports WHAT IT HIT and clicks the SMALLEST match, because an
 * outer wrapper contains every label on the screen and a click that silently
 * matched nothing is indistinguishable from one that worked.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { launch, attach } from "./cdp.mjs";
import { books, storageBlob } from "./books.mjs";

const OUT = "tools/harness/out";
const PORT = 4321;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const env = readFileSync(".env.local", "utf8");
const REF = env.match(/VITE_SUPABASE_URL=https:\/\/([a-z0-9]+)\./)[1];
const LEGAL = readFileSync("src/legal/documents.js", "utf8").match(/LEGAL_VERSION\s*=\s*["']([^"']+)/)[1];

const session = () => JSON.stringify({
  access_token: "harness", refresh_token: "harness", token_type: "bearer",
  expires_in: 999999999, expires_at: 4102444800,
  user: { id: "00000000-0000-4000-8000-000000000001", email: "ebong@example.com",
    user_metadata: { display_name: "Ebong", setup_done_at: "2026-09-01T00:00:00.000Z",
                     accepted_legal_version: LEGAL },
    app_metadata: { provider: "email" }, aud: "authenticated", role: "authenticated" },
});

const main = async () => {
  mkdirSync(OUT, { recursive: true });
  const server = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", shell: true });
  let up = false;
  for (let i = 0; i < 120 && !up; i++) { try { up = (await fetch(ORIGIN + "/")).ok; } catch { await sleep(250); } }
  if (!up) { server.kill(); throw new Error("preview never answered"); }

  const chrome = await launch({ port: 9446 });
  const cdp = await attach(chrome.base);
  try {
    const shoot = async (n) => {
      const png = await cdp.send("Page.captureScreenshot", { format: "png" });
      writeFileSync(`${OUT}/${n}.png`, Buffer.from(png.data, "base64"));
      console.log("  shot     " + n);
    };
    const click = async (label) => {
      const r = await cdp.evaluate(`(() => {
        const t = ${JSON.stringify(label)}.toLowerCase();
        // VISIBLE ONLY. The landing page stays in the DOM behind the app,
        // hidden by one CSS rule, so its buttons are still queryable -- and the
        // first run of this clicked "I already have an account" when asked for
        // "Account". This project has recorded that exact miss once already.
        const visible = (e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && e.offsetParent !== null
              && getComputedStyle(e).visibility !== 'hidden';
        };
        const all = Array.from(document.querySelectorAll('button, a, [role="switch"], [onclick], div[style]'))
          .filter(visible)
          .filter(e => (e.innerText || e.getAttribute('aria-label') || '').toLowerCase().includes(t));
        if (!all.length) return { ok: false, tried: t,
          // Say what IS on screen. "nothing matched" with no list is the same
          // dead end as a step that silently matched nothing.
          sawn: Array.from(document.querySelectorAll('button, a, [role="switch"]')).filter(visible)
                  .map(e => (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0,28))
                  .filter(Boolean) };
        all.sort((a,b) => { const x=a.getBoundingClientRect(), y=b.getBoundingClientRect();
                            return x.width*x.height - y.width*y.height; });
        const el = all[0];
        const hit = el.tagName + ':' + (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0,30);
        el.click();
        return { ok: true, hit, of: all.length };
      })()`);
      console.log(`  click    ${label} -> ${JSON.stringify(r)}`);
      if (!r.ok) throw new Error("nothing matched: " + label);
      await sleep(500);
    };
    // A switch row's LABEL is not inside its control, so filtering controls by
    // text finds only wrappers. Find the row by its words, then click the
    // role="switch" within it -- and report whether the label and the control
    // are actually the same element, because if they are not, a screen reader
    // announces a switch with no name.
    const clickSwitch = async (label) => {
      const r = await cdp.evaluate(`(() => {
        const t = ${JSON.stringify(label)}.toLowerCase();
        const row = Array.from(document.querySelectorAll('div, li, label'))
          .filter(e => (e.innerText || '').toLowerCase().includes(t))
          .sort((a,b) => (a.innerText||'').length - (b.innerText||'').length)[0];
        if (!row) return { ok: false, tried: t };
        const sw = row.querySelector('[role="switch"], button') || (row.closest('button'));
        if (!sw) return { ok: false, reason: 'row found, no control inside', rowTag: row.tagName };
        const named = (sw.innerText || '').toLowerCase().includes(t)
                   || (sw.getAttribute('aria-label') || '').toLowerCase().includes(t);
        sw.click();
        return { ok: true, control: sw.tagName + '[role=' + (sw.getAttribute('role') || 'none') + ']',
                 controlCarriesItsName: named };
      })()`);
      console.log("  switch   " + label + " -> " + JSON.stringify(r));
      if (!r.ok) throw new Error("switch not reachable: " + label);
      await sleep(600);
    };

    const type = async (value) => {
      const r = await cdp.evaluate(`(() => {
        const el = document.querySelector('.bt-sheet input, .bt-modal input');
        if (!el) return { ok: false };
        const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return { ok: true, value: el.value, placeholder: el.placeholder };
      })()`);
      console.log("  type     " + JSON.stringify(r));
      await sleep(300);
    };

    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 820, deviceScaleFactor: 2, mobile: true });
    await cdp.send("Page.navigate", { url: ORIGIN + "/" });
    await sleep(700);
    await cdp.evaluate(`(async () => {
      for (const r of await (navigator.serviceWorker?.getRegistrations?.() ?? [])) await r.unregister();
      if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
      localStorage.clear();
      localStorage.setItem("biztrack-storage-v3", ${JSON.stringify(storageBlob(books()))});
      localStorage.setItem(${JSON.stringify("sb-" + REF + "-auth-token")}, ${JSON.stringify(session())});
      localStorage.setItem("biztrack-analytics-consent", "false");
      return true;
    })()`);
    await cdp.send("Page.navigate", { url: ORIGIN + "/" });
    for (let i = 0; i < 160; i++) {
      const r = await cdp.evaluate(`(() => ({ app: !!document.querySelector('.bt-app'),
                                              splash: !!document.getElementById('splash-screen') }))`);
      if (r.app && !r.splash) break;
      await sleep(125);
    }
    console.log("  app      mounted");

    await click("Settings");
    await click("Manage profile");
    await clickSwitch("Passcode Lock");
    await shoot("pin-step1");
    await type("1234");
    await click("Next");
    await shoot("pin-step2");
    await type("1234");
    await click("Confirm");
    await shoot("pin-step3");

    // What is on screen at the end, and is the PIN already live?
    const state = await cdp.evaluate(`(() => {
      const sheet = document.querySelector('.bt-sheet, .bt-modal');
      const s = JSON.parse(localStorage.getItem('biztrack-storage-v3') || '{}').state || {};
      return {
        sheetText: sheet ? sheet.innerText.slice(0, 220) : null,
        pinEnabled: s.isPinEnabled === true,
        hasPinHash: !!s.hashedPin,
        hasRecoveryHash: !!s.hashedRecoveryKey,
        canDismiss: !!document.querySelector('.bt-sheet-close, .bt-modal-overlay, .bt-overlay'),
      };
    })()`);
    console.log("  state    " + JSON.stringify(state, null, 0));

    // And finish, which is the only place anything is written now.
    await click("Finish Setup");
    const after = await cdp.evaluate(`(() => {
      const s = JSON.parse(localStorage.getItem('biztrack-storage-v3') || '{}').state || {};
      return { pinEnabled: s.isPinEnabled === true, hasPinHash: !!s.hashedPin,
               hasRecoveryHash: !!s.hashedRecoveryKey,
               lockedOut: /Enter PIN to unlock/.test(document.body.innerText),
               onScreen: (document.querySelector('.bt-screen')?.innerText || '').slice(0, 40) };
    })()`);
    console.log("  after    " + JSON.stringify(after));
    await shoot("pin-after-finish");
  } finally {
    cdp.close(); chrome.proc.kill(); server.kill();
  }
};
main().catch((e) => { console.error("  FAILED: " + e.message); process.exit(1); });
