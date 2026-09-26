# The measurement harness

Rebuilt 25 September, after an audit found that all fifteen `scratchpad/*.mjs`
scripts this project's notes tell you to re-run had never been committed. This
is the first piece back. **Anything else rebuilt goes here, not in
`scratchpad/`.**

```sh
npm run build                 # it photographs dist/, so build first
node tools/harness/shoot.mjs  # writes tools/harness/out/
```

No Puppeteer and no dependency: node 22 ships a native WebSocket and CDP is
JSON over one socket.

## Files

| | |
|---|---|
| `cdp.mjs` | launch Chrome, attach, evaluate, screenshot |
| `books.mjs` | a fixture built through the app's own `make*` factories |
| `shoot.mjs` | boot, seed, drive, measure, capture |
| `probe-overlap.js` | does the floating install card cover content |

## What the fixture is for

`books.mjs` exists to make **all time differ visibly from this month**. A seed
whose sales all fall in the current month cannot tell the two periods apart, so
a screenshot of it agrees with the summary card whichever period the card is
showing -- a check that cannot fail. Most of the money is banked deliberately
in the months before this one:

```
all time    FCFA 23,302,000 profit   FCFA 62,450,000 revenue   37%
September   FCFA  7,092,000 profit   FCFA 17,670,000 revenue   40%
```

Even the margin differs, so a shot has two independent tells.

## Things that are in here because they cost a session once

- **Prove the preview server answers before measuring.** A harness that cannot
  connect and a page that is broken both produce a blank screenshot.
- **Evict the service worker and caches first**, or it photographs the build
  you shipped last month. The tell is the app's own update sheet in the shot.
- **Poll for `.bt-app`; never wait a fixed time.** After a rebuild the first
  load refetches every asset, and a slow load looks exactly like an empty page.
- **`Page.enable` before `addScriptToEvaluateOnNewDocument`**, which is inert
  without it -- and a shim that never installed reports what a shim that saw
  nothing reports.
- **`awaitPromise` on every evaluate.** Without it an async probe serialises as
  `{}`: an unfinished answer that reads as an empty one.
- **A metrics override dies with the socket that set it**, so measuring "at
  320" from a second connection silently measures the real window.
- **NO BACKSLASHES AND NO REGEXES THROUGH A QUOTING LAYER.** Writing this file
  set lost `\` twice in one sitting, which is why the Chrome path uses forward
  slashes and why `probe-overlap.js` is a file rather than an inline string.
- **An absence is not a clearance.** `measureOverlap` waits for the install
  card and says so explicitly when it never appears, because the first version
  reported `installCard: false` for a screen whose screenshot plainly showed
  one.

## Not rebuilt yet

`sweep` (5 screens x 6 widths x 2 themes), `clip` (the 320px check), `measure`
(alignment columns), `demoscreens` and `marketing` (the landing page's 19
screens and 129 zones). Until `demoscreens` and `marketing` exist the demo shop
cannot be renamed: the names are painted into six WebP screenshots.
