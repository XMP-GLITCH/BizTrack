/**
 * Boot the built app on seeded books, and photograph a screen.
 *
 *   node tools/harness/shoot.mjs [outdir]
 *
 * Every step below exists because of something this project has already paid
 * for once:
 *
 *  - It PROVES the preview server answers before it measures. A harness that
 *    cannot connect and a page that is broken both produce a blank screenshot.
 *  - It unregisters the service worker and clears caches BEFORE loading, or it
 *    photographs the build you shipped last month. The tell is the app's own
 *    update sheet appearing in the shot.
 *  - It POLLS for `.bt-app` rather than waiting a fixed time; after a rebuild
 *    the first load refetches every asset, and a slow load looks exactly like
 *    an empty screen.
 *  - It reports what each step actually matched. A click that silently matched
 *    nothing is indistinguishable from one that worked.
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { launch, attach } from "./cdp.mjs";
import { books, storageBlob } from "./books.mjs";

const OUT = process.argv[2] || "tools/harness/out";
const PORT = 4319;
const ORIGIN = `http://127.0.0.1:${PORT}`;

const env = readFileSync(".env.local", "utf8");
const REF = (env.match(/VITE_SUPABASE_URL=https:\/\/([a-z0-9]+)\./) || [])[1];
if (!REF) throw new Error("could not read the project ref from .env.local");

const LEGAL = (readFileSync("src/legal/documents.js", "utf8")
  .match(/LEGAL_VERSION\s*=\s*["']([^"']+)/) || [])[1];
if (!LEGAL) throw new Error("could not read LEGAL_VERSION");

/**
 * A session the app accepts without a network call. supabase-js does not
 * verify the token locally and only refreshes near expiry, so a far-future
 * `expires_at` means `getSession()` answers from localStorage and the app
 * takes the real signed-in route.
 *
 * `setup_done_at` and `accepted_legal_version` are on USER METADATA because
 * that is where the app reads them -- without both, this lands on onboarding
 * or the consent gate instead of the screen under test.
 */
function session() {
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    email: "ebong@example.com",
    user_metadata: {
      display_name: "Ebong",
      setup_done_at: "2026-09-01T00:00:00.000Z",
      accepted_legal_version: LEGAL,
    },
    app_metadata: { provider: "email" },
    aud: "authenticated", role: "authenticated",
  };
  return JSON.stringify({
    access_token: "harness.not.a.real.token",
    refresh_token: "harness-refresh",
    token_type: "bearer",
    expires_in: 999999999,
    expires_at: 4102444800,           // 2100
    user,
  });
}

/**
 * Measure the install card's overlap -- and WAIT for the card first.
 *
 * `InstallPrompt` starts with `isStandalone = true` and only reveals itself
 * once its effect has run, so a probe fired the instant the app mounts finds
 * nothing. The first version of this reported `installCard: false` for a
 * screen whose screenshot plainly showed the card: a NOT-FOUND wearing a
 * NOT-OVERLAPPING costume, which is the fault this project keeps paying for.
 * So the absence is now a separate, explicit answer.
 */
async function measureOverlap(cdp) {
  const probe = readFileSync("tools/harness/probe-overlap.js", "utf8");
  let last = null;
  for (let i = 0; i < 40; i++) {
    last = await cdp.evaluate(probe);
    if (last && last.installCard !== false && last.room) return last;
    await sleep(100);
  }
  if (last && last.installCard !== false) {
    // The card is up but published nothing. That is a real failure of the fix,
    // and it must not be reported as an overlap finding.
    return { ...last, note: "card rendered but --bt-install-room was never set" };
  }
  return { installCard: false, note: "card never rendered within 4s -- absence, not clearance" };
}

