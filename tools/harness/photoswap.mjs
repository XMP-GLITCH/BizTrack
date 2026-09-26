/**
 * Add a product photo, remove it, add another. Reported as: after removing,
 * adding a new one "just goes and deletes".
 *
 *   node tools/harness/photoswap.mjs
 *
 * Driven through the real controls with a real file handed to the real input
 * via DOM.setFileInputFiles. A synthetic change event on a file input cannot
 * carry a File, so anything short of this exercises a different code path from
 * the one a person uses.
 *
 * After every step it reads BOTH sides: the item's photoId in the store, and
 * whether that blob is actually in biztrack-photos. A photoId pointing at a
 * blob that is gone and a photoId that was never set look identical on screen.
 *
 * NO BACKSLASHES AND NO REGEXES IN THIS FILE, deliberately. Probes in this
 * project have been broken four times by a quoting layer eating one, and every
 * value needed here can be parsed by splitting on plain strings.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { launch, attach } from "./cdp.mjs";
import { books, storageBlob } from "./books.mjs";

const PORT = 4327;
const ORIGIN = "http://127.0.0.1:" + PORT;
const REF = readFileSync(".env.local", "utf8").split("https://")[1].split(".")[0];
const LEGAL = readFileSync("src/legal/documents.js", "utf8").split("LEGAL_VERSION")[1].split('"')[1];

const session = () => JSON.stringify({
  access_token: "harness", refresh_token: "harness", token_type: "bearer",
  expires_in: 999999999, expires_at: 4102444800,
  user: {
    id: "00000000-0000-4000-8000-000000000001", email: "ebong@example.com",
    user_metadata: {
      display_name: "Ebong", setup_done_at: "2026-09-01T00:00:00.000Z",
      accepted_legal_version: LEGAL,
    },
    app_metadata: { provider: "email" }, aud: "authenticated", role: "authenticated",
  },
});

const main = async () => {
  const server = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", shell: true });
  let up = false;
  for (let i = 0; i < 120 && !up; i++) { try { up = (await fetch(ORIGIN + "/")).ok; } catch { await sleep(250); } }
  if (!up) { server.kill(); throw new Error("preview never answered"); }

  const chrome = await launch({ port: 9454 });
  const cdp = await attach(chrome.base);
  try {
    await cdp.send("DOM.enable");

    const click = async (label) => {
      const r = await cdp.evaluate("(() => {"
        + "const t = " + JSON.stringify(label) + ".toLowerCase();"
        + "const vis = (e) => { const b = e.getBoundingClientRect();"
        + "  return b.width > 0 && b.height > 0 && e.offsetParent !== null; };"
        + "const all = Array.from(document.querySelectorAll('button, a, [role=tab], div[style]'))"
        + "  .filter(vis)"
        + "  .filter(e => ((e.innerText || '') + ' ' + (e.getAttribute('aria-label') || '')).toLowerCase().includes(t));"
        + "if (!all.length) return { ok: false, tried: t,"
        + "  saw: Array.from(document.querySelectorAll('button')).filter(vis)"
        + "    .map(e => (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 26)).filter(Boolean) };"
        + "all.sort((a, b) => { const x = a.getBoundingClientRect(), y = b.getBoundingClientRect();"
        + "  return x.width * x.height - y.width * y.height; });"
        + "const el = all[0];"
        + "const hit = el.tagName + ':' + ((el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30));"
        + "el.click(); return { ok: true, hit };"
        + "})()");
      console.log("  click    " + label.padEnd(20) + " -> " + JSON.stringify(r));
      if (!r.ok) throw new Error("nothing matched: " + label);
      await sleep(600);
    };

    const state = async (note) => {
      const s = await cdp.evaluate("(async () => {"
        + "const st = JSON.parse(localStorage.getItem('biztrack-storage-v3') || '{}').state || {};"
        + "const item = st.businesses && st.businesses[0] && st.businesses[0].items ? st.businesses[0].items[0] : null;"
        + "const ids = await new Promise((ok) => {"
        + "  const rq = indexedDB.open('biztrack-photos');"
        + "  rq.onsuccess = () => { const db = rq.result;"
        + "    if (!db.objectStoreNames.contains('photos')) return ok([]);"
        + "    const g = db.transaction('photos').objectStore('photos').getAllKeys();"
        + "    g.onsuccess = () => ok(g.result.map(String)); g.onerror = () => ok(['read failed']); };"
        + "  rq.onerror = () => ok(['open failed']); });"
        + "const pid = item && item.photoId ? String(item.photoId) : null;"
        + "return { photoId: pid, blobs: ids.length, pointsAtLiveBlob: pid ? ids.includes(pid) : null };"
        + "})()");
      console.log("  " + note.padEnd(26) + " " + JSON.stringify(s));
      return s;
    };

    const attachFile = async (file) => {
      const r = await cdp.send("Runtime.evaluate", {
        expression: "document.querySelector('.bt-sheet input[type=file], .bt-modal input[type=file]')",
      });
      if (!r.result.objectId) throw new Error("no file input inside the sheet");
      await cdp.send("DOM.setFileInputFiles", { files: [resolve(file)], objectId: r.result.objectId });
      await sleep(1600);
      // What the SHEET says. "nothing was saved" and "saving failed, here is
      // why" look identical in the store, and only one of them is the app's
      // fault. This prints the error the field would have shown a person.
      const said = await cdp.evaluate("(() => {"
        + "const s = document.querySelector('.bt-sheet, .bt-modal');"
        + "const inp = document.querySelector('.bt-sheet input[type=file], .bt-modal input[type=file]');"
        + "return { sheet: s ? s.innerText.slice(0, 160) : null,"
        + "         filesOnInput: inp ? inp.files.length : 'no input' }; })()");
      console.log("  file     " + file + " -> " + JSON.stringify(said));
      for (const l of cdp.logs.splice(0)) if (!l.includes("SW ")) console.log("    page   " + l.slice(0, 220));
    };

    await cdp.send("Emulation.setDeviceMetricsOverride",
      { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await cdp.send("Page.navigate", { url: ORIGIN + "/" });
    await sleep(700);
    await cdp.evaluate("(async () => {"
      + "for (const r of await (navigator.serviceWorker && navigator.serviceWorker.getRegistrations ? navigator.serviceWorker.getRegistrations() : [])) await r.unregister();"
      + "if (window.caches) for (const k of await caches.keys()) await caches.delete(k);"
      + "localStorage.clear();"
      + "localStorage.setItem('biztrack-storage-v3', " + JSON.stringify(storageBlob(books())) + ");"
      + "localStorage.setItem(" + JSON.stringify("sb-" + REF + "-auth-token") + ", " + JSON.stringify(session()) + ");"
      + "localStorage.setItem('biztrack-analytics-consent', 'false'); return true; })()");
    await cdp.send("Page.navigate", { url: ORIGIN + "/" });
    for (let i = 0; i < 160; i++) {
      const r = await cdp.evaluate("(() => ({ app: !!document.querySelector('.bt-app'),"
        + " splash: !!document.getElementById('splash-screen') }))");
      if (r.app && !r.splash) break;
      await sleep(125);
    }
    await cdp.evaluate("document.fonts.ready.then(() => true)");

    // CLEAR the photos store with a transaction; do NOT deleteDatabase. The
    // app holds an open connection, so a delete is BLOCKED, and the next
    // savePhoto fails with "Photo storage is busy" -- the harness manufacturing
    // the very fault it came to look for.
    const cleared = await cdp.evaluate("(async () => await new Promise((ok) => {"
      + "const rq = indexedDB.open('biztrack-photos');"
      + "rq.onsuccess = () => { const db = rq.result;"
      + "  if (!db.objectStoreNames.contains('photos')) return ok('no store yet');"
      + "  const tx = db.transaction('photos', 'readwrite');"
      + "  tx.objectStore('photos').clear();"
      + "  tx.oncomplete = () => ok('cleared'); tx.onerror = () => ok('clear failed'); };"
      + "rq.onerror = () => ok('open failed'); }))()");
    console.log("  app      mounted, photos store " + cleared);

    // FORCE THE TRAPPED STATE. A database at version 2 is exactly what the
    // self-heal leaves behind, and what made every later save throw
    // VersionError when openDb asked for a hardcoded 1. Reproducing it here is
    // what turns this from "it works on my machine" into a regression test:
    // before the fix this run cannot save a photo at all.
    const bumped = await cdp.evaluate("(async () => await new Promise((ok) => {"
      + "const rq = indexedDB.open('biztrack-photos', 2);"
      + "rq.onupgradeneeded = () => { const db = rq.result;"
      + "  if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' }); };"
      + "rq.onsuccess = () => { const v = rq.result.version; rq.result.close(); ok(v); };"
      + "rq.onerror = () => ok('bump failed'); rq.onblocked = () => ok('blocked'); }))()");
    console.log("  trapped  photos database forced to version " + bumped);

    await click("Mami Joy Provisions");
    await click("Inventory");
    await click("Add a photo");
    await state("before anything");

    await attachFile("tools/harness/fixtures/a.png");
    const first = await state("after adding the first");

    await click("Remove photo");
    const removed = await state("after removing");

    await click("Add a photo");
    await attachFile("tools/harness/fixtures/b.png");
    const second = await state("after adding the second");

    const png = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync("tools/harness/out/photoswap.png", Buffer.from(png.data, "base64"));

    console.log("");
    console.log("  VERDICT");
    console.log("    first add   set: " + !!first.photoId + "   blob present: " + first.pointsAtLiveBlob);
    console.log("    remove      cleared: " + (removed.photoId === null) + "   blobs left: " + removed.blobs);
    console.log("    second add  set: " + !!second.photoId + "   blob present: " + second.pointsAtLiveBlob);
    const ok = first.pointsAtLiveBlob === true && removed.photoId === null && second.pointsAtLiveBlob === true;
    console.log("");
    console.log(ok ? "  no fault reproduced" : "  *** REPRODUCED ***");
  } finally {
    cdp.close(); chrome.proc.kill(); server.kill();
  }
};

main().catch((e) => { console.error("  FAILED: " + e.message); process.exit(1); });