const main = async () => {
  mkdirSync(OUT, { recursive: true });

  // 1. the preview server, proven to answer before anything is measured
  const server = spawn("npx", ["vite", "preview", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", shell: true });
  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    try { up = (await fetch(ORIGIN + "/")).ok; } catch { await sleep(250); }
  }
  if (!up) { server.kill(); throw new Error(`preview server never answered on ${ORIGIN}`); }
  console.log("  server   answering on " + ORIGIN);

  const chrome = await launch({ port: 9444 });
  const cdp = await attach(chrome.base);
  const shots = [];

  try {
    await cdp.send("Emulation.setDeviceMetricsOverride",
      { width: 390, height: 820, deviceScaleFactor: 2, mobile: true });

    // 2. land on the origin so storage is writable, then evict the worker
    await cdp.send("Page.navigate", { url: ORIGIN + "/" });
    await sleep(600);
    const evicted = await cdp.evaluate(`(async () => {
      const rs = await (navigator.serviceWorker?.getRegistrations?.() ?? []);
      for (const r of rs) await r.unregister();
      if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
      localStorage.clear(); sessionStorage.clear();
      return { workers: rs.length };
    })()`);
    console.log(`  cleaned  ${evicted.workers} service worker(s), caches and storage`);

    // 3. seed
    const blob = storageBlob(books());
    await cdp.evaluate(`(() => {
      localStorage.setItem(${JSON.stringify("biztrack-storage-v3")}, ${JSON.stringify(blob)});
      localStorage.setItem(${JSON.stringify("sb-" + REF + "-auth-token")}, ${JSON.stringify(session())});
      localStorage.setItem("biztrack-analytics-consent", "false");
      return true;
    })()`);
    console.log("  seeded   3 businesses, a session, consent answered");

    // 4. reload and WAIT FOR THE APP, not for a clock
    await cdp.send("Page.navigate", { url: ORIGIN + "/" });
    let ready = null;
    for (let i = 0; i < 160; i++) {
      ready = await cdp.evaluate(`(() => {
        const app = document.querySelector('.bt-app');
        const screen = document.querySelector('.bt-screen');
        return { app: !!app, screen: !!screen,
                 heading: document.querySelector('h1')?.textContent?.trim() || null,
                 body: (document.body?.innerText || '').slice(0, 80) };
      })()`);
      if (ready.app && ready.screen) break;
      await sleep(125);
    }
    if (!ready?.app) {
      console.log("  NOT THE APP. body begins: " + JSON.stringify(ready?.body));
      throw new Error("never reached .bt-app -- a gate screen is probably up");
    }
    console.log(`  app      mounted, heading ${JSON.stringify(ready.heading)}`);

    // 5. read the card, then photograph it
    const card = await cdp.evaluate(`(() => {
      const el = document.getElementById('home-summary');
      if (!el) return null;
      const t = (s) => Array.from(el.querySelectorAll(s)).map(n => n.textContent.trim());
      return { label: el.querySelector('p')?.textContent.trim(),
               // Read the ELEMENTS. Splitting innerText needs a newline escape,
               // and an escape inside page code sent through a template literal is
               // one more quoting layer to lose -- which this file already did.
               all: Array.from(el.querySelectorAll('p')).map(n => n.textContent.trim()).filter(Boolean) };
    })()`);
    console.log("  card     " + JSON.stringify(card));

    const shoot = async (name) => {
      const png = await cdp.send("Page.captureScreenshot", { format: "png" });
      const file = `${OUT}/${name}.png`;
      writeFileSync(file, Buffer.from(png.data, "base64"));
      shots.push(file);
      console.log("  shot     " + file);
    };
    // The same measurement on HOME, because `.bt-has-fab` pads 148 to clear the
    // Sale button (top at 136) and the install card is taller than that. If it
    // overlaps here too, this is not "Analytics is missing a class", it is the
    // ladder never accounting for the card's HEIGHT on any screen.
    const homeOverlap = await measureOverlap(cdp);
    console.log("  home-ovl " + JSON.stringify(homeOverlap));
    await cdp.evaluate(`(() => { document.querySelector('.bt-screen').scrollTop = 0; return true; })()`);
    await shoot("home");
    writeFileSync(`${OUT}/home.json`, JSON.stringify(card, null, 2));

    // 6. Analytics, because the Home change is only half a claim. If that
    //    screen ALSO leads with all time then the two have not been split,
    //    they have been merged, and the reason given for the change is wrong.
    //    Click the SMALLEST matching element -- an outer wrapper contains every
    //    label on the screen -- and report what was hit, because a click that
    //    matched nothing reads exactly like one that worked.
    const hit = await cdp.evaluate(`(() => {
      const all = Array.from(document.querySelectorAll('button, a'));
      const want = all.filter(el => (el.innerText || '').trim().toLowerCase() === 'analytics');
      if (!want.length) return { clicked: false, saw: all.length };
      want.sort((a, b) => (a.getBoundingClientRect().width * a.getBoundingClientRect().height)
                        - (b.getBoundingClientRect().width * b.getBoundingClientRect().height));
      const el = want[0];
      const tag = el.tagName + ':' + (el.innerText || '').trim().slice(0, 24);
      el.click();
      return { clicked: true, hit: tag };
    })()`);
    console.log("  nav      " + JSON.stringify(hit));
    if (!hit.clicked) throw new Error("no Analytics control found");

    let heading = null;
    for (let i = 0; i < 80; i++) {
      heading = await cdp.evaluate(`(() => {
        const h = document.querySelector('.bt-screen h1');
        const lab = Array.from(document.querySelectorAll('.bt-screen p'))
          .map(n => n.textContent.trim()).filter(t => t.startsWith('Profit'));
        return { h: h?.textContent.trim() || null, labels: lab.slice(0, 3) };
      })()`);
      if (heading.h && heading.h !== 'Your Businesses') break;
      await sleep(100);
    }
    console.log("  analytics " + JSON.stringify(heading));
    writeFileSync(`${OUT}/analytics.json`, JSON.stringify(heading, null, 2));
    await shoot("analytics");

    // Measure, do not eyeball. This project has reverted four confident
    // findings that measurement killed -- including one claiming the Sale
    // button covered the list, when the last row cleared it by 69px.
    const overlap = await measureOverlap(cdp);
    console.log("  overlap  " + JSON.stringify(overlap));
    writeFileSync(`${OUT}/overlap.json`, JSON.stringify(overlap, null, 2));
    await shoot("analytics-bottom");

    // LANDSCAPE is the case a constant gets wrong. Below 520px tall the card
    // drops its explanatory sentence, so it is shorter AND sits at a different
    // offset -- which is the whole argument for publishing a measured value
    // instead of typing a number into six CSS rules.
    for (const [w, h, label] of [[740, 400, "landscape"], [360, 640, "small"]]) {
      await cdp.send("Emulation.setDeviceMetricsOverride",
        { width: w, height: h, deviceScaleFactor: 2, mobile: true });
      await sleep(400);
      const o = await measureOverlap(cdp);
      console.log(`  ${label.padEnd(9)} ${w}x${h} pad ${o.paddingBottom} covered ${o.coveredCount} ${JSON.stringify(o.covered || [])}`);
      await shoot("analytics-" + label);
    }
  } finally {
    cdp.close();
    chrome.proc.kill();
    server.kill();
  }
  console.log("\n  done: " + shots.join(", "));
};

main().catch((e) => { console.error("  FAILED: " + e.message); process.exit(1); });
