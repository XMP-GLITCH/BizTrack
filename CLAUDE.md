# BizTrack: working context

Claude Code reads this file automatically at the start of every session. It
exists because the work so far happened in a web session whose transcript does
not travel; this is that reasoning, written down.

---

## What this is

An offline-first PWA for tracking inventory, sales and profit across several
small businesses. Built for small business owners in West/Central Africa, with
XAF as the default currency.

**It is not a crafts app, and it stopped being one on 16 September 2026.** It
was first written for young women making and selling by hand, and the category
list, the copy and the examples all said so. One of the two real users sells
electronics. The owner's decision: the audience is anyone running a business,
whatever they sell, including services and digital goods. The product is a place
to keep business records, not a maker's tool. Copy that names the audience
should say that, and the category list should not privilege one trade.

Two people use it today. The goal is a real public product: **~130 paying users
by end of December**, at 3,500 XAF/month or 30,000/year.

Offline-first is a **product decision, not legacy debt**. Mobile data is
expensive and intermittent for these users, so the app reads and writes locally
and syncs when it can. Do not "modernise" this into a server-rendered app that
spins a loading skeleton when the network drops.

---

## Where things stand

| Phase | State |
|---|---|
| 0. Stabilise | ✅ Done. Install prompt, hook-order crash, data validation, honest security copy. |
| 1. Ledger data model | ✅ Done. Integer money, stock ledger, per-entity store, legacy migration. |
| 2. Supabase | ✅ Done, 8 Sep 2026. Schema applied to the live project, RLS verified against it, Google sign-in working end to end. |
| 3. Public launch | ✅ Shipped 11–13 Sep 2026. Live at **biztrack.store**. Accounts, Google sign-in, email codes, password reset, branded email, legal documents, analytics, notifications, all deployed and verified end to end. What remains is not engineering: getting the two existing users onto accounts, and a lawyer reading the documents before money changes hands. |

**The schema blocker is gone.** It was applied on 8 September and every table
answers. What now stands between this and paying users is the list at the end
of the 8 September session log.

Project ref: `ufyyurmekegbzkqjisdb`. `.env.local` is gitignored and must be
recreated on each machine, or the app silently runs local-only.

---

## The three ideas the code is built around

**1. Money is an integer in the currency's minor unit.** XAF has no subunit, so
1 500 XAF is `1500`; USD has two, so `$15.00` is `1500`. Never floats. They
drift across the sums every screen performs, and books off by a franc destroy
trust faster than a crash. Currency lives on the *business*, not globally, so an
amount is always interpretable.

**2. Stock is a ledger, not a counter.** Quantity on hand is derived by summing
`stockMovements`. This is what lets two offline devices each sell the last unit
and both keep their sale. A stored counter would have both write "4" and lose
one. It also means restocking at a new price averages in rather than
retroactively repricing stock already on the shelf, and "why is my stock 3?" is
answerable.

**3. Records were built to sync before there was a server.** Client-generated
UUIDs, `updatedAt` on every mutation, soft deletes via `deletedAt`. A hard
delete cannot propagate: the other device can't distinguish "deleted" from
"not seen yet".

---

## Deliberate choices that look like bugs

Do not "fix" these without discussing:

- **Overselling is CONFIRMED, not blocked, and not silent.** Changed on
  17 September 2026 at the owner's request; it used to go straight through.
  The form now refuses until an explicit "Record it anyway", and the reason it
  is a question rather than a refusal is the original reasoning, which still
  holds: a refusal does not undo the sale, it only stops it being written down.
  The customer has walked off with the goods and the cash is in the drawer
  either way, and an app that will not record real money teaches people to keep
  a second set of books. So the ACCIDENT is blocked and the FACT is not.
  `hasStockDiscrepancy` and its toast stay, because a negative balance can also
  arrive from another phone's sale on the next sync.
- **The PIN is not encryption.** It is a local device lock over already-local
  data. The About copy used to claim "industrial-grade encryption". That was
  false and was removed. Do not reintroduce security claims.
- **Sign-out does not delete local records.** They may not be backed up yet.
- **Auto data-rescue only scans *legacy* storage keys.** Scanning the live key
  resurrected data the user had just signed out of.
- **`replaceBusinesses` is the one bulk write left.** Restore genuinely replaces
  everything, and its input is validated by `parseBackup` first.
- **Sync is pull-based, not Realtime.** One owner on one or two devices over
  metered data does not need a websocket. Revisit when staff accounts land.
- **`business_members` exists though the UI never creates more than one row.**
  Retrofitting tenancy onto live data is the migration to avoid.
- **`is_business_member()` is `SECURITY DEFINER` on purpose.** A policy on
  `business_members` that queries `business_members` recurses infinitely.
- **Analytics holds usage only, never business content.** No item names, no
  amounts, no customer data. Enforced by an allowlist in `src/analytics`, not
  by call-site discipline. That table reaches dashboards and exports, so a
  franc of revenue in it would make every future breach a financial one.
- **There is no cookie banner, deliberately.** No advertising or third-party
  tracking cookies exist, so a consent dialog would imply consent was needed
  for things it was not. What *is* asked for is what genuinely needs it:
  analytics, and transferring data outside Cameroon. Adding a third-party
  analytics SDK changes this.
- **The claim flow offers no "keep only this device's books".** With a
  merge-based sync there is no honest way to deliver it: the next pull brings
  the account's rows straight back. A choice the code cannot keep is worse than
  no choice at all.
- **An unreachable server is never read as an empty one.** `inspectRemote()`
  returns null on failure and the claim flow then does nothing and asks again
  next launch. Treating offline as "the account is empty" is how a merge prompt
  becomes silent data loss.
- **Every email carries a six-digit code beside its link.** Not a fallback: on
  Android the link often opens a browser that is not the installed PWA, so the
  code is the reliable path. `AuthScreen`'s `verify` mode is where it is spent.
- **Apple sign-in was built, then removed.** It needs a paid Developer Program
  membership and this audience is overwhelmingly Android. `signInWithApple`
  stays in `auth.js`; only the button is gone.
- **Pinch zoom is disabled on purpose.** `user-scalable=no` in `index.html` is
  a product decision, not an oversight: this is a PWA people install and run as
  their till, and an app that zooms when a thumb brushes it does not feel like
  one. Worth knowing before touching it: iOS Safari has ignored that flag since
  iOS 10, so it only binds on Android, where "Force enable zoom" overrides it.
  And it is *not* what stops iOS zooming into a form field on focus, that is
  the input's font-size, which is why inputs are 16px. Keep them there.

- **One native `alert()` survives, in `src/main.jsx`.** Every other one became
  a toast or a dialog, both of which are React. That one fires when React has
  already crashed, so React is exactly what cannot be trusted to render it.
- **`--focus-ground`, `--focus-ink` and `--on-color` are the same in both
  themes, deliberately.** They are for surfaces that are not the page: the
  permanently dark screens, and anything painted in a business's own colour.
  Redefining them in the dark block is the bug they were created to fix.
- **`COLORS` must stay literal hex.** It is the palette an owner picks their
  business colour from, an identity rather than a meaning, and `heroTint()`
  silently returns its input untinted for anything that is not a six-digit hex,
  which drops white text onto an unmodified colour.

- **Motion durations are short on purpose.** 90 / 160 / 240 / 400ms, and
  nothing longer. Past roughly 250ms an animation on a mid-range Android reads
  as the phone being slow rather than as polish, and the person taps again.
  Anything that wants half a second is a decoration, not feedback.
- **List rows are not staggered, and nothing has an exit animation.** Both are
  deliberate omissions, not oversights. A staggered list delays the first row on
  every navigation of a ledger someone opens twenty times a day, and an exit
  animation means owning a closing state in every component that can unmount.
- **The theme switch is not animated at all.** It used to be animated on `body`
  only, which is worse: every surface is painted by an inline style that no
  stylesheet rule reaches, so the cards flipped in one frame while the page
  behind them crawled. Partly animated reads as a rendering fault.

- **`downloadSnapshot` is the PRE-UPGRADE backup, and only that.** It is wired
  to exactly two controls, both of which say so. It is not a general "download
  my data": it hands back a file written once before the ledger migration and
  never rewritten, so offering it to someone about to erase their phone loses
  every sale since. Current books come from `buildBackup` + `saveBackupFile`;
  the crash path uses `emergencyExport`, which captures both.

- **Settings and Account divide on one rule.** Settings is decisions about how
  the app behaves; Account is your identity, your credentials and your files.
  Every row was sorted against it once. A new row goes on whichever side that
  sentence puts it, not wherever there is room.
- **The usage-data switch lives at the foot of About BizTrack > Features, and
  that is as deep as it goes.** Deliberately off the settings list. It keeps the
  label "Share usage data" and the privacy policy names the full route, because
  a consent the policy calls withdrawable has to stay reachable by a documented
  path. Deep is fine; undocumented or renamed is not.
- **`sectionHead` owns the break above it; `sectionLabel` is type only.** They
  are not duplicates. `sectionLabel` goes inside `sectionRow`, a centred flex
  row, and is the base for the onboarding headings, where a top margin would
  misalign the label against the button beside it. `sectionHead` is for a label
  that STARTS a section in a scrolling column. One ratio for the whole app:
  **12 within a group, 28 between sections**, where 28 is `tabInner`'s 12px gap
  plus the head's own 16. Do not fake a break with a `marginBottom` on whatever
  happens to come first; that is what this replaced.
- **There is ONE photo column and it is 100.** `PHOTO = { size: 48, radius: 12,
  gap: 12 }` in App.jsx, and 100 is 24 of gutter + 16 of card padding + 48 + 12.
  A product photo is CONTENT, not an interface glyph, so it does not sit in the
  20px icon slot that puts text on 72; it gets a real column, 28px clear. Every
  row that leads with a picture uses it: inventory, sales, Overview's recent
  sales and best seller, the deep page's top items, the thinnest-margin card. A
  picture that is really a glyph, like the low-stock strip's, takes the 20px
  slot and lands on 72 instead. Do not add a third line between them.
- **A card holding a chart pads 16 top and bottom and 8 at the sides, and the
  8 is measured.** At 320 those 16px of extra plot are worth one more week
  label on the axis, 7 of 8 rather than 6; at 360 and up they cost nothing.
  That is the design system's "unless content genuinely demands asymmetry",
  used once, with a number behind it. What was wrong before was the VERTICAL
  asymmetry, 16 above the plot and 8 below, which nobody chose.
- **The ring's centre demotes its currency unit, like `DisplayAmount` does.**
  The hole measures 115px and the plain string measured 124, so the total was
  printing over the coloured band it is the total OF. Demoted it is 101, with
  14px clear. That headroom is about one more digit: past roughly a million the
  figure touches the band again, and the fix then is the ring's `innerRadius`,
  not a smaller type step.
- **Analytics leads with ONE finding, and it is not a card.** `portfolioFinding`
  in `domain/stats.js` picks WHICH fact, `AnalyticsLead` in App.jsx decides how
  to say it, and the split is deliberate: arithmetic is testable and English is
  not. It is drawn on the page ground with no surface, no border and no radius,
  because the finding it answers was eleven near-identical cards and the fix
  for that is not a twelfth. It is deliberately not tappable: it names the shop
  and the product, and a control that does not look like one is a mistake this
  file has already recorded once.
- **A business colour is UNIQUE, and colours already taken are not offered.**
  The form used to default to the next free colour, which made two shops
  distinct by accident and did nothing about someone opening the picker and
  choosing one that is already in use. On Analytics the colour IS the legend --
  there is no other one -- so a duplicate does not look untidy, it makes the
  ring unreadable with nothing on the page to resolve it against. Withheld
  rather than shown-and-disabled, because the only explanation for a greyed
  swatch is "another shop has it", which the Home list says better. Sixteen
  colours and no way to edit one afterwards, so a seventeenth business gets the
  whole palette back: a duplicate is bad and an unusable form is worse.
  `QuickPick` hides its more-button when the tail is empty, which it can now be.
- **The portfolio Analytics page does NOT rank products across businesses.**
  A business is the boundary where stock, cost and price are comparable.
  Ranking a shawl against a phone screen replacement produces an order nobody
  can act on, and across two currencies it is simply wrong. That reasoning was
  already in this file as the argument for the deep page; the cross-business
  "What earns the most" list contradicted it for five rows and about a third of
  the screen. The per-business version on the deep page is the same question
  asked where it has an answer.
- **The weekly chart starts at the FIRST SALE, not eight weeks ago.** Leading
  empty weeks are dropped; interior ones are kept, and that distinction is the
  rule. A gap in the middle is information and closing it up turns a stall into
  a smooth line, but weeks before the first sale are not a quiet patch, they
  are time the shop did not exist in these books. Drawing them put every bar in
  the right third of the card under an empty expanse, which reads as a broken
  chart rather than a short history. `maxBarSize` exists because of this: two
  bars sharing 280px are 100px slabs. This is half of the PINNED question,
  answered from the side that needed no new decision.
- **THE RING IS GONE. Share of profit is ONE STACKED BAR, and the total is a
  line of type beside the heading.** Widening the hole to 70% bought clearance
  and did not fix what was actually wrong, which measuring the INK rather than
  the boxes finally showed: every box was dead centre, label dx 0 and value
  dx 0, while the DIGITS sat **13.7px right of the ring's centre**, because
  this app demotes a currency unit to 0.5em at 50% opacity and that "FCFA" held
  27.4px of width carrying almost no ink. A circle is the least forgiving shape
  for an off-axis block: it is radially symmetric, so the offset shows against
  every part of the band at once, and the label above was centred on a
  different axis again.
  **A bar has no centre to miss.** It is anchored left and right by
  construction, so that failure mode does not exist, and the total moved onto a
  left-aligned line where there is nothing to centre. It also answers the
  question better: share is part-to-whole, and "how much of this rests on one
  shop" is a length against a length rather than an arc against an arc.
  It is 16px on the page ground against a 232px card, it needs no legend
  because the rank discs below carry the same colours, and it is flexbox, so
  this section pulls no chart library at all. `ShareRing.jsx` is still on disk
  while the owner compares; delete it once that is settled.
- **The bar's colours were re-measured against the PAGE, not the card.**
  `ringColor` was computed against `--card-bg` and this sits on `--bg-primary`.
  Light mode is the WEAKER ground, not the stronger: worst 5.81 against the
  page where it is 6.16 against a card, and that worst case is the documented
  worst of the sixteen. Dark mode improves, 7.54. Both are far above the 3:1 a
  non-text graphic needs. The first attempt at this check read `.bt-screen`'s
  computed background, got `rgba(0,0,0,0)`, and silently compared everything
  against BLACK -- a check reporting clean for the wrong reason. Resolve the
  token, not the computed style.
- **Chart animations are 400ms, which is `--motion-value`.** Recharts defaults
  to **1500**, and that was shipping: nearly four times the longest duration
  this project allows, on a chart read on a mid-range Android where past
  roughly 250ms an animation reads as the phone being slow. Nobody chose it; it
  arrived as a library default through a component that never named the prop.
  Both series carry it, which also fixes a stacked column growing out from
  under a cost segment already drawn at full height.
- **A finding body is about 95 characters, which is THREE lines at 390px.**
  It is the lead of the screen at 16/500 on the page ground, and at five lines
  it was the largest single block there. The number is measured rather than
  guessed: 16px in a 342px column wraps at roughly 30 characters, so 95 is
  three lines and two lines would be 65 -- not reachable for a finding that has
  to name a product, a shop and a number. This rule was first written as "two
  lines", which was wrong, and measuring the rendered block is what caught it.
- **On its own sheet, the PICTURE is the control.** The item photo sheet had
  four controls for one job: a big Change, a big Remove, a "Photo" label above a
  sheet already titled with the product's name, and a big Done for a change that
  was already written. It is one large tappable image now, with Remove as a
  quiet text button when there is something to remove. `PhotoField` keeps its
  thumbnail-and-buttons shape for the FORM, where it is one field among five and
  must not lead the screen; `solo` is the other one.
- **The finding ladder is ordered by what costs money soonest.** oversold,
  losing, runningOut, thinMargin, concentrated, steady. A ladder's bug is never
  the top rung, it is a rung firing when a more urgent one should have, so
  every test for it sets up a book where several rules are true and asserts
  which wins. Two thresholds exist only because a test caught the rule being
  wrong: a top earner must also be worth at least a tenth of item profit, or a
  trinket leads the screen, and a thin margin needs three units sold, or one
  experimental price does. Nothing in the ladder may compare this month against
  last: the summary card directly above already says that.
- **Stock health is measured in MONTHS OF COVER, not only in sell-through.**
  Both are in `inventoryHealth`, and they answer different questions.
  Sell-through is the share of everything ever held that has moved: familiar,
  comparable, and blind to time. Months of cover is how long the shelf lasts at
  the pace it is really selling, and it is the one that changes behaviour,
  because "forty-two months of stock" is a sentence an owner can act on and
  "7%" is not. The pace is measured over the BUSINESS'S trading window, first
  sale to today, never over the days one product happened to sell on: the other
  way flatters anything that only started moving recently, which is exactly
  what an overstock check must not let through.
- **"Since the last restock" is per ITEM and must stay that way.** Nobody
  restocks a whole shop at once, so a shop-wide "since the last inventory"
  would be a boundary that does not exist in the data. Per item it is already
  in the ledger and needs nothing invented.
- **`costSuspect` catches a missing zero, not only a missing cost.** Cost of
  exactly zero is the obvious case. The one that got through was a product with
  490 units on the shelf whose unit cost had been typed as 50 against a selling
  price over 110,000: not zero, so a zero check passed it, and the capital on
  the shelf came out understated by millions while its margin read 100%. The
  rule is stock on hand AND cost under 2% of the selling price. `qty > 0` is
  what keeps services and digital goods out, since a genuinely costless line
  has no shelf to sit on.
- **With ONE business the Analytics tab IS that business's deep page.** No
  overview, no drill-down. The portfolio level and the business level are the
  same numbers when there is one of them, and a screen that shows a total then
  asks you to tap your only business to see the same total is a tollbooth on
  every visit. Both real users are in this case. `BizAnalysisScreen` takes an
  optional `biz`, `onBack` and `title` so one component serves as both a root
  destination and a sub-screen; do not fork it into two.
- **THE LANDING PAGE IS STATIC MARKUP IN `index.html`, NOT A ROUTE.** Three
  reasons, in the order they matter. It paints with the HTML, so someone
  arriving from a WhatsApp link on a slow connection reads what BizTrack is
  while the 166KB of app is still downloading. It changes no routing, so
  `start_url`, the service worker scope and the per-origin localStorage that
  this project's entire rescue history comes from are untouched. And the app
  boots underneath it, so by the time anyone taps Get started the sign-in
  screen is already mounted.
  A pre-paint script sets `bt-returning` on `<html>` when localStorage holds
  either the ledger or a `-auth-token` key, and one CSS rule hides the landing
  on that class. **That check is what keeps an installed PWA opening the till
  rather than a marketing page**, since `start_url` is `/`; changing
  `start_url` later does not remove the need for it, because an app installed
  before that change keeps the old one forever. The catch shows the landing,
  which is the safe default: a private window throws, and a first-time visitor
  is who it is for.
  **`?landing` forces it on**, and that exists because the owner can otherwise
  never see their own landing page: their browser holds their books, so the
  check hides it on every visit, and reviewing marketing copy would mean
  clearing site data or opening a private window after every edit. A page
  nobody can look at is a page that quietly goes stale.
  **It promises no discount.** It says fifty places, free while the beta runs,
  and that the price is announced before it applies. A discount promised at
  signup is a discount committed to before the cohort is known, and that is the
  owner's call to make later.
- **THE PICTURES ON IT ARE THE REAL APP, AND NOT OF A CRAFTS SHOP.** Not
  illustrations, not a 3D render, not stock photography: `public/shot-home.webp`
  and `shot-analytics.webp` are screenshots of this build, captured by
  `scratchpad/marketing.mjs` from **`scratchpad/seedMarket.mjs`**, which exists
  precisely because the ordinary seed leads with "Sabi Crochet" and a ball of
  yarn. That is the audience this app stopped having on 16 September, and a
  marketing screenshot put it back on the first thing a stranger ever sees. The
  marketing seed is a provisions store, an electronics counter, a repair bench
  and a kitchen. **Alt text is a claim too**: it named the old products until
  the screenshots changed under it.
  **WebP straight out of CDP** rather than PNG-then-convert: 48KB and 20KB,
  because a hero heavier than the app would undo the page's only argument.
  Re-run that script whenever the screens it photographs change; a landing page
  showing last month's interface is the same class of stale claim this file
  records about copy.
- **THE PHONE ON THE LANDING PAGE IS A DEMO, AND IT MUST NEVER BE THE REAL
  APP.** Tapping the app's own controls in the picture swaps the picture.
  Nineteen real screens: Home, Analytics, Settings, Home's own sale sheet, and
  for each of the three shops visible on Home, its Overview, Inventory, Sales,
  Invoices and the record-a-sale sheet, keyed `bN-overview` / `-stock` /
  `-sales` / `-bills` / `-sale`.
  **Home's sale sheet is its own screen and not a shop's**, because with
  several businesses the app asks "Which business?" first; wiring Home's button
  to a shop's sheet would skip a question the app actually asks.
  **THE SALE SHEET DOES NOT ACTUALLY RECORD, and it is filled with a sale the
  shop ALREADY HAS -- its most recent one.** Recording would change the books,
  and these are the same books behind the hero image and the two marketing
  crops, which `marketing.mjs` captures from a separate run of the same seed; a
  sale added here and not there would make the demo's Home screen disagree with
  the hero it IS. Mirroring the newest sale is what removes the seam: tap
  Record Sale and the list you land on is topped by exactly the line the form
  was showing, because that line is real. Fill it with anything else and the
  join shows at once.
  **The product pictures are TILES, not photographs**, drawn on a canvas by the
  harness into the app's own `biztrack-photos` IndexedDB. The rule that the
  pictures are the real app is about the SCREENSHOTS, which they still are; the
  books in them have always been invented, down to the customers on the
  invoices. Real photographs would be better and the harness will use them the
  moment there are any -- same ids, same store. The harness VERIFIES each tile
  is painted before storing it: one came out fully transparent, and JPEG has no
  alpha, so it encoded as a solid black square.
  Running the actual app there is the obvious idea and it is the one to
  refuse, because **localStorage is per ORIGIN**: demo books seeded at
  `biztrack.store` go into `biztrack-storage-v3`, the same key a real user's
  books live in, and the pre-paint check then reads them as "returning user"
  forever. That is this project's entire v1.5.3 to v1.5.7 rescue history,
  aimed at strangers. Accounts are mandatory too, so there is no app to show
  without forging a session in someone else's browser.
  **THE WHOLE GRAPH IS GENERATED.** `scratchpad/demoscreens.mjs` drives the
  real app on the marketing seed, photographs every screen, MEASURES every
  control, and rewrites `window.BT_DEMO` in `index.html` between two markers.
  Do not hand-edit that block and do not type a coordinate: a zone placed by
  eye is a dead control the first time the chrome moves, which this file
  already records in a drag handle that advertised a gesture the app did not
  have. Re-run it whenever the app's chrome changes.
  **It refuses to write a zone that leads nowhere**, and the runtime skips one
  too, so a half-captured run cannot ship a hotspot that does nothing.
  **ZONES GO IN THE APP'S OWN PAINT ORDER: list, then the floating Sale
  button, then the bar.** A later sibling wins a tap, and getting this wrong
  shipped a real defect the owner caught: the last shop row measures 83.5% to
  94.6%, which is the strip the FAB and the bottom bar are drawn over, so with
  the rows last they won every tap there -- **the "+ Sale" button on Home
  opened QuickFix Phones**, and the top of all three bar items did too. Nothing
  is clipped to fix it; the same rule the app uses decides it.
  **The generator asserts no zone is buried**, by sampling each zone against
  the ones above it and failing if under a quarter of it is left. Overlap on
  its own is faithful -- the app's list runs under the app's bar -- but a zone
  with nothing left is a control answering a tap it can never receive.
  **Not everything visible is wired, deliberately.** "Delete this business"
  sits in the corner of every business screen and must never be reachable from
  a marketing page, and a text field in a photograph cannot take a keyboard.
  What is wired is navigation: the bar, the shops, the tab strip, and back.
  **Nothing is fetched until a tap.** The screens are ~37KB each and total
  608KB; a visitor who never touches the phone pays for none of them. The map
  itself is 9.6KB inline, 0.9KB gzipped.
  **The hint is `hidden` in the markup and unhidden by the script**, because
  without JS there are no hit areas and a line telling people to tap a picture
  that cannot answer is the dead control this design exists to avoid.
  `.frag` carries `pointer-events: none` because it overlaps the phone and
  otherwise eats taps on the bar.

- **The landing page animates; the app still does not.** The app's 90/160/240/
  400ms ceiling exists because it is a till read at a stall with a customer
  waiting. **That reasoning is about the app**, and this page is read once by a
  stranger who owns nothing yet, so its reveals run at 500ms with a 70ms
  stagger. Same argument reverses the no-stagger rule: that one is about a
  ledger opened twenty times a day, where a stagger delays the first row every
  time. Only `opacity` and `transform` move, both composited, because it is the
  same cheap Android either way.
  **NOTHING LOOPS.** This project already shipped an infinite animation running
  for a whole session behind an invisible element; a permanently breathing
  landing page is that mistake in marketing clothes.
  **The hide is gated on a class JS adds**, so a browser that never ran the
  script shows the page at full opacity. Hiding in CSS and revealing in JS is
  how a page goes blank for exactly the people with the worst connections.
- **THE REVEAL SYSTEM HAS HIDDEN CONTENT FOR EVER THREE TIMES, and the third
  is the one to know about.** The observer's root is shrunk by `rootMargin:
  0 0 -8% 0` and the sweep refuses anything below 92%, and those agreeing is
  itself an earlier fix. But the LAST element on the page can come to rest
  inside that bottom strip: the shrunken root never contains it, the gate
  never passes it, and there is no scrolling left to change either. So `atEnd`
  short circuits the gate, and a passive `scroll` listener runs the sweep,
  because if the final movement crosses nothing the observer never fires at
  all. Anything added at the very bottom of this page depends on both.
- **The reveal is a SWEEP, not a per-entry reveal, and that was a real bug.**
  Revealing only the element an IntersectionObserver entry fired for left
  anything that scrolled past unobserved hidden forever: measured, jumping to
  the bottom left **six blocks permanently invisible**. The observer is only a
  cheap trigger now; when it fires, everything at or above the fold is revealed
  whether it was the entry or not. And the safety net CHECKS rather than waits:
  a blanket `setTimeout(showAll, 1500)` fired before anyone scrolled, so the
  observer was doing nothing and the page still looked right, which is a pass
  that hides its own failure.
- **The landing's two buttons dispatch `bt-auth-mode`, and that is why they can
  be trusted.** The page is plain markup outside React and it is dismissed
  AFTER `AuthScreen` has mounted underneath it, so its starting mode cannot be
  a prop and cannot be read in a `useState` initialiser. Until the event
  existed, "I already have an account" dropped people on "Create your account":
  a control that said one thing and did another.
- **Data rescue has THREE doors and the sign-in wall is not one of them.** The
  crash screen, onboarding and the PIN lock, verified by reading which
  component owns each line. A fourth was briefly added to the wall when the
  skip was removed, reasoning that onboarding had gone behind it. Onboarding
  sits immediately AFTER the wall and its door never moved, so that was a
  duplicate on the one screen where it makes least sense: everyone there is
  signing in or creating an account, and finding local books gets neither done.
- **AN ACCOUNT IS REQUIRED. THE NETWORK IS NOT.** "Use BizTrack without an
  account" is gone, and the second sentence is the one that gets misread: you
  need signal ONCE, at the sign-in wall, and everything after is exactly as
  offline as it has always been. This is not permission to make the app wait on
  a server. Two reasons it went, and the second is what made it urgent: an
  account is the backup, and this project's whole v1.5.3 to v1.5.7 rescue
  history came from books living on one phone; and `evaluatePlan(null)` returns
  `canWrite: true` with no expiry, so a signed-out user was **an unlimited free
  tier**, which contradicts "30 days then read-only, not a free tier" and meant
  read-only could be bypassed by signing out.
- **The `isBackendConfigured === false` branch stays, and is NOT a route a user
  can choose.** With no env vars the app runs local-only rather than becoming
  unusable. That is a misconfigured DEPLOY degrading gracefully. Do not delete
  it while removing local-only as a choice; they are different things.
- **READ-ONLY IS ENFORCED AT `setModal`, and that is chosen over wrapping each
  action.** Almost every write in this app starts by opening a sheet, so one
  intercept covers a sale, a business, an item, a restock, a photo, an invoice
  and an edit, and the person is told when they TAP rather than after filling a
  form. `WRITE_MODALS` is the list; `receipt` and `invoice` are deliberately not
  in it, because looking at a document you already have is reading and the
  Terms promise it stays available. The two writes that do not open a sheet,
  `replaceBusinesses` and `updateInvoice`, are wrapped individually.
- **`evaluatePlan(null)` FAILS OPEN and must keep doing so.** A signed-in user
  whose profile fetch did not complete arrives with null. Failing closed would
  refuse to record a sale because of a network error, which is locking someone
  out of their own books for a reason that has nothing to do with payment.
  Asserted in `src/backend/plan.test.js`. Do not "harden" it: the gate is a
  courtesy backed by a conversation, and the database deliberately does not
  enforce it either.
- **THE CAP IS ENFORCED BY THE SCREEN, NOT BY THE DATABASE, because the
  database cannot.** `handle_new_user` runs AFTER insert on `auth.users`, so by
  the time it fires the account exists; with Google sign-in it exists before any
  of our code is involved at all. A trigger can only STAMP what someone gets.
  So `AuthScreen` calls `beta_status()` on mount and never offers the signup
  form when the answer is full. The trigger is the backstop that decides the
  cohort and the plan.
- **`beta_status()` fails CLOSED and `fetchBetaStatus` fails OPEN, and that is
  not a contradiction.** The database says "closed" when its settings row is
  missing, because a half-applied migration must not let an uncapped cohort in.
  The client says "open" when the NETWORK fails, because turning away a real
  person standing in front of the owner over one failed request is the costlier
  mistake. The server refuses when it knows something is wrong; the client
  refuses only when the server said so. Verified: with the RPC returning 404,
  which is the live project today, the signup form renders exactly as before.
- **SIGN IN ALWAYS WORKS, including on the "beta is full" screen.** Only
  signup is capped. One hole is known and accepted: "Continue with Google" from
  the sign-in tab cannot tell a returning user from a new one, so a determined
  stranger can still get an account that way, and gets a normal `trialing`
  profile rather than a beta one. Closing it would mean removing Google sign-in
  from everyone who already uses it to stop a leak of a few against fifty.
- **The waitlist is NOT queued locally, where feedback is.** Feedback is queued
  because it is someone's considered words and losing them is a real loss. A
  waitlist address is worth nothing sitting on the phone of someone who has
  just been told the beta is full: better to say it did not send than to promise
  a place in a queue that exists only on their own device.
- **`profiles.cohort` is null for everyone who predates the beta**, so the two
  existing accounts are excluded from the fifty by construction rather than by
  a date comparison anyone has to get right. `created_at` could have stood in
  and the column exists for the one case a date gets wrong: someone who used
  the app right through the beta and claimed an account afterwards.
- **The BETA state is `plan = 'active'` with a null `plan_expires_at`.** That is
  not a new state, it is the existing one read correctly: writable, no expiry.
  A beta user must never see the read-only banner, and query 3 of
  `supabase/beta-preflight.sql` names anyone stamped wrong at signup.
- **ANALYSIS HAS ONE DOOR, and it is the Analytics tab.** Overview used to
  carry a "Deep analysis" button; it is gone. That button led to a page already
  reachable in one tap from the bar at the bottom of every screen, which is not
  a shortcut, it is a second door, and this project spent a whole pass removing
  those. The business rows on Analytics are the way in.
- **The business Overview tab stays QUICK, and that is what lets the deep page
  be long.** Overview is what you land on and answers "how is this going" in one
  screen; the deep page is on the other tab, so 2,600px of scroll is a choice
  the reader made. If Overview grows a period, a pace or a shelf, it has become
  the deep page and there are two of them again.
- **The month chart stacks profit + cost, so the bar's height is revenue.**
  Grouped bars are what a printed report does and they are wrong on a phone: six
  months side by side is twelve bars across 310px and the pale one hides the
  other. Stacked, the gap between the solid part and the top IS the margin, and
  revenue is never its own series so it cannot double count.
- **`captureBeyondViewport` re-triggers Recharts' mount animation.** It resizes
  the viewport, the bars restart from zero height, and the screenshot catches
  them empty while any series with `isAnimationActive={false}` draws in full. A
  chart photographed that way looks broken and is not. Scroll and shoot the
  viewport instead.
- **`archivedAt` is in the schema and is deliberately UNUSED.** The Inventory
  tab puts sold-out products in a shut group, and that group is a FILTER on a
  list, not an archive: nothing is destroyed, no record changes, and one tap
  reverses it. Wiring `archivedAt` up was the obvious move and it is the wrong
  one, because an owner-declared state needs an owner to declare it and nothing
  here needs declaring -- the ledger already knows what has sold. Sold out is
  `qty === 0 AND sold > 0`, and each exclusion is load-bearing: `qty < 0` is
  OVERSOLD and must stay in the main list with its badge, since hiding the one
  row that needs correcting is the worst thing the group could do; `sold === 0`
  is a product just added and not yet stocked, which the owner is in the middle
  of setting up.
- **THREE places decide what "low stock" means and all three must say
  `qty > 0`.** `bizNote`, the Overview strip, and Home's banner. Home's was the
  one missing it, so a sold-out product counted as low stock and so did an
  oversold one, whose negative balance already has its own banner directly
  above. It survived because the banner printed names and nothing else: it took
  putting "0 left" and "-2 left" on screen for a count of eleven to turn out to
  be a count of seven. An empty shelf is not a low shelf, and the badge on the
  row obeys the same rule -- `Out` at zero, `Low` below the threshold.
- **A low-stock strip anchors its mark to the FIRST LINE, not to the block.**
  `alignItems: "flex-start"`. Those lines carry a shop name, so they wrap at
  320 and at 390, and a glyph centred on a two-line row sits half a line below
  one centred on a one-line row: a column of four marks that do not line up.
  Home's banner and Overview's strip are the same row shape and must not
  disagree.
- **A `Disclosure` header is a card row, not a section label.** The first
  version was a label with a chevron, which made it the only control on the
  screen that did not look like one. Everything tappable in settings is a row
  on a card; a shut section is too.
- **The Home row IS the shop: its ground carries the business's colour, edge to
  edge.** That is one device, not the card coming back. Section B removed the
  per row card because six things per row all said "look here"; this replaced a
  4px stripe and a bare glyph, so the count went DOWN, and there is still no
  fill, no shadow, no radius and no pill. The colour is the ground rather than a
  badge beside the name, which is the whole distinction.
- **Do not put the emoji in a circle.** It was built and rejected: a round
  avatar with a name, a sub-line and right-aligned meta is the WhatsApp
  conversation row, and on this audience's phones that is the most familiar list
  there is. A books app's Home screen must not read as a messaging app. A colour
  tab bleeding off the screen edge was rejected too, for forcing full-bleed
  dividers when every other rule in the app is inset.
- **The rows are full-bleed, so they keep the press brightness and drop the
  press scale.** `.bt-bizlist > button.bt-bizrow:active` overrides the global
  rule on specificity, not on ordering. Scaling a 390px band to 0.97 opens a
  gap of page colour down both sides and reads as the row detaching. An inset
  row has margin to shrink into; a full-bleed one does not.
- **A new business gets the first unused colour, but always the same mark.**
  A colour is pure identity, so handing out the next free one invents nothing.
  An emoji says what the shop sells, so cycling it would give a phone repairer
  a ball of yarn. The asymmetry is deliberate.
- **There are now THREE functions mixing the same sixteen hues, and each one
  exists because the other two are wrong for its job.** `heroTint` darkens so
  white type survives. `bizTint` lightens to a wash so a mark can sit on it.
  `ringColor` darkens in light mode and LIFTS in dark, because a darkened
  segment on a dark card measures 1.49:1 and is invisible. Before adding a
  fourth, check which of these already does it.
- **Never put white on a RAW business colour.** Nine of the sixteen fail AA,
  worst 3.10:1 on the sage. The palette was measured white-on-TINTED, never
  white-on-raw, and the ring's rank key nearly shipped with exactly that
  mistake.
- **`bizTint` and `heroTint` pull in opposite directions.** `heroTint` darkens
  a business colour so white type survives on it; `bizTint` lightens one so a
  mark can sit on it. `bizTint` returns rgba on purpose, because a flat light
  mode tint is wrong the moment the page behind it is dark.

- **Rescue is reachable from three places and that is correct.** The crash
  screen, onboarding, and the PIN lock are all places where Settings cannot be
  reached at all. They are contextual, not duplicated. Do not consolidate them.

- **`src/legal/documents.js` names routes through the UI.** Moving a settings
  row is therefore a documentation change. Four `Settings > X` paths in the
  privacy policy went stale in one session; one of them had never been right.
  Grep the policy for the arrow whenever a row moves.
- **The usage-data switch is not decorative and cannot just be deleted.**
  `track()` and `flush()` in `src/analytics/analytics.js` both refuse unless
  consent is exactly true, and the policy promises collection is conditional on
  it and withdrawable. To make analytics non-optional the order is: rewrite the
  policy and signup consent FIRST, then remove the gate, then remove the switch.

- **There is no `<select>` in this app, and adding one is a regression.** A
  native select hands BOTH its arrow and its option list to the OS: the arrow
  painted in the element's `color` (the darkest chevron on the screen, near
  white in dark mode), and a list that cannot be styled at all, which is why it
  looked bland on Android and desktop and fine on iOS. `Select` is a button
  plus `ModalShell`, so the list is the app's own sheet. Its chevron points DOWN
  because a right chevron here means "goes to another screen".
- **A sheet is closed by DRAGGING it down on a phone, and by an X on desktop.**
  Never both. Above 700px the sheet is a centred dialog, the handle is hidden
  because there is no bottom edge to drag to, and `.bt-sheet-close` appears.
  Below it the drag is the close and a button beside it is the redundant
  control the gesture replaces. The drag starts from the handle and title strip
  only, not the whole sheet: these sheets hold forms and scrollable option
  lists, and a drag that began anywhere would fight both. `touchAction: none`
  is scoped to that strip for the same reason.
- **`ModalShell` portals into `.bt-app`, and must keep doing so.** The overlay
  is `position: absolute`, so rendered inline it covers its nearest positioned
  ancestor instead of the window. From inside a scrolled `.bt-screen` that
  measured -193..627 on an 820px window, with the page showing through under the
  sheet. It also owns Escape and focus restore for every sheet in the app; a
  second shell would quietly drop both.

- **A receipt is DERIVED from the sale, never stored.** `makeSale` already
  snapshots `itemName`, `qty`, `unitPrice` and `occurredAt` at the moment of
  recording, so the money on a receipt cannot drift and a second copy would be
  one more thing to keep in step. The number is a pure function of the sale's
  id, or of its `groupId` when it has one. Before adding a record to freeze
  something, check whether the thing is already frozen.
- **A receipt must never show cost, profit or margin.** It goes to the BUYER,
  and `unitCost` sits on the same record as `unitPrice`. `receiptLines` reads
  price and quantity and nothing else, and the test asserts the negative: no
  cost value, no profit value, and no field whose NAME matches cost, profit or
  margin. Do not add a "you saved" line or a subtotal computed from cost.
- **`groupId` on a sale decides only what is PRINTED together.** One customer
  buying three things is three sale records, because stock and profit are per
  item and merging them would break the ledger. It is a plain text column and
  deliberately not a `sale_groups` table: there is nothing to store about a
  group beyond the fact that some sales share one.

- **The eight original category strings are frozen.** "Crochet", "Jewelry",
  "Beauty", "Food", "Fashion", "Thrift", "Accessories" and "Other" are on live,
  synced records. Add categories freely; renaming one of those eight leaves an
  existing user with a value no option matches. `Select` falls back to showing
  a raw value for exactly that reason, and for categories people type
  themselves.

- **`heroTint()` does not make a colour safe, so measure every new one.** It
  mixes 38% toward the ink, which rescues a mid-tone and not a light one: pure
  yellow through it is about 2.5:1 under white text. The sixteen in `COLORS`
  were each computed and the worst is 6.16. Do not add a swatch without
  checking it, and do not rename the first eight: they are on live records and
  `#C17F5A` is the accent and the schema default.

- **The `auth.sessions` trigger can never raise.** Its whole body is wrapped.
  A missed sign-in notification is acceptable; blocking authentication for
  everyone is not. Drop statement is in `supabase/functions/README.md`.

---

## Data safety rules

The migration rewrites stored data on a device holding someone's only copy of
their books. Therefore:

- An untouched snapshot is written to `biztrack-pre-ledger-backup` before any
  migration, and never overwritten. Downloadable via Account → Pre-Upgrade Backup.
- `migrateState()` must never throw. Each business converts in isolation;
  failures are preserved under `unreadableBusinesses`, never dropped.
- `verifyMigration()` re-checks counts, units sold and per-item stock on the
  user's own device. A mismatch surfaces a banner, not a silent success.
- **Never gate data behind payment.** An expired plan makes the app read-only.
  Everything stays visible and exportable. Locking someone out of their own
  books would travel by word of mouth faster than the product.

---

## Business decisions already made

- **3,500 XAF/month, 30,000/year.** Annual is the hero option: mobile-money
  auto-renewal is unreliable, so twelve monthly decisions means twelve chances
  to lose a happy customer.
- **30-day trial, then read-only.** Not a free tier. A free tier gives someone
  tracking one hustle no reason to ever pay.
- **~130 users, not 100.** 100 assumed monthly pricing; annual discounting moves
  the target for the same 4.2M XAF/year.
- **Beta: announce the price, hold back the discount.** Saying nothing about
  price reads as bait-and-switch when the bill arrives.
- **Acquisition is direct, not ads.** ~200 conversations converts far better
  than a funnel at this scale, and paid ads against a 3,500 product need
  retention data nobody has yet.

---

## Verifying changes

```sh
npm test              # 100 unit + integration tests (node:test, no extra deps)
npm run lint          # 3 pre-existing errors, 3 warnings, see below
npm run build
./supabase/tests/run.sh        # 35 RLS tests, needs local Postgres
./supabase/tests/roundtrip.sh  # data survives a real Postgres round trip
```

Against the live project, pasted into the Supabase SQL Editor:

```
supabase/rls-check.sql          # is RLS really protecting every table AND view
supabase/analytics-queries.sql  # which screens, which features, what breaks
```

Run `rls-check.sql` after ANY schema change.

**Known lint state:** 3 errors and 3 warnings, all pre-existing React hygiene in
the update-check and PIN paths (`set-state-in-effect`, `purity`,
`exhaustive-deps`). They need restructuring, not renaming. Do not add
suppressions.

It was 4 until 15 September. The fourth was "Cannot access variable before it
is declared": `checkUpdates` called `showToast`, which was declared 150 lines
further down, so it was reading a `const` in its temporal dead zone. It never
threw only because nothing calls `checkUpdates` during the first render. Moving
the toast to the top of the component fixed it, and is why it is there.

---

## What is proven, and what is not

**Proven** against real PostgreSQL 16 running the actual migration files: the
schema, 35 RLS tests asserted in *both* directions (owner can reach their data,
another user cannot), and a full data round trip where revenue, COGS, profit,
stock on hand and weighted-average cost all return identical.

**Proven** in a headless browser against the built app: legacy migration on real
data, the auth screen, and graceful offline failure.

**Proven against the LIVE project, 8 September 2026:** the schema applied
cleanly; all eight tables reject an anonymous insert with `42501`, meaning RLS
rejected the row before the foreign key was even checked. Google OAuth returns
a correct 302 to `accounts.google.com` with the right `client_id` and callback.

That write probe is how to check RLS from outside the database, and it is worth
remembering: with RLS *off* the same request returns `23503` from the foreign
key instead, so the two are distinguishable without writing a single row. A
*read* probe cannot tell them apart: an empty table and a fully protected one
both return `[]`.

**Proven 11 Sep 2026, against the live project:** all four Edge Functions
(`notify`, `unsubscribe`, `delete-account`, `send-email`) are deployed and
have executed. `notify` rejects a bad secret and sends with a good one;
`delete-account` refuses an unauthenticated call; `unsubscribe` reaches its
RPC and answers correctly; `send-email` refuses an unsigned request and sends
on a valid signature. Email through Brevo is delivering: signup confirmation,
password reset and sign-in notices all observed as requests → delivered →
opened in Brevo's event log.

Also unverified: whether `item_stock` actually has `security_invoker` on. Every
table is empty, so a leaking view and a working one look identical from
outside. Query 2 of `rls-check.sql` answers it from inside.

---

## Open decisions

1. ~~Claim-local-data flow.~~ **Settled 8 Sep.** Ask, never decide silently;
   default to merging, because the merge is a union and loses nothing; write a
   backup before anything changes. `src/backend/claim.js` and `ClaimScreen`.
2. **App.jsx is now 3,108 lines**, up from ~2,600. The 8 September work made
   this worse, not better. New screens went to their own files, but the settings
   rows, consent gate and claim wiring all landed in App.jsx. State ownership is
   settled, so the split is still safe; there is just more of it.
3. ~~Bundle is 917 KB.~~ **Done 11 Sep.** Recharts (340 KB, a third of the
   app) is lazy behind `Suspense` in `ProfitChart.jsx`, and vendor code is split
   into react / supabase / icons / store chunks. First load is now **580 KB
   (166 KB gzipped)**, down from 920 KB / 264 KB. The vendor split matters most
   on the loads *after* an update: a release invalidates a 46 KB app chunk
   instead of a 264 KB monolith. The chart chunk is still precached by the
   service worker on purpose: this is offline-first, and someone opening
   Analytics with no signal should still see their chart.

---

## Layout

```
src/domain/    Business rules, framework-free, fully tested.
               money · inventory (ledger) · stats · schema · migrate
src/store/     Zustand store. Per-entity actions, persisted to localStorage.
src/backend/   Supabase client, row mappers, auth, sync, claim.
               Degrades to local-only throughout.
src/analytics/ Usage telemetry, crash capture, error boundary. Allowlisted.
src/legal/     Privacy policy and terms, as data. One file, lawyer-readable.
src/screens/   AuthScreen · LegalScreen · ClaimScreen. The rest is in App.jsx.
supabase/      migrations · functions (Edge) · emails · tests
               setup-all.sql · rls-check.sql · analytics-queries.sql
```

`supabase/setup-all.sql` now holds FIVE migrations and is still not idempotent.
A project that already ran the first three must apply only the two newer
migration files. Never re-run setup-all.

---

## Session log: 7 September 2026

The move to VS Code described above actually happened on this date. What
changed, and what was measured against the live service rather than assumed.

### This checkout

`C:\Users\EAE\projects\biztrack`, a fresh clone on `claude/repo-review-54joy7`.

The previous working copy at `C:\Users\EAE\Downloads\files\biztrack` is a clone
of **`main`**, v1.5.9, the pre-ledger local-only app, with no `CLAUDE.md`, no
`supabase/`, no `src/domain/` and no `src/backend/`. It was left in place
deliberately for the owner to delete. It holds nothing unique: no unpushed
commits, no stashes, and only `build.log`, `dist/` and `node_modules/` outside
git. If it is still there and someone is confused about which folder is which,
that is why.

`main` and the branch have not been merged. `main` is still v1.5.9.

### Verified against the live Supabase project

Probed directly, not inferred:

| Check | Result |
|---|---|
| Network to `*.supabase.co` | Reachable |
| Project `ufyyurmekegbzkqjisdb` | Live |
| Publishable key in `LOCAL_SETUP.md` | Valid |
| Email provider / sign-ups | Both enabled |
| **Schema applied** | **No** |
| **`mailer_autoconfirm`** | **`false`: "Confirm email" still ON** |

`GET /rest/v1/businesses` returns exactly the failure predicted above:

```
PGRST205: Could not find the table 'public.businesses' in the schema cache
```

So the Phase 2 blocker is unchanged and now confirmed live: `setup-all.sql` has
still never been run. The network unreachability noted under "Not proven" was an
environment limitation, not a project problem. The service answers fine from
this machine.

### Tooling installed

Supabase CLI **v2.116.0** at
`C:\Users\EAE\AppData\Local\Programs\supabase\supabase.exe`, appended to the
**User** PATH (38 → 39 entries; prior value backed up before the edit). It needs
a terminal started after the install to resolve.

Dead ends on this machine, so nobody repeats them: no winget package exists,
Scoop is not installed, and `npm i -g supabase` is blocked by Supabase upstream.
The GitHub release zip is the route that works. Verify the SHA256 against the
release `checksums.txt`, and expect GitHub to be slow enough that the download
needs `curl -C -` to resume.

### Still outstanding

1. `.env.local` does not exist in this checkout. Until it does the app runs
   local-only and never contacts Supabase. Values are in `LOCAL_SETUP.md` §2.
2. Apply the schema: CLI (`login` → `link` → `db push`) or paste
   `supabase/setup-all.sql` into the dashboard SQL Editor.
3. Turn off "Confirm email" and add `http://localhost:5173` to the redirect
   allowlist. Both are dashboard-only; neither can be done from the CLI or the
   publishable key.

### A note on the old `main`, for context

A read of `main` turned up several defects, and the branch already fixes all of
them: the `beforeinstallprompt` listener was never registered (so the Android
install prompt could never appear), `index.html` read the wrong storage key for
the theme, `vite.config.js` used `__dirname` in an ESM config, and the rescue
code scanned the *live* storage key alongside the legacy ones. Nothing to do;
recorded only so the same findings are not re-reported as new.

One loose thread genuinely explains the v1.5.3–v1.5.7 emergency history:
`idb-keyval` was still installed in the old checkout but absent from
`package.json`. The store used to persist to IndexedDB and later moved to
`localStorage`, which is what stranded people's books and forced the whole Data
Rescue system into existence.

---

## Session log: 8 September 2026

Phase 2 finished and most of Phase 3 built, in one session, on branch
`claude/repo-review-54joy7`. Nine commits, `5ee30ba`..`c74a8a9`.

### What got unblocked

`setup-all.sql` was pasted into the SQL Editor and applied. `.env.local` was
recreated from `LOCAL_SETUP.md` §2 and confirmed to reach Vite, checked in the
*served module*, not just on disk, because a file that exists and a file that
Vite has picked up are different claims.

"Confirm email" is now **off** (`mailer_autoconfirm: true`) and
`http://localhost:5173` is in the redirect allowlist. The latter was confirmed
indirectly and neatly: Supabase silently replaces a non-allowlisted
`redirect_to` with the Site URL, and it came back intact.

Google sign-in is live. The Cloud Console client is a **Web application** type: the OAuth exchange happens in Supabase,
not the browser, with
`https://ufyyurmekegbzkqjisdb.supabase.co/auth/v1/callback` as the redirect URI.
Scopes are `email profile`, which are non-sensitive, so publishing the consent
screen needed no Google review.

### What was built

- **Auth:** Google sign-in; six-digit code verification (`verifyOtp`) so a
  confirmation or password reset can be finished *inside* the app; a clickwrap
  consent gate that records the accepted `LEGAL_VERSION` on user metadata.
- **Email:** five branded auth templates in `supabase/emails` (regenerate with
  `generate.py`), plus a queue-backed notification sender for trial
  warnings, low stock, weekly summaries and new sign-ins, through Brevo.
- **Legal:** privacy policy and terms in `src/legal/documents.js`, rendered
  in-app by `LegalScreen`, plus self-service account deletion.
- **Analytics:** first-party usage telemetry and crash capture, opt-in, with a
  90-day retention job and eight ready-made queries.
- **Claim flow:** the path an existing local-only user takes to get an account.

### Two false claims were shipping, and are now fixed

Worth recording because both were live liability, not untidiness:

- About said **"Your records stay on your device."** True before Phase 2, false
  the moment sync shipped.
- The v1.4.3 changelog still advertised **"local data encryption stability."**
  The same claim had already been removed from About for being untrue. The PIN
  is a screen lock, not encryption.

The lesson generalises: every claim in user-facing copy has to be re-checked
when the architecture changes under it. The privacy policy written earlier in
this same session said the app collected no analytics, which the analytics
work made false two hours later, and it had to be rewritten to match.

### Before anyone else can sign up

1. ~~**`ENTITY` in `src/legal/documents.js` is placeholders.**~~ **Done.** It
   is a real name, a real address in Buea, `hello@biztrack.store` and a
   WhatsApp number. This line went on saying "placeholders" for ten days after
   it stopped being true, which is the same failure this file records about
   user-facing copy, turned on the file itself: **a claim in here has to be
   re-checked when the thing underneath it changes.** The Layer 3 legal audit
   is what caught it, by reading the value rather than this sentence.
2. **Deploy the Edge Functions:** `notify`, `unsubscribe --no-verify-jwt`,
   `delete-account`. Until then the Delete Account button errors and nothing
   sends.
3. **Storage bucket `brand`** with `public/wordmark-light.png`, or every email
   shows alt text instead of the logo.
4. **Custom SMTP (Brevo).** This is the real launch blocker: Supabase's built-in
   sender only delivers to your own team addresses, so a beta tester's
   confirmation email goes nowhere, silently, while sign-up appears to succeed.
5. **Lawyer review** of governing law, the liability cap, VAT, and whether
   cross-border transfer needs more than the consent collected at sign-up.
6. Then turn "Confirm email" back on.

### Notes for whoever picks this up

The two highest-value engineering jobs are both listed under Open decisions and
both got worse today: App.jsx grew ~500 lines, and the bundle grew ~58 KB. The
bundle is the one that touches every user on every launch.

`npm run lint` is still 4 errors and 3 warnings, all pre-existing, all in
App.jsx. Nothing added on 8 September contributed to it; two new violations
were introduced during the work and both were fixed rather than suppressed. Keep
it that way; the count is a useful tripwire precisely because it has not moved.

---

## Deployment: what is actually live, 9 September 2026

Established by probing Vercel and DNS directly, not from memory. This was not
written down anywhere and cost a session to rediscover.

### Two Vercel projects, one repo

Both are linked to `XMP-GLITCH/BizTrack` and both build on every push:

| Project | Domains | Status |
|---|---|---|
| **`biz-track`** | `biztrack.store`, `www.biztrack.store`, **`biz-track-nine.vercel.app`** | **The live one.** Users are here. |
| `biz-track-oy5c` | `biz-track-oy5c.vercel.app` | Abandoned duplicate. Delete or disconnect it. |

`biz-track.vercel.app` is **not ours**: that subdomain belongs to another
Vercel account and serves a Next.js app. That is why the second project got the
`-oy5c` suffix. Do not chase it.

Production on both is still `e4e14ee` (main, v1.5.9), which contains no Supabase
code at all. **The branch has never been deployed to production.**

### A PUSH DOES NOT DEPLOY. `vercel --prod` DOES.

Added 20 September, after a push reached Vercel, built in ten seconds, and left
`biztrack.store` on the previous build -- which read exactly like a broken
integration and is not one.

Vercel creates a PRODUCTION deployment only for the branch configured as the
project's production branch. That branch is not `claude/repo-review-54joy7`, so
every push to this branch builds a **preview**: `target: null`, aliased only to
`biz-track-git-claude-repo-review-54joy7-...vercel.app`, and behind
`ssoProtection`, so a beta tester cannot even open it.

**Every production deployment this project has ever had came from someone
running `vercel --prod` on their own machine.** Not a theory: `source` on the
deployment record reads `"cli"`, and all twenty production deployments in the
project's history are by `xmp-glitch`. The git metadata on them is real, because
the CLI reads the local checkout and attaches it -- which is exactly why they
look like GitHub deploys in the dashboard and why this took a session to see.

So the deploy is two steps and the first one is not enough:

```sh
git push                  # source control. Builds a preview. Changes nothing live.
vercel --prod --yes       # from the repo root; .vercel/project.json is committed
```

The CLI is already installed and logged in as `xmp-glitch`, and it holds
permissions the Vercel MCP token does not: that token gets **403 Forbidden** on
`assign_alias` and on listing env vars, so promoting a preview through the API
fails while the CLI succeeds. Reach for the CLI first.

**This is a gate, not a defect, and it is worth keeping.** A production branch
would put every push straight in front of real users, and this project's whole
working method -- a month of sessions each ending "still nothing pushed" -- is
the owner testing locally before anything ships. Changing it is a decision, not
a fix.

Verify from outside afterwards, always, because a deploy that silently runs
local-only looks perfectly healthy:

```sh
curl -s https://biztrack.store/ | grep -o 'assets/index-[^"]*\.js'   # hash moved?
curl -s https://biztrack.store/assets/index-*.js | grep -q ufyyurmekegbzkqjisdb
```

And check `biz-track-nine.vercel.app` too. It is a separate origin holding
separate localStorage, it is where the existing users' books live, and it is
aliased to the same deployment -- so it moves with production, but only a fetch
proves it did.

### `biztrack.store` is bought but dead

Registered at Namecheap, on Namecheap's own nameservers
(`dns1.registrar-servers.com`), with **no A or AAAA records**. Nothing resolves.
To point it at Vercel: A record `@` → `76.76.21.21`, and a CNAME for `www` whose
target must be **copied from the Vercel domains tab**. Vercel issues a
per-project value and its own docs disagree between `cname.vercel-dns.com` and
`cname.vercel-dns-0.com`.

### The trap that governs the whole migration

**localStorage is per-origin.** Books saved at `biz-track-nine.vercel.app` are
invisible at `biztrack.store`. A user moved to the new domain before they have
an account sees an empty app, indistinguishable from total data loss, and the
exact failure that produced the v1.5.3–v1.5.7 emergency-rescue history.

So the order is fixed, and it is not negotiable:

1. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` on the **`biz-track`**
   project, visibility **Config**. Vercel refuses `Secret` on a `VITE_` prefix
   because Vite inlines it into the client bundle, which is correct.
2. Deploy to the origin users already use.
3. Get both existing users onto accounts, so their books reach the server.
4. *Then* point `biztrack.store` at the project.

Anyone without an account moves by **file**, via Settings → Save My Data to a
File, then Restore From a File on the other device.

### Vite inlines env vars at BUILD time

A deploy without those two variables produces an app that silently runs
local-only: no sign-in screen, no accounts, no sync, and it looks perfectly
healthy. Verify a build from outside rather than trusting the dashboard:

```sh
curl -s <deployment>/assets/index-*.js | grep -q ufyyurmekegbzkqjisdb
```

Preview deployments are behind `ssoProtection: all_except_custom_domains`, so
that check needs a Vercel share link, and a beta tester cannot open a preview
URL at all. Custom domains are exempt, which is one more reason to finish
`biztrack.store`.

Measured on the branch preview: the bundle is **920 KB**. That is the number the
code-splitting work has to move.

---

## Session log: 11–13 September 2026

The launch. Everything below was verified against the live services, not
inferred, mostly by probing from outside, because that is the only check that
cannot be fooled by a dashboard that says the right thing.

### It is live

**https://biztrack.store**, apex canonical, `www` redirects to it, TLS issued,
serving the same build as `biz-track-nine.vercel.app`.

Both origins matter and they are NOT interchangeable. localStorage is
per-origin, so the two existing users' books live at the vercel.app address
until they have accounts. Sending them to `biztrack.store` before they sync
shows them an empty app, which is indistinguishable from losing everything.

### Email, and why it is not SMTP

Supabase Auth sends through a **Send Email Hook** (`supabase/functions/
send-email`), not SMTP. That is deliberate and hard-won: Supabase's own SMTP
client returned `500 Error sending recovery email` against Brevo while the
*identical* host, port, username, password and sender authenticated and sent
fine from outside it. The fault was inside Supabase's SMTP path. The Brevo API
was already proven, so the hook routes around it.

Two things that bought beyond unblocking delivery: the five branded templates
now render from `send-email/templates.ts` in the repo rather than being pasted
into five dashboard tabs nobody can diff, and every auth email carries the
numeric code beside its button.

The hook verifies a **standard-webhooks HMAC signature** on every request,
constant-time, rejecting anything older than five minutes. This is not
optional: the endpoint sends as a DKIM- and SPF-passing BizTrack address, so an
open one would be a phishing gift aimed at users whose only business records
are in this app.

`no-reply@biztrack.store` sends; `Reply-To` is `hello@biztrack.store`, because
someone locked out of their books will hit reply and a bounce at that moment is
the worst possible answer.

### What the dashboards got wrong

Worth recording, because two of these cost real time:

- Brevo reported `authenticated: false` while its own API said every DNS record
  was `ok: true`. The records had been right for a while; Brevo simply had not
  re-checked. `PUT /v3/senders/domains/{domain}/authenticate` fixed it in one
  call.
- Brevo's SMTP panel showed "Currently Unavailable" while `GET /v3/account`
  reported `relay.enabled: true` with the host, port and login. The panel had
  failed to load, nothing more.
- Vercel's env vars were half-set: only `VITE_SUPABASE_URL`, Production only.
  Since `isBackendConfigured = Boolean(url && anonKey)`, production would have
  failed too.

The lesson that generalises: **verify from outside, in the built artefact.**
`curl -s <deployment>/assets/index-*.js | grep -q ufyyurmekegbzkqjisdb` is worth
more than any settings page.

### Bugs found by a real person, not by tests

Three, all in the signup flow, all mine, all invisible to `npm test`:

1. The Terms and Privacy links were inside the consent `<label>`, so tapping
   them toggled the checkbox instead of opening the document.
2. Fixing that exposed a second: Google sign-in is gated on that checkbox, and
   the accidental toggling had been satisfying the gate. With the links fixed
   the button silently refused, with the reason in small red text above the
   fold. The gate is right; making it invisible was not.
3. Password recovery issues an 8-digit code; the verify field had
   `maxLength={6}` and sliced input to 6. The last two digits were discarded as
   the user typed, so the code could never be entered at all, on the screen
   someone reaches when locked out.

All three shipped past a green test suite. Keep sending real-user reports;
they are worth more than anything curl can prove.

### Notifications are scheduled

`pg_cron` + `pg_net`, three jobs, secret in Vault rather than in the job bodies:

| Job | Schedule | Purpose |
|---|---|---|
| `biztrack-billing` | `0 7 * * *` | Trial warnings at 7/3/1 days, then trial-ended |
| `biztrack-weekly` | `0 7 * * 1` | Low stock + weekly summary |
| `biztrack-drain` | `*/15 * * * *` | Sends whatever is queued |

Without these the 30-day trial simply expires and the app goes read-only with
no warning, which is the entire trial-to-paid path.

**Verified running, 14 Sep 2026.** `cron.job` shows what is *scheduled*;
`cron.job_run_details` shows what actually *ran*: a job can be registered and
still fail every time, usually because `pg_net` cannot reach the function or
the Vault lookup returns null and the secret header goes out empty. Check the
second, and note the column trap: `job_run_details` has `jobid`, not
`jobname`, so it needs a join:

```sql
select j.jobname, d.status, d.return_message, d.start_time
from cron.job_run_details d
join cron.job j on j.jobid = d.jobid
order by d.start_time desc limit 15;
```

That, together with the Brevo event log showing `requests → delivered`, is the
whole chain proven: cron fires → `notify` runs → Brevo delivers.

### Still open

Nothing technical. Every part of the system has been verified against the live
services. What remains is product work and housekeeping:

1. **The two existing users have never signed up.** Own phones,
   `biz-track-nine.vercel.app`, Google sign-in. Analytics and crash capture are
   live, so this is the step that starts producing real information.
2. **Brevo API key rotation.** It and the SMTP key were pasted into a session
   transcript. The SMTP key is now unused (the hook replaced it), so it can
   simply be deleted.
3. **Test accounts** `arreyewube273+hooktest@gmail.com` and possibly
   `otakufever003@gmail.com` are real rows and will muddy early numbers.
4. **A lawyer** on governing law, the liability cap and VAT before taking money.
5. **App.jsx is ~3,100 lines.** Still the largest structural debt, and unlike
   the bundle it costs the maintainer rather than the user.

---

## Session log: 14 September 2026

A UI/UX audit of the whole interface, then the first two pieces of work it
produced. **Nothing in this session was pushed.** The owner is testing locally
before anything reaches GitHub or production, because there are real users on
the live build and this work is almost entirely visual.

### The audit

Findings are in an artifact with before/after specimens rendered in the app's
own tokens. The short version, and the parts worth remembering:

- **35 hex literals in JSX against 6 tokens.** Success, warning and danger had
  no names, so the same meaning was written four different ways, including
  *two* different ambers that both meant "warning".
- **18 font sizes, 13 border radii, 5 font weights** with 700 used 36 times.
  When everything is bold nothing leads.
- **Three depth strategies at once**: shadow on every card, 4px left borders,
  gradients with blurred orbs.
- **Record Sale is four taps from Home**, through the third tab of a business,
  behind a dashed button. It is the app's core verb. The bottom nav still
  carries dead code for an `add` tab that was removed.
- **"Total Profit This Month" is all-time.** `calcPortfolioStats` has no date
  filter. In a books app that is a trust bug, not a copy nit. **Still open.**
- 47 native `alert()`/`confirm()` calls. In an installed PWA these render as
  "biztrack.store says", and Android offers to suppress them after a few.

### Contrast was the real damage, and it was measurable

Every ratio below was computed, not estimated:

| | was | now |
|---|---|---|
| `--text-secondary` (every cost line, date, sub-label) | 3.67 page / 3.90 card | **5.88 / 6.23** |
| accent as text (`+ Add New`, dashed buttons) | 3.07 | **4.57** |
| oversell warning on the sale form | **2.85** | **5.46** |
| white on the business hero, worst of 8 colours | **3.10** | **6.16** |
| footnotes on the signup/consent screens | 3.19 | **6.80** |

The hero one is the instructive case. The business screen paints whatever
colour the owner picked and writes revenue, profit and margin on it in white.
Five of the eight failed. `heroTint()` mixes any hex 38% toward the app's ink,
which fixes every colour including ones restored from old backups, and keeps
the hue so a business is still recognisable at a glance.

`#C0392B` was *checked and kept*. It measures 5.44 on white. Do not "fix" it.

### Two tokens for the accent, on purpose

`--accent-color` is the terracotta and stays a **fill** (nav pill, avatar,
meters) where contrast rules do not apply. `--accent-text` is the darker
`#A5603A` and is what anything *read* in the accent uses. Same split reasoning
gives every semantic colour a trio: text, the tint it may sit on, and that
tint's edge. In dark mode the tints are alpha over whatever is behind them, so
one value is correct on the page and on a card, which a flat light-mode tint
hex can never be, and which is exactly what broke the sale form's profit
preview, the currency select, and every status badge.

### Dark mode was broken in more places than it looked

The ones that mattered: the **bottom nav's active icon** was hardcoded to the
light theme's ink, so the selected tab went invisible on the control that says
where you are. The sale form's source switch had an "active" pill *darker* than
its own track, so the selected tab read as the unselected one. And the Recharts
tooltip defaults to a white card while its text colour was already a token: near-white type on white.

### Responsive, without touching the phone

The phone layout is the reference design, not a draft to be corrected. So
**every responsive rule lives inside a min-width media query**. At phone
widths not one declaration matches. That is what makes "do not break mobile" a
property of the file rather than a promise, and it is why the `!important` in
those blocks is acceptable: inline style objects outrank a stylesheet, so
without it a media query cannot reach the layout at all.

- **≥700px**: wider framed column, business cards to a grid, bottom sheets
  become centred dialogs (the drag handle hides; there is nothing to drag).
- **≥1024px**: the bottom bar becomes a 236px left rail. Same DOM, same three
  destinations, rotated by CSS. Content stops at an 880px measure and centres,
  so a sale row does not run 900px with a number at each end.
- **≤520px tall**: landscape phones. A 78px bar is a fifth of the screen, so
  the nav goes flat and compact and the install card drops its explanatory
  sentence.
- **≤620px tall**: a centred column taller than the window is *unreachable*:
  `justify-content: center` pushes the top out of scroll range, and the top is
  where the consent checkbox and the six-digit code field live.

Two overflow bugs only visible at 320px, both pre-existing: the summary card
clipped "MARGIN 66%" off its right edge, and the business hero rendered
"FCFA 66,500FCFA 45,50068%". Both rows sized their children at max-content with
no way to give. They wrap now, and wrapping engages only when the row genuinely
does not fit, so 360px and up are unchanged.

`boxSizing: content-box` on the nav (added so the gesture-bar inset sits below
its 78px height) had to be undone for the rail, where `top:0/bottom:0` plus
vertical padding would overflow the window. Worth knowing before editing it.

### How the screenshots were taken

No Puppeteer, no new dependency. `vite preview`, then Chrome with
`--remote-debugging-port`, driven over CDP from a script using node 22's native
`WebSocket`. It seeds a book into localStorage, clicks through the sign-in and
analytics gates rather than faking a session, and **unregisters the service
worker and clears caches before each shot**. Otherwise it photographs the
previous build. That last part cost a round trip; the tell is the app showing
its own "Update Available" prompt in the screenshot.

### What this session did NOT do

The audit's hierarchy findings are untouched: the ledger list, the single-number
hero, the Record Sale shortcut, the "This Month" label, the `alert()` calls, the
type and radius scales. And `src/App.css` is 184 lines that nothing imports.

`npm run lint` is still exactly 4 errors and 3 warnings. Keep it that way.

### One audit finding was wrong, and was reverted

The audit called `user-scalable=no` an accessibility defect and the first pass
removed it. It is a deliberate product decision (see the entry under
"Deliberate choices that look like bugs"), and it is back. The part of that fix
that *was* real survives independently: inputs are 16px, which is what actually
stops iOS zooming into a form field on focus, and the viewport still carries
`viewport-fit=cover` for the safe-area insets.

The lesson is the one this file keeps relearning from the other direction: a
rule that is right in general ("never block zoom") is not automatically right
for this product, and the owner's reasons are not in the code to be read.

---

## Session log: 15 September 2026

Typography, continuing the audit. Still nothing pushed.

### The scale

There were **13 text sizes and 6 weights**, with `fontWeight: 700` used 36
times and no 400 anywhere in the style object. That is the mechanism behind
"everything is bold, so nothing leads": with no quiet weight available, the only
way to mark something as important was to make it bold too.

Now, and this is the whole system:

| | | |
|---|---|---|
| 11 | uppercase eyebrows, badges, nav |
| 12 | meta: the line that qualifies a value |
| 14 | body, row titles, controls |
| 16 | the figure that leads a row; section and card headings; inputs and buttons |
| 20 | screen and modal titles |
| 26 | screen heading |
| 36 | the one display figure |
| **weights** | 400 · 500 · 600 · 700. 800, 900 and 300 are gone |

**One family: DM Sans.** See "The serif is gone" below; the table above is the
whole type system.

Everything else that still sets a `fontSize` is a glyph (an emoji, a lucide
icon, an avatar initial) or a code field, where 24px with wide tracking is the
control's whole design. Those are not type steps and should not be folded in.

At this point the serif was merely *confined* (nothing below 17px, headings
only). It was removed entirely later the same day; see below.

### The rule that did the most work

**The figure leads its row; the name is secondary; the meta recedes.** In a
sale row that means 16/600 for the amount, 14/600 for the item, 12/400 for
"2 units · Yesterday". Before, those were 14/800, 14/700 and 12/500: three
tiers claiming the same importance. Nothing moved position; the hierarchy comes
entirely from weight and size contrast.

This is a judgement call worth knowing about: it makes the **money louder than
the business name** on the Home list. That is right for a profit tracker and it
is one line to flip if it ever reads wrong.

### Tabular figures

`font-variant-numeric: tabular-nums` on the app root. DM Sans sets proportional
figures by default, so a 1 is narrower than a 7 and a column of right-aligned
amounts comes out visibly ragged. FCFA 111,500 over FCFA 45,500 over FCFA
7,200, none of the digits lining up. For an app that is a column of money this
is the single highest-value typographic change in the session. It also steadies
the six-digit sign-in code, which used to reflow as each character was typed.

### Things found on the way

- **`--font-sans` began with `"Inter"`, which this app has never loaded.** Only
  DM Sans and Playfair are fetched. Every glyph the design thought was Inter was
  DM Sans falling through. `'Nunito'` in the shell's stack was the same. Both
  removed; the stacks now name what is actually there.
- **The feedback textarea was 13px**, below the threshold at which iOS zooms a
  field on focus. Same bug the inputs had; same fix.
- **Five style entries had zero references**: `statusBar`, `statusTime`,
  `statusIcons`, `chevron`, `toast`. Between them they held the app's only
  weight-300 and its only 10px, so the type census read worse than the app
  actually was. Removed.
- The business hero's decorative orb sat directly behind the margin figure.
  Brightening the hero labels for contrast made it obvious; it is pushed out and
  faded now.
- Heading sizes 24 and 26 were both doing "screen heading" in Playfair, two
  pixels apart. Consolidated to 26.

### The serif is gone

Three passes, in this order, and the order matters because each one was the
owner rejecting the previous answer and being right to:

1. **Set the scale.** Left the app switching typeface four times down Home with
   nothing governing the switch. The hero total was Playfair while the three
   figures beneath it in the *same card* were DM Sans.
2. **"Playfair names, DM Sans measures."** Coherent as a rule, and it made the
   home total DM Sans 30/700, which the owner correctly called amateur.
3. **Drop Playfair entirely.** Which is where it landed.

**Do not reintroduce a display serif.** Three independent reasons:

- **Legibility.** Playfair is a Didone with very high stroke contrast. The thin
  strokes are the character at 26px and are what breaks up at 15px on the 720p
  Android LCDs this app is actually read on.
- **Positioning.** Cream ground + display serif + terracotta accent is the most
  templated look on the web, and Playfair is the most templated serif in it. It
  read as a brochure, not as a tool someone runs a business on.
- **Weight.** It cost **295 KB of a 386 KB font payload**: 12 files, both
  families carrying their full 100-1000 range *and italics*, none of which the
  app ever used. DM Sans 400-700 upright alone is 2 files, 92 KB. That is more
  than the app's entire JS chunk, on first load, for users who pay for every
  megabyte. Measure any future second face in kilobytes on 3G before measuring
  it in taste.

### What replaced it, and the Tesla lesson that is actually transferable

The reference the owner raised was Tesla, and it is worth recording accurately
because it cuts against the obvious reading: **tesla.com is entirely
sans-serif**. Gotham, and no serif anywhere. So the amateur quality was never
sans-vs-serif. It was the treatment. What Tesla does that this did not:

- **Weight goes DOWN as size goes up.** Display type sits near 400-500. Bold at
  display size is the "make it look important" reflex and the clearest tell of
  undesigned type. The home total is now **36px at weight 500**, tracked to
  -1.6, not 30/700.
- **Real negative tracking** on anything large.
- **One family, held with discipline.**

With the serif gone, hierarchy comes from the three levers the skill names
(size, weight and colour) used together. A section heading and a row figure are
both 16px and separate cleanly on weight alone (700 against 600). That is the
lever the serif had been doing badly.

### DisplayAmount and formatMoneyParts

`DisplayAmount` renders the one display figure per screen and demotes the
currency unit to 0.5em at 50% opacity. At 36px "FCFA" is four letters as wide
as half the number, competing with the thing someone opened the app to read.
XAF writes its unit as a word rather than a glyph, so this matters more here
than it would for "$".

`formatMoneyParts` in `domain/money.js` does the split, built on
`Intl.formatToParts` rather than a regex over `formatMoney`'s output, because
the unit is a prefix in en-US by locale data rather than by guarantee. Two
things that cost a test run and are now asserted:

- **Intl separates the unit with a NON-BREAKING space (U+00A0)**, so a regex
  looking for `" "` in `formatMoney` output silently fails to match.
- A negative formats as `-FCFA 1,500`, sign *before* the unit. Split naively the
  minus lands inside the quiet demoted unit, where it is easy to miss on a loss.
  `formatMoneyParts` keeps it on the digits.

**A trap that wasted a round trip.** `summaryAmount` renders inside an `<h2>`,
and `index.css` used to set the serif on every `h1`-`h6`. Removing the inline
`fontFamily` therefore did *nothing*: the heading rule put the serif straight
back and the before/after screenshots came out pixel-identical. That CSS rule no
longer sets a family at all, but the lesson stands: a value rendered in a
heading element must NAME its face, not merely omit another one.

### One family means one spelling

Four different spellings of the DM Sans stack were in use across the files
(`'DM Sans',sans-serif`, `'DM Sans', sans-serif`, the full chain, and the
token). They are **not** equivalent: `sans-serif` alone resolves to a
different face on Android than the system-UI chain the token names. All 17 now
read `var(--font-sans)`. Only `monospace` on the recovery key is exempt.

---

## Session log: 15 September 2026 (part two): hierarchy

Audit section B, the findings about where the eye has nowhere to go. Still
nothing pushed.

### "Total Profit This Month" was all-time, and now is not

`calcBizStats` and `calcPortfolioStats` take an optional `{ since }`. The
default is no bound, so every existing caller is unchanged; Home passes
`startOfMonth()`.

**The boundary is UTC on purpose.** `occurredAt` is UTC everywhere in this app,
and a period computed in local time would disagree with the timestamps it
filters. The cost is a one-hour window per month: in Cameroon (UTC+1) a sale
recorded between midnight and 01:00 on the 1st carries the previous month's UTC
date. Do not "fix" this to local time without reinterpreting every stored
timestamp, not just this comparison.

**A quiet month must not read as lost data.** That failure mode is this app's
own history. When the month is empty and the books are not, the card says so
and shows the all-time figure instead of a bare `FCFA 0`.

Home is now the month; Analytics is explicitly "Revenue · All time". Both name
their period, so two screens showing different numbers is obviously deliberate.

### The business hero said 38% three times

Revenue, profit and margin sat at the same size and weight, so nothing led.
The margin was then stated as a number, as the bar's width, and as a
sentence underneath repeating both. Profit is what the screen is about, so it
is the only thing at display size; the rest is one meta line, and the bar
survives as the single non-numeric reading of margin.

### Record a sale is one tap

It was four: Home, into a business, into the third tab, then a dashed button.
It is an ACTION, not a destination, which is why it is a button floating over
the content rather than a fourth item in the nav. Only on Home and inside a
business.

From Home with several businesses the sheet asks which one. `AddSaleModal`
shows the picker when `screen !== "business"`, since inside a business the
context is already unambiguous. `openBiz(id, { stay: true })` selects without
navigating, so the sheet opens over Home rather than on a screen nobody asked
for.

The nav's dead `add`-tab branches (`t.action`, `t.id === "add"`, `addNavIcon`)
are gone. They had been unreachable since the tab was removed.

### The Home list is a ledger

Every row used to be a card: white fill, shadow, 18px radius, a 4px colour bar,
a tinted emoji tile, a bold figure and a status pill. **Six devices per row all
saying "look here"**, stacked four deep beneath a summary card also saying it.

Rules instead of cards. The only thing still carrying colour is the margin
stripe, which is the business's own identity. A `<button>` rather than a
`<div>`, so the row is reachable by keyboard and picks up the focus ring.

The status pill is gone too, and it deserved to: it graded a business
Profitable/Break Even/Losing from **all-time margin**, so a shop that had not
sold anything in months still showed green. `bizNote()` replaces it with the
one fact worth reading, ordered by what needs attention: oversold, then low
stock, then how the month is going. **Colour now means "act on this"**: amber
and red where something needs doing, muted otherwise.

It never restates the figure already on the row. A business that started this
month has the same lifetime and month profit, and a row printing it twice reads
as a rendering fault.

### The screenshot harness was lying, all session

Every capture before this point showed "Low Stock on 8 items": every item in
the seed. That was not the app. **`stockMovements` belong to the BUSINESS and
carry an `itemId`**; the harness had been nesting them inside each item with
`qty`/`kind` instead of `delta`/`reason`, and `sanitizeBusiness` drops any
movement whose `itemId` does not match a real item. So every quantity derived
to 0 and the app correctly reported everything as low stock.

With the seed corrected the number is 3, and the Overview tab's Best Seller and
Low Stock cards appear. Both had been suppressed the whole time because
`best.sold > 0` and `qty > 0` were false for every item.

The layout conclusions drawn from those earlier screenshots still stand. The
stock figures in them did not.

### Also removed

Five style entries with zero references: `userNameInput`, `bizCardRight`,
`bizProfit`, `settingsIcon`, `settingsRowVal`.

### Alignment: three lines, each with a rule

The owner said the Home screen felt uncomfortable. Measuring every text block's
left edge in the running app turned that into a list:

    24  headings
    42  ledger emoji
    46  summary-card text
    69  low-stock banner text
    71  ledger business names

**Five lines; the damage was in the near-misses.** 42 against 46, and 69
against 71. Human vernier acuity (the ability to see that two lines are not
collinear) is an order of magnitude finer than ordinary visual acuity, so a 2px
offset is not "nearly aligned", it is *visibly wrong* while being too small to
name. That is what produces unease rather than a complaint. Two edges 30px
apart read as two deliberate columns; two edges 2px apart read as a mistake.

The system now, and it holds on every screen:

| | |
|---|---|
| **24px** | the screen gutter: headings, section labels, the outer edge of every card, the ledger's margin stripe |
| **40px** | text on a surface: 24 + 16 of inner padding. Every card and row spends the same 16 |
| **72px** | text that follows an icon: 40 + a 20px icon slot + a 12px gap |

72 was chosen because the settings rows already landed there; everything else
was made to match rather than inventing a new number.

Four traps that produced the near-misses, all worth knowing before adding a
card:

- **A visible border eats padding.** `box-sizing: border-box` puts the 1px
  border *inside* the padding box, so the low-stock banner's 16px padding put
  its icon on 41 and its text on 73 while every borderless card sat on 40/72.
  A bordered card needs 15px of padding to land on the same line.
- **An accent border does the same, larger.** `infoCard` carries a 4px left
  border, so its left padding is 12, not 16.
- **A border on a padded container is drawn at the container's edge, not the
  content's.** `bizList` had `borderTop` and `padding: 0 24px`, so the top rule
  spanned the full screen while every row rule was inset 24px: the same line
  drawn at two lengths. The rule now lives on the first row.
- **An eyebrow is not a row.** The info cards put a 14px icon inline before
  their label, which pushed the label's words 20px right of the value beneath
  it. Eyebrows get no icon column; the card's coloured border already says what
  kind of card it is.

Re-measured after the change: **24, 40, 72, and nothing else.**

The record-sale button was the last thing off the grid: `right: 20` while the
gutter is 24. It is the only element that floats, so being 4px off was the most
visible near-miss on the screen. Its right edge is now 366 on a 390 viewport,
the same line the summary card and every ledger amount end on. Its shadow also
came down from `0 8px 24px / 28%` to `0 3px 14px / 16%`: it was the only
shadowed thing left on a screen whose cards had just been reduced to rules.
Its fill is deliberately *not* special. `--text-primary` on `--bg-primary` is
what every primary button in the app already uses.

`scratchpad/measure.mjs` is the harness. It walks the text nodes of
`.bt-screen` and reports every distinct left edge with examples. It hits the
same service-worker trap as the screenshot script and has to evict it, or it
measures the previous build and reports that nothing changed.

### The bottom bar had two alignment faults, one invisible

Measured rather than eyeballed:

    item        box-left  box-right   centre
    Home           33.3       96.6      64.9
    Analytics     147.1      229.5     188.3
    Settings        280      356.7     318.4

1. The row sat **9.3px inside the 24px gutter** on both sides.
2. Worse and harder to name: `justify-content: space-around` across three
   items of **different widths** spreads the leftover space evenly, which
   leaves the item *centres* unevenly spaced: 123.4px then 130.1px. A row of
   tab icons is read as a rhythm of equally spaced points, so a 6.7px wobble
   registers even though the bar looks symmetric overall.

Each destination now owns an equal third (`flex: 1`) and the bar is padded to
the gutter, so the row spans 24 → 366 and the centres land on 81 / 195 / 309,
exactly 114 apart. The visible pill moved to an inner `.bt-navpill` span so it
still hugs its label rather than stretching to fill the column; the responsive
rules for the desktop rail and the compact landscape bar target that span now,
not the button.

**The general rule:** `space-around` / `space-evenly` only produce an even
rhythm when the items are the same width. For anything read as a row of
markers, give the items equal columns and centre the content inside them.

### Then it still felt wrong, and the reason was motion, not layout

Equal columns fixed the geometry and the bar still read as off. Four more
things, found by measuring rather than looking:

| | was | now |
|---|---|---|
| selection pill width | **63.3 / 82.3 / 76.7**, one per tab | 88, constant |
| bar content vertical centre | **3.5px above** the visible bar's centre | 0.5px |
| gap, Sale button to bar | **3px** | 12px |
| summary card inset on Analytics | **48px**, vs 24 on Home | 24 on both |

The first and last are the important ones, and they share a cause: **they are
only visible as motion.** Nothing else on screen changes when you navigate, so
a "you are here" marker that grows 19px when you move to Analytics, and a
summary card that jumps 24px inward on the same trip, are perceived as
instability rather than as layout. You cannot point at either in a still
screenshot, which is exactly why it registers as an unpleasant feeling with no
name attached.

Causes worth not repeating:

- **The pill hugged its label.** Labels are 31 / 50 / 45 wide, so the indicator
  inherited that spread. An indicator has to be a constant; it is the one
  element whose job is to be compared against itself in another position.
- **`box-sizing: content-box` on the bar.** `minHeight: 78` measured the
  CONTENT box, so the 8px bottom padding was added *below* it: items centred in
  78 while the bar you can see was 87. Border-box, with the safe-area inset as
  the only bottom padding, centres the row in the area it actually occupies and
  keeps the inset as pure clearance.
- **A card with its own margin inside a padded container.** `summaryCard`
  carries `margin: 0 24px` because on Home it is a direct child of the screen.
  On Analytics it sits inside `tabInner`, which pads 24 as well, so the same
  card was double-guttered. Any component with its own outer margin needs that
  margin cleared when it is nested in something that already supplies one.

Also on Analytics: the ranking row was a fixed 130px column holding a rank, an
emoji, a name and a margin figure. At the current type sizes the name wrapped
and shoved the bar and the amount out of shape. It is a grid now, on the same
lines as the ledger, with the bar spanning underneath. And the chart had been
built on `infoCard`, so it carried a 4px accent stripe: a status device on a
chart, sitting next to real ones.

### Analytics, rebuilt

The page showed **profit per business three times**: once in the bar chart,
once in the ranked list directly beneath it in the same encoding, and once on
Home before you ever got there. That redundancy, not the chart type, was the
problem with it.

**The chart is not a ring, and was not made one.** A ring encodes part-to-whole,
which would have been the same data a fourth time; it needs a legend, which on
390px with named businesses is either unreadable or a colour key to look up;
and it is imprecise where a list is exact. The *question* a ring would have
answered is a good one though (how concentrated is my income), so it is
answered as **a share percentage on each row of the list**, which is precise and
costs no space.

**What was missing was time.** `occurredAt` sits on every sale and was used for
exactly one thing: the "Today / Yesterday" label. Nothing in this app had ever
shown a trend, which is the one question Home structurally cannot answer and
the only real reason to open an analytics screen. The chart slot now holds
eight weeks of profit, Monday-start.

Two defects fixed on the way, both of the same family as the "This Month" bug:

- **Top Items ranked by units sold and printed revenue.** The first row was not
  necessarily the biggest number on the screen.
- **That revenue was styled green as profit** by `invProfit`, the same style
  that genuinely means profit-per-unit on the Inventory tab. Revenue wearing
  profit's clothes, in a bookkeeping app.

Both came from `unitPrice * sold`: the price you *hoped* for times the units
that moved. It ignored every discount, and it could not see custom sales at all
because they have no inventory item. `itemPerformance()` builds from actual
sales instead, and immediately showed that the top earner in the test books is
a custom wedding shawl the old page could not have listed.

New in `domain/stats.js`, all tested: periods take an exclusive `until` so
adjacent months partition cleanly; `startOfWeek` (Monday, UTC, for the same
reason `startOfMonth` is UTC); `weeklyProfit`, which **keeps empty weeks as
zeroes** because a gap in trading is information and closing it up turns four
quiet weeks into a smooth line; and `itemPerformance`.

### The AI feature, and what was built toward it

A real user exports their CSV and asks an AI what to change about their
business. That is the strongest product signal in this project so far. It says
what job Analytics was not doing.

No AI was built. What was built is the cheap version of the same job: **"Copy a
summary for analysis"**, which puts a compact labelled text summary on the
clipboard: portfolio, month against last month, profit by week, per business,
per item realised, and stock running low. A CSV of every row is the wrong shape for
this; it spends the reader's attention on transcription rather than on the
question.

It copies and nothing else. Where it goes next is the owner's decision, and
while the app has no AI of its own that is the only honest place for that
decision to sit. The privacy policy says records are not sent to third parties,
and a button that silently posted the books somewhere would make that false.
When a real feature lands, this is the section it replaces.

### PINNED: the analytics chart is empty for a new user

Flagged by the owner to come back to, not solved.

The profit-by-week chart shows eight weeks. A user two weeks into the app sees
six empty buckets and two bars, which is *honest* (the empty weeks are real and
`weeklyProfit` keeps them deliberately) but may read as a broken chart rather
than as a short history. The guard currently hides the chart entirely below two
trading weeks and shows a note instead.

The real question underneath it is what an analytics screen should show someone
who has almost no history, and it is the same question as the AI feature: the
first month of use is when an owner most wants to be told something, and when
there is least to tell them. Candidate answers, none chosen:

- raise the guard from two trading weeks to three or four
- show only the weeks since the first sale, so the axis grows with them
- replace the chart with a comparison against the previous equal period until
  there is enough history for a trend
- show the chart but label the run-in explicitly ("2 weeks of history so far")

Worth deciding with a real user's books in front of you rather than the seed,
because the seed has two weeks by construction and makes this look worse than
it may be.

### Still open from the audit

The 47 native `alert()`/`confirm()` calls, the 13 border radii, the three
simultaneous depth strategies, and the dead `src/App.css` (184 lines nothing
imports). All four are done; see the next section.

---

## Session log: 15 September 2026 (part three): system

Audit section C, the findings about why every fix was a hunt. Still nothing
pushed.

The premise of this section is not that any one of these was a bug. It is that
each of them made the NEXT change more expensive: to alter the dark screens you
had to find ten hard-coded browns, to change a card's corner you had to know
which of seventeen radii it used, and to ask the user a question you had to hope
Android had not switched native dialogs off. Four of the items below turned out
to be live defects rather than untidiness, and that is the argument for the
whole section: an inconsistency you have to hunt is also an inconsistency you
cannot audit.

### What was scattered, and what it is now

| | was | now |
|---|---|---|
| border radii | 17 values | **5**: 12 control · 16 card · 22 sheet · 99 pill · 50% circle |
| depth strategies | 3 at once (shadow, 4px accent borders, blurred orbs) | **1**: surface + a hairline `box-shadow: 0 0 0 1px` |
| native `alert`/`confirm`/`prompt` | 47 | **1**, and it is deliberate |
| dead stylesheet | `src/App.css`, 184 lines, imported by nothing | deleted |
| dead `@theme` block | 11 unused brand colours (one of them `#85DCB`, five hex digits, not a colour) | one line, `--font-sans` |
| icon-only controls with no name | 4 labelled out of ~13 | every one labelled; 6 images given `alt` |

The only surviving radius outside the scale is `6` on the two 20px checkbox
ticks, where a 12px corner on a 20px box is a circle.

### The dialogs

`window.confirm` in an installed PWA renders as "biztrack.store says", which
reads as the browser interrupting rather than as the app asking. Worse, Android
offers to suppress dialogs after a few and the browser honours it, which turns
every guard into a no-op and every prompt into `null`.

That last part was not hypothetical. **Account deletion asked for the word
DELETE through `window.prompt`**, after a `confirm`. A suppressed prompt returns
`null`, the typed check compares `null !== "DELETE"`, and deleting your account,
which is a legal right rather than a convenience, becomes impossible with no
error and nothing to report.

So there is now one mechanism, `ask()`, which resolves a promise and reads
almost exactly like the call it replaces:

```js
if (!(await ask({ title: "Sign out?", body: "…", confirmLabel: "Sign out" }))) return;
```

It grew two variants, both of which paid for themselves:

- **`requireTyped`**, which puts a field in the dialog and disables the confirm
  button until the word matches. Account deletion and the factory reset use it,
  and it replaced a confirm-then-prompt pair with one dialog.
- **`askText`**, which resolves with what was typed instead of yes/no, and
  resolves `null` on cancel, exactly as the `prompt()` it replaced returned. It
  is used once: pasting a backup code from a pre-file version of the app.

Statements became toasts rather than dialogs, because a statement is not a
question. The toast carries a tone: an error is a red block that wraps and
stays 4200ms, an acknowledgement is a pill for 1800ms. Form validation became
inline `S.formError` text under the field, because "Quantity must be greater
than 0" is a correction to a control six pixels away, not news.

**One native `alert` is left, in `src/main.jsx`, and it stays.** It fires when
`emergencyExport` fails, which is reached from the crash screen. Every
replacement above is React, and React is precisely what cannot be trusted to
render at that moment.

### The dialogs did not work at first, and the reason generalises

`ask()` and `askText()` returned promises that never settled, on exactly the
screens that needed them most: the PIN reset and onboarding's "I have a code"
import. The button did nothing at all.

**App has seven early returns before its main shell, and the toast and the
dialog were mounted inside that shell.** (**Correction, 19 September:** it is
**eight** now, and the count matters because the invariant is audited by
counting. Seven of the eight wrap in `withOverlays`; the one that does not is
the blank hold on `!auth.ready`, which renders nothing at all. Checked rather
than assumed: nothing can raise an overlay in that window, because every
`showToast` in `checkUpdates` is behind `if (manual)` and boot-time
auto-rescue is silent for the same reason. So it is safe by circumstance, not
by construction -- the first toast raised during a slow session check would be
dropped silently.) A gate screen replaces the whole tree,
so the dialog those screens raised was never rendered, so `settle` was never
called. Every overlay now goes through one `withOverlays(ui)` that wraps every
return, including the gates, so the invariant is "the overlays are always
mounted" rather than "remember to mount them".

The general form: **a promise raised from a component resolves only if the thing
it created is somewhere that renders.** An early return is not just a different
screen, it is a different tree.

### Three colours that must not follow the theme

The token sweep earlier in the audit had been applied mechanically, and it broke
three things that a light-mode screenshot cannot show:

- **Onboarding, the crash screen and the Account header are dark in BOTH
  themes.** Their text was written as `--bg-primary`, which is `#FAF8F4` in
  light mode and `#1A0E0A` in dark. So in dark mode the onboarding headings and
  the owner's own name turned near-black on near-black, and the primary button,
  painted `--bg-primary` on `--text-primary`, became a near-black button on a
  near-black ground: the only way forward, invisible.
- **Two of the eight business colours had been replaced with semantic tokens**,
  `var(--warning)` and `var(--text-secondary)`. A business colour is an identity
  the owner picked, not a meaning. And `heroTint()` parses a six-digit hex and
  returns its input unchanged when it cannot, so a business on either of those
  got an UNTINTED hero: white on that amber measures about 2:1, which is the
  exact failure `heroTint` was written to prevent. Both are literals again, and
  the line says why.
- **"White" had four spellings**: `#FFF`, `#FFFFFF`, `#FAF8F4`, `#FAF9F7`.

There are now three tokens that are identical in both themes, defined once and
never redefined in the dark block:

```
--focus-ground  #2C1810   the permanently dark screens
--focus-ink     #FAF8F4   13.8:1 on that ground
--on-color      #FFFFFF   text on a business colour, after heroTint()
```

Light mode is pixel-identical after the change, because light `--text-primary`
already *was* `#2C1810` and light `--bg-primary` already *was* `#FAF8F4`. That
is what made the bug invisible for so long: in one theme the wrong token and the
right token have the same value.

**The rule worth keeping: a colour chosen to contrast with the PAGE cannot be
reused on something that is not the page.**

### The floating layer had never been measured

Three things hover over a screen, and each had been positioned by hand:

    install card   left/right 16   bottom 85
    toast          left/right 16   bottom 100
    Sale button    right 24        bottom 90

So the floating layer sat on a different left edge from the content behind it,
8px outside the 24px gutter that section B had just established everywhere else.
On Home the card and the toast both landed ON the Sale button. And the install
card's `bottom: 85` carried no `env(safe-area-inset-bottom)`, so on a
gesture-bar Android it overlapped the nav.

One ladder now, measured from the bar up, and one gutter:

    0     the bar, 78px + the gesture inset
    90    the Sale button, 12px clear, 46px tall
    148   anything above it: the toast, and the install card on a screen that
          has a button (`.bt-raised`)

Verified in the running app at 390x820: nav top 742, button 684-730, toast
624-672. Twelve pixels between each, and both edges on 24 and 366, the same
lines the ledger amounts and the summary card end on.

### Smaller things, found while looking

- **Two back arrows were still `size={24}`** while the other five were 22, one
  of them in `LegalScreen`. That is the whole category: a rule applied to the
  file you were in rather than to the app.
- **A duplicated `<div style={S.settingsDivider} />`**, pre-existing, drawing
  the same hairline twice so that one rule in the settings list was heavier than
  the others for no reason anyone chose.
- The five persona buttons in Account contained only an image with no `alt` and
  no label: a screen reader read "button" five times with nothing to tell them
  apart and nothing to say which was selected. They have `aria-label` and
  `aria-pressed` now, and their `#C17F5A` / `rgba(155,123,94,.1)` literals are
  tokens.

### Press feedback

There was none: no `:active`, no `:hover`, anywhere. On a phone that reads as a
dead control, which is how a double-tap happens, and this app records money.

It lives in `index.css` rather than in the style objects on purpose. Inline
styles cannot express a state, and a JS `onTouchStart` handler on every button
would be the same rule written eighty times.

```css
button:not(:disabled):active { transform: scale(0.97); filter: brightness(0.95); }
@media (hover: hover)              { button:not(:disabled):hover { filter: brightness(0.96); } }
@media (prefers-reduced-motion: reduce) { button:not(:disabled):active { transform: none; } }
```

### How the dialogs were verified

`scratchpad/dialogs.mjs`, same CDP driving as the screenshot harness. Two things
it does that the earlier scripts did not, both because the first run produced
four confident screenshots of the wrong screen:

- **Every click reports whether it matched anything.** A step that silently
  matched nothing is indistinguishable from a step that worked.
- **It clicks the SMALLEST matching element, not the first.** An outer wrapper
  contains every label on the screen, so `querySelectorAll('div').find(…)`
  matches the whole page and clicks it.

One trap worth recording: the error toast for "no pre-upgrade backup" would not
appear, because **migrating the seed WRITES a pre-upgrade backup**. The happy
path was running and quietly downloading a file. The harness clears
`biztrack-pre-ledger-backup` first.

### Still open from the audit

App.jsx is now ~3,800 lines and remains the largest structural debt. The
analytics chart being empty for a new user is still pinned above. Everything
else in the audit is done.

---

## Session log: 16 September 2026: motion

Not an audit section. A, B and C were the whole audit and C closed it. This is
the one craft area the audit never covered, and the reason to do it now is that
section B's hardest findings were the ones that were **only visible as motion**,
and it then left motion itself undesigned.

Still nothing pushed.

### What there was

Eleven `transition` declarations in 3,700 lines, and seven `animation`s. Not a
system, and not really a choice: no `:hover`, no `:active` before section C, no
entrance on any surface in the app.

| | was |
|---|---|
| durations | **0.2s, 0.3s, 0.5s, 0.8s**, and a bare `transition: 0.3s` |
| curves | `ease`, `ease-in-out`, one `cubic-bezier` overshoot |
| progress bars | three of them, at **three different speeds** |
| keyframes | `fadeIn` and `slideIn`, **byte-identical bodies under two names** |
| where those lived | two `<style>` tags inside JSX, so each existed only while its own component was mounted, which `index.css` already had a comment forbidding |

`transition: 0.3s` names no property, which means `all`: every animatable
property on the element, including ones that force layout, and including
whatever it inherits.

### The scale

```
--motion-tap    90ms    a control acknowledging a tap
--motion-move   160ms   something moving or changing in place
--motion-enter  240ms   a surface arriving over the screen
--motion-value  400ms   a bar growing to a new number

--ease-out  cubic-bezier(0.22, 1, 0.36, 1)   arriving
--ease-in   cubic-bezier(0.4, 0, 1, 1)       leaving
```

**These are short on purpose and it is a product decision, not taste.** This app
is read on mid-range Android LCDs, standing at a stall, with a customer waiting.
Past roughly 250ms an animation stops reading as polish and starts reading as
the phone being slow, and the person taps again. An onboarding step was fading
in over **0.8s**, on the screen where someone is deciding whether this app is
worth their time.

Measured across every screen afterwards, in the running app rather than in the
source: 0.09s, 0.16s, 0.24s, 0.4s, and nothing else. No `all` anywhere.

### What now moves that did not

- **Every sheet and dialog.** They had no entrance at all, so each simply
  existed, fully formed, over a screen that had not changed. A bottom sheet
  that does not come from the bottom is not a sheet: the gesture it teaches,
  drag it back down, is only legible if you saw it arrive from there. The
  responsive block had literally always *said* "a sheet slides up from the
  bottom edge because that is where the thumb is". It never did.
  Above 700px the same component is a centred dialog, and a centred dialog
  sliding up from the bottom of a wide window is a phone habit applied to a
  shape with no bottom edge, so there it scales in from where it already is.
- **The bottom bar's selection marker.** This is the payoff for section B.
  B made the pill a constant 88px specifically because "an indicator is the one
  element whose job is to be compared against itself in another position", and
  then it teleported, so there was never anything to compare. It is one element
  now instead of three, drawn behind the items and moved.
- **Changing screen**, which was a hard cut. With the bar, the heading and the
  gutters identical on all three, a cut gives no sense that anything was
  replaced, only that the numbers changed.
- **The Sale button**, which arrives when you return to a screen that has one.
- **Inline form errors**, which appeared under the button with no motion at all
  and were easy to miss entirely, defeating the point of moving validation out
  of a blocking dialog in the first place.

### The marker slides without knowing anything

The three destinations own equal thirds of the track (B again: `flex: 1`,
centres measured 114px apart), so `translateX(index * 100%)` lands on the right
column by construction. Nothing is measured, and nothing needs re-syncing when
a label changes length.

The three buttons gained one wrapper, `.bt-navtrack`, for a single reason: it is
exactly as tall as the pills, so the marker takes its height from `inset: 0`
rather than carrying a copy of it. The pill is 57.5px, which is an icon, a gap,
a line of 11px label and padding, and none of those are numbers this file should
have to know in two places. Verified at three widths: the marker's box is
pixel-identical to the active pill's in each, including the 88x34 compact
landscape bar.

**In the >=1024px rail it is switched off.** There the items are content-sized
and stacked with a gap rather than equal thirds of the height, so a
whole-column transform has nothing to land on, and a rail is read as a list
rather than as a rhythm of three markers. The highlight goes back onto the item,
selected by `aria-current="page"`, which the buttons now carry and should have
had anyway.

### Three toggles, two sizes, and none of them a control

Found by pulling on `transition: 0.3s`.

There were three switches written inline: dark mode at **44x24 with an 18px
knob**, the passcode and the analytics consent at **40x20 with a 16px knob**.
The same control, drawn two ways, four pixels apart.

Worse: each was a pair of `<div>`s inside a `<div onClick>`. A `<div>` is not
focusable and announces nothing, so **three settings, one of them a security
feature and one of them a consent decision, could not be reached with a keyboard
and were invisible to a screen reader.**

One `Toggle` and one `SwitchRow` now. The row is a `<button role="switch"
aria-checked>`, which gets Space, Enter, the focus ring and a spoken on/off
state for free. The knob moves on a `transform`, not on `left`: `left` is
layout, recomputed every frame, while a transform is composited.

### The splash screen never left

The largest thing this session found, and it had nothing to do with design.

`index.html` hides the boot splash with `opacity: 0; visibility: hidden`. That
is not removal. **`visibility: hidden` does not stop an animation**, so the
pulsing logo (`pulse 2s infinite`) and the sliding loader bar (`slide 1.4s
infinite`) kept running *for the entire session*, on an invisible fixed element
covering the whole viewport at `z-index: 9999`, on phones chosen for being
cheap.

It is stopped when the fade starts and the node is removed once the fade is
done. Confirmed gone from the DOM afterwards, along with both animations.

### The theme switch was half animated, so it is now not animated

`body` cross-faded its background and text over 0.3s when dark mode was toggled.
Nothing else did: every surface in this app is painted by an inline style, which
no stylesheet rule reaches. So the cards, the bar and the framed column flipped
in one frame while the page behind them crawled for 300ms.

On a phone that showed as a mismatched edge. On a desktop, where the body is
visible either side of the 1240px column, it was two large panels changing at
different speeds. **A theme switch that is only partly animated reads as a
rendering fault**, so it happens in one frame now, everywhere. Animating the
rest is not available without `!important` on a global selector, which would
break every transition above.

### Deliberately not done

- **No stagger on list rows.** A list that deals itself out like a hand of cards
  is the most recognisable tell of motion added for its own sake, it delays the
  first row on every single navigation, and this is a ledger someone checks
  twenty times a day.
- **No exit animations.** React unmounts immediately; keeping a node alive to
  animate it out means owning a closing state everywhere, and nothing here is
  worth that. Things arrive with weight and leave at once.
- **No sliding marker on the business tab strip.** Those segments have their own
  visible backgrounds with gaps between them, so a marker would have to hop
  across the gaps. It is a segmented control changing state, and it gets the
  90ms step on the two properties that actually change.

### Reduced motion

The existing global `prefers-reduced-motion` block already collapses any
duration to 0.01ms, and it reaches everything added here: verified by emulating
the media feature and re-reading the sheet's computed animation, which came back
at `1e-05s`. The spinner still turns, slowly, because a stopped spinner says
"broken" rather than "working".

### The sweep, and what it caught

Three sessions had changed layout-adjacent CSS, so the close of this one was
every screen at every width, in both themes, **measured rather than looked at**:
`scratchpad/sweep.mjs` walks 5 screens across 320 / 390 / 700 / 834 / 1280 and a
740x400 landscape, and reports horizontal overflow, the nav's geometry, and
whether the marker's box is pixel-identical to the current pill's. Sixty
combinations per theme. It found four things, two of them mine.

**1. The landscape bar had quietly undone section B.** That block sets
`.bt-navpill { width: auto }`, so at 740x400 the pills measured **88.1 / 108.6 /
102.5** and the marker, a constant 88, sat *inside* the pill on two tabs out of
three. The centres were right, so nothing looked wrong in a still; it took an
indicator to make it visible, which is the same lesson as B's original finding.
The pill width is now one inherited custom property, `--nav-pill-w`, which the
marker reads too, because an indicator that is not exactly the shape of the
thing it marks is just a second shape.

**2. The marker claimed a screen you were not on.** `Math.max(0, findIndex(...))`
turns "not found" into "Home", so opening Account from Settings lit Home: the
one control whose entire job is to say where you are, saying somewhere you are
not. Before there was a marker this was right by accident, because
`screen === t.id` simply matched nothing.

The fix is a parent map rather than a remembered position. A ref read during
render is impure and the lint tripwire caught it immediately (3 errors to 6),
which was the right answer: `business` belongs to Home, and Account, About and
the legal documents are all reached from Settings, so the parked position is a
pure function of the screen rather than of where you happened to be before.

**3. Two grid blowouts at 320px**, both pre-existing. A grid track and a flex
child both default to `min-width: auto`, meaning they refuse to shrink below
their content's intrinsic width. So on Account the lifetime-profit card ran
**past the right edge of a 320px screen**, and the owner's email pushed the
profile header 3px wider than the phone. `minmax(0, 1fr)` is the whole fix for
the grid and `minWidth: 0` for the flex child, and the email is ellipsised
rather than wrapped because the full value is in the field directly below it.

**4. The feedback card**: five rating buttons at their intrinsic width needed
272px of a 232px row. They are equal columns now, which is the same argument
that gave the nav its equal thirds. Its padding was also 20 where every other
card in the app spends 16, so its text sat on the 44px line instead of B's 40.

### One finding was wrong, and the revert is the point

The sweep also reported the inventory row's right column overflowing by 14px,
and the first fix was a `flexShrink: 0` and a `gap`. Measuring properly showed
**the figure is 117px in a 117px column and is not clipped at any width**: the
14px is the delete button's own negative margin, which exists so a 44px tap
target reaches the card's edge. Both changes were reverted, and `clip.mjs` now
ignores a parent whose child is outdented, along with deliberately ellipsised
text and anything inside a horizontal scroller. A detector that cries wolf gets
turned off.

Worth knowing about the harness: **a CDP metrics override is cleared when the
socket that set it closes.** Measuring "at 320" from a second process therefore
silently measures at whatever the window actually is, which is how the first
reading of that row came back as a 342px row on a 320px screen. `probe.mjs`
takes a width and sets it in its own session.

What remains at 320px is one emoji glyph painting 23px inside its declared 20px
icon slot. It is width-independent, `overflow` is visible so nothing is cut, and
the business name beside it sits 12px clear. Changing the 20px slot would move
the icon column the whole alignment system is built on, for 3px nobody can see.

---

## Session log: 16 September 2026 (part two): redundancy

A redundancy audit of the whole app, run with the `design-review` skill: not
"does this look good" but "how many things here do the same job, and do they
still agree with each other". Still nothing pushed.

The answer to the second half was no, three times, and each disagreement was a
live defect rather than untidiness. **Duplication does not stay duplication.**
Two copies of one job drift, and the copy that drifts is the one nobody looked
at recently.

### What the count found

| job | doors |
|---|---|
| export your data | **7** |
| restore from a backup | **4**, in **2 separate implementations** |
| emergency data rescue | **3** |
| sign out | **2**, doing different things |
| screens that are a list of settings rows | **2**, 20 rows over 13 sections |

The two settings screens share section names that mean different things:
Settings has `Data`, Account has `Data Management`; Settings has `About`,
Account has `App Information`; Settings has `About > Privacy Policy`, Account
has `Privacy > Share usage data`. Nothing tells you which screen owns a control
except having found it there before.

### Three defects, all of them caused by the duplication

**1. "Sign Out" on the Account screen did not sign out.**

```js
onClick={() => {
  ctx.setOnboardingComplete(false);
  showToast("Signed out successfully");
}}
```

It never called `signOutOfAccount`. It reset onboarding and dropped the user
into the setup wizard **with the account session still live**, then told them
the opposite of what had happened. No confirmation, and styled `primaryBtn`, so
it was the loudest control on the screen. The real sign-out was a row in
Settings, with a confirmation, which is presumably why nobody noticed this one.

It is now the same action as that row, confirmation and all, and it renders only
when `auth.session` exists. A local-only user never had anything to sign out of.

**2. The copy offered before the factory reset was not their books.**

The "Download a copy first?" dialog called `downloadSnapshot`, which is the
**pre-ledger backup**: written once before the migration and, by this file's own
data-safety rule, never overwritten. So a user who had traded for months since
then did exactly the right thing, took the copy, erased, and was left holding
their books as of migration day.

And the whole offer was gated on `readSnapshot() && ...`, so a user who never
migrated, which is **every new user**, was offered no copy at all before
`localStorage.clear()`.

It now builds a real backup of the current state with the same
`buildBackup`/`saveBackupFile` pair that "Save My Data to a File" uses, it is
offered unconditionally, and **if the file cannot be written the wipe does not
proceed.**

Verified end to end rather than by reading the diff: seed one business with one
sale, take the offer, intercept `Blob`, and read what was actually produced.
`{format: "biztrack-backup", businesses: 1, names: ["Sabi Crochet"], sales: 1}`.

**3. The crash screen's "Download my data" had the same fault**, and the correct
function already existed. `emergencyExport()` in `main.jsx` captures live state
AND the pre-upgrade copy, and was wired to the error boundary; the crash screen
inside App.jsx offered the same button wired to the narrow one. It has moved to
`utils/transfer.js` so both callers run the same code.

`downloadSnapshot` survives, used twice, and both are honest about what it is:
the migration-mismatch banner's "Download original data", and the "Pre-Upgrade
Backup" row.

### One error, four presentations

`S.formError` in App.jsx was a tokenised block: tinted ground, matching edge,
12px radius, `bt-rise` on entry. The sign-in, claim and consent screens each had
their own bare `<p>` at 12px in a hardcoded `#FF9B8A`. Three copies of the same
literal, after section C removed thirty-five of them, so a failed sign-in and a
failed save looked like two different classes of event.

The contrast was fine, measured: `#FF9B8A` is **8.3:1** on `--focus-ground` and
`#9BD4A0` is **9.9:1**. The defect was that nobody had decided it once.

Those screens are dark in both themes, so they cannot use the light-mode tint,
and this is the `--focus-*` problem again: a colour chosen to contrast with the
page, reused on something that is not the page. They get the same
text/tint/edge trio every other semantic colour in this file has:

```
--danger-on-focus   #FF9B8A + a 12% tint and a 32% edge, both alpha over the ground
--success-on-focus  #9BD4A0 + the same
```

and `S.formErrorDark` / `S.formNoticeDark` are passed to them through `styles`,
which is how those screens already receive everything else. One definition, four
call sites, and an error is now the same shape of object wherever it appears.

### Still open, and deliberately not done yet

Four procedures were scoped and held, because they remove things rather than
correct them and that is the owner's call, not a craft one:

- **Collapse the duplication between the two settings screens.** Decided:
  **keep two, and make the line real.** Settings owns app preferences (theme,
  currency, low stock threshold, the legal documents). Account owns identity and
  data (name, email, passcode, files, delete account). Every row moves to
  whichever side it belongs on, and the duplicated section names go.
- **Cut the doors**: one export, one restore, one rescue, each reachable from
  one place.
- **Strip the sign-in screen**, which currently offers three fields, a consent
  checkbox with two links, and five separate actions on first run.
- **Remove the lifetime figures from Account.** All-time profit is already on
  Analytics, and section B settled that Home is the month and Analytics is all
  time. A third copy on a settings screen is money on a screen that is not about
  money.

One more for that pass, found on the way: **`PRO LOCAL` is a hardcoded string**
in success green on the Account screen, with no plan state anywhere in the
store. Every user is told they are on a paid tier, including a trial user and an
expired one. Given the trial-to-paid path is the whole commercial model, this
should say something true or say nothing.

### The second restore implementation

Not fixed yet; it belongs with the "cut the doors" pass and is recorded here so
it is not rediscovered. Account's restore counts both sides and requires
"Replace my books" before it writes. Onboarding's `handleImport` calls
`replaceBusinesses` immediately, with no confirmation. Onboarding is reachable
with real books present, which is exactly what the broken Sign Out above used to
do to people.

---

## Session log: 16 September 2026 (part three): the line between Settings and Account

Procedures 3, 4 and 6 from the redundancy audit, done as one pass because all
three moved rows on the same two screens and doing them separately would have
meant moving a row and then deleting it. Still nothing pushed.

### The line, and it is now real

There were two screens that were both a list of settings rows, 20 rows over 13
sections, in identical styling, with section names that collided: Settings had
`Data`, Account had `Data Management`; Settings had `About`, Account had `App
Information`; Settings had `About > Privacy Policy`, Account had `Privacy >
Share usage data`.

The owner's decision was to keep both screens and make the split mean
something. The rule, which every row was then sorted against:

> **Settings** is decisions about how the app behaves.
> **Account** is your identity, your credentials and your files.

| | |
|---|---|
| **Settings** | Account (the way in) · Appearance · Preferences · Usage data · About · Feedback |
| **Account** | Owner profile · Choose persona · Personal details · Backup · Your files · Security · Danger zone |

So "Export as CSV" and the cloud-backup row moved to Account, and "Share usage
data" moved to Settings.

**"Privacy" became "Usage data"**, which is the collision this pass was about.
The switch is gated on `isBackendConfigured`, so the legal documents cannot live
beside it: they have to be reachable in every build, including one with no
backend. Naming the switch for the thing it controls fixes the collision without
hiding a legal document behind a build flag.

### What went

- **The second sign-out.** The cloud-backup row moved onto Account in the same
  pass, and it already signs out, with the account's email and sync state
  beside it. The standalone button was the same action, worse presented, on the
  same screen. One action, one control.
- **The lifetime figures.** All-time profit is on Analytics, and section B
  settled that Home is the month and Analytics is all time. A third copy sat
  directly under the profile header, leading a screen that is not about money.
- **"Membership: PRO LOCAL".** A hardcoded string in success green with no plan
  state anywhere in the store, telling a trial user and an expired one alike
  that they were on a paid tier.
- **The "Pre-Upgrade Backup" row, when there is nothing behind it.** For every
  user who never migrated, which is every new user, tapping it produced an error
  toast and nothing else. A row whose only function is to report its own
  absence is not a door. Read once through a lazy `useState` initializer,
  because whether that snapshot exists cannot change while the screen is open.

### The CSV report was a hundred lines inside an onClick

`Export as CSV` could not be moved, because its entire implementation was an
inline handler in a JSX attribute: a function that only exists inside an
attribute belongs to that attribute. It is `exportCsvReport()` at module level
now, beside the other data helpers, and the row is seven lines.

It sits next to "Save My Data to a File" on the same card, which is the point of
moving it. They are two different artefacts and the only way to choose between
them used to be already knowing:

- **Export as CSV**, "A spreadsheet to read or send on. Not a backup."
- **Save My Data to a File**, "A backup to restore from, or to move to another
  phone."

`parseBackup` cannot read the CSV. Nobody had ever said so on screen.

### One restore, one rule

Onboarding's `handleImport` called `replaceBusinesses` the moment a file parsed.
The same action on Account counted both sides and required "Replace my books".
Two implementations of the one bulk write left in the app, and the one that had
drifted was the one nobody looked at.

It asks now whenever there is something to lose. Onboarding is usually an empty
app, where confirming the replacement of nothing is noise, but it is
re-enterable with real books present, which is precisely what the broken Sign
Out used to do to people.

### A finding that was wrong, and was dropped

The audit counted **three doors to Emergency Data Rescue** and proposed cutting
to one. Reading where they actually are killed that: the crash screen, the
onboarding screen, and the PIN lock screen. All three are places where Settings
cannot be reached at all, which is the whole point of a rescue. They are
contextual, not redundant, and all three stay.

The same test spared most of the seven export paths. Four of them are
contextual and appear only in a specific situation: the crash screen, the
migration-mismatch banner, and the offer before a factory reset. What was
genuinely redundant was the two that sat on a menu, on different screens, with
no way to tell them apart. Those are now adjacent and labelled.

### Verified

Both screens re-read out of the running app rather than the diff: section lists,
row lists, the Pre-Upgrade row present with a snapshot and absent without one.
Then the full sweep, 5 screens x 6 widths x 2 themes, clean, plus a 320px clip
check on both restructured screens.

### Still open

**Procedure 5, the sign-in screen**, is untouched. On first run it offers three
fields, a consent checkbox carrying two document links, and five separate
actions. Worth noting before that pass: consent is collected three different
ways in this app, by checkbox at signup, by fine print on the sign-in form, and
by the whole `ConsentScreen` for an existing account. That is the same shape of
finding as the two sign-outs, and it is the thing to look at first.

---

## Session log: 16 September 2026 (part four): disclosure, and the consent that could not be removed

The owner's pass over the restructured screens. Still nothing pushed.

### Sections you have to open

`Disclosure` is a settings section that stays shut. Three use it:

- **About** holds three documents nobody reads twice. Shut, it costs one row
  instead of a third of the screen.
- **Danger zone** holds erasing an account and erasing a phone. Those were a
  permanently visible row and a permanently visible dashed button at the bottom
  of the screen people open to change their own name. Shut is not about tidiness
  there: it is one deliberate tap before either is on screen at all. Verified
  that "Erase this phone" is **not in the DOM** while the section is closed.
- **Usage data**, for the reason in its own section below.

**The shut header is a CARD, not a label.** The first version made it a section
TITLE with a chevron, which left it the only thing on either screen that was a
control and did not look like one: everything else tappable here is a row on a
card. It is a row on a card now, with an icon, a label, a subtitle and a
chevron, and opening grows that same card downward, so the thing you tapped is
the thing that expanded. The header is a real `<button>` with `aria-expanded`.

The wipe also became an ordinary row rather than a dashed button of its own,
because a uniquely styled control at the end of a list reads as the screen's
conclusion, which is the opposite of what it is.

**The first version introduced a 4px near-miss and the harness caught it.**
`discloseHeader` carried `padding: 0 4px`, so its label sat at **28** while
every other section label sits at **24**: exactly the class of defect section B
spent a whole pass removing. The card version has no such offset.

### Sign out was made undiscoverable, and that was mine

Removing the duplicate sign-out in the previous pass left the survivor inside
the cloud-backup row, whose whole surface silently signed you out with the only
clue a small word on the right. The owner could not find it, correctly.

Status and action are separate rows now: a line showing the account email and
sync state, and below it a **Sign out** row that says what it does and confirms.
One control, and it looks like one.

### The usage-data switch could not be removed, so it was buried

The owner asked for it to go, on the reasoning that accepting the Terms already
covers collection. **The premise did not hold, and checking took one grep:**
`track()` returns early unless consent is exactly `true`, `flush()` refuses the
same way, and switching it off deletes the queue. Nothing is collected today
without it.

Removing the switch while still collecting would have made two live promises
false:

- "**If you agree** to share usage data, we also store which screens and
  features you used..."
- "You can **withdraw your agreement** to usage data at any time... without
  losing any feature of the app."

This project has shipped a claim its architecture had made untrue twice, and
logged both as liability. So the switch stays and is buried instead.

It took three attempts, each one the owner saying "deeper":

1. Its own section on the Settings page. Too obvious.
2. Inside the shut About section. Wrong for the reason the whole redundancy
   pass exists: a section named for one thing holding a control that does
   another. About is three documents; a switch that changes what leaves the
   phone is not one of them.
3. **The foot of the Features tab inside the About BizTrack screen.** Settings,
   open About, tap About BizTrack, scroll to the bottom. It is off the settings
   list entirely, which is what was asked for, and it is still a route the
   privacy policy can name in full.

That is the floor. A withdrawable consent has to stay reachable by a documented
path, so it can be deep but it cannot be undocumented, and it cannot be renamed
into something that does not say what it is. **The policy names this exact
route; if the switch moves again the policy moves with it.**

Verified where it landed rather than in the diff: walked Settings > About >
About BizTrack > Features, toggled it, and confirmed
`biztrack-analytics-consent` flipped to `"true"` with the toast.

**If it should genuinely become non-optional, the order is: rewrite the policy
and the signup consent text FIRST, then remove the gate in `analytics.js`, then
remove the switch.** Doing it in the other order is the same failure this file
records twice.

### Every navigation path in the policy was wrong

The document names four `Settings → X` routes and the restructure broke three
of them; the fourth, "Settings → Backup Data", had never matched any section at
all. All four now name where the control actually is. `LEGAL_VERSION` was
deliberately **not** bumped: these are corrections to wording, not changes to
what is collected, and bumping it re-prompts every existing user for consent.

This is the third time this file has recorded the same lesson. It is worth
stating as a rule rather than an anecdote: **`src/legal/documents.js` names
routes through the UI, so moving a settings row is a documentation change.**

---

## Session log: 16 September 2026 (part five): the select arrow, and the last bury

Still nothing pushed.

### The one mark in the interface nobody had chosen

The owner said the dropdown arrows "seem like they're just floating around,
they don't seem like they're part of the design". They were right, and it is
measurable. A native `<select>` draws its own arrow, so on five controls the
browser was choosing the glyph:

| | the app's chevrons | the select's arrow |
|---|---|---|
| shape | lucide chevron, stroke 2 | the platform's own glyph |
| size | a 20px box | whatever the browser draws |
| colour | `--text-secondary`, via the stroke attribute | the element's `color`, which is **`--text-primary`** |
| position | its own 20px box at the row's edge | crammed 10px from the edge |

So it was the **darkest chevron on the screen, on the least important control**,
in a shape from no family, not on the grid. That is the whole of "floating": it
is not in the palette, not in the icon set, and not on the measure.

Worse in dark mode. A native arrow painting with the element's `color` goes
near-white when the theme flips, so the loudest thing in a settings row became
an arrow.

### One `Select`, and the app draws the arrow

`appearance: none` removes the platform glyph; a lucide `ChevronDown` is drawn
in its place, `pointerEvents: none` so the whole control is still the native
select and keeps the platform picker, the keyboard behaviour and the
accessibility for free. Two shapes, because a select appears two ways here:
compact at the end of a settings row, and full width in a form. Both leave the
same room: 12 of inset, a 20px chevron, 6 of air before text can reach it.

**It points DOWN, not right, and that is a distinction worth keeping.** A right
chevron in this app means "this goes to another screen". A select opens a list
where it stands. Five controls used to say the wrong one of those.

`S.input` carried `appearance: "auto"`, which is an explicit request for the
platform arrow. It stays for real `<input>`s; `S.selectFull` is the same box
without it.

Measured after, in the running app: every chevron in the app, navigation and
select alike, is now `stroke="var(--text-secondary)"`, `stroke-width="2"`,
`width="20"`. In dark mode the select arrow paints `#D6A98A`, the dark theme's
`--text-secondary`, which is the point: it follows the theme, and the native one
never did.

### The usage-data switch, third and final location

Settings section, then inside the shut About section, then here: **the foot of
the Features tab inside the About BizTrack screen**. Settings, open About, tap
About BizTrack, scroll past "Independent Creators".

It is off the settings list entirely, which is what was asked for three times,
and Settings is down to four sections with exactly one switch on it: Dark Mode.

Verified where it landed rather than in the diff: walked the whole path,
toggled it, and watched `biztrack-analytics-consent` flip to `"true"` with the
toast. The privacy policy names this exact route in both places it mentions
withdrawal.

**That is the floor, and it is worth writing down why.** A consent the policy
calls withdrawable has to stay reachable by a path the document can name. Deep
is fine. Undocumented is not, and neither is relabelling it into something that
does not say what it does.

---

## Session log: 16 September 2026 (part six): the app picks, not the OS

Still nothing pushed.

The arrow was only half of it. The owner's real complaint was the OPEN state:
"on Android and PC it's kind of bland and basic". That is exact. A native
`<select>` hands the option list to the operating system, which on iOS draws a
polished sheet and on Android and desktop draws a plain grey list. **Nothing
about that list can be styled** - not the type, not the radius, not the theme,
not the dark mode. Five of this app's controls were therefore designed by
whichever browser the user happened to have.

So the list is the app's own now. `Select` is a button that looks exactly as
the control did, opening `ModalShell`: the same sheet as every form in the app,
sliding up from the bottom on a phone and centring as a dialog above 700px,
with the app's radius, its type scale, its motion tokens and its dark mode. The
chosen option is marked by an accent border, the control tint AND a tick, never
by colour alone.

No new dependency. The skill's advice is to compose a headless primitive rather
than hand-roll a control, and it is right in general, but this project has no UI
dependencies at all and an explicit kilobytes-on-3G budget. `ModalShell` already
IS the primitive; it just had to be reachable from a field.

### Hand-rolling it means owing the whole contract

A hand-rolled control that drops keyboard or screen-reader behaviour is broken,
not merely inconsistent, so the shell had to grow what a native select gave for
free. **`ModalShell` had neither Escape nor focus handling**, which means every
form, both confirmations and the update prompt could be opened and not closed
from a keyboard, and a screen reader was never told the context had changed.
Fixing it there fixed all nine at once, which is the argument for having had one
shell in the first place.

The sheet takes focus itself rather than the first control inside it: focusing a
field would open the keyboard on a phone before anyone asked.

Verified as a sequence rather than as a diff: trigger focused, sheet takes
focus, Escape closes it, focus returns to the trigger. Then picking an option
closes the sheet, updates the trigger, fires the toast and persists to the
store. And a picker opened from INSIDE the sale sheet stacks two sheets, closes
only the inner one, and leaves the sale form as it was.

**`.click()` does not move focus, and that nearly produced a false failure.**
The first focus test reported focus was not restored; the cause was the test,
not the app, because a synthetic click leaves `document.activeElement` on the
body. Focus the trigger first and it passes.

### The bug this uncovered in every modal

`S.modalOverlay` is `position: absolute`, so it covers its nearest POSITIONED
ancestor. Every modal until now was rendered at the shell level, where that
ancestor is the framed column and the two coincide. A picker is rendered where
its field is, deep inside `.bt-screen`, which is a SCROLLED container, so the
overlay inherited the scroll offset: measured at 390x820 it spanned **-193..627
on an 820px window**, and the page showed through underneath the sheet.

`ModalShell` portals into `.bt-app` now, so where it is called from stops
mattering. That is the only way a shared shell is actually shared. The framed
column rather than the body, so a sheet still centres inside the 780px frame at
tablet width the way every other sheet does. Re-measured: overlay 0..820, sheet
336..820.

### The new arrow was misaligned, in the variant that stretches

Caught by the owner, confirmed by measuring: on the sale sheet the button
spanned 24..366 and the chevron sat at 253..273, **93px short of the right
edge**, glued to wherever the label's words happened to end. Which is precisely
the "floating" complaint the native arrow was replaced for, reintroduced by the
replacement.

`S.selectValue` had no `flex: 1`, so the label span sized to its text and the
chevron followed it. The compact variant hid the bug: it is `inline-flex` and
hugs its content, so text-then-arrow is exactly right there. Only the
full-width one, which stretches to the field, had slack for the arrow to fall
short of.

`flex: 1` and `minWidth: 0` on the label. Re-measured: chevron inset 15 on the
full-width control (14px padding + a 1.5px border) and 13 on the compact one
(12 + 1), each landing on its own padding line rather than on a number anyone
typed, and the field's right edge at 366 with the text inputs beside it.

**That `minWidth: 0` is the third appearance of one default this week.** A flex
child and a grid track both default to `min-width: auto` and refuse to shrink
below their content, which produced the Account card running past a 320px
screen, the profile header 3px wider than the phone, and here an ellipsis that
could not ellipsise. Worth recognising on sight.

### One test in the harness is obsolete because the app improved

`dialogs.mjs` checked the "No pre-upgrade backup was found" error toast. That
error is now **unreachable from the UI**: the row hides itself when there is no
snapshot, and the only other caller is the migration banner, which cannot appear
without one. The branch stays as defence; the test now covers a toast that can
actually happen. Worth noticing rather than deleting quietly, because a test
that can no longer fail is not passing, it is absent.

---

## Session log: 16 September 2026 (part seven): the app stops being a crafts app

Still nothing pushed.

The category list was eight entries, six of them making-and-selling by hand:
Crochet, Jewelry, Beauty, Food, Fashion, Thrift, Accessories, Other. That was
the audience the app was first written for. It is not the audience: one of the
two real users sells **electronics**, and the owner's call is that this is for
anyone running a business, goods or services or digital, not for makers.

### The list

**29 categories, alphabetical.** Alphabetical deliberately: grouping by sector
means deciding which sector comes first, and that decision is the exact thing
being undone. Electronics, Phone & computer repair, Digital products, Printing
& design, Photography & video, Transport & delivery, Tutoring & lessons,
Construction & trades, Farming & livestock, Health & pharmacy and the rest now
sit beside Crochet rather than behind it.

**The eight original strings are kept VERBATIM.** They are stored on live
records and synced. Renaming "Thrift" to "Thrift & second-hand" would have left
both existing users with a category matching no option in the picker, which the
new `Select` would render as an empty control: data loss, visually, on records
that are fine.

### "Other" became a question instead of a shrug

A list cannot enumerate every business, so the last row is **"Something else"**,
which opens the `askText` dialog and takes whatever the owner types. The schema
already stores `category` as a free string, so a typed value costs nothing and
survives sync.

That needed one thing from `Select`: **a value the option list has never heard
of must still show.** It falls back to rendering the raw string. Needed twice
over, for a typed category and for "Other" on every record written before today.

The default is now **blank with a "Choose a category" placeholder**, not
"Crochet". Guessing someone's trade from the audience the app used to have is
the whole problem in miniature. Blank becomes "Other" on save, because
`str("")` returns `""` rather than the fallback, so an empty category would
reach the Home row and render there as a bare separator with nothing in front
of it.

### The copy that named the old audience

Two strings on the About screen still described a crafts app, and copy that
names an audience has to move when the audience does:

- "Empowering local entrepreneurs and creators to scale with confidence."
- "Whether you crochet, bake, or design..."

Both now describe someone running any small business. This is the same rule
this file keeps relearning from a different direction: **every claim in
user-facing copy has to be re-checked when the thing underneath it changes.**
Three times it was a claim that had become false; this time it was a claim that
had become too narrow.

---

## Session log: 16 September 2026 (part eight): sixteen colours and forty-one marks

Still nothing pushed.

The category list stopped being a crafts list, so the two things beside it had
to as well. Thirteen of the fifteen emoji were crafts, beauty or fashion, and
the eight colours were the whole warm half of the wheel and nothing else.

### The palette is sixteen, and every one was computed

**`heroTint()` does not make a colour safe**, and that is worth stating plainly
because it is easy to assume it does. It mixes 38% toward the ink, which
rescues a mid-tone and not a light one: pure yellow through it still measures
about **2.5:1** under white text, well under AA. The original eight only worked
because they were all mid-dark to begin with.

So every candidate was measured, white on the tinted hero, and the eight added
fill what the old set had none of, which was the entire cool half: teal,
indigo, violet, magenta, rose, plus two greens and a citron.

```
kept   #C17F5A 6.31  #8B6914 8.65  #7A9B76 6.16  #B85C5C 7.88
       #5C7A8B 8.06  #9B5C8B 8.42  #5C8B6E 7.30  #8B7A5C 7.52
added  #8C9645 6.26  #6A9647 6.67  #479E7E 6.43  #479E9E 6.29
       #475D9E 10.05 #53479E 11.32 #9E4789 9.29  #9E4767 9.54
```

Sixteen unique, **worst 6.16, which is exactly the worst of the original
eight**. The floor does not move, which was the condition for adding any.

The eight originals are kept for the same reason the eight category strings
were: they are on live records, and `#C17F5A` is also the app's accent and the
schema's default colour.

The swatches also gained `aria-label` and `aria-pressed`. They had `title`,
which is a tooltip and not an accessible name, so sixteen buttons with no text
announced nothing and nothing said which was chosen. Exactly the defect the
persona picker had.

### Forty-one marks, grouped by trade

Shop and retail, food, beauty and hair, fashion, making, phones and repair,
print and teaching, trades and cleaning, transport, farming, health and events.
Grouped rather than alphabetical because this is a grid of pictures: the eye
scans it by shape, so like things belong together. The fifteen originals are
all still in it.

### Emoji or icons is a real question, and it is the owner's

Asked and not answered in this pass. The argument that usually settles it,
that emoji render differently on every platform, **does not apply here**: this
audience is overwhelmingly Android, so they see one consistent set. Against
that, the app is lucide everywhere else and the business mark is the one place
using a different visual language, and an emoji does not respect its box: the
320px check still reports one painting **23px inside a declared 20px icon
slot**.

The reason to keep emoji anyway is that the business mark is CONTENT, not
interface. Lucide is how the app speaks; the mark is how the owner names their
own shop, closer to a profile picture than to a toolbar. Forty-one recognisable
pictures cover twenty-nine trades; thirty monochrome outlines would not.

---

## Session log: 16 September 2026 (part nine): a row, not a wall

Still nothing pushed.

Sixteen colours and forty-one emoji laid out in full turned the add-business
form into two grids you scrolled past to reach the button that creates the
business. The owner called it bloat, which it was, and it was **caused by the
previous two changes**: widening the sets without changing how they are shown.

### The shape

`QuickPick` puts a few on one row and the rest behind a count.

Collapsing them entirely was the other option and is worse: it costs a tap on
the common case, where someone is happy with the first colour they see. So the
common case stays on screen and only the tail moves.

**The button carries the number, not an ellipsis:** `+11` and `+35`. It answers
"is it worth opening?" before it is opened, which three dots cannot.

The row widths are not guesses. At 390px the sheet body is 342: a 44px swatch
with a 14px gap fits six, so five colours and the more button; a 44px emoji
with a 4px gap fits seven, so six marks and the button. Each row is exactly one
row.

**The chosen option is always in the row**, even when it is not one of the first
few, because a picker that hides your own selection is reporting the wrong
state. Verified: choose Berry, which is sixteenth of sixteen, and it appears in
the row as selected with the count still reading `+11`.

Measured before and after at both 320 and 390: the sheet was 90% of the window
and scrolling; it is **566px and does not scroll**. The whole form, name to
button, is on screen at once.

### The six on the row are a spread, not the first six

`EMOJIS` is grouped by trade, so its first six are all shop and food.
`QUICK_EMOJIS` is one per broad family: shop, storefront, food, fashion, making,
phones. A row of six has to be that to be useful.

### Two more bits of the old audience

The default mark was a ball of yarn. It is the shopping bag the schema already
falls back to, so the form and the fallback agree. And the business-name
placeholder read "e.g. Crochet by Sabi".

That is the fourth and fifth string this session that named an audience the
product no longer has. They are easy to miss precisely because they are not
claims and nothing contradicts them; they just quietly describe a smaller
product than the one that exists.

---

## Session log: 16 September 2026 (part ten): the way in

The owner said the sign-in and onboarding screens are "too cluttered... it just
fills the entire page". Audited with the `interface-design` skill. Still nothing
pushed.

### "No negative space" is measurable, so it was measured

`scratchpad/density.mjs` counts, for a screen: how many horizontal rows of the
viewport have anything painted in them, how many controls there are, and whether
it fits at all.

| screen | ink coverage | controls | text lines | fits 390x820? |
|---|---|---|---|---|
| **Create your account** | **60%** | **10** | 10 | **no, scrolls 20px** |
| **Welcome** (onboarding 0) | **49%** | 5 | 10 | yes |
| Your name (onboarding 1) | **17%** | 2 | 2 | yes |
| Your email (onboarding 2) | **22%** | 2 | 3 | yes |

**The answer is already in the product.** Steps 1 and 2 of the onboarding wizard
are exactly the screen the owner is asking for: one question, one field, one
button, 17% ink. The two screens that bookend them are three times denser. There
is no need to invent a direction; there is a need to make the gate look like the
wizard it leads into.

### The welcome screen had a functional bug, not a taste problem

Onboarding rendered `<InstallPrompt>` INSIDE its own "Important: Install First"
card. The prompt is `position: absolute`, so it never stayed in that card: it
floated 90px from the bottom of the screen and landed **on top of the two
controls below it**.

Measured at 390x820: the floating card occupied 603..730, "Looking for lost
data? Tap to Rescue" 619..663, "Transfer from another device" 675..727. Both
completely covered.

That is the worst thing on this screen to hide. This file records rescue-on-
onboarding as one of three deliberate entry points precisely because **someone
who has lost their books lands on this empty screen**. The install prompt was
sitting on the button they came for.

It renders in the flow now, one card with one message. Re-measured: Install App
480..510, Get Started 529..583, Rescue 607..651, Transfer 663..715. No overlaps.

Three duplications went with it:

- The install message was on screen **twice**, in two cards, because the
  explanation card and the prompt each said it.
- Onboarding computed `isStandalone` itself, duplicating the check inside
  `InstallPrompt` (which also covers iOS's own flag). Two copies of one decision
  about whether to show one card. It was also computed during render, which is
  impure, and the lint tripwire caught it the moment it became unused.
- The reason to install was "offline access and a native app feel". The reason
  that matters is that browser storage is per origin, so switching to the
  installed app without carrying the books loses them, which is this project's
  entire v1.5.3 history. It says that now.

### The inline card had to be repainted, and the lesson is the old one

The first version reused the floating card's colours: `--card-bg`, which is
WHITE, with `--text-primary` on it. On the permanently dark onboarding screen
that made it the brightest object on the page, **louder than "Get Started",
which is the actual primary action**.

That is the `--focus-*` rule for the third time: a colour chosen to contrast
with the PAGE, used on something that is not the page. Inline paints in the
fixed trio, and its button is a ghost rather than a fill, because the card
explains and offers; it must not compete with the way forward.

### The sign-in screen: audited, not yet rebuilt

Ten controls and ten lines of text, and it does not fit on a 390x820 phone.
What it asks, all at once and all at roughly equal weight:

1. fill three fields
2. agree to two documents and a cross-border data clause, in a 25-word
   paragraph placed **directly above the primary button**, with both document
   names underlined and coloured so a legal sentence reads as three more actions
3. or use Google
4. or sign in instead
5. or skip the whole thing

Four routes, presented before the person has been told anything about the
product. The skill's word for this is a parking lot: when everything competes
equally, nothing wins.

One item is a plain defect: **"Tick the box above to continue with Google."** is
a permanent line of body text that is really an error message. It is on screen
before anyone has done anything wrong, and it is the explanation for a rule the
person has not yet broken.

**The restructure is held, because it is a commercial decision, not a craft
one.** "Continue without an account" is currently the smallest, faintest thing
on the screen, below a rule, in the muted colour, and it is how both real users
actually use the app. Promoting it would suit the product, which is offline
first by design and treats the account as a backup mechanism. But this file's
own deployment order says getting both users onto accounts is a prerequisite for
pointing `biztrack.store` at the project, and account conversion is what the
sync and the commercial model rest on. Which path leads is the owner's to pick.

---

## Session log: 16 September 2026 (part eleven): calming the way in

The owner picked **"keep account first, just calm it"** from the four options
the audit left open. So the four routes all stay, in the same order, and the
work was entirely about which of them leads. Still nothing pushed.

### What the clutter actually was

The screen did not have too much on it. It had **no rhythm**, and those look
identical from the inside.

`scratchpad/rhythm.mjs` prints the top level blocks of a screen with the gap
between each pair, because "there is no negative space" is a claim about gaps
and a list of gaps can be read:

```
before                          after
  DIV  h164  the heading          DIV  h164
         gap 28                          gap 16
  FORM h320  fields + button      FORM h320
         gap 32                          gap 32     <- the one break
  DIV  h17   "or"                 DIV  h17
         gap 14                          gap 14
  DIV  h56   Google               DIV  h51
         gap 6                           gap 14
  DIV  h21   Sign in              DIV  h21
         gap 12                          gap 12
  DIV  h75   skip                 DIV  h75
```

**28 against 32 was the whole problem.** Two breaks four pixels apart do not
read as two tiers, they read as a mistake, which is the exact near-miss class
section B spent a pass removing and which produces unease rather than a
complaint. With six blocks spaced almost identically, the screen reads as six
separate things stacked, and six things stacked is what "it fills the entire
page" describes.

The heading and the form are one idea, "here is what you are doing, now do it",
so that gap is tight at 16. The break between the form and the other ways in is
32, double its largest neighbour, and it is now the only break on the screen.
Ink coverage barely moved, 60% to 57%, which is the point: **the fix was where
the space is, not how much of it there is.**

### Two primaries, one of them by accident

"Continue with Google" spread `S.primaryBtn`, so it was full width at 16/600 in
a box within two pixels of the height of "Create account". The translucent fill
made it *look* secondary and the measurement said otherwise.

**Two controls of identical footprint read as peers whatever colour they are.**
It steps down to the 14px body size in a 46px box, still well over the 44px tap
minimum, and the solid white button is now the only thing on the screen at that
weight.

Also corrected from the audit: the standing line "Tick the box above to continue
with Google" is gone, since `oauth()` raises a real error on the attempt and
that error has rendered in the shared bordered block since the last pass. The
two document names came down from `#FAF8F4`, the brightest colour on the screen,
to 75% white. The underline is what says "link"; the brightness was only saying
"look at me", three words above the primary button.

### A centred column that clips is the same bug as one that cannot be reached

Found while checking the screen fits, and it was not only this screen.

`S.phone` sets `overflow: hidden` and all nine focus screens set
`justifyContent: center` inline. Centred plus clipped means content taller than
the window is lost off **both** ends with no way to scroll to it. Measured on
signup at 390x820 with one validation error showing: **832px of content in an
820px window**, 6px gone off each end into padding. Nothing had been lost yet.
It was 6px away from losing something.

The `@media (max-height: 620px)` block existed because of the same fault, and
handled it by giving up centring entirely below 620px. That was only ever half
the story, and it hid the other half.

Two auto margined pseudo elements are the spelling that satisfies both
requirements at once:

```css
.bt-focus { justify-content: flex-start !important; overflow-y: auto !important; }
.bt-focus::before, .bt-focus::after { content: ""; margin-block: auto; }
```

They are flex items, so they absorb the free space equally and centre the real
children when the content fits. When it does not there is no free space, the
auto margins resolve to zero, and the content sits at the top of a scroller
that reaches all of it. Verified that centring is **unchanged**: 47/47 at
390x820 and 221/221 at 834x1112, identical to before. Verified that the error
case now scrolls instead of clipping, and that onboarding centres at 390x820
(95/95) and is fully reachable at 320x568 and 740x400.

`ClaimScreen` had carried its own `overflowY: "auto"`, one screen out of nine
patched where somebody happened to notice. That is the drift this week has been
about, and it is gone.

**The general rule, worth recognising on sight:** `justify-content: center`
pushes overflow out of the scroll range. Auto margins do not. Use the pseudo
element pair for anything that must centre when it fits and scroll when it does
not.

### Verified

Full sweep, 5 screens x 6 widths x 2 themes, clean. Nothing clipped at 320.
Lint still 3 errors and 3 warnings. The signup screen fits a 390x820 phone with
43px of air above and below, and still fits with a validation error showing.

---

## Session log: 16 September 2026 (part twelve): the shop sign

The owner likes the Home screen and said the businesses on it do not feel like
different businesses: "these are completely different businesses, it's not just
different products". Audited with the `interface-design` skill. Still nothing
pushed.

### The complaint is a number

Four businesses seeded across genuinely different trades, crochet next to an
electronics counter next to a kitchen next to a repair bench, then every row
measured rather than looked at:

```
row 342x74, identical on all four
left edges 24, 40, 72, 269, identical on all four
identity    a 4px x 32px stripe, plus a 20x17 glyph
            468 of 25,308 square pixels, 1.8% of the row
```

**1.8%, at the far left edge, in a 4px sliver.** Everything a person actually
looks at, the name, the figure, the note, the geometry, was byte identical. So
recognising which shop a row is required READING it, every time, on a screen
someone opens twenty times a day to answer "which one needs me".

That is not a taste problem and the fix is not decoration. A recognition cue
has to be big enough to work before reading, and this one was not.

### Two defaults guaranteed the collision

Worse, and this is the half that matters most in the owner's real app rather
than in the seed:

```js
const [color, setColor] = useState(COLORS[0]);   // always #C17F5A
const [emoji, setEmoji] = useState("🛍️");        // always the bag
```

Every business started on the terracotta that is **also the app's accent**, and
on the same mark. So two shops created by tapping through the form without
opening either picker were identical in every identity signal the Home list
has. Not similar: the same.

The colour now starts on the first entry in `COLORS` that no existing business
is using. Verified in the running app: with terracotta, indigo, sage and
magenta already taken, the form opens on Gold `#8B6914`, the first one free.

**The mark is deliberately NOT cycled the same way**, and the distinction is
the point. A colour is pure identity, so any of the sixteen is as true as any
other and handing out the next free one invents nothing. An emoji says what the
shop sells, so cycling it would hand a phone repairer a ball of yarn, which is
worse than handing them the same bag as everyone else.

### The first answer was a chat app, and the owner caught it

The 4px stripe and the bare glyph were first replaced with a **36px disc**
holding the emoji on a wash of the owner's colour. It measured well and it was
wrong, and the owner named it before any of the checks did: a circular avatar
beside a name, a sub-line and a right-aligned meta column is the **WhatsApp
conversation row**. Not a loose resemblance. On this audience's phones that is
the single most familiar list in existence, and the Home screen of a books app
had started to read as a messaging app.

That is the failure the `interface-design` skill describes exactly: the pattern
was reached for because it is the strongest pattern in training, not because
anything about THIS product asked for it. Measuring the defect did not prevent
defaulting on the fix.

Three replacements were built, screenshotted in both themes, and put to the
owner:

| | what it is | why not |
|---|---|---|
| the ledger margin | a 5px colour rule at full row height, rows stacking into one unbroken spine | quietest, but closest to the stripe that was already too weak |
| **the stall** | **the row's whole ground is a wash of the shop's colour, edge to edge** | **chosen** |
| the binder tab | a solid tab bleeding off the left screen edge | forces full-bleed dividers when every other rule in the app is inset, and crops differently on every device |

### The row is the shop

The colour now grounds the entire row rather than sitting beside the name, and
the rule between rows is that colour too. Identity went from 1.8% of the row to
all of it.

The 24px gutter moved off `bizList` and onto the row's own padding, because a
wash that stops short of the screen edge is a card again. Text still starts on
72 and the figures still end on 366, re-measured after.

**36 is not a number chosen by feel.** The alignment system says text that
follows an icon sits on 72, and 72 is 24 of gutter plus the icon slot plus the
row's 12px gap. A 36px slot is what keeps the text exactly where it was.
Re-measured after: left edges 24, 72, and the figures still ending on 366.

**This is not a return to cards, and the distinction is worth defending.**
Section B removed the per row card because there were SIX devices per row all
saying look here: a white fill, a shadow, an 18px radius, a colour bar, a
tinted emoji tile and a status pill, stacked four deep under a summary card
also saying it. The objection was the count, not the tile. This is one device
on a bare rule, and it replaced two weaker ones, so the count went DOWN. The
row is still a rule, still has no fill, no shadow and no pill.

### `bizTint` is not `heroTint`, and they must not be swapped

`heroTint` DARKENS a business colour so white type survives on it. `bizTint`
lightens one so a mark can sit on it. Same input, opposite directions.

It returns **rgba, not a mixed hex**, which is the whole reason it exists
rather than being written inline. A flat light mode tint is wrong the moment
the page behind it is dark, which this file already records for every semantic
colour. One alpha value is correct on the cream page and on the near black one,
and the dark mode screenshot is what proves it.

It falls back to `var(--control-bg)` rather than to its input. Returning the
hex unchanged is exactly `heroTint`'s documented trap, and here it would put a
solid, full strength colour where a 24% wash was intended.

**The wash is 10% in light and 18% in dark, and that is not the "one alpha
holds everywhere" rule being broken.** That rule is about one value holding
across SURFACES within a theme, which alpha genuinely does. It says nothing
about holding across THEMES, and perceptually it does not: a light ground has
far more room to be darkened than a near-black one has to be lightened, so the
10% that reads clearly on `#FAF8F4` is nearly invisible over `#1A0E0A`. Both
were screenshotted before the values were picked. The dividers follow, 38% and
46%.

### A 320px finding closed itself

The sweep has been reporting, since the motion session, one emoji glyph
painting 23px inside its declared 20px icon slot, and the judgement was to
leave it because widening the slot would move the icon column the whole
alignment system rests on.

The disc settles it without that cost. Measured at 18px the glyph is 25x24, and
a 36px disc holds it with 5.5px clear on every side. The glyph also sits at
offset 0,0 from the disc's centre on all four rows, so it is optically centred
and not merely boxed. The Analytics ranked list still uses the 20px
`bizRowEmoji`, deliberately: there the rank number leads the row and the mark is
a supporting detail, not the thing being recognised.

### Verified

Full sweep, 5 screens x 6 widths x 2 themes, clean. Nothing clipped at 320. The
row's left edges re-measured at 24 and 72 with figures on 366, so the alignment
system is unchanged. Lint still 3 errors and 3 warnings.

---

## Session log: 16 September 2026 (part thirteen): product photos

Both real users asked for this before anything else on their list: they want a
picture on each product, because someone selling from a stall knows their stock
by sight and "Denim Jacket" is three different jackets. Phase 1 of a four-phase
list the owner set (photos, receipts, invoices, and the legal gate). Still
nothing pushed.

### Photos are in IndexedDB, and that is not a preference

The books live in `localStorage` under `biztrack-storage-v3`, in a per-origin
quota of about 5MB. One uncompressed phone photo is 3 to 7MB. Anything that
puts an image near that quota risks a write of the LEDGER failing, and this
project's entire v1.5.3 to v1.5.7 emergency-rescue history came from exactly
one storage decision going wrong.

So `src/utils/photos.js` owns a separate IndexedDB database and the store keeps
only an id. Verified in the running app across the whole flow: after adding an
item with a photo, `localStorage` was still **9KB**.

**The database is deliberately not called `keyval-store`.** `checkRescue` opens
that name and `JSON.parse`s whatever it finds, so a JPEG landing there would be
handed to a JSON parser on the data-rescue path.

**`photoId` had to be added to `makeItem`.** That function drops every field it
does not name, and it runs on restore, so a field missing from it is a field
that disappears the first time someone moves phones.

### What a photo costs, measured

A 3000x4000 noise-and-gradient image, which is roughly the entropy of a real
photograph, encoded as a 12MP camera would:

```
original                      6.93 MB
1000px long edge, q0.72        102 KB     <- shipped
1000px, q0.80                  146 KB
1200px, q0.72                  197 KB
```

**68x smaller.** That number is the reason the pipeline exists: this audience
pays for every megabyte, and it is also what the backup question below turns
on. The field shows the saved size on screen for the same reason.

### Three traps in the encode path

- **EXIF orientation.** Android cameras write portrait photos as landscape plus
  a rotation flag. `createImageBitmap(file, { imageOrientation: "from-image" })`
  applies it. Without that every portrait product photo is stored on its side,
  and redrawing through a canvas makes it permanent rather than merely
  displayed wrong.
- **`canvas.toBlob` fails silently.** Asked for a type the browser cannot
  encode, it does not throw and does not return null: it quietly encodes PNG.
  A photo meant to be 100KB comes back as a multi-megabyte PNG, which is worse
  than the original on a metered connection and invisible to any test that only
  checks a blob exists. The returned type is therefore checked, not assumed.
- **A canvas is transparent, and JPEG has no alpha**, so an unpainted one
  encodes as black. It is filled white first, or a PNG with a transparent
  background becomes a black rectangle.

### The bug worth the whole session

`openDb` cached its connection at module scope, and the test drove it into a
state that turns out to be reachable for real:

> `Failed to execute 'transaction': One of the specified object stores was not found.`

**A database can exist at the right version and still have no object store.**
An upgrade transaction that aborts part way leaves exactly that, and so does
anything else that opens the name without creating the store. It is not self
healing, and this is the part that matters: **`onupgradeneeded` fires only when
the version CHANGES**, so reopening at the same version returns the same broken
database forever. Photos would be dead for that user with no route back and
nothing on screen explaining why.

`openDb` now checks for the store and, if it is missing, closes and reopens at
`version + 1`, which is the only way to get an upgrade transaction at all. Two
smaller hardenings came with it: `onclose`/`onversionchange` drop the cache, so
a connection outliving its database (Chrome's "clear site data", another tab)
does not get handed out for the rest of the session; and a REJECTED promise is
never cached, because one transient failure would otherwise disable photos
until the app restarted.

### The row had no room, and the reason was a space

Adding a 56px photo column to the inventory row clipped every row at 320px: the
name column fell to 54px of usable width.

The cause is one this file has recorded before from another direction.
`formatMoney` separates the unit from the digits with a **non-breaking space**,
so `FCFA 2,500` is a single unbreakable token about 86px wide at 12px. Below
that the column cannot wrap and simply overflows.

The photo came down to 48, and the name column got a **floor of 96px** rather
than the profit column getting a cap. The floor forces the profit column to
give way, which it can, because it is allowed to wrap. Re-measured at 320:
nothing clipped, name 96, profit 84.

That is also the **fourth** appearance of `min-width: auto` on a flex child in
one week. Worth recognising on sight.

**Correction, 17 September:** this section originally called that column 108
and then did the arithmetic that gives 100. The number in the app was always
100; only the sentence was wrong. It went uncaught for a day because nobody
measured the line it claimed, which is the argument for measuring rather than
reading, applied to this file rather than to the app.

### Text in an inventory row now starts on its own column, and that is deliberate

The alignment system reserves a 20px icon slot and puts text on 72. A photo is
CONTENT, not an interface glyph, so it gets a real column: 24 gutter + 16 card
padding + 48 + 12. That is a second deliberate column, well clear of the 72
line rather than a near-miss, and **every row renders the slot whether it holds
a photo or not**, so nothing in the list is ragged and an empty slot is the
only affordance saying a photo can be added to an item that already exists.

### `requestPersistence` is called at boot, on purpose

Without it Chrome treats IndexedDB as best-effort and may clear it when the
device runs low on space. For most sites that loses a cache; here it would lose
a shop's product photos with no action by the owner, which is this project's
oldest failure mode wearing new clothes. It covers `localStorage` too, which is
reason enough on its own. Granted silently for an installed PWA and declined
silently otherwise, so it never prompts and there is nothing to handle.

### A harness contract worth knowing

**`scratchpad/clip.mjs` navigates nowhere.** It measures whatever page the
browser currently has open, which means it happily reports on a document loaded
before the last build and did exactly that twice this session. Drive the page
to the screen under test first; `invrow.mjs` does that and deliberately leaves
it there.

### The photo shows up in four places, and that meant deleting a duplicate

The owner asked for it on Sales, on Overview and in the + Sale picker as well
as Inventory. Two of those already shared markup:

**`SalesTab` and Overview's "Recent Sales" carried byte-identical sale rows.**
Adding the photo to each would have been writing it twice, which is the pattern
this file has spent the week removing. There is one `SaleRow` now. The old
copies had already drifted, exactly as predicted: Overview's dropped
`sale.note`, which nobody decided, it just was not kept in step.

**A sale does not carry a photo, and must not.** The picture belongs to the
PRODUCT, looked up by `itemId`, because a copy stored on each sale would go
stale the moment the owner retook it. `photoIndex()` builds the map once per
list rather than a `find` per row, since both callers render every sale a
business has ever made. Soft-deleted items stay in the map on purpose: a sale
of something since removed from the list should still show what was sold.

**A custom sale gets the empty slot**, which is right rather than a gap: there
is no product in the book for it to be a picture of.

`Select` gained an optional `icon` per option, and it is drawn on the trigger
as well as in the sheet. Without the trigger half, picking a photo in the list
would show one and then hide it again the moment the sheet closed.

On the Best Seller card the photo sits beside the VALUE, not the eyebrow. This
file already records that an eyebrow is not a row and gets no icon column,
because an inline icon pushes the label out of line with the value beneath it.

### Still open in this phase

**Whether photos belong in the backup file, and it is the owner's call.** "Save
My Data to a File" says it is "a backup to restore from, or to move to another
phone". The moment photos exist and are not in that file, that sentence is
false, and this project has already logged two shipped claims its architecture
made untrue. At about 100KB each, fifty photographed items is roughly 5MB of
what is currently a small JSON file. Either they go in or the copy changes;
there is no third option that is honest.

Sync to Supabase Storage is also still to do, so today this device holds the
only copy of every photo.

---

## Session log: 16 September 2026 (part fourteen): photos reach the server

Phase 1 steps 4 and 5. Still nothing pushed, and **the storage migration has not
been applied**, so photo sync is written but inert. See the end of this section.

### The backup file now says what it does not carry

"Save My Data to a File" said it was "a backup to restore from, or to move to
another phone". That became false the instant photos existed: the file is the
ledger as JSON and photos are blobs in a separate IndexedDB.

Three options were put to the owner. The one taken is the reversible one: the
row now reads **"Your books, to restore from or to move to another phone.
Product photos are not included."** Putting photos IN the file is still open and
nothing here forecloses it; at about 100KB each, fifty photographed items is
roughly 5MB of what is today a small JSON file, and on metered data that is a
real cost every time someone taps it.

The other claim, in the feature guide, is "records are backed up to your account
so you can reach them from another phone". That one is not reworded, because
step 5 is what makes it true rather than something to weaken.

### Two deletions did not know photos existed

Both were live defects the moment photos shipped, and both are the same shape
as everything else in this file: a sentence that stopped being true.

**"Erase everything on this phone" did not.** `localStorage.clear()` does not
touch IndexedDB, so the books went and every photograph of the stock stayed on
a phone the owner believed they had just wiped. Verified end to end after the
fix: three photos and a 9KB ledger before, **zero photos and 0KB after**.

**Deleting an account left every photo on the server.** `deleteUser` cascades
DATABASE rows; Storage is not cascaded. So a user exercising a legal right to
be deleted would leave their entire product gallery in the bucket with no
account left that could ever name or reach it.

`delete-account` now empties `{userId}/` **before** deleting the user, because
once `deleteUser` returns there is no `auth.uid()` left to scope a cleanup to,
and a failure there should abort the whole thing rather than strand files. It
pages, because `list` caps at a page and "most of your data was deleted" is not
a right anyone has exercised. It re-reads the FIRST page each pass rather than
walking an offset forward, since each pass deletes what it read and an
advancing offset would step straight over what slid down into the gap.

**This function has to be redeployed.** The code change is inert until it is.

### The path is the authorisation

Objects live at `{userId}/{photoId}.jpg`, and every storage policy compares the
first path segment to `auth.uid()`. No join, no lookup table, nothing to keep
in step: a row cannot be mislabelled into another user's folder, because the
folder name IS the check.

That also removes a whole class of work. The path is derivable from the signed
in user plus the `photoId` already on the item, so **no new synced column was
needed**. A device that pulls an item knows exactly where its photo lives.
`remotePath` on the local record is a cache of "already uploaded", not the
source of truth; losing it costs a re-upload, not a photo.

The UPDATE policy carries both `using` and `with check`. With only `using`, a
user allowed to touch a row could rewrite its `name` into someone else's
folder: the check that lets them in is not the check on what they wrote.

The bucket is **private**, with a 2MB ceiling as a backstop against a bug
rather than a working limit, since the client compresses to about 100KB before
it ever uploads. A public bucket would make every product photo readable by
anyone who can guess a UUID, which the privacy policy says is not so.

### How the sync behaves

Photos push **after** the ledger, never before and never gating it, and the
result is deliberately not folded into `status`. `status` means "are my books
safe", and a large photo still uploading must not make it say no, nor delay a
sale reaching the server.

Uploads are **sequential on purpose**. This runs on a phone on metered mobile
data, and firing twenty parallel uploads is how you saturate a weak connection
and make all twenty time out.

Downloads are **lazy, per photo, from the component that needs one**, not a
bulk pull after sign in. Someone restoring on mobile data should pay for the
six thumbnails on screen, not for a gallery they have not asked to look at.
`Photo` calls `resolvePhotoUrl`, which reads locally first and only then
reaches out; for a local-only user it returns exactly what the local read did.

A duplicate upload is treated as success that arrived earlier: a previous run
uploaded the object and died before recording that it had. Worth knowing:
Supabase Storage returns `statusCode` as a **string**, confirmed by probing the
live project, so the check compares against `"409"` and not `409`.

### Analytics: five places now, and the domain row grew two fields

The owner asked for the photo on Analytics too. That screen is portfolio-wide,
so unlike every other list it has no single business in hand to look a picture
up against: `itemPerformance()` flattens every sale across every book.

So the ROW carries it. `itemPerformance` now returns `itemId` and `photoId`
alongside the figures. `key` already encoded the item id, but only by
concatenating it into a string, so anything that wanted it had to parse the key
back apart. The photo map is built once per business rather than once per sale,
and it deliberately keeps soft-deleted items: a product since removed from the
list still sold what it sold, and the row should still show what it was.

**A custom sale carries neither**, and that is visible on screen: the top
earner in the seed books is a custom wedding shawl, and it shows the empty slot
rather than borrowing a picture from a product it was never linked to. Asserted
in `domain.test.js` across all four cases: a live item, a soft-deleted one, an
item with no photo yet, and a custom sale.

40px here rather than the 48 an inventory row uses, because this list's
sub-line carries a business name as well as the units and the margin, so it has
less width to give. The thinnest-margin card gets one too.

The ranked BUSINESS list on the same screen keeps its 20px emoji and does not
get a product photo, which is the distinction that was already recorded: there
the rank number leads and the mark is a supporting detail, not the thing being
recognised.

Checked at 320: the only thing clipping on Analytics is the pre-existing
business emoji painting 23px inside its declared 20px slot, which this file
already records as deliberate and which `overflow: visible` means is not
actually cut. Nothing from the new photos.

### Not done, and it is not a detail

**The bucket does not exist yet.** Probed against the live project rather than
assumed:

```
POST /storage/v1/object/product-photos/probe.jpg
  -> 400  {"statusCode":"404","error":"Bucket not found","code":"NoSuchBucket"}
```

So until `supabase/migrations/20260916000100_product_photos.sql` is applied,
every upload fails silently and every remote fetch returns null, which is
exactly the designed offline behaviour and therefore looks like nothing at all.
**Today this phone still holds the only copy of every photo.**

Two things to do, neither of which is code:

1. Apply `20260916000100_product_photos.sql` (SQL Editor, or `db push`).
2. Redeploy the `delete-account` Edge Function.

Then re-run the probe above: a 400 with `NoSuchBucket` means step 1 has not
happened, and a 400 or 403 for a policy reason means it has and the policies
hold. A **200 would mean the bucket was created public by hand**, which is the
one outcome to look for.

---

## Session log: 16 September 2026 (part fifteen): receipts

Phase 2 of the owner's four-phase list. Still nothing pushed.

### The plan was wrong, and reading the schema is what showed it

The execution list said a receipt must be **a snapshot taken at issue time, not
a re-render**, because regenerating one later could contradict the copy already
in a customer's WhatsApp. That reasoning is right and the conclusion was not,
because `makeSale` already does it: a sale carries its own `itemName`, `qty`,
`unitPrice` and `occurredAt`, captured when it was recorded and never
recomputed from the item. **The money on a receipt cannot drift.**

So there is no receipts entity. No table, no store actions, no sync mappers, no
RLS, no migration, nothing to keep in step. `src/utils/receipt.js` draws from
the sale, and the receipt number is a pure function of the sale's id and date,
both immutable, so it is stable by construction rather than by being written
down. A reprint next year is byte-identical to the copy already sent.

The general form, worth keeping: **before adding a record to freeze something,
check whether the thing is already frozen.**

### The one thing this feature could get catastrophically wrong

A receipt goes to the BUYER. `unitCost` sits on the same record as
`unitPrice`, and `saleProfit` is one import away, so the worst available bug is
printing the owner's margin on a document they hand to a customer.

`receiptLines()` reads price and quantity and nothing else, and the test asserts
the negative rather than the positive: the serialised line must not contain the
cost, must not contain the profit, and must not carry a field whose NAME
matches cost, profit or margin. A test that only checks the total is right
would pass happily while a margin sat beside it.

### The number

`R-YYMMDD-XXXXXX`, and **not sequential, deliberately**. Sequential numbering
across two offline phones is the same conflict the stock ledger exists to
avoid: both devices issue number 47. This app also does not produce a fiscal
document, and an official-looking sequence would imply it does.

The first version took the leading six hex characters of the sale id. It passed
its unit tests and then produced `R-260915-000000` for **every sale in the test
books**, because their ids all begin with zeros. Slicing a prefix depends on
the SHAPE of an id, which is depending on luck; FNV-1a over the whole string
does not. There is now a test built from ids that differ only at the end, which
is exactly what a seeded or sequentially generated id looks like.

### PNG on a canvas, and no dependency

This audience sends business documents on WhatsApp, where an image previews
inline and a PDF is an attachment someone has to open. A PDF library is also 90
to 400KB against an explicit kilobytes-on-3G budget. A canvas is already in the
browser, so the whole thing costs nothing on first load.

It is **always light**, whatever theme the app is in: a receipt leaves the phone
and may be printed, and a near-black rectangle is not what someone wants in
their chat. It is drawn at 2x and declared at 1x so it is crisp opened full
screen. It carries the product's photo when there is one, which is Phase 1
paying for itself, cropped to a square by COVER rather than stretched, because a
portrait photo squashed into a box is worse than a cropped one.

Two things that had to be got right and are easy to miss:

- **`await document.fonts.ready` before measuring.** Without it the first
  receipt of a session silently renders in the fallback face while every later
  one uses DM Sans, which is invisible in testing because the second one looks
  right.
- **The canvas height is SUMMED from the same steps the drawing takes.** The
  first version used one trailing constant and left the footer baseline 6px
  from the bottom edge, so the descender on "Thank you" was cut off the
  finished PNG. Named parts mean the canvas cannot disagree with what is drawn
  on it.

### Why the receipt is drawn when the sheet opens

`navigator.share` requires transient activation, which an `await` can outlive.
A tap that first has to render a canvas can therefore be REFUSED by the
browser, and it would fail only on a real phone, only sometimes. The sheet
draws on open and the Send button hands over a blob that already exists.

That also buys the right behaviour for free: the owner sees the document before
it goes to a customer.

Dismissing the share sheet rejects with `AbortError`. That is a choice, not a
failure, so it does not fall through to the download: handing someone a file
they have just declined to send is the wrong answer to "no".

### The sale row is a button now

Tapping a sale opens its receipt. There was no competing action on a sale, so
the whole surface carries this one rather than every line growing a second
control, and it picks up keyboard reach and the focus ring the same way the
Home ledger rows did.

`SaleRow` is shared by the Sales tab and Overview's Recent Sales, so both got
it from one change. That is the extraction from part thirteen paying for itself
one section later.

### Verified

113 tests. Driven in a real browser: three sale rows expose receipts, the sheet
draws 1440x1080, the number renders, and sharing falls back to a download in
headless with the toast that says so. Full sweep clean, 5 screens x 6 widths x
2 themes. Lint still 3 errors and 3 warnings.

---

## Session log: 17 September 2026: overselling, and one customer's basket

Three things the owner raised together, and the third was a question rather than
an instruction. Still nothing pushed.

### Overselling now asks, and the reason it asks rather than refuses

The owner said overselling "should not be a possibility". It had been a
documented deliberate choice since the ledger landed, so the rule entry above
has been rewritten rather than quietly contradicted.

What it does now: the form will not record a quantity above stock without an
explicit "Record it anyway", through the app's own `ask()` dialog, naming the
figure and how short it leaves them.

**It is a question and not a refusal, and that is not softening the
instruction.** A refusal does not undo the sale. The customer has walked off
with the goods and the cash is in the drawer either way; all a block achieves
is that the money never gets written down. An app that will not record real
money teaches people to keep a second set of books somewhere else, which is the
one outcome worse than a stock figure that needs correcting. So the accident is
blocked and the fact is not: mistyping 50 for 5 now takes a deliberate yes,
which is what was actually going wrong.

`hasStockDiscrepancy` and its reconciliation toast stay. A negative balance can
still arrive without passing through this form at all, from another phone's
sale on the next sync.

### One customer, three items, one receipt

The owner spotted the problem in the same breath as asking for the feature: if
a receipt is per sale, and a sale is per item, then a customer buying three
things gets three receipts.

**Merging them into one sale record would be wrong.** Stock and profit are per
item; that is the ledger the whole app rests on. So the records stay separate
and only what gets PRINTED together changes: `groupId` on a sale, null for the
overwhelming majority, shared by lines recorded in one go.

It is a plain text column and deliberately not a `sale_groups` table. There is
nothing to store about a group beyond the fact that some sales share one: no
total to keep in step, no status, no owner. A table would be a second home for
the same fact.

In the form it is one button, "Same customer, another item", which records the
line, keeps the group, clears only the fields that describe the ITEM, and shows
a running count. The primary button becomes "Finish sale". Verified in a real
browser: three sales written, all sharing one group id, and one receipt reading
three lines with a single total of FCFA 21,500.

A basket is numbered by its GROUP, so every line shares one number and a
reprint matches the copy the customer holds.

### The receipt toggle is off by default

Asked for while recording, shown when the sale is finished. Off by default,
because most sales at a stall do not get one and recording a sale has to stay
one tap for the common case.

### Two bugs the mapper test caught, one of them from the last session

`mappers.test.js` pins the real column list by hand and asserts every mapped
key exists. Adding `group_id` failed it immediately, which is the tripwire
working. Checking why turned up something worse:

**`photoId` was never mapped, so it never synced.** Phase 1 uploaded blobs to
Storage and added a lazy remote fetch for a restored phone, and none of it
could ever have worked: a restored device pulls every item with a null photo
id, so there is nothing to ask the server for. The device that took the photos
still has them locally, which is exactly why it looked fine. `items.photo_id`
is in the photos migration now, and mapped both ways.

The general shape, again: **a feature verified only on the device that created
the data is not verified.**

### Verified

116 tests. Driven in a browser: an oversell of 99 against 13 in stock raises
the dialog, declining leaves the books untouched; a three-line basket writes
three sales sharing one group and draws one 1440x1380 receipt. Full sweep
clean, 5 screens x 6 widths x 2 themes. Lint still 3 errors and 3 warnings.

### Migrations still to apply, now three things

1. `20260916000100_product_photos.sql` (bucket, policies, **and
   `items.photo_id`**).
2. `20260916000200_sale_groups.sql` (`sales.group_id` and its partial index).
3. Redeploy the `delete-account` Edge Function.

Until 1 and 2 are applied, photos and baskets work locally and neither syncs.

---

## Session log: 17 September 2026 (part two): invoices

Phase 3, and the phase where the data model mattered more than the document.
Still nothing pushed.

### An invoice is not a sale, and that is the whole design

`calcBizStats` sums revenue and cost from every record in `business.sales`.
So do `calcPortfolioStats`, `weeklyProfit`, `itemPerformance`, the CSV export
and the copy-for-analysis summary. **Anything placed in that array is money the
books say has arrived.**

The cheap version of this feature is a sale with a `paidAt` flag, filtered out
of revenue. It would have to be filtered out of all six, and the day someone
adds a seventh and forgets, the owner's revenue silently includes money nobody
has paid them. This file already records one figure that meant something other
than its label, and it was a trust bug rather than a copy nit.

So invoices are their own records, their own table, their own RLS. **It is not
that they are excluded from revenue; it is that they cannot reach it.**

Marking one paid does not convert it either. The owner records the sale the
ordinary way and `saleGroupId` remembers the two belong together. A conversion
that wrote into `sales` on the invoice's behalf would reopen the same hole from
the other end. The confirmation says so in as many words: "It does NOT add the
money to your books: record the sale for that, so stock and profit move with
it."

Verified in a browser rather than argued: create an invoice, mark it paid, and
the sales count stays at 3 and revenue stays at FCFA 66,500 throughout.
`domain.test.js` asserts the same thing twice, unpaid and paid.

### Lines are document content, so they are JSONB

Invoice lines are never queried alone, never aggregated and never summed into
anything, because they are not ledger entries. A child table would buy joins
nobody needs and a second place for the same snapshot to drift from. Each line
carries its own name and price for the same reason a sale does: an invoice
already sent must not change when the owner reprices next month.

### One engine, two documents

`drawReceipt` grew a `kind` and the few fields an invoice adds: a customer
block, an optional due date, and a footer note. A second 200-line canvas
routine for a document differing by a heading and a name would have drifted
from the first within the session.

The label follows what the document IS. "Total paid" is a statement of fact on
a receipt; on an unpaid invoice it would be a false one, so it reads "Amount
due" until the invoice is settled and "Paid in full" after.

The measured header height had to grow with the optional lines. A constant
there is exactly what clipped the receipt's footer last time.

### No stock check when adding an invoice line, on purpose

The oversell guard added this morning is right on the SALE form and wrong here.
An invoice is a request for payment for work that may not be done yet, so
refusing to bill for something the owner is about to make or restock would be
the same guard applied where it does not belong. Stock moves when the sale is
recorded, which is the only place it should.

### The privacy gate, which this phase actually triggered

Two new categories, and both were missing from the policy:

- **Product photographs**, which shipped in Phase 1 and were never mentioned.
- **A customer's name and contact**, typed onto an invoice. This is the first
  personal data about a THIRD PARTY this app has ever held, and it crosses a
  border like everything else.

The policy also said "we do not collect ... your contacts", which was true
about the phone's address book and would have read as false beside an invoice
holding a customer's number. It now separates the two: nothing is read from the
device, and a customer's details reach us only because the owner typed them.
There is a line telling the owner they decide what to record about a customer,
and that deleting the invoice removes it from both device and database.

**`LEGAL_VERSION` is bumped to `2026-09-17`, deliberately**, where the route
corrections on 14 September deliberately were not. Bumping re-prompts every
existing user for consent, so it is reserved for a change to WHAT IS COLLECTED
rather than to wording. Two new categories qualify.

### The allowlist did its job before anyone asked it to

`track("invoice.create", { lines: N })` and `{ method: ... }` would have been
silently dropped: `lines` and `method` are not in `ALLOWED_PROPS`. Not a leak,
but not data either. They use `count` and `ok` now. A customer's name never
goes near it.

### Verified

125 tests. In a browser: four tabs fit at 320 with no overflow, an invoice is
created, drawn at 1440x1104 with the customer block, marked paid, and revenue
never moves. Full sweep clean, 5 screens x 6 widths x 2 themes. Lint still
3 errors and 3 warnings.

One harness note, because it produced a false failure: "Mark as paid" is the
label on BOTH the sheet button and the dialog's confirm, so the generic
click helper hit whichever came first in the DOM and the invoice stayed
unpaid. Target the last `.bt-sheet` when a dialog is stacked over a sheet.

### Migrations still to apply, now four things

1. `20260916000100_product_photos.sql` (bucket, policies, `items.photo_id`).
2. `20260916000200_sale_groups.sql` (`sales.group_id`).
3. `20260917000100_invoices.sql` (the table, indexes and RLS).
4. Redeploy the `delete-account` Edge Function.

Run `supabase/rls-check.sql` after 3, as after any schema change. Note that
`delete-account` empties the photo bucket but does NOT yet delete invoice rows
explicitly: they cascade from `businesses`, which cascades from the user, so
the rows go. Worth re-checking against the live project rather than trusting
this sentence.

---

## Session log: 17 September 2026 (part three): correcting a sale, and feedback that arrives

Two things the owner raised. Still nothing pushed.

### The feedback box was lying, and that is the right word for it

```jsx
<textarea placeholder="Tell us what you think..." style={S.feedbackInput} />
<button onClick={() => showToast("Feedback sent! Thank you 🙏")}>Send Feedback</button>
```

The textarea had **no `value` and no `onChange`**, so the words were never read
by anything at all. The button's entire implementation was a toast claiming the
message had been sent. The five rating faces did the same.

This is the Sign Out that did not sign out, and worse in one respect: the person
ACTED on the claim and then waited for a reply that was never coming.

What replaced it obeys one rule: **say what actually happened.** Three
outcomes, and no fourth where the app claims a success it cannot back:

```
"sent"    it is on the server
"queued"  it is on this phone and will go when there is signal
"failed"  it could not even be saved, which the person must be told
```

Queued locally FIRST, always, because this audience is offline most of the time
and a message that only sends when the network happens to be up is the same
broken promise in a different hat. It drains on boot as well as in the sync
loop: the loop needs a signed-in user, and a local-only owner is exactly the
person most likely to have something to say about an app they have not signed
up for.

**Not through the analytics queue.** That pipe is allowlisted to usage only and
must never carry content; feedback is content by definition. Opposite rules,
separate channels.

The send is **raced against 2.5 seconds**. Waiting on the network leaves the
button reading "Sending..." for as long as the phone takes to give up, which on
a weak connection is tens of seconds. Win the race and the person is told it
arrived; lose it and they are told it is saved and will go later, which is true
either way because the flush continues in the background.

The table is **write-only by design**: an insert policy and deliberately no
select policy, so nobody using the app can read the box back, including whoever
fills it with rubbish. `anon` may insert as well as `authenticated`, because a
local-only user is still a user. The spam surface is real and accepted, and the
policy comment says so.

### A sale could never be corrected, and now can

A mistyped price or quantity was permanent. That is the wrong trade in a book
someone runs a business on: an uncorrectable number the owner KNOWS is wrong is
worse for trust than an edit ever is.

**A sale and its stock movement are one fact recorded twice**, joined by
`saleId`: the money in `sales`, the units in `stockMovements`. So `updateSale`
and `deleteSale` live in the store and move the pair together. Editing either
alone leaves the books and the shelf disagreeing with nothing to say which is
right.

The sale is soft-deleted so its tombstone can travel; the MOVEMENT is removed
outright, because `deriveInventory` sums whatever movements it is given and
leaving one behind would keep the stock decremented for a sale that no longer
exists.

Only quantity, price and note can change. **Not the item**: changing which
product was sold is two corrections wearing one coat, since stock has to come
back on one shelf and off another. That is a delete and a new sale, and saying
so is clearer than pretending otherwise.

The oversell confirmation from this morning applies here too, computed against
what stock WOULD be: the old quantity added back before the new one is taken
off.

### The bug that would have made "delete" silently wrong

**`stats.js` never filtered `deletedAt` on sales.** Not in `calcBizStats`, not
in `weeklyProfit`, not in `itemPerformance`, and not in the CSV export or the
Sales list either.

That was harmless for exactly as long as nothing could delete a sale. The
moment one could, deleting a mistaken sale would have taken the row off the
screen and **left the money in the revenue** with no way to tell.

`liveSales(business)` is one helper used by every reader, rather than a filter
each of them has to remember. Asserted across all three stats readers.

### The seed hid the real behaviour, which is worth remembering

The first browser run showed revenue moving on a correction and stock NOT
moving, which looked like a bug in the store. It was the seed: its stock
movements are aggregates carrying no `saleId`, so nothing was linked to update.

Re-run against a sale recorded through the FORM, the whole chain is right:

```
record qty 3   stock 13 -> 10   linked move -3   revenue 66,500 -> 84,500
correct 3 -> 1 stock 10 -> 12   linked move -1   revenue 84,500 -> 72,500
delete         stock 12 -> 13   no linked move   revenue back to 66,500
```

**Fixture data that does not go through the real write path cannot test the
real write path.** Same shape as the harness that reported every item as low
stock for a whole session.

### Verified

126 tests. In a browser: a sale corrected and deleted with money and stock
moving together; feedback with nothing typed refused honestly; a rating and a
message kept in the queue with the app version, and the form cleared after.
Full sweep clean, 5 screens x 6 widths x 2 themes. Lint still 3 errors and 3
warnings.

### Migrations still to apply, now five things

1. `20260916000100_product_photos.sql`
2. `20260916000200_sale_groups.sql`
3. `20260917000100_invoices.sql`
4. `20260917000200_feedback.sql`
5. Redeploy the `delete-account` Edge Function.

Until 4 is applied every message queues on the phone and none arrives, which is
at least what the app now says is happening.

---

## Session log: 17 September 2026 (part four): the handle that did not grab

The owner said the Close button on a bottom sheet is redundant, because you can
drag the sheet down instead, and that it should exist on desktop and not on a
phone. Still nothing pushed.

### The gesture did not exist

The premise needed checking before anything was removed, and it did not hold.
`ModalShell` had **no drag handling at all**. A sheet closed by tapping the
overlay, by Escape, or by a Close button. `S.modalHandle` was a decorative pill.

Which makes it worse than a missing feature. The handle has been drawn at the
top of every sheet since the responsive work; `index.css` has carried a rule
hiding it above 700px with the comment "nothing to drag"; and the motion
session wrote down that a sheet arriving from the bottom edge teaches the
gesture of dragging it back. Three places described a gesture the app did not
have. **It is the clearest kind of dead control, because it advertises
itself.**

Removing the Close buttons first would have left a phone user with no visible
way out of a form at all: the overlay tap works, but nothing says so.

So the order was: make the handle tell the truth, and only then take the button
away.

### What the drag does

Pointer events on the handle-and-title strip, `translateY` while the finger is
down, and on release either it closes or it springs back:

```
travelled > 96px          close
speed     > 0.5 px/ms     close, because a flick counts even when it is short
otherwise                 snap back to 0
```

Three decisions worth keeping:

- **The grab zone is the top strip, not the sheet.** These sheets hold text
  fields and scrollable option lists, and a drag that could start anywhere
  would fight both. `touchAction: none` is scoped to that strip precisely so
  the form underneath still scrolls.
- **Downward only.** Dragging up would lift the sheet off the edge it is
  anchored to.
- **The transition is disabled while dragging.** Left on, the sheet lags behind
  the thumb, which on a mid-range Android reads as the phone being slow rather
  than as direct manipulation. It is re-enabled for the spring back.
- **Mouse pointers are ignored.** A mouse is not what this is for, and above
  700px there is no bottom edge to drag to anyway.

### Three Close buttons went, three stayed

The ones removed were secondary `textBtn` "Close" at the foot of the receipt,
invoice and sale sheets: redundant on a phone once the drag works, and replaced
on desktop by the X.

The three that stayed are inside "that invoice is no longer here" style states,
where Close is the ONLY thing to do and is styled as the primary action. That
is not a way out competing with a gesture; it is the single action on a screen
with nothing else on it.

### Verified with a real touch drag

Not a synthetic React event: `Input.dispatchTouchEvent` over CDP, so it goes
through the same pointer path a thumb does.

```
phone 390    close button  display:none      0 text Close buttons left
             drag 40px     sheet still open, transform back to none
             drag 200px    sheet closed by the gesture alone
desktop 1280 handle        display:none      nothing to drag
             close button  flex, 40px        click closes it
```

126 tests, full sweep clean at 5 screens x 6 widths x 2 themes, lint still
3 errors and 3 warnings.

---

## Session log: 17 September 2026 (part five): feedback reaches a person

The owner asked for feedback to go to the BizTrack email. Still nothing pushed.

### A row nobody opens is a more honest kind of nowhere

Part three made the box real: messages become rows instead of evaporating into
a toast that claimed they had been sent. But `feedback` has an insert policy and
no select policy, so the only way to read it was the Supabase dashboard, and
nothing told anyone a message had landed. Better than lying, still not
delivered.

### Why NOT `notification_queue`

The obvious move is to reuse the queue that already exists, and it is the wrong
pipe for two reasons that are both in its schema:

- `user_id` is `not null references auth.users`, and feedback can come from a
  local-only user who has no account at all. Forcing it through would mean
  inventing a user id.
- The drain resolves the recipient FROM that user, so everything in that table
  goes back to the person it is about. Feedback goes the other way. Pushed
  through unchanged, it would email a customer's feedback back to the customer.

So it stays in its own table and the SENDER grew a third phase instead.

### Phase 3 of `notify`

Same safety shape as the drain it sits beside: read unmarked rows, send, mark.
A run that dies halfway leaves correct state and the next run continues.
`feedback.notified_at` is the watermark, in exactly the shape
`notification_queue.sent_at` already uses.

It reuses everything already deployed and running: the Brevo client, the service
role, and `biztrack-drain`, which fires every fifteen minutes. No new cron, no
new secret, no client change.

`FEEDBACK_EMAIL` defaults to `REPLY_TO_EMAIL`, which is already
`hello@biztrack.store` and already an inbox a person reads. So this works with
no new configuration, and the override exists for the day that changes.

**The message is HTML-escaped.** It is text a person typed going into an email
body; left raw, an apostrophe or an angle bracket breaks the mail and anything
deliberate does worse.

A Brevo failure leaves the row unmarked so the next run retries, which is right
for a transient outage and harmless otherwise. A 429 breaks the loop, matching
what the drain above it already does.

### What is verified and what is not

**Not verified end to end, and it cannot be from here.** There is no Deno on
this machine and the function has to be deployed to run at all, so nothing has
actually sent an email.

What WAS checked: the file typechecks. A temporary `tsc` reports only the five
expected Deno and JSR module-resolution errors and nothing else, and the same
command on a deliberately broken copy reports `TS1005`, which proves the check
would have caught a real fault rather than passing silently.

The first attempt at that check was hollow and worth recording: it ran
`node node_modules/typescript/bin/tsc && ...` when TypeScript is not a
dependency here, so the `&&` short-circuited and only the trailing `echo` ran.
It printed "parse check done" and had checked nothing. **A check that cannot
fail is not passing, it is absent.**

### Migrations still to apply, now six things

1. `20260916000100_product_photos.sql`
2. `20260916000200_sale_groups.sql`
3. `20260917000100_invoices.sql`
4. `20260917000200_feedback.sql`
5. `20260917000300_feedback_to_inbox.sql`
6. Redeploy `delete-account` AND `notify`.

`notify` is the one that carries the feedback email, so 5 without 6 still leaves
messages sitting in the table.

---

## Session log: 17 September 2026 (part six): the ring, revisited

The owner asked for a ring chart on Analytics. Still nothing pushed.

### It was rejected once, and saying what changed matters

The Analytics rebuild considered a ring and did not build one, for three
reasons: it would be the same data a fourth time; it needs a legend, which on
390px is either unreadable or a colour key to look up; and it is imprecise
where a list is exact.

Two of those stopped being true in the meantime, which is the honest reason to
revisit rather than simply overruling the old note:

- **Every business now carries its own colour across the whole app**, because
  the Home list was rebuilt around exactly that.
- **It is no longer a fourth copy**, because the per-row share BAR was removed
  when the ring went in. Share had been encoded twice in that list already, as
  a percentage and as a bar whose width was that percentage. A column of bars
  is the worst of the three at the question share is FOR, which is how
  concentrated the income is. The ring answers that; the rows keep the exact
  figures, which a ring answers badly.

The weekly chart stays. A ring encodes composition and a bar chart encodes
time; they answer different questions and swapping one for the other would have
lost the only thing on the page that says whether the business is growing.

### The legend problem was still real, and the fix was already on the row

The first build put the ring above a list showing rank, emoji and name, and
**nothing on the screen said which segment was which business.** "The colours
are learned on Home" does not hold if this page never repeats them.

The rank number became the key: the same 20px column, now a filled disc in the
segment's colour. No new element, no legend, and the row did not have to grow a
fourth mark beside its rank, emoji and name.

### Two contrast failures, both caught by measuring rather than looking

**White on the RAW palette fails AA on nine of the sixteen**, worst 3.10:1 on
the sage. The first version filled the rank disc with `b.color` and wrote a
comment claiming the palette had been measured for exactly that. It had not:
the sixteen were measured white-on-TINTED, and the raw values were never safe.
Tinted, the worst is 6.16:1.

**Then dark mode.** `heroTint` darkens toward the ink, and the dark `--card-bg`
is `#2C1810`, so a tinted violet segment measures **1.49:1 against its own
card**: a slice nobody can see. The raw colour is no better at 2.22:1, under
the 3:1 a non-text graphic needs.

So `ringColor` darkens in light and lifts 45% toward the light ink in dark.
That puts the worst of the sixteen at **6.17:1 against the card and 6.17:1 for
the ink on the rank key**, which is the same colour. Both numbers being equal
is a coincidence of the tokens rather than a bug: dark `--card-bg` and the dark
ink are both `#2C1810`.

The text on the key follows the fill: white on the darkened light-mode disc,
dark ink on the lifted dark-mode one.

### Smaller decisions

- **A business at a loss is named under the ring, not dropped.** A ring cannot
  draw a negative, and a chart quietly omitting the very thing worth looking at
  would be worse than no chart.
- **The ring is hidden with one business**, because one business is always 100%
  of itself.
- **The hole carries the total.** It is the only chart shape with free space in
  the middle, which is the actual argument for a ring over a pie here.
- **It starts at twelve o'clock, clockwise.** Starting at three reads as an
  arbitrary rotation.
- Recharts is already a shared vendor chunk, so the ring costs the bundle
  nothing beyond its own few lines.

### Verified

126 tests. In a browser, both themes: four segments keyed to four rank discs of
the same colour, centre reading `ALL TIME FCFA 134,700`, zero share bars left.
Full sweep clean, 5 screens x 6 widths x 2 themes. Nothing newly clipped at 320.
Lint still 3 errors and 3 warnings.

The owner said this page will be revisited with more. The PINNED question above
is still the one to answer next: what the weekly chart should show someone who
has almost no history. The ring helps a little, because part-to-whole needs no
history at all.

---

## Session log: 17 September 2026 (part seven): an audit of Analytics, and its first finding

Run with the `interface-design` skill, measured in the running app rather than
looked at. Six findings; this section is finding 1, which is fixed. Still
nothing pushed.

### What the measurements said

```
alignment   24 · 40 · 72 · 92 · 104 · 133 · 169     two lists' names 12px apart
rhythm      section gaps 28 · 20 · 12, within-group 12
type        36 20 18 17 16 14 13 12 11              13 is off the scale
surfaces    9x r16 pad14/16, 2x r16 pad16/8         charts pad 8 horizontally
duplication all-time profit appears twice
monotony    9 near-identical rows, identical gaps
```

### Finding 1: a section heading sat as close as two rows inside a list

The three section gaps measured **28, 20 and 12**, and none of them was chosen.
`tabInner` supplies a 12px gap, and each break was whatever `marginBottom` the
PRECEDING element happened to carry: the summary card had 16, a chart card had
8, and a list row had none.

The last one is the defect. **12 is also the gap between two rows inside the
list above it**, so "What earns the most" sat no further from the previous
section than two items in one list sit from each other. Nine rows read as a
single run with a heading dropped in the middle.

That is the near-miss class section B spent a pass removing, at the rhythm
level rather than the alignment level, and it is worth noting that it arrived
the same way: not by a bad decision but by nobody making one.

### The fix is an owner, not three numbers

A break belongs to the section that starts, not to whatever came before it. But
`sectionLabel` is shared by ten call sites, and two of those make a blanket
`marginTop` wrong:

- **`sectionRow` is a centred flex row.** "My Businesses" sits beside "+ Add
  New", and a top margin on the label would drop it out of line with the
  button. Verified after the change: both centres on 375, `marginTop: 0px`.
- **Three onboarding headings spread it** as a base and override the size, so
  they would have gained 16px nobody asked for.

So there are two styles sharing one `SECTION_TYPE` const: `sectionLabel` is the
type alone, `sectionHead` is the type plus the break. That is not duplication;
they are two jobs that happen to share a type step, and the shared const is what
stops them drifting.

The two ad-hoc margins that were faking breaks are gone: `chartCard`'s
`marginBottom: 8`, and the summary card's 16 on this screen.

Re-measured: **28 · 28 · 28 between sections, 12 within**, one ratio with one
place to change it. Overview's "Recent Sales" and the Invoices "Settled"
heading picked up the same break, so it is a rule rather than a one-screen fix.

### Still open from this audit

2. Two stacked lists put their names on **92** and **104**, and neither is on
   the 24/40/72 system.
3. All-time profit is on screen twice: the summary card's meta and the ring's
   centre.
4. `summaryNote` is **13px**, off a scale of 11/12/14/16/20/26/36.
5. Chart cards pad **8px** horizontally where every other card pads 16, which
   is also asymmetric against their own 16px top.
6. Nine near-identical rows with identical gaps and surfaces. This one is not a
   spacing fix; it is the question of what the page is FOR, which is the same
   question as the pinned empty-chart note.

126 tests, full sweep clean at 5 screens x 6 widths x 2 themes, lint still
3 errors and 3 warnings.

---

## Session log: 17 September 2026 (part eight): finding 2, and the column that was three columns

Audit finding 2 said two stacked lists on Analytics put their names on **92**
and **104**, and neither is on the 24/40/72 system. Measuring the rest of the
app first turned that into something larger. Still nothing pushed.

### There were four lines doing one job

```
 72  text after a 20px icon slot          the system line
 78  Overview, low stock       28px photo + 10 gap
 92  Sales, Overview, Analytics 40px photo + 12 gap
100  Inventory                 48px photo + 12 gap
104  Analytics, by business    20 rank + 12 + 20 emoji + 12
```

**92 against 100 is the worst of these**, and the audit never saw it because
it only looked at one screen. Those two are the Inventory tab and the Sales
tab: adjacent segments of the same control, on the same business, which a
person flips between all day. Eight pixels is far too small to name and far too
large not to feel. 78 against 72 is six, which is worse still on that measure
and only survives because the strip carrying it is four rows long.

None of the four was chosen. Each is what fell out of a photo size picked for
that row plus a gap picked for that row.

### One column, and the photo size follows it

`PHOTO = { size: 48, radius: 12, gap: 12 }`, so the column is 100, and every
list that leads with a picture uses it. 48 because the inventory row already
spent it and that is the screen where the picture does the most work; 100
because it is 28 clear of 72, which is a column rather than a near-miss.

The 40px on the sale and Analytics rows had a reason written beside it: those
sub-lines are longer, so the row had less width to give. That reason is real
and it is answered below, but it was never a reason for a second COLUMN. It
was a reason for less room, and less room is what wrapping is for.

The low-stock strip is the exception and it is a real one. Those are not rows
in a list; they are a four-line strip inside a card, at the 12px meta size,
where the name is read and the picture only confirms it. A mark behaving as a
glyph takes the 20px slot and the 12px gap, which is the exact spelling of 72.
So it went from 28/10 to 20/12 and joined the icon line instead.

### The business list lost its emoji, and gained a mark

104 could not be moved by changing a gap: it is two 20px slots and two 12px
gaps, and no arrangement of those lands on 72 or 100.

It did not need to be. The row carried **two identity signals for one
identity**: a rank disc in the shop's colour and the shop's emoji. The disc has
been the identity mark since the ring landed, and the colour is what the Home
list was rebuilt around. The emoji was the second one, and it was what pushed
the name to 104.

Without it the name sits on **72**, the line the settings rows and every other
icon row already use. Nothing was invented.

One thing did change beyond removal: the disc now carries the colour **whether
or not a ring is drawn**. It used to be a plain grey number when there was no
ring, which meant the row's identity mark changed shape depending on how many
of the owner's businesses happened to be profitable. A mark that does that is
not a mark. `ringColor` was already measured for this exact use, worst case
6.16:1 on the fill and 6.17:1 for the ink on it, so making it unconditional
extends the measurement rather than needing a new one.

### The new column did not fit at 320, and the numbers say why

The wider column cost the top-items row 8px on its right, and the 320 check
caught it at once: 274 in 272.

Measuring the row rather than guessing gave the whole budget. At 320 there are
240px inside the card, and the row wants:

```
photo    48   fixed
gap      12
name     96   the floor, so the money column gives way instead
money    99   MIN-content, because "FCFA 45,500" is one unbreakable token
            255
```

**Four things and not one of them can give.** The name floor exists precisely
so the money wraps, and the money has already wrapped as far as a non-breaking
space allows. Going back to a 40px photo saves exactly 8 and still leaves 247
in 240, so the old geometry was 7px over as well and nobody had looked.

So the row wraps: `flexWrap` with a `rowGap`, and `marginLeft: auto` on the
figure block so that when it takes its own line it is still the row's right
hand column rather than a second unlabelled line. This is the same answer the
320px summary card and business hero already got, for the same reason, and it
engages the same way. Measured at three widths: **320 wraps, 360 and 390 stay
on one line.**

### Re-measured

```
Analytics   24 · 40 · 72 · 100
Overview    24 · 40 · 72 · 100
Inventory   40 · 100
Sales       40 · 100
```

Nothing clipped at 320 on any of the four. 126 tests, full sweep clean at
5 screens x 6 widths x 2 themes, lint still 3 errors and 3 warnings.

### Still open from this audit

3. All-time profit is on screen twice: the summary card's meta and the ring's
   centre.
4. `summaryNote` is **13px**, off a scale of 11/12/14/16/20/26/36.
5. Chart cards pad **8px** horizontally where every other card pads 16, which
   is also asymmetric against their own 16px top.
6. Nine near-identical rows with identical gaps and surfaces. Still the
   interesting one, and still a question about what the page is FOR.

---

## Session log: 17 September 2026 (part nine): findings 3, 4 and 5, and the total on top of its own chart

The small half of the Analytics audit, plus one thing the fix for 5 made
visible. Still nothing pushed.

### 3: the same figure twice, and the odd period out

The summary card's meta row read `Revenue | Margin | All time`, and the ring
lower down carries all-time profit in its hole, which is the entire argument
for a ring over a pie on this screen.

Duplication was the audit's complaint and it is the weaker of the two. **The
stronger one is that "All time" was the only chip on that row naming a
different period from the heading directly above it.** A meta line under a
figure qualifies THAT figure; two of the three chips were September and the
third was everything, with one word carrying the distinction. The business
hero's meta row has been exactly `Revenue | Margin` all along, so removing it
made the two agree as well.

All-time profit is still on the screen twice over: the ring's hole when there
is more than one business, and the ranked rows always, which are all-time by
definition.

### 4: 13px was never a step

`summaryNote` was 13 against a scale of 11/12/14/16/20/26/36. It is the line
under the display figure that qualifies it, which is the definition of the 12px
meta step. It is used on Home as well, so both moved.

The type census on Analytics is now 11, 12, 14, 16, 20, plus the 36 display
figure and the 0.5em unit each display figure demotes, which is derived from
its own size rather than a step.

### 5: the asymmetry that mattered was the vertical one

The finding said chart cards pad 8 horizontally where every other card pads 16.
Padding all four sides at 16 is the obvious answer and it is wrong, which the
measurement showed before it shipped:

```
320   16/8/8   7 of 8 week labels     16 all round   6 of 8
360   16/8/8   8                      16 all round   8
390   16/8/8   8                      16 all round   8
```

**At 320 those sixteen pixels are worth one more week label.** Recharts hides
ticks that would collide, so the cost of the tidier number is information, on
the narrowest phone, on the only chart in the app that answers "is this
growing". The design system's own rule allows asymmetry where content demands
it; this is that case, and now it is a decision with a number behind it rather
than a value nobody picked.

What was genuinely undecided was **16 above the plot and 8 below it**, so the
chart sat high in a surface that looked symmetric. It is `16px 8px` now.

The two card heights went up by 8 to match, 200 to 208 and 210 to 218, so the
plot area is exactly what it was. A padding fix that quietly shrinks both
charts is not a padding fix.

### The thing the screenshot showed that no measurement had asked about

With the ring 8px smaller for one build, its centre total was clearly sitting
on the coloured band. Measuring it showed that had **always** been true:

```
before   hole 115   value 124   9px over
```

The app already had the answer, from the typography session: `DisplayAmount`
demotes the currency unit to 0.5em at 50% opacity, because "at 36px FCFA is
four letters as wide as half the number, competing with the thing someone
opened the app to read". That argument is stronger at 20px inside a 115px
hole, not weaker. `fmtParts` sits beside `fmt` so both resolve the currency the
same way.

```
after    hole 115   value 101   14px clear, identical at 320/360/390/700/1280
```

**14px is about one more digit.** Past roughly a million the figure will touch
the band again, and the answer then is the ring's `innerRadius`, not a smaller
type step. Worth knowing before a real user's books make it happen.

### Verified

126 tests. Analytics on 24 / 40 / 72 / 100, section gaps 28 and within-group
12, nothing clipped at 320. Full sweep clean at 5 screens x 6 widths in BOTH
themes, 60 combinations. Lint still 3 errors and 3 warnings.

### Still open from this audit

6. Nine near-identical rows with identical gaps and surfaces. Not a spacing
   fix: it is the question of what this page is FOR, which is the same question
   as the pinned note about what an analytics screen shows someone two weeks
   into using the app. Worth a conversation before any code.

---

## Session log: 17 September 2026 (part ten): the page says one thing

Audit finding 6, the last one, and the only one that was not a measurement. The
owner chose "lead with one finding" from four directions. Still nothing pushed.

### What the finding actually was

Eleven cards, nine of them near-identical rows 12px apart, all
`r16 pad14/16 shadow`, all name + sub-line + figure, together 47% of a page
that runs a little over two screens. The surfaces census was two entries for
eleven cards.

**So the page was internally consistent, and that was the problem.** Four
passes of tidying had made everything agree and left nothing leading.

The cause is not spacing. Every row earns its place and none is redundant; they
look alike because they all do the same thing, which is **rank something and
stop**. The whole page was descriptive. It said how much, which shop, which
product, and nothing it said could be acted on, which is also why it had no
focal point to give: ranking has no climax.

That is the same gap as the pinned note about a new user, from the other end. A
screen that ranks needs history to be interesting. A screen that tells you one
thing does not.

### One finding, and it is not a card

`portfolioFinding` in `domain/stats.js` returns a finding; `AnalyticsLead` in
App.jsx turns it into a sentence. The split is the point: the arithmetic is
testable and the English is not, and copy in the domain layer means a sentence
nobody can reword without breaking a test. `bizNote` is the per-business
version of the same idea and returns copy, which is why it lives in App.jsx and
this does not.

It is drawn on the page ground: no background, no border, no radius. **On a
screen of eleven cards, the one thing that is not a card is what the eye finds
first**, and the answer to nine identical surfaces is not a tenth.

It is deliberately not tappable. It names the shop and the product, so the
owner knows where to go, and a control that does not look like one is the
`Disclosure` mistake this file already records.

### The ladder, ordered by what costs money soonest

```
1  oversold      the books already disagree with the shelf
2  losing        a business has cost more than it has brought in
3  runningOut    a top earner is about to stop earning
4  thinMargin    volume on something that keeps almost nothing
5  concentrated  most of the income rests on one shop
6  steady        none of the above, and saying so is worth a line
```

Only 5 and 6 need any history, which is the payoff: **a shop two weeks old can
still be told something true.**

Nothing in the ladder compares this month against last, because the summary
card directly above already does, and a page printing one fact twice invites
the reader to look for the difference. There is a test that asserts exactly
that, by checking no kind name mentions a month.

### The tests found two rules wrong, which is what they were for

A ladder's bug is never the top rung. It is a rung firing when a more urgent
one should have, and the result still looks plausible, so every test sets up a
book where SEVERAL rules are true and asserts which wins. Two of them failed
first time and both were the rule, not the test:

- **"one of your best earners is running low" led with a trinket.** Top three
  by profit is meaningless in a book with one real earner and four small
  things, because the small things are in the top three. An earner now also has
  to be worth at least a tenth of total item profit, which scales with the
  books rather than with how many products happen to exist.
- **a thin margin on one unit sold led the whole screen.** That is a price
  someone tried once. Three units, both for the bestseller case and the plain
  thinnest-margin one. The card this replaced had no such floor, and did not
  need one: it sat at the BOTTOM of the page, where being occasionally trivial
  cost nothing. As the lead it would be the headline.

### It absorbed a card rather than adding one

The "Thinnest margin" card at the foot of the page was already a single
computed finding presented on its own. It is rung 4 now. So the page gained a
lead and lost a card, which is the direction finding 6 asked for.

### Verified

138 tests, up from 126. Four rungs rendered from real books in a browser rather
than argued: oversold in the danger tone, runningOut in the warning tone,
concentrated muted, and the all-clear. Eyebrow contrast computed on the page
ground rather than assumed, since a semantic colour used as TEXT is a trap this
file records: worst case **5.13:1** (danger, light), best 9.76 (warning, dark),
so `--danger` and `--warning` are already the text-safe values and no new token
was needed.

Rhythm re-measured: summary, 28, lead, 28, first section head. Nothing clipped
at 320. Full sweep clean at 5 screens x 6 widths in both themes. Lint back to
3 errors and 3 warnings after the tripwire caught a dead initialiser of mine.

### What this leaves

The audit is closed, all six findings. The **pinned** question is still open and
is now half-answered by accident: whatever the weekly chart should show someone
with two weeks of history, that person at least gets a true sentence at the top
of the screen now. The chart guard itself is unchanged.

---

## Session log: 17 September 2026 (part eleven): the numbers a real business needed

The owner sent a quarterly review one of the two real users had produced by
exporting BizTrack and handing the export to an AI. It is the best product
document this project has: six sections, four of them about products, none of
them about which business, because he runs one. Still nothing pushed.

### What it said about the product

The app is built around a PORTFOLIO. Home is a list of businesses, Analytics
leads with profit by business, the ring is hidden below two of them. Both real
users have one business. For them, half of Analytics is a screen saying one
thing about one row.

The owner's answer, and it is better than the one this session first argued
for: **Analytics stays a general overview and each business gets its own deep
page, reached by tapping it.** A filter across one shared screen was the wrong
idea, and the reason is arithmetic rather than taste. Product analysis across
businesses is mostly meaningless: ranking a shawl against a phone screen
replacement produces a list nobody can act on, since stock and price cannot
move between them, and with two currencies the comparison is simply wrong.
**A business is the boundary where stock, cost and price are comparable**, so
it is the right container for depth.

With ONE business there is no drill-down at all. The Analytics tab is that
business's deep page. An overview that shows a total and then asks you to tap
your only business to see the same total is a tollbooth on every visit.

### Four numbers the app could not produce

His report is built on things that do not exist anywhere in this codebase:

- **Sell-through**, the share of everything ever held that has moved.
- **How long the stock lasts at the current pace.** He had 463 of one product
  against 37 sold in a quarter, and 490 of another against 35.
- **Sales count as distinct from units.** One product was 42 units across 41
  sales, another 10 units across 5. A counter people walk up to, and bulk
  orders. The row carried only units, so it could not tell them apart.
- **Calendar months.** The app has eight weeks and nothing else, and every
  review of a real business is written on a monthly axis.

This app has always warned about too LITTLE stock and said nothing at all about
too much, which is the wrong half for a trader. Capital dead on a shelf is what
takes a business down, and low-stock alerts point the other way.

### Sell-through is true and does nothing; months of cover is the one that works

Both are in `inventoryHealth` because they are different questions, and the
difference is worth stating: "7% sell-through" is accurate and changes nobody's
mind, while "forty-two months of stock at this pace" is a decision.

The pace is measured over the **business's** trading window, first sale to
today, not over the days a given product happened to sell on. Measuring it the
other way flatters anything that only started moving recently, which is exactly
the product an overstock check exists to catch. A test asserts this, and it
failed first time: the fixture had put every sale in the last six weeks, so the
denominator was 1.5 months instead of a quarter and the cover came out at 18
months instead of 43. The fixture was wrong, not the function, but the failure
is the useful kind.

`monthsOfCover` is **null** when nothing has sold, rather than Infinity. A
screen printing "Infinity months of stock" is a bug report.

### Then it was run against his actual books

Reconstructed from his own report and pushed through the new code:

```
HIS REPORT   117 sales · 9,227,000 revenue · 6,750,250 profit · 73% margin
OURS         117 sales · 9,227,020 revenue · 6,750,270 profit · 73% margin
```

Sell-through matched line for line: 7%, 7%, 42%, 50%, 5%. The twenty francs are
rounding in the reconstruction, not in the arithmetic.

And it produced the number nobody had:

```
CAPITAL ON THE SHELF   12,849,500 FCFA
```

Against a quarter that earned 9.2M. That single figure is the finding of his
entire review, and the app had no way to say it.

### Running it is what caught the bug, which is the whole argument for running it

The first version flagged an item whose cost was **zero**. His books passed a
product with 490 units on the shelf valued at 24,500 FCFA in total, because the
unit cost had been typed as **50** against a selling price over 110,000. Not
zero, so the zero check let it through, the capital figure was understated by
millions, and that product's margin reads 100% in every list it appears in.

`costSuspect` is now stock on hand AND cost under 2% of the selling price.
`qty > 0` is what keeps services and digital goods out of it: a genuinely
costless line has no shelf to sit on.

**A unit test built from imagined numbers would never have found this.** The
test that exists now was written backwards from the real case.

### Still to build

The domain layer is done and tested; nothing renders yet. What follows, in
order: the deep page and its period control and the two doors into it, trimming
the business Overview tab so it is genuinely quick, then the stock-cycle marker,
then the AI narrative, which cannot start until the privacy policy is rewritten
because it currently promises records are not sent to third parties.

151 tests, lint still 3 errors and 3 warnings.

---

## Session log: 17 September 2026 (part twelve): the deep page

The UI for part eleven's numbers. One page per business, reached two ways, and
with one business it IS the Analytics tab. Still nothing pushed.

### Where it lives, and the rule that makes it work

```
several businesses   Analytics overview -> tap a row -> that business's page
                     or: the business -> Overview tab -> "Deep analysis"
one business         the Analytics TAB is that page. No drill-down at all.
```

The single-business rule is not a shortcut, it is the whole point. With one
business the portfolio level and the business level are the same numbers: one
row, and a ring that is 100% of itself. An overview that shows a total and then
asks the owner to tap their only business to see the same total again is a
tollbooth on every visit, and **both real users are in that case.**

`BizAnalysisScreen` takes an optional `biz`, `onBack` and `title`, so the same
component is a sub-screen of whatever opened it and a root destination on the
Analytics tab. `analysisFrom` is a plain state value set by the ACTION that
opened it, not a ref read during render: that distinction is on record here
because the nav marker was once given a remembered position the impure way and
the lint tripwire caught it.

The nav marker parks on Analytics for this screen, which is where it belongs
whichever door was used.

### The Overview tab stays quick, deliberately

It is what you land on, and it answers "how is this going" in one screen. The
deep page is a button away, and **that is what lets the deep page be long.**
Nobody arrives there by accident, so 2,600px of scroll is a choice the reader
made rather than a wall they were dropped in front of.

### The period

Four presets: last 3 months, this month, last month, all time. A date picker on
a phone is four taps to answer a question asked in one, and every interesting
boundary here is a calendar month anyway.

**The default is three months, not this month.** This page's subject is pace,
trend and whether stock is moving, and none of those mean anything over eleven
days. Home is where "this month" lives.

`Select` already existed and is the app's control for this, so nothing new was
built.

### The chart: stacked, not grouped

A printed report puts revenue and profit side by side. Tried, and wrong on a
phone: six months side by side is twelve bars across 310px, and the pale one
hid the other entirely.

Stacked as **profit + cost**, the bar's full height is revenue, the solid part
is what was kept, and the gap between them IS the margin, readable without
anyone computing a percentage. Revenue is never its own series, so it cannot
double count.

### Three things the screenshots caught that the DOM did not

**1. The bars floated in mid-air.** The profit segment was drawn at the right
height in the right colour, confirmed by reading the rendered paths, and was
invisible in the photograph. The cause was the harness: `captureBeyondViewport`
resizes the viewport, which re-triggers Recharts' mount animation, and the
profit bar was photographed at zero height while the cost bar, which has
animation off, drew immediately. **Scroll and shoot the viewport instead.**

**2. The status pills wrapped.** "Not selling" broke over two lines inside its
own lozenge, drawing a tall blob beside a name that had then also wrapped.
`whiteSpace: nowrap` and `flexShrink: 0`, which every pill in this app should
have had.

**3. One row contradicted itself.** A product showed "0 sold" beside "1 sold
since you restocked 1", because that restock was three months before the report
period: two windows on one row with nothing saying so. The batch line now
carries its date and only appears when the restock falls INSIDE the period.

Two smaller ones from the 320 check: a product with nothing left showed
"FCFA 0 on the shelf", a line of noise on every sold-out row, so the value
column is empty when the shelf is; and the Y axis said "3600k" where "3.6M"
both fits and reads better.

### The lead was wrong for the business it was built for

The finding ladder from part ten said **"Nothing needs doing"** to a shop with
463 of one product and 490 of another, decades of stock at the pace they sell,
and one product whose cost is a typo. It was right by its own rules and useless,
because it was written before the app could see a shelf at all.

Two rungs added, and the first one goes above everything:

```
1  untrusted  a cost is missing, so the profit figures are not real
5  parked     capital standing still on a shelf that is not moving
```

`untrusted` is first because it is the only rung that invalidates the others. If
a cost was never entered the margin reads 100%, every profit total is
overstated, and a finding computed from those numbers is advice built on a typo.
On his books the lead now reads: *"Canopy at JUDEXCAM has 490 in stock and no
real cost recorded, so its margin reads as pure profit and every total it is
part of is too high"* -- sitting directly under a profit figure it is telling
you not to trust. That is the right thing for this screen to say first.

`parked` only fires when what is standing still is large against what the shop
actually earns. Holding three months of stock is how a shop works; holding four
years of it is the finding.

### A test failure that was the ladder being right

`parked` immediately outranked `thinMargin` in an existing test, and the fixture
was at fault rather than the rule: it held 497 units of a product against 9,000
of total revenue, so 49,700 of dead stock genuinely IS the bigger fact. The
fixture now isolates the rung it is testing. **A ladder's tests have to hold
every other rung still**, or they test the ladder's order instead of the rule.

### One careless edit, caught by grepping rather than by luck

A blanket string replace for `activeBiz.currency` inside this component also hit
two lines in `BusinessScreen`, which had nothing to do with it. Reverted. The
tell was a `subject.` reference appearing in a component that has no `subject`;
the check is grepping for the new name afterwards and reading every hit, not
trusting that the old string was unique.

### Verified

154 tests. Driven in a browser on **JUDEXCAM's reconstructed books**, not the
seed: one business opens straight onto the deep page with no drill-down, four
businesses give four tappable rows, Back returns to whichever door was used, and
the period control changes the heading and the figures. Capital on the shelf
reads **FCFA 12,849,500** with the warning that one product's cost is not real.
Nothing clipped at 320. Lint still 3 errors and 3 warnings.

### Still to build

The stock-cycle marker, then the AI narrative. The marker is the one that
matters next: the other real user resets the whole app when new stock arrives,
and the working theory is that she is reaching for a clean slate the product
does not otherwise offer. The AI cannot start until the privacy policy is
rewritten, because it still promises records are not sent to third parties.

---

## PARKED: the AI deep analysis, and the tier it belongs to

Scoped, costed and deliberately not built. The owner's call on 17 September:
ship first. This section exists so none of it has to be worked out twice.

### The feature

An in-app narrative on the deep analysis page: what happened over the period,
and what to do about it. One of the two real users already does this by hand,
exporting and pasting into an AI, which is the strongest signal in this project.
The app would close that loop.

**"Copy this business for analysis" stays either way**, and while the AI is
parked it is the only version there is. When the AI does land it becomes a
FALLBACK rather than a peer, for three reasons that do not go away:

- **Offline.** The AI needs signal and this audience often has none. That is the
  app's founding constraint, not an edge case.
- **Read-only mode.** This file's own rule is never to gate data behind payment.
  A copy is an export; an AI call is a paid service.
- It is what works when consent has not been given.

The shape when it ships: **one button that does the best thing available and
says which it did**, the same contract as the feedback box. Online and
consented, a narrative. Otherwise, the summary on the clipboard and a line
saying why.

### Model: `claude-opus-5`

Not "best is best". He already gets a seven-page report by pasting the export
into Claude, so **an in-app version that is visibly worse has no reason to
exist**. And the judgement in this task is real: noticing that a 100% margin is
a typo rather than a triumph, that 463 espresso machines is four years of stock,
that the highest-frequency product is a traffic driver rather than a profit
centre.

If cost needs to come down, **lower `effort` before lowering the model.** Lower
effort on the newest model generally beats high effort on a smaller one, and it
keeps one model, one prompt and one thing to tune.

### What it costs, measured rather than guessed

`scratchpad/payload.mjs` and `scale.mjs` build real books and size the actual
payload. The summary aggregates per PRODUCT, and that turns out to be the whole
story:

```
products  sales    payload tok   Opus5   Sonnet5   Haiku   (XAF per analysis)
       8    120            499    33.6      13.4     6.7
       8   1600            518    33.7      13.5     6.7
       8   8000            531    33.7      13.5     6.7
      30   1500           1117    35.5      14.2     7.1
      80   2400           2492    39.6      15.8     7.9
     200   3000           5817    49.6      19.8     9.9
     500   5000          14151    74.6      29.8    14.9
```

**A high-volume shop costs nothing extra.** Eight products with 120 sales and
eight products with 8,000 sales are the same price, because ten thousand sales
collapse into the same eight lines. Only CATALOGUE size moves it, and slowly:
62x the products is 2.2x the cost. Output is a flat ~30 XAF whatever the shop
looks like, and input only overtakes it past roughly 400 products.

Prices are Anthropic first-party, mid-2026, at roughly 600 XAF to the dollar.
Both move; re-measure before pricing anything on them.

### The tier and the cap

For a 5,000 XAF tier, per month:

```
cap    typical shop        500-product shop
 5     ~170 XAF (3.4%)     ~375 XAF (7.5%)
10     ~340 XAF (6.8%)     ~750 XAF (15%)
20     ~680 XAF (13.6%)    ~1,500 XAF (30%)
```

**Start at 5, and not for cost reasons.** Running a deep analysis twice in a
week on the same books returns the same answer, because the books have not
moved. Five a month is already more than the feature can usefully produce.
Raising a limit later is easy; lowering one is a broken promise.

Billing needs nothing built: the API charges per token per call, so a month
where nobody taps the button costs nothing. **What needs building is the cap**,
and it has to live in the Edge Function. A client-side counter is a number in
`localStorage` in an offline-first app, resettable by anyone, and "Erase this
phone" clears it.

**Free, and it removes most of the waste:** store each analysis with a
fingerprint of the books and return the stored one when nothing has been
recorded since. Instant, works offline, costs nothing, and turns the cap into
something almost nobody reaches.

### Three prerequisites, none of them this feature

1. **The privacy policy still says records are not sent to third parties.** That
   has to be rewritten and consent re-collected BEFORE any call leaves the
   device. This file records two shipped claims that the architecture made
   untrue; this would be the third and the worst, because it is business data
   crossing a border.
2. **The app has no plan state.** `PRO LOCAL` was a hardcoded string with no
   plan anywhere in the store, which is why it was removed. A tier gate needs
   something to gate on.
3. **There is only one tier today**, 3,500/month or 30,000/year. A second tier
   is a pricing decision that changes the ~130-user arithmetic behind the
   December target.

### Two design notes for whoever builds it

- **Do not render the model's markdown.** Ask for structured fields (a headline,
  three to five findings, each a title and a body) and render them in the app's
  own type scale. A markdown blob would look foreign on every screen.
- **Prompt caching will not help here**, and that is worth knowing rather than
  adding it out of habit: calls are sparse and the cache TTL is five minutes, so
  the write is paid for and the read never happens.

---

## Session log: 17 September 2026 (part thirteen): retouching before a ship

The AI and the tier are parked (see PARKED above). This is a tidy-up pass over
what the last week added, found by running checks rather than by looking. Still
nothing pushed.

### Four dead style entries, and why they are not just untidiness

`barBg`, `barFill`, `colorRow`, `emojiGrid`: 4 of 163, all residue from changes
this file already records. The two bars were the per-row share bar the ring
replaced; the two grids were the full colour and emoji walls `QuickPick`
replaced.

They matter beyond tidiness because **every design audit in this project is
measured against a census** of the type sizes, radii and surfaces in `S`. A dead
entry is a value in that census that nothing on screen can show, and this file
already records a case where five dead entries held the app's only weight-300
and its only 10px, so the type census read worse than the app actually was.

### The tour was still teaching a portfolio tracker

The three-step guide a new user sees on their very first screen read:

```
"Here is your total profit across all businesses."
"Tap here to add a new business to your portfolio."
"See your growth trends and profit ranking here."
```

Both real users have ONE business. "Across all businesses" is a total of one,
"your portfolio" is the framing the app spent two days moving away from, and
**"profit ranking" points at a screen that, for them, no longer contains a
ranking at all** since the Analytics tab became the deep page.

So the first thing the app said to a new user was a description of a different
product. It now says what is true with one shop or five, and names what the
Analytics tab actually holds: what sells, what earns, what is stuck on the
shelf.

This is the same lesson this file keeps recording from a new direction: copy
that describes the product has to move when the product does. Three times it was
a claim that had become false, once a claim that had become too narrow, and this
time a claim that had become about a different app.

### Four floating shadows, three recipes, two in raw black

```
Sale button     0 3px 14px  rgba(44,24,16,0.16)   the app's ink, measured
install card    0 8px 30px  rgba(44,24,16,0.15)   the app's ink
toast           0 10px 25px rgba(0,0,0,0.30)      RAW BLACK
tour tooltip    0 10px 30px rgba(0,0,0,0.25)      RAW BLACK
```

Three of those four are the same job, a surface floating over the page, and
they had three different recipes. Nobody chose that; each was written where it
was needed.

**A raw black shadow is the one thing that cannot follow a theme**, which is the
`--focus-*` lesson in another costume: a value picked against one background,
used on something with a different one.

Two tokens now, because there are two jobs and the rest of the app uses the
hairline `0 0 0 1px` that section C settled on:

```
--shadow-raised   a control lifted off the page   the Sale button
--shadow-float    a surface over the page         install card, toast, tooltip
```

Both are redefined in the dark block, and that is the point rather than a
detail: **a shadow is a darkening, and there is almost nothing left to darken on
a near-black page.** The dark values are lifted so a floating surface separates
at all, and the real separation there still comes from the border and the
surface step. Verified by reading the COMPUTED value in both themes rather than
the source, because a `var()` that resolves to nothing removes the shadow
silently and no test notices: light `rgba(44,24,16,0.16)`, dark
`rgba(0,0,0,0.45)`. The Sale button's shadow now follows the theme, where before
it was the same ink value on both.

### Verified

154 tests, sweep clean at 5 screens x 6 widths in both themes, lint still
3 errors and 3 warnings.

### What still stands between this and a ship, and none of it is code

1. `20260916000100_product_photos.sql`
2. `20260916000200_sale_groups.sql`
3. `20260917000100_invoices.sql`
4. `20260917000200_feedback.sql`
5. `20260917000300_feedback_to_inbox.sql`
6. Redeploy `delete-account` AND `notify`
7. `supabase/rls-check.sql` after 3

And the one product decision left open: **the other real user resets the whole
app when new stock arrives.** The stock-cycle marker was next on the build list
and is not built. Until it is, the working theory stands unanswered and she is
still destroying her own history to get a clean slate the product does not
otherwise offer. Worth asking her what she actually does before building
anything, which costs one message.

---

## Session log: 18 September 2026: the four-layer audit

The largest audit this project has run: **UI/UX, security, legal, and user
psychology**, each with its own skill, then every layer fixed in order. Still
nothing pushed.

**The findings and the fixes are in `AUDIT.md`, not here.** That file is ~1,300
lines and this one is already long enough to cost context every session. What
follows is what a future session needs to know without opening it.

### What each layer cost

| layer | what it found | what changed |
|---|---|---|
| 1. UI/UX | the inventory row carried EIGHT things, three of them coloured, with a full-danger delete on every row | the row is five things, green is gone, delete moved into the restock sheet; rhythm put on one owner per break; the fifth alignment column removed |
| 2. security | `notify` phase 3 sent **one email per feedback row**, and the table accepts `anon` inserts forever | one digest per run, so flooding the table can no longer flood the inbox or the sending reputation; `safeEqual`/`callerIsCron` given one definition; free text stripped before PostHog |
| 3. legal | product photos and crash messages were collected and **never disclosed**; one absolute in the policy was false | a new policy section, the absolute made TRUE rather than softened, the per-person identifier disclosed, `LEGAL_VERSION` to `2026-09-18` |
| 4. psychology | the graveyard inventory list, a low-stock banner that demanded recall, and a screen that silently changes shape | a shut sold-out group, four named rows with pictures and counts, one line of copy |

### The one thing not fixed, and why

**The stock-cycle marker.** One of the two real users wipes the whole app when
new stock arrives. The audit's theory is that her mental model is a CYCLE and
the app's is a PERPETUAL LEDGER, and it fits every piece of evidence: the
batch shape of her restocks, the graveyard list, and the fact that the wipe
produces exactly the state she wants.

It has never been checked with her. If the theory is right the fix is small and
already scoped; if it is wrong, building it is building on a guess. **Ask her
to walk through what she does when new stock arrives, and why** -- not "do you
reset the app", which invites a yes.

The sold-out group was built anyway, because it needed no theory: the list
filtered `deletedAt` and nothing else, which is a verified defect for anybody.
If she is reaching for a clean slate, that group IS one, without destroying
anything. If she is not, nothing was wasted.

### Three lessons, all of them the old one wearing new clothes

- **A check that reports clean for the WRONG REASON is worse than no check.**
  The secret scan looked for JWTs. Supabase keys are `sb_publishable_`, so it
  would have passed a bundle with the key printed twice. Re-run against the
  actual key material.
- **A step that silently matched nothing is indistinguishable from one that
  worked.** A policy regex matched 5 of 35 policies and the conclusion drawn
  from it happened to be right, which is worse than being wrong. Re-parsed
  properly: 61 policies, none defaulting to PUBLIC, one anon-reachable by
  design, none missing `with check`. Same shape twice more in the harness: a
  probe clicked a section title instead of a profile row, and the gate clicks
  were never reported, so a slow load after a rebuild looked exactly like a
  screen with nothing on it.
- **The display that demanded recall was also the display that hid a wrong
  number.** Home's low-stock banner printed names and nothing else. Adding the
  quantity turned "Low Stock on 11 items" into six, because two of the three
  low-stock rules in this app excluded an empty shelf and that one did not.

### One finding was WRONG, and the revert is the point again

"The Sale button covers the list." Measured: the last row clears by **69px** on
Home and by exactly **12px** on Inventory, which is this app's own documented
rung, and `.bt-has-fab` already pads 148. The style added to fix it was
reverted. That is the fourth time this file has recorded a confident finding
that measurement killed.

### Verified

154 tests, lint still 3 errors and 3 warnings, full sweep clean at 5 screens x
6 widths in BOTH themes, nothing clipped at 320. Layer 4 driven in a browser on
books seeded with a sold-out item, an OVERSOLD item and a never-stocked item:
the oversold row stays in the main list with its badge, the never-stocked row
stays, and only finished products go in the group.

`vite` went 8.0.10 to 8.3.0 from `npm audit fix`, accepted only after the
build, the tests, the lint and a full sweep in both themes.

### What still stands between this and a ship, and none of it is code

The five migrations and the two redeploys listed at the end of 17 September,
`rls-check.sql` after the schema change, **the lawyer**, and one message to the
user who resets her app.

---

## Session log: 18 September 2026 (part two): retouching before a ship

The owner's pass over the audit's output, and the first time anyone had LOOKED
at the Analytics page end to end rather than measured one part of it. Still
nothing pushed.

The page lost a third of its height and two of its sections. What follows is
what the screenshots showed that the measurements had not asked about.

### One door to analysis

The business Overview carried a "Deep analysis" button. It led to a page that
is one tap away from the bar at the bottom of every screen, so it was not a
shortcut, it was a second door. Gone. **Analysis lives on the Analytics tab and
the business rows there are the way in.**

### A colour is unique now, because it is the only legend

Colours already taken are no longer OFFERED in the picker. The form already
defaulted to the next free one, which made two shops distinct by accident and
did nothing about someone opening the picker and choosing a colour in use.

The reason this matters more than it looks: **on Analytics the colour IS the
legend.** There is no other one, by design, because the ring's key is the rank
disc and the colours are learned on Home. Two shops sharing a colour makes that
chart unreadable with nothing on the page to resolve it against.

Verified in the browser against four seeded shops: **zero of the four in-use
colours offered**, five free ones on the row and a `+7` button, which is
exactly the twelve that are left.

### "Everything is off centre" was two different things

Measured rather than guessed, and they had different causes.

**The weekly chart was lopsided**, and the cause was the eight-week window. A
shop with two trading weeks got six empty buckets on the left and both bars
crammed into the right third: a chart that reads as broken rather than as a
short history. Leading empty weeks are now dropped and interior ones kept, so
the axis grows with the books. `maxBarSize` came with it, because two bars
sharing 280px are 100px slabs.

That is **half of the question pinned since 15 September**, answered from the
side that needed no new decision.

**The total was crowding its own ring.** Measured: 101.2px of figure inside a
109.2px hole, **four pixels clear on each side**. `innerRadius` went 62 to 70,
giving a 133px hole and 15.9px clear.

**That was not the fault, and the owner said so on sight.** See part three
below: the clearance was real and fixing it left the thing still looking wrong,
because the fault was the INK, not the box, and nothing had measured the ink.

### Two sections went, and one of them the file had already argued against

**"What earns the most" ranked products across businesses.** This project's own
rule says a business is the boundary where stock, cost and price are comparable,
and that ranking a shawl against a phone screen replacement produces an order
nobody can act on. That rule is the whole argument for the deep page existing;
the list contradicted it for five rows and about a third of the screen.

**"Copy a summary for analysis" went with it.** There were two copy buttons and
only the portfolio one was removed. The per-business "Copy this business for
analysis" stays, and that is the one the PARKED AI section depends on, so
nothing in that plan was lost. Worth knowing why the CSV is not a replacement
for either: it is a row per sale, which spends the reader's attention on
transcription rather than on the question.

Analytics is **1,379px** now, down from 2,044.

### The lead was a paragraph where a headline should be

Every finding body is one or two short sentences, about 95 characters, which is
**three** lines at 390px. It is 16/500 on the page ground and the focal point of
the screen; at five lines it was the largest single block there.

The first version of that rule said "two lines", asserted from a character
count rather than from the page. Measured, the block wraps at about 30
characters a line, so two lines is 65 and no finding naming a product, a shop
and a number fits it. **The rule is three, and the claim in this file was
corrected to what the rendered block actually does.**

Copy only, so no test moved: the arithmetic is in `domain/stats.js` and the
English is in App.jsx, which is exactly why that split exists.

### Four controls for one job

The item photo sheet had a big Change, a big Remove, a "Photo" label above a
sheet already titled with the product's name, and a big Done for a change that
had already been written. **The picture is the control now**: one large tappable
image, and Remove as a quiet text button when there is something to remove.
Verified in the browser: one control on the sheet, down from four.

Done went for the reason three other sheets lost theirs: the change is saved
the moment it is made, so it only ever meant "close", which is the drag on a
phone and the X on a desktop.

`PhotoField` keeps its old shape for the FORM through a `solo` flag. There it is
one field among five and must not lead the screen.

### The harness bit twice, both times in ways already written down

A probe's regex escapes were mangled by the shell heredoc (`\+` arriving as
`+`), which this file records the fix for: write the probe to its own `.js`
file and read it in. And a fixed 3.4s wait after a rebuild left an entire run
reporting empty screens, because the first load had to fetch every asset again.
It polls for `.bt-app` now and **reports every gate click**, since a step that
silently matched nothing is indistinguishable from one that worked.

### Verified

154 tests, lint still 3 errors and 3 warnings, full sweep clean at 5 screens x
6 widths in both themes, nothing clipped at 320.

---

## Session log: 18 September 2026 (part three): the ring goes

The owner looked at the widened ring and said the money in the middle still
made it "very unsymmetrical", and asked to try a graph instead. Still nothing
pushed.

### Measuring the boxes had answered the wrong question

Part two measured the ring's centre block and found it perfect: label dx 0,
value dx 0, block dx 0 and dy 0. Every box centred. The clearance fix was real
and the thing still looked wrong, which is the tell that the measurement was of
the wrong property.

Measuring the INK settled it in one run:

```
ring centre x        195.0
label box     centre 195.0   dx    0
value box     centre 195.0   dx    0
   demoted unit  144.4..171.8   27.4px wide, 10px, opacity 0.5
   DIGITS        171.8..245.6   centre 208.7   dx +13.7
```

**The digits sat 13.7px right of the centre of a circle.** This app demotes a
currency unit to 0.5em at 50% opacity, which is right everywhere else and is
exactly wrong here: "FCFA" holds 27.4px of width and almost no ink, so the box
is centred and the thing a person actually reads is not. The label above it was
centred on the box too, so the two lines did not even share an axis.

A circle is the least forgiving shape for that. It is radially symmetric, so
an off-axis block is visible against every part of the band at once.

**The general form, and it is new to this file: centring a BOX is not centring
what is in it.** Any line whose weight is unevenly distributed, which a demoted
currency unit guarantees, needs its ink measured, not its bounds.

### What replaced it

One stacked proportional bar, full width, on the page ground. The total moved
to a left-aligned line beside the heading.

- **A bar has no centre to miss.** Anchored left and right by construction, so
  the failure mode does not exist rather than being corrected.
- **It answers the question better.** Share is part-to-whole, and the thing an
  owner wants from it is how much rests on one shop, which is a length against
  a length rather than an arc against an arc.
- **No legend, and this time that is really true.** The rows directly beneath
  carry the same colours on their rank discs and the exact figures besides.
  That was always the answer to the ring's legend problem; the ring just needed
  a bigger one.
- **16px instead of a 232px card**, and no chart library: a proportional
  stacked bar is flexbox. Analytics is **1,149px** now, down from 2,044 at the
  start of the day.

`flex-grow` on the raw value rather than percentage widths, because four
roundings do not add back to the whole. Measured: 120 / 114 / 85 / 18 across
342px against shares of 35.6 / 33.8 / 25.2 / 5.3, exact.

### The animation, and a library default nobody had chosen

The bar grows from nothing on mount: **one transform on the whole strip**, not
a width per segment, because per-segment growth arrives at four different times
and that is the staggered-list effect this project has already refused once.
Verified in the running app: `transition-property: transform`, `0.4s`,
`cubic-bezier(0.22, 1, 0.36, 1)`. That is `--motion-value` and `--ease-out`, and
the global reduced-motion block collapses it without this component knowing.

Checking that turned up something shipping: **the weekly chart was animating at
Recharts' default 1500ms.** Nearly four times the longest duration this project
allows, on a chart read on a mid-range Android, where this file's own rule says
anything past roughly 250ms reads as the phone being slow. Nobody chose it; it
arrived as a library default through a component that never named the prop.
Both series are 400ms now, which also fixes a stacked column growing out from
under a cost segment that had animation switched off and drew at full height
immediately.

### A contrast check that was clean for the wrong reason

`ringColor` was measured against `--card-bg`, and the bar sits on
`--bg-primary`. The first check read `.bt-screen`'s computed background, got
`rgba(0,0,0,0)`, and compared every segment against **black** -- clean numbers,
meaningless. Resolving the token instead:

```
light   worst 5.81 vs the page   (6.16 vs a card)
dark    worst 7.54 vs the page   (6.73 vs a card)
```

Light is the **weaker** ground, not the stronger, which is the opposite of what
was assumed before measuring. Both are far above the 3:1 a non-text graphic
needs, and that light worst case is the documented worst of the sixteen.

### Still on disk

`src/screens/ShareRing.jsx` is unused and kept only while the owner compares
the two. It goes when that is settled; an unused module is exactly the dead
weight this project keeps removing.

---

## Session log: 19 September 2026: the gate the Terms already promised

Preparing for a beta. The owner's decisions: accounts become mandatory, the
beta is capped, and the price is decided later. Still nothing pushed.

### The find that reordered the work

`src/legal/documents.js` has said this since it was written:

> **What happens if you stop paying.** The app becomes read-only. It does not
> lock you out and it does not delete anything.

`evaluatePlan` computed `canWrite`, `useAuth` exposed it as `auth.plan`, and
**nothing in the interface ever read it.** Grep for `canWrite` outside
`src/backend/` returned nothing at all. The trial ended, the emails went out on
schedule, and every write still went through.

That is the fourth time this project has shipped a document disagreeing with the
code, and the first time the document was the STRICTER of the two, so nobody was
short-changed. What it cost was the commercial model: there was no state the app
could put anyone in.

### And the skip made fixing it pointless

`evaluatePlan(null)` returns `canWrite: true` with no expiry. A signed-out user
was therefore an **unlimited free tier**, against a recorded decision that says
in as many words: *30-day trial, then read-only. Not a free tier.*

So read-only could be bypassed by signing out, and building the gate while
"Use BizTrack without an account" existed would have been building a lock
beside an open door. **Removing the skip and enforcing read-only are one piece
of work, not two.**

The owner's own reason was backup, and it is the better-known one: this app's
entire v1.5.3 to v1.5.7 rescue history came from books living on one phone.

**An account is required. The network is not.** Signal is needed once, at the
wall. Everything after is as offline as it ever was, and that sentence is in the
rules above because the obvious misreading turns this into a server-rendered app.

### Six false sentences, and a version bump

The privacy policy described the no-account case in six places: "whether or not
you have an account", "without an account, your records stay on your device and
are not sent anywhere", "for your session if you have no account", and three
more. All rewritten.

`LEGAL_VERSION` is `2026-09-19`. No new CATEGORY of data appears, but a category
that used to be optional is now unavoidable: an email address. Someone could
previously run this app having given us nothing. For a given person that is a
change to what is collected from them, which is the test the rule applies.

It is also the cheapest it will ever be: two real users today against fifty beta
places about to open, and everyone arriving after this accepts the new version
on the way in.

### What the rescue door taught, and the correction that followed

Rescue has three deliberate entry points, chosen because they are the places
Settings cannot be reached, and **onboarding was one of them** -- someone who
has lost their books lands on an empty screen.

The first move was to copy that door onto the wall, on the reasoning that
onboarding now sits behind it. **That was wrong and the owner caught it.**
Onboarding sits immediately AFTER the wall, not behind a door that closed, so
its rescue link never moved: the copy was a FOURTH door, on the one screen
where it makes least sense. Everyone there is signing in or creating an
account, and finding local books gets neither done.

It is removed. The three doors are the crash screen, onboarding and the PIN
lock, exactly as recorded, and verified by reading which component owns each
line rather than by trusting the count.

### The harness could no longer get in

Every probe in `scratchpad/` reached the app by clicking "Use BizTrack without
an account". The choice was to run them against a build with no env vars, which
exercises the misconfigured-deploy fallback that no user takes, or to give the
harness a session.

`scratchpad/fakeSession.mjs` writes a well-formed entry at
`sb-<ref>-auth-token` with a far-future `expires_at`. supabase-js does not
verify the token client-side and only refreshes near expiry, so `getSession()`
returns it with no network call and the app takes the real signed-in route. The
profile fetch still fails, `profile` stays null, and `evaluatePlan(null)` is
writable -- the documented fail-open path, so the harness sits in a state the
app genuinely supports.

### Two harness traps, one new and one already recorded

**`Page.addScriptToEvaluateOnNewDocument` is INERT without `Page.enable`.** The
profile shim reported zero fetches and the probe read that as "the app never
asks for a profile". It was not installed at all. What made it findable was that
`window.__shimHits || 0` and `JSON.stringify(window.__seen || [])` return `0`
and `[]` whether the shim ran or not: **the check could not fail.** Asking
`typeof window.__seen` separated "saw nothing" from "was never there" in one
line.

And the old one: a regex written into a probe through a shell heredoc reported
`(none)` for a banner plainly on screen. Substring tests now, and the probe
files that need patterns live in their own `.js`.

### Verified against the real wiring

Not argued: a fetch shim answers the profile read with a chosen plan, so all
four states run through `evaluatePlan`, `useAuth`, ctx and the guard.

```
beta         active, no expiry     no banner      sale form OPENS
trial_soon   2 days left           countdown      sale form OPENS
trial_ended  trial in the past     read-only      REFUSED, "Message us"
expired      expiry in the past    read-only      REFUSED, "Message us"
```

161 tests, up from 154: `src/backend/plan.test.js` pins the beta state, the
fail-open, and that `daysLeft` rounds UP so a trial with hours left never reads
as zero. Sweep clean at 5 screens x 6 widths in both themes. Lint still 3 errors
and 3 warnings.

### Still to build for the beta

The cohort column, the cap and the waitlist, and the beta status copy. The cap
is the one with a decision in it: with local-only gone, "the beta is full" now
turns someone away completely rather than costing them backup, so the number
matters more than it did. `supabase/beta-preflight.sql` is in the repo for the
domain move, and its first query is the one that must come back clean before
`biz-track-nine.vercel.app` is touched: **an account is not the same as having
synced.**

---

## Session log: 19 September 2026 (part two): the way in, before the way in

Two corrections and one new screen. Still nothing pushed.

### The rescue door on the wall was a fourth door

Part one moved data rescue onto the sign-in wall, reasoning that onboarding had
gone behind it and this project records three deliberate entry points.

**The owner said it did not make sense there, and they were right.** Reading
which component owns each line rather than trusting a count: the crash screen,
**onboarding** (`Onboarding`, still there, still unchanged) and the PIN lock.
Onboarding sits immediately AFTER the wall, so its door never moved. The copy
was a fourth, on the screen where it helps least: everyone there is signing in
or creating an account, and finding local books does neither.

Removed. The invariant is what it always was.

The general shape is one this file keeps recording: **a rule applied without
checking whether its premise still holds.** "Onboarding is behind the wall" was
never true.

### The landing page

`biztrack.store` opened on "Create your account", which asks for commitment
before saying what the thing is. Acquisition here is direct conversations,
which in this market means a link pasted into WhatsApp, and the person who taps
it should learn what BizTrack does.

**It is static markup in `index.html`, not a route**, and the three reasons are
in the rules above: it paints with the HTML rather than after 166KB of app; it
changes no routing, so `start_url`, the service worker scope and per-origin
localStorage are untouched; and the app boots underneath it, so the sign-in
screen is already mounted when anyone taps Get started.

**The pre-paint check is the part that matters and it is easy to miss why.**
`start_url` is `/`, so an installed PWA opens this document. Without a check
running before the first paint, every installed user would open a marketing
page instead of their till. It looks for the ledger key or anything ending
`-auth-token`, and sets one class that one CSS rule reads.

Verified as three separate visitors rather than one:

```
new          no keys              landing SHOWN, app mounted behind it
returning    session + books      landing never rendered
books only   books, no session    landing never rendered  <- the installed app
```

That third row is the one worth the test. An existing user whose PWA opens `/`
with local books and an expired session goes straight to sign-in.

`captureBeyondViewport` is safe here, unlike on the charts: there is no Recharts
mount animation to re-trigger on a page of static HTML.

### What the copy does NOT say

It does not promise a discount. It says fifty places, free while the beta runs,
that every message sent from inside the app is read, and that the price is
announced before it applies, which is exactly what the Terms already commit to.

**A discount promised on the landing page is a discount committed to at signup,
before the cohort is known.** The owner's stated plan is to set the number after
seeing who turns up, and those two cannot both be true. The weaker promise is
the one that can be upgraded later; the stronger one cannot be walked back.

### Verified

161 tests, lint still 3 errors and 3 warnings, sweep clean at 5 screens x 6
widths in both themes, and no horizontal overflow on the landing at 320, 390 or
1280. The sweep is unaffected because `fakeSession` sets a session key, which is
one of the two keys the pre-paint check looks for.

### Still to build for the beta

The cohort column, the cap and the waitlist. The landing already names fifty,
so the number is now a claim on screen: when the cap is built it has to be the
same number, and the "beta is full" state needs somewhere to send people.

---

## Session log: 19 September 2026 (part three): the landing page gets pictures

The owner could not find the landing page, then said it was "way too bland...
no pictures, no visualization, basically nothing", and asked for research
rather than another guess. Still nothing pushed.

### Why it could not be found, and the affordance that was missing

Two causes, both of them the design working:

1. **Nothing is pushed**, so `biztrack.store` still serves the old build.
2. The landing hides itself the instant localStorage holds books or a session,
   which is what stops an installed PWA opening a marketing page. **So the
   owner of this app could never see their own landing page**, on any machine
   they actually use it on.

That second one was a real mistake. Reviewing marketing copy would have meant
clearing site data or opening a private window after every edit, and **a page
nobody can look at is a page that quietly goes stale.** `?landing` forces it
on. Verified on a browser seeded with books AND a session: plain `/` gives
"Good morning, Arrey", `/?landing` gives the landing.

### A control that said one thing and did another

"I already have an account" dismissed the landing and left you on **Create your
account**. Both buttons did the same thing, because dismissing was all they did.

The reason it could not be a prop is worth keeping: the landing is plain markup
outside React, and `AuthScreen` mounts underneath it long before either button
is tapped, so `useState(() => hasSignedInBefore() ? ...)` has already run.
A `bt-auth-mode` CustomEvent is the seam. Verified:

```
Get started                 -> "Create your account"
I already have an account   -> "Welcome back"
```

### What the research actually said

Searched rather than guessed, and the line that decided the work:

> A real screenshot of the dashboard, the editor, or the reporting view does
> more conversion work than any illustration or 3D graphic.

Plus: headline under 8 words or ~44 characters; CTA above the fold; repeat the
CTA two or three times; on mobile, stills rather than video to protect load
time. The existing headline was already 7 words and 40 characters.

### So the pictures are the app

`scratchpad/marketing.mjs` drives the real build on seeded books and captures
**WebP straight out of CDP**, which matters more here than anywhere: this page's
entire argument is that it paints before the 166KB app arrives, and a hero
image heavier than the app would undo it.

```
shot-home.webp        45.4 KB   the whole home screen, the hero
shot-analytics.webp   19.4 KB   the finding, cropped to a MEASURED rect
```

The crop was guessed first and came out with half a summary card at the top and
half a chart at the bottom. Measuring the element and clipping to it fixed it in
one run, which is this project's whole method applied to a screenshot.

`deviceScaleFactor: 1.75` rather than 2: displayed at 260px the extra pixels
are invisible and the file is a third smaller.

**The oversold row is deliberately still in the hero.** It could have been
seeded away, and leaving it means Home flags a problem and the second image
explains what to do about it, told across two pictures from ONE set of books.
Different seeds per image would have put numbers on the page that disagree.

### The page now

Hero with the headline, one sub-line, both buttons and the phone, then what it
does, then the finding, then beta, then trust. Measured at 390: the primary CTA
is fully above the fold at 362 of 820, both images load, nothing overflows at
320, 390 or 1280.

The trust block is the part that is specific to this market rather than to
landing pages in general: **"Built in Buea, Cameroon. Questions go to a person"**
with the WhatsApp number and the address already in `ENTITY`. A stranger's app
asking for your books is a different proposition from a Buea person's app
asking for your books, and no feature bullet buys that.

### Verified

161 tests, lint still 3 errors and 3 warnings, sweep clean at 5 screens x 6
widths in both themes.

Sources for the research above:
https://snapblock.ai/blog/best-saas-landing-page-structures-2026 and
https://framiq.app/blog/best-saas-landing-pages-2026

---

## Session log: 19 September 2026 (part four): the cap, the cohort and the waitlist

The last outstanding build for the beta, and the thing that makes the landing
page's "we are taking 50 people in" a fact rather than a sentence. Still nothing
pushed.

### The database cannot refuse a signup, so the screen has to

`handle_new_user` runs AFTER insert on `auth.users`. By the time it fires the
account exists, and with Google sign-in it exists before any of our code is
involved at all. **A trigger can only stamp what someone gets; it cannot turn
anyone away.**

So the cap lives in three pieces:

```
app_settings      one row, beta_open + beta_limit, flipped from the SQL editor
beta_status()     SECURITY DEFINER, returns {open, full, left} and never rows
AuthScreen        asks on mount, and never offers the signup form when full
handle_new_user   the backstop: stamps cohort + plan for whoever arrives anyway
```

`beta_status()` is a definer function because the honest answer needs a COUNT
over `profiles`, and granting anon a select on that table to get it would mean
handing out the user list in order to answer "are there places left". Its
`search_path` is pinned, like all fourteen of the others.

### The two failure directions are opposite on purpose

- **`beta_status()` fails CLOSED.** No settings row means the migration is half
  applied, and letting an uncapped cohort in is not recoverable in a minute.
- **`fetchBetaStatus` fails OPEN.** A network error must not turn away a real
  person standing in front of the owner.

They are not in conflict: the server refuses when it KNOWS something is wrong,
and the client refuses only when the server said so.

### Verified as four states, not one

A fetch shim answers the RPC, so the whole path runs before the migration is
applied anywhere:

```
room        open, 12 left   signup form    sign in reachable
full        open, 0 left    WAITLIST       sign in reachable
closed      beta_open false WAITLIST       sign in reachable
notapplied  RPC 404         signup form    sign in reachable   <- today
```

The last row is the one that matters most: **until the migration is applied,
nothing changes.** And joining the list really posts:
`{email: "mami@example.com", source: "wall"}`, after which the screen says
"You are on the list".

**Sign in works on every one of those screens**, including the one that has
just said the beta is full. One hole is known and accepted: Google from the
sign-in tab cannot tell a returning user from a new one.

### The harness trap, and it was a new shape of an old one

The first run reported `rpcCalled: 0` for every state and the signup form
everywhere. The shim was not installed at all, and the reason is worth writing
down:

```js
const STATUS = __STATUS__;                       // the real placeholder
// __STATUS__ is substituted by the probe        // ...and one in the COMMENT, first
```

`String.prototype.replace` with a string argument replaces **the first
occurrence only**, and the first occurrence was in the shim's own comment. So
the real assignment kept `__STATUS__`, the script threw a ReferenceError, and
**a throw inside `addScriptToEvaluateOnNewDocument` is silent.**

What made it findable was the same fix as last time: `window.__rpc || 0` reads
`0` whether the shim counted nothing or was never there. `typeof window.__rpc`
separated them in one line. **A counter that starts at zero cannot report its
own absence.**

`replaceAll`, and do not put a placeholder in the comment that documents it.

### Still to do, and none of it is code

`20260919000100_beta_cohort.sql` joins the five migrations already waiting.
Queries 4 to 6 of `supabase/beta-preflight.sql` read the cohort, what the
sign-up screen is being told, and the waitlist itself, which has no select
policy and so is readable only through the service role.

Two numbers stay the owner's and both move without a deploy: `beta_open` and
`beta_limit`. The landing page names fifty, so if the limit changes, that
sentence changes with it.

---

## Session log: 19 September 2026 (part five): the demo was a crafts shop

The owner said the landing page was "too basic, no animations, nothing", and to
use a different demo business than Sabi Crochet and yarn. Still nothing pushed.

### The second half was the more serious one

The marketing screenshots were captured from `seed4`, which leads with **Sabi
Crochet and a ball of yarn**. This app stopped being a crafts app on
16 September: the category list, the About copy, the default mark and the
name placeholder were all moved off crafts that day, and this file records four
separate sessions doing it.

Then the first picture a stranger sees put it straight back.

It is the sixth time this project has caught an artefact naming an audience the
product no longer has, and the worst position any of them has been in, because
a landing page is the first impression and nothing else on it gets read first.

`scratchpad/seedMarket.mjs` is the fix: a provisions store, an electronics
counter, a phone repair bench and a kitchen. Rice, cooking oil, sugar, a power
bank, a screen replacement. Goods AND services, nothing hand-made.

**The alt text was wrong too**, and that is the part worth keeping. It said
"Wool Blanket at Sabi Crochet shows minus 2 in stock", describing a picture
that no longer existed. Alt text is a claim about an image; when the image
changes it goes stale exactly like copy does, and it is easier to miss because
nobody sees it.

The oversold product is still seeded deliberately, so the two images tell one
story: Home flags "1 oversold" on Mami Joy Provisions, and the Analytics crop
says *"Cooking Oil 1L at Mami Joy Provisions shows -2 in stock."* One set of
books, two pictures that agree.

### Motion, and which of this project's rules actually applied

The app's ceiling is 90/160/240/400ms because **it is a till read at a stall
with a customer waiting**, and past roughly 250ms an animation reads as the
phone being slow. The same file forbids staggering list rows because a ledger
is opened twenty times a day and a stagger delays the first row every time.

Neither reason describes a landing page read once by a stranger who owns
nothing yet. So the reveals are 500ms with a 70ms stagger, and the feature list
does arrive as a list. What does carry over unchanged is the audience: same
cheap Android phones, so only `opacity` and `transform` move.

**Nothing loops.** This project shipped an infinite animation that ran for a
whole session behind an invisible element at `z-index: 9999`; a landing page
with a permanently breathing element is that same mistake wearing marketing
clothes.

### Two failures the checks caught, and one they nearly hid

**The hide is gated on a class the script adds.** Without `bt-anim` on `<html>`
none of the opacity-0 rules match, so a browser that never ran the script shows
the page in full. Hiding content in CSS and revealing it in JS is how a page
ends up blank for precisely the people with the worst connections.

**The first safety net was a lie by omission.** `setTimeout(showAll, 1500)`
revealed everything before anyone had scrolled, so the audit reported zero
hidden elements and the reveals were doing nothing at all. The audit could not
tell "working" from "timer fired", which is this file's oldest recurring
lesson. Counting what is hidden BELOW THE FOLD separated them in one line, and
the net now checks rather than waits: nothing marked after 800ms, when the hero
is in view and a working observer would have marked it, means the observer is
not delivering.

**Then the honest audit found a real defect.** Revealing only the element an
entry fired for left anything that scrolled past unobserved hidden forever:
jumping to the bottom left **six blocks permanently invisible**. A fast flick
on a cheap phone is the same thing. The observer is only a trigger now, and
correctness comes from a sweep that reveals everything at or above the fold
whether it was the entry or not. Re-measured:

```
                        before scroll   after jumping to the bottom
per-entry reveal        9 hidden        6 STILL HIDDEN
sweep                   9 hidden        0
reduced motion          0 hidden        transitions: none
no IntersectionObserver 0 hidden        revealed immediately
```

### Verified

161 tests, lint still 3 errors and 3 warnings, sweep clean at 5 screens x 6
widths in both themes, nothing overflowing on the landing at 320, 390 or 1280,
and the primary CTA still above the fold.

---

## Session log: 19 September 2026 (part six): the landing page becomes a desktop page

The owner sent a design (ChronoTask, on Dribbble) and said *"i see how you
don't optimize for desktop"*. They were right, and it was measurable. Still
nothing pushed.

### The number behind the complaint

Measured with `scratchpad/desk.mjs`, which reports what share of the window the
page actually uses and whether the hero is two columns:

```
                before                 after
1280   36% of the screen, one column   81%, two columns
1680   27% of the screen, one column   69%, two columns
page height at 1280        2338px      1978px
```

A phone column centred in a 1280px window, with 610px of empty page beside the
hero. The app itself has had breakpoints at 700 and 1024 since the responsive
work, and **the landing now uses the same two**: a marketing page that reflows
at widths the app does not is a second system to keep in step.

### What transferred from the reference, and what did not

Four things were taken:

- **A bar.** The page had no persistent chrome at all: a logo, a headline, then
  a long scroll with the way in only at the very top and the very bottom. It is
  `position: sticky` and **solid rather than blurred**, because a
  `backdrop-filter` is a per-frame composite on phones chosen for being cheap
  and this page's only argument is that it is light.
- **Display type.** 32 on a phone, 40 at 700, **64 at 1024 and 76 at 1440**,
  tracking tightening with each step. Still weight 700, not heavier: the
  typography session's rule is that weight goes DOWN as size goes up, and at
  64px a bold DM Sans line is already the loudest thing on any screen.
- **A two-tone headline.** "Know **what your business is** really making.",
  with the middle clause at 52% white. One span, and it is the cheapest
  hierarchy available on a page that otherwise had one weight and one colour
  from top to bottom.
- **Layered depth**: a real crop of the app floating clear of the phone.

What did **not** transfer is the reference's central device, which is to
shatter the product into a dozen scattered fragments and show no whole screen
at all. BizTrack's pitch is that ONE screen tells you your real profit, so
breaking it into pieces would argue against the product.

The mark moved into the bar and is 34px there. It used to be a 52px tile above
the headline, which is a logo standing in for chrome that was not there.

### The fragment has to say something the phone does not

The first one cropped the **profit card**, and the desktop hero then showed the
same card twice, 200px apart: once inside the phone, once floating beside it.
A fragment that repeats its neighbour is not depth, it is a duplicate.

It is the **weekly profit chart** now, which is on a screen the hero never
shows. Placed by measurement rather than by feel: the crop is 340x243 CSS px,
so 256 wide is 183 tall; it overhangs the phone by 60px, which is enough to
layer and little enough that the business rows behind it are still readable.

**It is a `background-image` inside the 1024 media query on purpose.** A
browser only fetches a background whose rule matches, so a phone never pays for
it. An `<img>` would download on every device and then be hidden, which is the
worst of both.

### The demo books grew from two weeks to seven

Adding the chart exposed the seed. `scratchpad/seedMarket.mjs` put every sale
inside a fortnight, which is honest for a brand new shop and wrong for a
picture of the product: the chart came out as **two 100px slabs** with nothing
to read across, which is exactly the shape this file already records
`maxBarSize` as existing because of.

It is a shop that has been open since early August now, and while rewriting it
each sale writes **both** records the app writes -- the money in `sales` and
the units in `stockMovements`, joined by `saleId`. The old fixture wrote one
aggregate movement per product, which is the same shape of fixture that made a
correction look broken on 17 September. Derived stock was checked against the
story the screenshots tell: Cooking Oil still -2, still six products low, and
the four businesses still in that order.

### The reveal bug that the bar exposed

`anim2.mjs` reported two blocks stuck at opacity 0 at the bottom of the page,
consistently. Not timing: polled to four seconds, `.trust` sat at **opacity 0,
514px down an 820px window**, forever.

**The observer's boundary and the sweep's gate were different numbers.** The
observer fired at `threshold: 0.01`, the instant a node was one pixel inside
the viewport; the sweep then refused to reveal anything whose top was still
below 92% of it. A node that enters by a sliver and stops there -- which is
what the last block on a page does when a scroll ENDS at the bottom -- fires
once, is rejected, and never fires again, because nothing crosses a threshold
after the scrolling stops.

`rootMargin: "0px 0px -8% 0px"` shrinks the root by the same 8%, so the
callback now fires exactly when the gate would pass. **One boundary, written
once.** The sweep was written to make "hidden forever" impossible and a second
number quietly put it back.

It only surfaced now because the bar made the page longer and
`scroll-behavior: smooth` made the harness's jump animate. Both are additions;
the bug was already there waiting for a page of the right height.

### A sideways scroll nobody could see, and two tests that could not find it

The hero's glow is a 560px circle centred on a column that is 320px wide on the
narrowest phone, so it reaches 120px past the right edge, and `overflow-y:
auto` resolves the other axis to `auto` as well. Measured: **scrollWidth 440 in
a 320px window**, draggable sideways.

Three reasons it survived every previous check, and the last two are the
transferable ones:

- Every overflow check in this project walks ELEMENTS, and a `::before` is not
  one.
- `el.scrollLeft = 999; el.scrollLeft` reads back **0 while a smooth scroll is
  still animating**, so it reported "fine" for a page that moved.
- An `overflow: hidden` box is still scrollable **from script** by spec, so the
  same test reported "true" after the fix, for a page nobody can move.

What a thumb can do is `overflow-x` resolving to auto or scroll **AND**
`scrollWidth > clientWidth`. Verified in both directions rather than assumed:
`dragSideways: true` with the rule removed, `false` with it in place, and
proven able to fire by injecting a 2000px element.

### Two sections that were still phone layouts in a wide window

The crop under "And it tells you what needs fixing" was `max-width: 720px` on a
716px image, so the app's own type inside it rendered **larger than this page's
headings**: a quotation shouting over the page quoting it. It is 520 and beside
its heading now.

The beta note and the trust note each had a 500px column of empty page beside
them. They are one two-column closing block at 1024 and up, with a fixed 420px
left column because the beta note is a boxed aside and the trust note is prose:
giving the box a fraction would make its width depend on how long the paragraph
beside it happens to be. The `<hr>` between them went, so the gap it supplied is
a margin now.

### The probe that clicked the wrong button and said the right thing

`landing.mjs` logged `tap Get started` and clicked
`document.querySelector('[data-landing-go]')` -- the FIRST one in the DOM.
Which stopped being Get started the moment the bar was added, so it reported
tapping signup and landed on the sign-in screen. **The label in the log was the
only thing that was wrong.** It targets the value now. Same family as every
harness finding in this file: a step that matched something other than what it
claimed.

### Verified

161 tests, lint still 3 errors and 3 warnings, app sweep clean at 5 screens x 6
widths in both themes.

On the landing: all four reveal states clean (on load 13 of 13 below the fold
hidden, 0 hidden after scrolling, 0 under reduced motion, 0 without
IntersectionObserver); no sideways scroll and no element overflow at 320, 390
or 1280; the bar's tap targets 44px at every width and its two anchors arriving
clear of it; the bar's Sign in reaching **"Welcome back"** and its Get started
reaching **"Create your account"**, which is the control-says-what-it-does
check this page already failed once; and the three visitor types unchanged --
landing shown for a stranger, never rendered for a returning user, never
rendered for someone with books and no session, which is the installed PWA.

---

## Session log: 19 September 2026 (part seven): the phone on the landing page answers

The owner asked to make the screenshot usable, so a visitor can move around the
app before entering it. Still nothing pushed.

### The version that was NOT built, and why it is the dangerous one

The obvious reading is "run the real app behind the landing page with demo
books in it". That is the idea to refuse, and the reason is not craft:

**localStorage is per ORIGIN.** Demo books seeded at `biztrack.store` are
written into `biztrack-storage-v3` -- the same key a real user's books live in,
at the same origin. The pre-paint check would then read them and set
`bt-returning` forever, so an installed till opens full of somebody else's
rice, and the landing page never shows again. That is precisely the shape of
this project's whole v1.5.3 to v1.5.7 rescue history.

Accounts are also mandatory since part one, so there would be no app to show
without writing a forged session into a stranger's browser.

So the demo is three REAL screenshots and a swap. Nothing touches storage,
nothing boots the app, nothing forges anything.

### The app's own bar is the control, and the hit areas are measured

Tapping "Analytics" in the picture makes the picture the Analytics screen.
`marketing.mjs` prints the nav's rects beside the capture:

```
Home       l 6.15%   t 91.59%   w 29.23%
Analytics  l 35.38%  t 91.59%   w 29.23%
Settings   l 64.62%  t 91.59%   w 29.23%
```

Equal thirds, because the app's own bar is `flex: 1` -- which is itself a fix
this file records, and it is why these numbers are clean.

**Positioned by eye they would be a dead control the first time the bar
moves**, which is the failure already recorded here in a drag handle that
advertised a gesture the app did not have. Emitted beside the capture, the
picture and the zones cannot disagree: re-run the script and paste the line.

The zones run to the BOTTOM of the image rather than stopping at the bar's own
height. 7.19% of a 262px-wide phone is 38.7px, under the 44px minimum; to the
bottom edge it is 45px, and the only thing below the bar in the picture is the
safe-area strip. Measured after: 76x45 at 390, 93x55 at 1280.

### Nothing is downloaded until somebody taps

The other two screens are 35KB and 32KB. On this audience's connections that is
real money for a visitor who never touches the phone, so they are fetched on
the tap that asks for them and never before. Asserted rather than asserted-at:
`performance.getEntriesByType('resource')` returns **[]** for `demo-*.webp` at
rest, and `["demo-analytics.webp"]` after one tap.

The swap loads the new picture FIRST and only then changes `src`, because
swapping straight away blanks the frame for exactly as long as the fetch takes,
which on a weak connection is the whole problem. The frame dims while it loads,
so the tap is acknowledged; a failed fetch leaves the screen that is already
there, since a broken-image icon in the hero is worse than not moving.

On a wide screen with a real pointer the other two are fetched on
`pointerenter`, so the first click is instant. Deliberately not on a phone:
that is 67KB nobody asked for.

### The demo books grew a Settings screen, and the seed is the marketing seed

Both new screens come from `seedMarket.mjs` on the same run as the hero, so all
three agree: the same shop, the same figures, the same oversold Cooking Oil
that the second landing image explains.

### Three defects, and one of them was in the check

**1. The floating chart fragment ate taps on Home.** It overlaps the phone by
60px on desktop and it came after `.phone` in the DOM, so it took the pointer
events over its area. `elementFromPoint` on three points across each zone
returned `"frag"` for the left of Home. It is `pointer-events: none` now --
which it should always have been, being `aria-hidden` decoration.

**2. My reachability check reported all three zones dead at 390, and the page
was fine.** `elementFromPoint` answers null for anything OUTSIDE the viewport,
so a zone that is merely scrolled off reads exactly like a zone something is
sitting on. It scrolls the demo into view before asking now. Same family as
every harness finding in this file, and worth stating as a rule:
**a null answer and a wrong answer are not the same finding.**

**3. The hint needed a positioning context of its own.** "Tap the tabs" sits
under the phone, and the phone's wrapper is what the floating fragment is
positioned against, so adding the line moved the fragment up by its height. A
`.phoneWrap` holds the phone and the fragment; the hint is outside it.

### The role was claimed, so the contract was kept

`role="tablist"` owes arrow keys and a roving tabindex. This file already
records that a hand-rolled control which drops keyboard behaviour is broken
rather than merely inconsistent, so either the keys exist or the role should
not have been written. Fifteen lines, so they exist: Left/Right wrap, Home/End
jump, and exactly one tab stop at a time so Tab moves past the demo rather than
through three identical buttons. Verified as a sequence rather than read:

```
focus first   home      shown shot-home.webp        stops [home]
ArrowRight    analytics shown demo-analytics.webp   stops [analytics]
ArrowRight    settings  shown demo-settings.webp    stops [settings]
ArrowRight    home      wraps                       stops [home]
End           settings                              stops [settings]
Home          home                                  stops [home]
```

### The hint is not decoration

Without a line saying the picture answers, nobody taps it, and a control nobody
knows about is the same dead control from the other direction. "Tap the tabs.
These are real screens, not pictures of one." 12px, measured at **4.89:1** on
the page ground, which clears AA for normal text.

The crossfade is 220ms and collapses under reduced motion. That needed its own
rule: the existing block only reaches `[data-reveal]`, and this is an `<img>`
inside one.

### Verified

161 tests, lint still 3 errors and 3 warnings, app sweep clean at 5 screens x 6
widths in both themes.

On the landing: all four reveal states clean at 19 nodes (14 of 14 below the
fold hidden on load, 0 after scrolling, 0 under reduced motion, 0 without
IntersectionObserver); every tap zone reachable at 320, 390 and 1280 with the
fragment overlapping and no longer intercepting; zero demo bytes fetched before
a tap and exactly one after; the full keyboard sequence above; and no sideways
scroll or element overflow at any of the three widths.

### A harness note

`vite preview` bound to **`::1` only** on this restart, so `curl localhost:4317`
failed while the server was plainly running and its own log said so. Chrome
resolves `localhost` to `::1` first on Windows, so every probe worked and only
curl did not. `http://[::1]:4317/` is the spelling that answers either way.

---

## Session log: 19 September 2026 (part eight): the demo grows from three screens to fifteen

The owner asked for more functions in the landing page's phone. It went from
three nav destinations to the whole navigable app. Still nothing pushed.

### What it reaches now

```
home ──bar──> analytics, settings
     └─shop row─> each of the three shops visible on Home
                  └─tab strip─> Overview · Inventory · Sales · Invoices
                  └─back──────> home
```

Fifteen screens, **108 hit areas**, all of them measured.

### The map is GENERATED, and that is the whole point

`scratchpad/demoscreens.mjs` drives the real app on the marketing seed,
photographs every screen, measures every control, and rewrites
`window.BT_DEMO` in `index.html` between two markers. Three zone rules in CSS
were fine for one bar; 108 of them typed by hand would be 108 chances to ship a
hotspot pointing at nothing.

Two guards, because a generated graph can still be wrong:

- **The generator refuses to write a zone whose target was never captured.** A
  run that dies halfway cannot leave a hotspot that leads nowhere.
- **The runtime skips one too**, so a stale map cannot draw a dead control
  either.

### Not everything visible is wired, deliberately

**"Delete this business" sits in the corner of every business screen.** It is
never a zone and must never become one: a marketing page is the last place a
stranger should be able to reach a destructive action, even a simulated one.
A text field in a photograph cannot take a keyboard either, so forms are not
wired. What is wired is navigation, which is what "look around" means.

### The check that earned its keep: walk the whole graph

Clicking 108 zones by hand is not something anyone does twice, so
`scratchpad/walk.js` does it: for every screen, follow every zone, assert the
picture that arrives is the one the zone named, and come back. It found the
one real defect in the rewrite immediately.

**When the runtime became data-driven it stopped updating `data-on`.** The
internal `at` variable moved, the picture moved, and the attribute — the only
state anything outside the closure can read — stayed on `home` forever. The
walk reported every screen unreachable when a single line was missing. Nothing
in the UI showed it, because nothing in the CSS reads that attribute yet.

Two harness faults on the way, both already-recorded shapes:

- The walk timed out at four minutes because it is one long in-page call and
  108 zones do not fit. That is the harness's limit, not a failure of the page,
  and the two look identical in a log unless the error is read.
- An early exploration probe scoped its click helper to `.bt-app`. **The gate
  screens render OUTSIDE `.bt-app`**, so it could never dismiss the analytics
  consent gate and reported "no app" — a failed click wearing an empty screen's
  clothes.

### Three content defects the new screens exposed

**1. The Invoices tab photographed as "No invoices yet."** An empty state
standing in for a feature the landing page actively advertises. The marketing
seed now carries one outstanding and one settled invoice per shop, with real
Cameroonian customer names and due dates, so the screen shows an outstanding
total, an unpaid invoice and a settled one — and the line "Not counted in your
revenue until you record the sale", which is this project's invoice-versus-sale
rule explaining itself on a marketing page. **A demo that undersells is the
same class of error as one that oversells.**

**2. The Sales tab showed five consecutive "Bluetooth Speaker" rows**, with the
Power Bank sales that fall between their dates missing. The app was right and
the fixture was wrong: `addSale` does `sales: [sale, ...b.sales]`, so the array
IS the order the Sales tab renders in, and it does not sort. Built per product
with `flatMap`, the seed came out grouped by product. It sorts newest-first now,
which is the order the real write path produces. **Third time this file has
recorded a fixture that did not match the real write path.**

**3. Generated accessible names scraped the wrong element, twice.** Shop rows
came out as "Mami Joy Provisions Groceri" — truncated mid-word — and tab labels
as "Inventory for FCFA67,720", because `.bt-app h1,h2` matches the profit
figure before the shop name. Both now take the name from the seed, which is
already in hand. The second one is the same mistake as the first, made two
lines later, in the same edit.

### What it costs

```
15 screens   608 KB   fetched only when a zone asks for one
the map      9.6 KB inline, 0.9 KB gzipped
at rest      0 bytes
```

A visitor who never touches the phone pays nothing. On a wide screen with a
real pointer the screens one hop away are fetched on `pointerenter`, so the
first click is instant; deliberately not on a phone.

### The hint is `hidden` in the markup

The zones only exist once the script has run, so a browser that never got the
JS would otherwise read a line inviting it to tap a picture that cannot answer.
The script unhides it after the first zones are drawn. Same reasoning as the
reveal rules being gated on a class JS adds.

### Not done, and it is a real gap

**The product photos in the stock list are empty slots.** Photos were the
feature both real users asked for first, and the Inventory screen is where they
would do the most work. The seed has no photo blobs, and filling them would
mean inventing product photography and presenting it as a real shop's — which
is the one thing "THE PICTURES ARE THE REAL APP" forbids. It stays empty until
there are real photos to use.

### One more probe that could not fail

The lazy-loading check taps a zone and asserts nothing was fetched before it.
When the zones became generated they stopped carrying `data-demo`, so its
selector matched nothing, every tap silently missed, and it reported
"downloaded: []" after the tap -- **which is also exactly what a working page
reports**. Each generated zone now carries `data-to`, so a probe can target a
zone by where it leads and a miss is loud. Re-run afterwards: `[]` at rest and
`["demo-analytics.webp"]` after one tap, at both widths.

### Verified

161 tests, lint still 3 errors and 3 warnings, app sweep clean at 5 screens x 6
widths in both themes.

On the landing: **15 screens visited, 108 zones followed, nothing broken** --
every zone's destination asserted against the picture that actually arrived.
Every zone on Home reachable at 390 and 1280 with the chart fragment
overlapping. Zero demo bytes at rest and exactly one file after one tap. All
four reveal states clean at 19 nodes. No sideways scroll or element overflow at
320, 390 or 1280, and the bar's 44px targets unchanged.

---

## Session log: 19 September 2026 (part nine): recording a sale, and pictures on the shelf

The owner asked for two things on the landing page's demo: be able to add a
sale, and see pictures in the stock list. Eighteen screens and 126 zones now.
Still nothing pushed.

### Pictures in the stock list

The Inventory screen was showing an empty placeholder box on every row, which
demonstrates the layout without demonstrating the point -- and photos are the
feature both real users asked for first.

They are **tiles, not photographs**: a soft two-tone ground with the product's
emoji, drawn on a canvas by the harness straight into the app's own
`biztrack-photos` IndexedDB, under the same contract `savePhoto` writes
(`photos` store, keyPath `id`, and the same record shape).

**This does not break "THE PICTURES ARE THE REAL APP."** That rule is about the
SCREENSHOTS being real screenshots of the real build, which they still are. The
books inside them have always been invented -- the shop names, the sales, the
customers on the invoices. Real photographs from a real shop would be better
and the harness will use them the moment there are any: same ids, same store.

**One tile came out a solid black square**, and the cause is the trap
`photos.js` already records from the other direction: the canvas was entirely
TRANSPARENT, and JPEG has no alpha, so it encoded as black. My first
measurement averaged RGB and ignored alpha, so it reported the tile as "black"
rather than "never painted" -- two different findings that look identical if
you only look at three of the four channels.

The fix is not to chase the cause but to stop assuming: the harness now awaits
`document.fonts.ready` (the same fix the receipt canvas needed) and **checks
every tile is fully opaque before storing it**, retrying and failing loudly
rather than writing a black square.

### Recording a sale

The FAB is a zone on every business screen, and it opens that shop's real
record-sale sheet: the product with its picture, the quantity, the price, and
the live line that says **Total Revenue FCFA 3,000 / Net Profit +FCFA 1,080**.
That preview is the product's entire pitch and it had never appeared anywhere
on the landing page.

**IT DOES NOT ACTUALLY RECORD, and that is forced by something structural.**
The books behind these screens are the same books behind the hero image and the
two marketing crops, which `marketing.mjs` captures from a separate run of the
same seed. A sale recorded here and not there would make the demo's Home screen
disagree with the hero image it IS -- they are one file.

**So the form is filled with a sale the shop ALREADY HAS: its most recent
one.** Tap Record Sale, land on that shop's sales list, and the top row is
exactly the line the form was showing, because that line is real. Fill it with
anything else and the join shows at once.

The sheet is filled through the app's own controls -- the item picker opens the
second sheet and an option is chosen in it, and the number inputs are set with
the native setter plus an `input` event, because React owns them.

### A defect I nearly reported that was my own probe

`Record Sale` measured at `t: 100.1%` -- below the viewport -- and the sheet's
scroller showed only 12px of travel. That reads as the primary action of the
app's core verb being unreachable on a phone, which would have been the most
serious finding in weeks.

**The sheet has TWO scrollers and my probe scrolled the first one.** Scrolled
properly it is fully on screen at 360x640, 360x740, 390x800, 390x844 and
412x915. The app was never wrong. Recorded because the failure mode is the one
this file keeps meeting: a step that acted on the wrong element reports the
same thing as a page that is broken.

### The walk had to stop assuming the shape of the app

The 126-zone traversal parked on the sale sheet and called the remaining
sixteen screens unreachable. Its `goto` assumed every screen has a way back to
home; the sale sheet has exactly two exits, to that shop's sales list and to
its overview, and neither is home.

It is a **BFS over the map** now rather than a set of assumptions about the
app's shape. The graph is data; the traversal should read it. Two smaller
things came with that: zones carry `data-to`, so nothing has to be inferred
from the order buttons happen to be in, and `-sale` had to be added to the
suffix alternation AFTER `-sales`, or `b1-sales` matches `sale` and never
resolves.

### One more escape eaten in transit

`/in stock\\)$/` written into a page through a JS template literal arrives as
`/in stock)$/` -- an unmatched paren, and a thrown SyntaxError rather than a
silent miss, which is the lucky version. Both regexes in that path are plain
string comparisons now. Same family as the probe regexes mangled by a shell
heredoc, which this file already records twice; the lesson is that a pattern
crossing a quoting layer should not be a pattern.

### What it costs now

```
18 screens   704 KB   fetched only when a zone asks for one
the map      13.9 KB inline, 1.3 KB gzipped
at rest      0 bytes
```

### Verified

161 tests, lint still 3 errors and 3 warnings, app sweep clean at 5 screens x
6 widths in both themes.

**18 screens visited, 126 zones followed, nothing broken** -- every zone's
destination asserted against the picture that actually arrived, by a BFS over
the generated map.

One harness note: the sweep failed with `ECONNREFUSED 127.0.0.1:9333` after the
session restarted, which is Chrome having died rather than anything about the
page. Worth reading the error rather than the exit code -- a harness that
cannot connect and a page that is broken both exit non-zero.

---

## Session log: 19 September 2026 (part ten): the Sale button opened a shop

The owner: *"the sale button overlaps with the business button when you tap
sale"*. Exactly right, and the cause was structural rather than a stray
coordinate. Still nothing pushed.

### What was actually happening

The zone map had no Z-ORDER. Every zone was measured from an element's rect and
emitted in whatever order the generator happened to build them, with the nav
first and the shop rows last. A later sibling wins a tap, so the rows won.

```
the last shop row   t 83.5%  ..  94.6%     full width
the + Sale button   t 83.0%  ..  88.8%     drawn INSIDE that strip
the bottom bar      t 91.59% .. 100%       also inside it
```

So on Home, tapping the Sale button opened **QuickFix Phones**, and the top
three percent of all three bar items did too. Confirmed by hit-testing the map
rather than by reading it: three overlapping pairs, every one resolving to
"Open QuickFix Phones".

**The app has no such bug** because the app has a z-order: the list paints,
the Sale button floats over it, the bar sits over both. The demo was
reproducing the geometry and throwing the stacking away.

### The fix is the app's own rule, not a clip

Zones are emitted bottom-up in the order the app paints them -- content, then
the floating button, then the bar -- so the last one in the DOM is the one
drawn on top, and a tap resolves exactly as it does in the app. Nothing is
clipped and no coordinate was adjusted. Re-measured afterwards by hit-testing
the point each control occupies in the picture:

```
the Sale button on Home   -> "Record a sale"     -> home-sale
Home / Analytics / Settings in the bar   -> their own screens
the third shop row        -> "Open QuickFix Phones"
```

**And a check, because ordering is the kind of thing that silently rots.** The
generator samples every zone against the ones above it and refuses to write the
map if under a quarter of any zone survives. Overlap on its own is faithful --
the app's list really does run under the app's bar -- but a zone with nothing
left of it is a control answering a tap it can never receive.

### Home's Sale button needed somewhere of its own to go

It could not point at a shop's sheet: with several businesses the app asks
**"Which business?"** first, and Home's sheet carries that row. Sending the
button to `b1-sale` would have skipped a question the app actually asks.

So `home-sale` is its own capture. The sheet has to be scrolled to reach Record
Sale, which puts the business picker above the frame -- exactly where it goes
on a real phone -- so the alt text describes what is IN the picture rather than
what the screen contains. The two sheets are still distinguishable: the screen
behind the overlay is Home in one and the shop in the other.

### The fixture was not reproducible, and that is how this surfaced

The captured form showed **Rice 5kg 3 @ 6500** while a fresh read of the seed
said the newest sale was **Soap Bar 6 @ 500**. Neither was wrong:

`day()` called `Date.now()` afresh, and it runs once per product as the module
evaluates, so two sales on "the same day" landed a millisecond or two apart --
and which came out newest depended on whether the clock ticked between two
calls. The Sales tab renders array order, so **the top row of the list flipped
between runs**, and the form that mirrors it could disagree with the picture it
leads to. Worse, `marketing.mjs` and `demoscreens.mjs` evaluate the seed
separately, so they could disagree with each other.

One anchor for every date now. Same-day sales tie exactly, `Array.sort` is
stable, and the order is the order they are written. Checked by importing the
module three times: identical. **Reproducible is the whole point of a
fixture**, and this file has now recorded three separate fixture faults that
each looked like a bug in the app.

Verified after: the form reads Rice 5kg, 3, 6500, *Total Revenue FCFA 19,500 /
Net Profit +FCFA 3,900*, and the top row of the list it leads to is Rice 5kg,
3 units, FCFA 19,500, +FCFA 3,900.

### One more escape eaten in transit

`"...\\n  "` written through a quoting layer arrived as a real newline inside a
JS string literal, so the file would not parse. The message joins with `" | "`
now and contains no escape at all. Third time in two sessions; the rule is that
a pattern crossing a quoting layer should not be a pattern.

### Verified

161 tests, lint still 3 errors and 3 warnings.

**19 screens visited, 129 zones followed, nothing broken**, and the three
controls the report was about hit-tested one by one: the Sale button on Home
reaches `home-sale`, and Home / Analytics / Settings in the bar each reach
their own screen rather than a shop.

```
19 screens   736 KB   fetched only when a zone asks for one
the map      14.3 KB inline, 1.4 KB gzipped
at rest      0 bytes
```

---

## Session log: 19 September 2026 (part eleven): the landing page stops looking generated

The owner: *"the whole landing page... looks way too basic and very ai
generated, check github repos for highest rated landing pages and copy some
things"*. Run with the `design-deslop` skill, which is exactly this job;
`interface-design` explicitly excludes marketing pages. Still nothing pushed.

### The research said not to copy the templates

The repo the owner had in mind is `PaulleDemon/awesome-landing-pages`, and
reading it settles the question: it is a template collection whose own stated
purpose is "speed-to-market over custom design work". **Those templates ARE the
generic look** -- they are what the average landing page is made of, which is
precisely why a generated page resembles them. Copying blocks out of it would
have made the complaint worse.

What the rest of the reading actually said, and it is the opposite advice:
underspecified work gets answered with the most statistically common pattern,
so the escape is **one accent that appears only where it means something, real
typographic range, and opinions about layout**. Techniques, not blocks.

### The tells, measured before anything was touched

`scratchpad/slop.mjs` turns the squint test into numbers, because "looks
basic" is a claim about composition and composition can be counted:

```
                            before          after
gaps between blocks    56, 56, 56, 56   18 within a band, 176-208 between
<hr> doing the breaks        3                0
distinct grounds             1 field          4 bands, dark/paper/dark/paper
type sizes            ... 18, 22, 64      ... 18, 27, 40, 64
ink that is not body text    5%              accent labels every band
page height at 390         2,539px         2,882px
```

Four consecutive gaps of exactly 56px is the monotone failure with a number on
it. Three `<hr>`s is separation drawn with lines instead of space. One ground
for 2,022px is why nothing on the page grouped.

### The second ground is the APP'S OWN CREAM

`#FAF8F4`, not a neutral picked to look expensive. The middle of the page is
literally the colour of the product, so it reads as a page out of BizTrack
rather than a section of a template -- and it is why no rule is needed between
bands. **The ground changing IS the break.** A band change also separates with
less space than a rule needs, which is why the phone padding came back down to
52 after 72 put the page at 3,014px.

### The tick grid is gone

Four ticks in a 2x2 with a bold label and a grey sentence is the single most
templated block on the web. They are ledger ROWS now: the app's own list
idiom, a hairline between each, hierarchy from weight and colour rather than
from a decorative mark, and a terracotta index number that is the same device
the Analytics rank discs use. The page and the product mark rank the same way.

### Three defects the checks caught

**1. The hero note ran underneath the floating chart.** The new line filled
~200px of dead space under the CTAs and the sentence disappeared behind the
chart fragment: "and syncs ... comes back". Capped at 400px, measured
clearance 44px, and `elementFromPoint` at the note's right edge returns the
note rather than the fragment.

That also **made a comment in this file false**. The fragment's position was
argued from "the text column is empty at that height: the buttons end 90px
above it". True when it was written; untrue the moment a line was added there.
The comment now says what is actually the case. **A position argued from
"nothing is there" has to be re-measured the moment something is.**

**2. Every band was double-padded.** The responsive blocks still gave `.wrap`
`padding: 64px 40px 80px`, so each band paid its own 72 plus the column's 64
and 80. The column keeps its measure and its gutter; the band owns vertical
space.

**3. Only one row in four closed.** `li:last-child` gets a bottom border, but
in a two-column grid the bottom row is TWO items, so the left column ended on
nothing. The rule belongs to the `ul`.

### And one probe that measured the wrong document

`slop.mjs` waited a fixed 2,200ms after navigating, and after a rebuild the
first load refetches every asset, so it measured a document with no `#landing`
in it and threw "Cannot read properties of null". That reads exactly like a
page whose landing element is missing. It polls now -- the same fix this file
already records for the gate clicks.

### Verified

161 tests, lint still 3 errors and 3 warnings, app sweep clean at 5 screens x
6 widths in both themes.

The landing: widths unchanged (81% of a 1280 screen, two columns, CTA above
the fold); 44px tap targets at every width and no sideways drag at 320/390/
1280; all four reveal states clean at 23 nodes, 17 of 17 below-fold hidden on
load; the three visitor types unchanged. Contrast on the new cream band
measured rather than assumed: 15.9 headings, 6.53 lede, 5.71 body, and the
eyebrows at 4.57, which is this project's own ratified `--accent-text`.

**The demo still works end to end: 19 screens, 129 zones, nothing broken**,
which is the check that mattered most, because the phone now lives inside a
band rather than directly in the column.

---

## Session log: 19 September 2026 (part twelve): the real logo, and the last element on the page

The owner: *"use biztrack's logo in the landing page"*. The nav had been
carrying a lucide HOUSE on a terracotta tile -- a stock glyph standing in for a
logo, which is its own kind of generated tell. Still nothing pushed.

### The logo was already in the repo, twice

```
public/favicon.svg         457 B    the mark, as vector
public/wordmark-light.png  640x160  the full lockup, RGBA with real alpha
```

The mark is a **profit-split disc**: a circle halved terracotta and cream with
the centre cut out. It is the app's own subject drawn as a shape, which is
worth more on this page than any icon set.

Both are used, each where it can be:

- **The nav gets the disc, inlined from `favicon.svg`.** Vector, no request,
  sharp at any size. The favicon draws that disc on a `#2C1810` rounded square
  and the bar is the same colour, so only the disc is drawn here and the centre
  dot and divider are cut back to the bar, which is what they already are in
  the icon.
- **The cream band gets the full lockup.** "light" in `wordmark-light.png`
  means light BACKGROUND: it is dark ink on transparency, so it can only go on
  the paper band. That is also the one place a serif is allowed -- the rule
  against a display serif is about the TYPE SYSTEM, and a wordmark is a
  picture of a name.

It sits LAST on the page. Between the beta note and the button it read as a
label for the button.

**One thing left undone and it is the owner's call:** the nav sets "BizTrack"
in DM Sans beside the real mark, because the only wordmark file is dark ink and
cannot go on the dark bar. That is a different lockup from the official one. A
light-on-dark variant of the wordmark would fix it, and making one means
drawing a brand asset rather than using one.

### The bug the sign-off exposed, which had nothing to do with logos

`anim2` reported the new image stuck at opacity 0 after scrolling to the
bottom. Not timing, and the measurement is what separated the two: the scroll
ARRIVED at 1,000ms and the element was still hidden at **5,000ms**. It also
revealed normally at 1280x900 and never at 390x820.

**The 8% gate assumes there is always more page to scroll.** The observer's
root is shrunk by `rootMargin: 0 0 -8% 0` and the sweep refuses anything whose
top is below 92%, and those two agreeing is a fix this file already records.
But the LAST element on the page can come to rest inside that bottom strip:
the shrunken root never contains it, the gate never passes it, and there is no
more scrolling left to change either. It stays at opacity 0 for ever.

Two lines fix it and both are needed:

- **At the end of the scroller, nothing may stay pending.** `atEnd` short
  circuits the gate.
- **A passive `scroll` listener runs the sweep**, because the observer alone
  cannot see that strip -- if the final movement crosses nothing, the sweep
  never runs at all. It detaches once nothing is left.

This is the third distinct way this one reveal system has hidden content for
ever: first revealing only the entry's own element, then a gate that disagreed
with the observer's boundary, now a strip neither can reach. Each was found by
asking the page rather than reading the code.

### And a probe that answered `{}`

The timed version of the check is an async function, and `Runtime.evaluate`
without `awaitPromise` serialises the Promise as `{}` -- which reads as an
empty answer rather than an unfinished one. The same shape as every harness
fault in this file: the failure and the success are indistinguishable unless
the check is made to say which it is.

### Verified

161 tests, lint still 3 errors and 3 warnings.

All four reveal states clean at 24 nodes, including the state that was broken:
scrolled to the bottom, **0 still hidden**. Nav tap targets 44px and no
sideways drag at 320/390/1280. The three visitor types unchanged. The demo
still walks 19 screens and 129 zones with nothing broken.

---

## Session log: 19 September 2026 (part thirteen): the footer, and a contrast sweep it started

The owner: *"add a footer to the homepage..built by apex tech"*. It is two
lines; the check it prompted found three contrast failures, only one of them
mine. Still nothing pushed.

### The footer is a strip, not a section

The build credit on the left, the copyright on the right, baseline-aligned,
wrapping to two rows on a phone. It puts the page back on the dark ground it
opens with, so the alternation is honest end to end: dark, paper, dark, paper,
dark.

**It carries no logo.** The wordmark sign-off is directly above it at the foot
of the cream band, and two marks in a row is one mark too many.

### A rule that lost to a rule of equal specificity

`#landing .footer { padding: 26px 0 }` measured **104px** top and bottom, 227px
tall for one line of type:

```
#landing .footer   1 id + 1 class   written where the footer is defined
#landing .band     1 id + 1 class   written later, inside @media (min-width: 1024px)
```

**Equal specificity, so source order decides**, and every responsive rule in
this project deliberately lives inside a min-width query at the bottom of the
file -- which is what makes "do not break mobile" a property of the file. So
anything opting out of the band rhythm has to OUT-SPECIFY it, not merely follow
it. `#landing .band.footer` is 1 id + 2 classes and wins regardless of order.
Measured after: 26px, 71px tall.

### The probe invented a defect before it found real ones

The first contrast run reported the beta paragraph at **1.00:1** -- dark ink on
dark ground, invisible text, which would have been the worst thing on the page.
It was the probe.

Walking up for a ground, it stopped at the first background with **any** alpha
and treated it as opaque. `.beta` carries a 3% wash, so the walk reported a
surface that does not exist. It composites the whole stack down to the first
opaque layer now, and that finding vanished.

The ground walk has to go up at all for the reason this file already records
from the share bar's check: **a band has no background of its own**, so reading
its computed `background-color` returns `rgba(0,0,0,0)` and light text gets
compared against BLACK -- a number better than the truth.

So the same probe produced both kinds of wrong answer in one session: a false
pass if you read the element, a false FAILURE if you stop one layer too early.

### Three real failures, measured at 390 and 1280

```
3.25   .foot, the fine print under the button   rgba(44,24,16,0.5) on cream
4.21   the footer credit                        rgba(250,248,244,0.45) on dark
4.30   the "Beta" eyebrow                       #A5603A on the .beta wash
```

All three are 11-12px normal text, where AA asks 4.5.

**The third is this file's own rule at small scale.** `#A5603A` is the ratified
`--accent-text` and measures **4.57** against the page -- 0.07 of margin. The
`.beta` box's 3% dark wash is not the page, and it spent 0.27 of that.

The fix is to remove the wash rather than to darken the label. A 1px border at
18% is what makes it a box; the wash carried almost no ink and cost a measured
colour the ground it was measured on. Inventing a fourth accent value to sit on
a surface that did not need to exist is the worse trade.

The footer went to **0.5**, not to some new number: that is the alpha the demo
hint already spends on the same ground, already measured at 4.89. One value.

Nothing on the page fails at 390 or at 1280, and the probe is known to be able
to fail, because it reported these three on this same code path.

### The footer is a regression test for the previous session's bug

Part twelve found that the LAST element on a page can come to rest inside the
bottom 8% strip the observer's `rootMargin` excludes and the sweep's gate
rejects, with no scrolling left to change either -- hidden for ever. The footer
is now the last element, so the reveal check is a direct test of `atEnd` rather
than an incidental one: **25 nodes, 19 hidden below the fold on load, 0 still
hidden at the bottom.**

### Worth the owner's attention, and it is not code

The footer says BizTrack is **built by Apex Tech**. `ENTITY` in
`src/legal/documents.js` names **a person** -- Ewube Arrey Neville Arrey -- as
the operator, and that name is what the privacy policy and the Terms are
written around. Those can legitimately differ: a person can operate a product a
studio built. But if Apex Tech is the operating entity, the legal documents
name the wrong party, and that is cheaper to settle before the lawyer reads
them than after.

### Verified

161 tests, lint still 3 errors and 3 warnings, app sweep clean at 5 screens x
6 widths in both themes.

On the landing: **zero contrast failures at 390 and at 1280**, measured over
every text node with its ground composited; all four reveal states clean at 25
nodes, including the one the footer is a regression test for; nav tap targets
44px and no sideways drag at 320/390/1280; the three visitor types unchanged.
The demo still walks **19 screens and 129 zones with nothing broken**.

---

## Session log: 20 September 2026: nobody had ever synced anything

The owner reported the cloud-backup row saying "waiting for a connection".
That sentence was covering **the single worst defect this project has had**:
eight accounts, zero rows, since the schema went up. Still nothing pushed.

### What was actually true

```
auth.users        8
profiles          8      written by a SECURITY DEFINER trigger, so RLS-exempt
businesses        0
business_members  0
items             0
sales             0
stock_movements   0
```

Every account ever created. Not one row of business data has ever reached the
server. The screen said "Backed up to your account" the entire time.

### The bug

`upsertAll` calls `.upsert(rows, { onConflict: "id" })`, so PostgREST issues
`INSERT ... ON CONFLICT (id) DO UPDATE` and **never a plain INSERT**.

**PostgreSQL makes an upsert satisfy the SELECT and UPDATE policies as well as
the INSERT one, and it applies SELECT's `USING` to the NEW row -- even when
nothing conflicts.** Both of those policies read `is_business_member(id)`, and
the membership row that function looks for is written by `add_owner_as_member`,
an **AFTER INSERT** trigger that has not fired at the moment the check runs.

So the first write of a business could never pass. For anyone. Ever. And
because `pushChanges` aborts on the first failure and `pullChanges` only runs
after it, items, sales and movements never ran either.

The fix lets the OWNER through on their own row without consulting membership,
which is what `20260906000200_rls.sql` already *claimed*: "there is no such
thing as a business whose owner cannot see it." It routed the owner's access
through a row that does not exist yet, so it did not enforce it.

It is not weaker. `owner_id = auth.uid()` still pins every path to the caller.
Verified against the live schema in a rolled-back transaction: the owner's
upsert returns OK, and a stranger upserting a business owned by someone else
still returns **42501**.

### Why 35 RLS tests passed while this was broken

**They all assert the plain INSERT form.** The client has never sent that form.
A test suite that exercises a shape the application does not use is not
covering the application, and it was green through the entire outage.

`rls_test.sql` now asserts the upsert form, for a business that does NOT yet
exist, because the conflicting case was always fine.

### Four wrong turns, all mine, all the same shape

- **"The 401s prove two tabs."** They were the HARNESS: `fakeSession.mjs`
  writes a fabricated session, and because `isBackendConfigured` is true the
  app then hits the REAL project every five minutes with a token the server
  correctly rejects. Every screenshot run this month has been doing that.
- **"The request never reaches Postgres."** A BEFORE trigger that logged into
  a table showed nothing, and I read the silence as a finding. **A trigger's
  side effects roll back with the statement that fired them**, so it could
  never have recorded a failing insert. `RAISE WARNING` survives; a table write
  does not.
- **"The schema cache is stale."** Reloading it changed nothing, which is the
  only reason that theory died rather than being believed.
- **"It is the RETURNING clause."** `upsert()` sends `return=minimal` unless
  `.select()` is chained. I had built a probe around a clause the client never
  sends -- and the probe's failure was real, just not the user's failure.

The one that broke it open was isolating the single difference between the
probe that PASSED and the request that FAILED: plain INSERT versus upsert.
Everything else had been held constant for hours without that one varying.

### Also fixed, and independent

`flattenBusinesses` initialised `{businesses, items, sales, movements}` and
never `invoices`, so `flat.invoices` was `undefined` and
`upsertAll("invoices", undefined)` threw on `undefined.length` -- after the
other four tables had gone, before the pull, and before any cursor advanced.
It would have broken every sync the moment the RLS fix landed. 162 tests now,
and one of them is this.

### Still to apply

`20260920000100_fix_businesses_upsert_rls.sql`. **Applying it is the whole
fix**; everything else in this session was finding out what to write in it.

### The status line was the whole reason this took a night

The RLS fix landed and the row appeared, and the screen still said **"waiting
for a connection"** -- because the push now gets through businesses, items,
sales and movements and then throws on `upsertAll("invoices", undefined)`, and
`syncOnce` labelled every failure `offline`.

That is the same defect as the bug it was hiding, one layer up. Fixed:

- **`looksOffline()` classifies instead of assuming.** `navigator.onLine`, or a
  `TypeError` whose message actually looks like a fetch failure. A `TypeError`
  from OUR OWN code -- reading `.length` of undefined, say -- is a TypeError
  too, and must not be read as a dead network.
- **`reason` is now `offline` or `failed`**, and `useSync` maps `failed` to a
  real status instead of the silent `idle` it used before.
- **The Account row stops asserting.** It read "Backed up to your account"
  whenever a session existed, before any sync had ever succeeded. On failure it
  now says backup is not working, that the records are safe on the phone, and
  prints `lastError` -- the actual sentence, not a guess at it.
- **`upsertAll` treats a missing row set as empty.** One absent key in an
  accumulator should not be able to take the whole sync down again.

**The rule, stated plainly because this project keeps paying for it:** a
message that names the wrong cause is worse than no message. "Waiting for a
connection" sent the owner to check their signal for days while the server was
answering 403 on schedule, without fail.

### All six pending migrations applied, 20 September

Applied in order against the live project, after checking each for the upsert
flaw above and for anything destructive (there was none; all six are additive
and carry `if not exists` guards):

```
20260916000100_product_photos     items.photo_id + private bucket + policies
20260916000200_sale_groups        sales.group_id
20260917000100_invoices           table, indexes, RLS
20260917000200_feedback           table, insert-only
20260917000300_feedback_to_inbox  feedback.notified_at
20260919000100_beta_cohort        app_settings, beta_status(), cohort, waitlist
```

**The invoices policies do NOT have the businesses bug**, and the reason is
worth keeping: they check `is_business_member(business_id)` -- membership of an
EXISTING business, which by then certainly exists. `businesses` was uniquely
broken because it checked membership of the row being created. Same reasoning
clears items, sales and movements.

Verified after, with the CURRENT build's exact column shapes, in a rolled-back
transaction: item upsert **with** `photo_id`, sale upsert **with** `group_id`,
stock movement, invoice, feedback insert as both `authenticated` and `anon`,
and `beta_status()` callable. All pass. Before the migrations, `photo_id` and
`group_id` both returned `42703` and invoices `42P01` -- **so deploying the
working tree before applying these would have broken sync again, on items and
sales this time.** Migrations-first is safe in both directions; deploy-first is
not.

`product-photos` is PRIVATE, which is the one outcome this file said to watch
for.

### The security check after changing a security policy

`rls-check.sql` query 1: twelve tables, RLS on, policies present, all OK.

Then isolation, directly, because loosening `businesses_select_member` is
exactly the kind of change that quietly leaks:

```
owner sees own businesses                1   (want 1)
ANOTHER REAL USER sees them              0   (want 0)
anon sees them                           0   (want 0)
another user UPDATEs owner's business    refused, 0 rows changed
another user DELETEs owner's business    refused, row survived
```

Feedback stays write-only: a row inserted as `anon` is readable by neither
`anon` nor `authenticated`, while the privileged session sees it -- so the
table works and the wall holds.

**Two of my own checks were wrong before they were right, both the same way.**
An exception-based test reported feedback as READABLE, because RLS does not
raise on a SELECT, it returns zero rows; and the first isolation attempt wrote
to a temp table the `anon` role could not touch. Neither failure was in the
database. This file's own rule -- an empty result and a blocked result are not
the same finding -- applies to the checks as much as to the app.

### Data is reaching the server

A business and a custom sale recorded on a real device, both stuck locally for
days, are now on the server. That is the first real business data this project
has ever backed up.

### And then it shipped

`9b510fa` is live on **https://biztrack.store** and on
**biz-track-nine.vercel.app**, which is the origin the existing users' books
sit on. `dpl_3s58SDKXa1aKZZ4vWR2vGDztETtY`, `target: production`, built in 8s.

**The push was not the deploy, and that cost most of an hour.** The commit went
to GitHub, Vercel built it in ten seconds, and `biztrack.store` went on serving
the previous bundle -- which reads exactly like a broken integration. It is
not: this branch is not the project's production branch, so a push builds a
preview. The full explanation is now under "A PUSH DOES NOT DEPLOY" in the
deployment section above, where someone looking for it will find it.

Three API routes were tried and all three failed before the obvious one worked:
`request_promote` returned 422, `create_deployment` was refused, and
`assign_alias` came back **403 Forbidden** -- the Vercel MCP token cannot
create an alias or even list env vars. The CLI, already installed and logged in
as the owner, did it in one command. **Reach for the tool that holds the
credentials, not the one that is already in hand.**

I also got the diagnosis wrong first and it is worth recording which way. I
concluded a Vercel setting had changed around 14 September, because production
deployments stopped after `73fabba`. They did not stop: reading `source` on
that deployment returns `"cli"`, and every one of the twenty production
deployments in this project's history is by `xmp-glitch`. Nothing changed and
nothing broke. The git metadata on those deploys is what misled me -- the CLI
attaches the local checkout's commit, so a hand-run deploy is indistinguishable
from a GitHub one in the dashboard. **A field that looks like provenance was
only a label.**

Verified from outside rather than from the dashboard, which is this file's
standing rule:

```
biztrack.store            assets/index-CoUE0w9S.js   (was index-CRnPS_60.js)
biz-track-nine...app      assets/index-CoUE0w9S.js   same deployment
supabase ref inlined      yes      so it is NOT silently local-only
publishable key inlined   yes
www.biztrack.store        307 -> apex
in the shipped bundle     "Sync FAILED (not a connection problem)"
                          "Sync deferred (offline)"
                          "Backup is not working"
```

Those last three strings are the point of checking the artefact rather than the
hash: they are the sync fix itself, so their presence proves what shipped and
not merely that something did.

Existing users hold a service worker precaching the old build, so they get the
"Update Available" prompt rather than the fix on next launch. That is by design
and is the offline-first bargain working.

---

## Session log: 21 September 2026: the prompt could not reach the stuck

The owner opened `biztrack.store` and got the OLD build, with the old
onboarding and no landing page, and no way to move off it. Two separate
things were true at once and they hid each other.

### THE SERVICE WORKER SERVES THE BUILD YOU LAST ACCEPTED

`src/sw.js` has `registerRoute(new NavigationRoute(createHandlerBoundToURL(
'index.html')))`, so **every navigation is answered from the precached
index.html**. A returning visitor does not get what the server is serving;
they get what their worker already holds, until they accept an update. The
apex can be correct and a person can still be looking at last month's app --
and `curl` will agree with the server, not with them.

The only control that changes that is the "Update Available" prompt, **and it
was rendered inside the main shell, past eight early returns.** So anyone on
the sign-in wall, onboarding or the PIN lock could never be told an update
existed -- the exact screens where being stuck on an old build is most likely
and least explicable. It is in `withOverlays` now, which is where the toast
and the dialog already went, for a reason this file had already written down:
**an early return is not a different screen, it is a different tree.**

It was also the last SECOND SHELL in the app: raw `S.modalOverlay` markup
with no portal, no Escape and no focus restore, which the rules above warn
about by name. It is a `ModalShell` now and inherits all three.

### WHICH EXPOSED A REAL BUG IN EVERY GATE-SCREEN DIALOG

`S.modalOverlay` is `position: absolute` deliberately: inside `.bt-app` that
covers the framed column and centres in the 780px frame at tablet width. The
gate screens have no `.bt-app`, so `ModalShell` falls back to `document.body`
-- which is **not positioned**, so an absolute box hangs off the initial
containing block at the DOCUMENT origin, and page scroll drags the backdrop
away while the sheet stays put.

```
sign-in wall, 390x820, before   overlay top -214   bottom quarter unscrimmed
sign-in wall, 390x820, after    overlay top 0      sheet 517..820, visible
desktop 1280x900, after         overlay top 0      sheet centred, visible
```

Desktop hid it entirely, because the gate screens fit there and nothing
scrolls. **This project shipped this exact bug once before** (-193..627 on an
820px window) and fixed it by portalling. Portalling was only half of it:
where there is no frame to sit inside, the overlay must be anchored to the
VIEWPORT. It reaches every dialog raised from a gate, which is the data
rescue on onboarding and on the PIN lock -- the screens someone who has lost
their books actually lands on.

### The catch-22, and who it actually bites

A fix that makes updates reachable can only arrive BY an update. That sounds
fatal and mostly is not, and the distinction is worth keeping:

- **Existing real users are on the old build in the MAIN SHELL**, because
  accounts were not mandatory then and they have local books. The old build
  renders the prompt there, so they are offered it normally.
- **Whoever lands on a GATE screen of the old build is stuck for good**, and
  the only way out is a hard reload or clearing site data. That was the owner.

After this deploy nobody can enter that state again.

### The other half, and it is not a bug

**The owner will still not see the landing page at plain `/`.** The pre-paint
check hides it whenever localStorage holds the ledger key or a `-auth-token`,
which is what stops an installed PWA opening a marketing page. Their browser
holds both. **`?landing` is the documented escape and exists for exactly
this**; it is in the rules above and it is easy to forget when a stale build
is failing at the same time.

### Two harness faults, both already in this file's catalogue

- A probe **spawned its own `vite preview` and raced it**, so
  `ERR_CONNECTION_REFUSED` came back as an empty page and read as a rendering
  failure. It proves the server answers before it measures now. A harness that
  cannot connect and a page that is broken look identical unless asked.
- It measured **the frame the sheet appeared in** rather than where it came to
  rest. `--motion-enter` is 240ms and a sheet ARRIVES, so a correct sheet
  reported as one sitting off-screen at `top: 820`.

And one that was not a fault but a dead end worth recording: the first probe
tried to trigger a REAL update by building twice. It never fired --
`waiting: false`, no update detected, because the browser serves `sw.js` from
HTTP cache and `registration.update()` honours it without
`updateViaCache: 'none'`. Forcing the prompt on behind a temporary flag, then
removing it, tested the thing that could actually fail: where the overlay
LANDS on a screen with no `.bt-app`.

162 tests, lint still 3 errors and 3 warnings. Live on both origins as
`index-IiidO7sQ.js`.

### THE APP UPDATES ITSELF NOW. It used to ask.

The owner's question was the right one: *why doesn't it just refresh?* Because
`registerType: 'prompt'` means a new worker installs and then **waits for ever**
-- released only by an explicit "Update now" or by every tab closing at once.
With the button unreachable behind a gate, that is a permanent stall.

It is `registerType: 'autoUpdate'`, and **the setting alone is inert**: with
`injectManifest`, `src/sw.js` must call `self.skipWaiting()` and
`self.clients.claim()` itself or the worker still waits. Both are there now,
with the reasoning beside them.

**The reload is load-bearing, not cosmetic.** `cleanupOutdatedCaches()` deletes
the previous precache the instant the new worker activates, so a page left
running on the old build holds hashed chunk URLs that no longer resolve -- the
lazily imported chart is the one that 404s. Reloading at once is the SHORTER
window of danger, not the longer one. Do not add a "finish what you are doing"
delay without solving that first.

`onNeedReload` replaces vite-plugin-pwa's bare `window.location.reload()` with
a 700ms "Updating BizTrack" sheet, because **an app that silently restarts
reads as a crash** on a mid-range Android and this audience is at a stall when
it happens. Long enough to read four words, far too short to reach a lazy
chunk.

`updateProgress` and `isUpdating` are declared ABOVE `useRegisterSW`, and that
is required rather than tidy: the callback is stored once on the first render,
so a setter declared further down sits in its temporal dead zone when the
closure is built. Same fault as `checkUpdates` reaching a `showToast` declared
150 lines later, which never threw only because nothing called it during the
first render.

**The trade, taken knowingly:** an unsubmitted form is lost when an update
lands. Recorded sales are not, because every mutation reaches localStorage
first.

Verified by building twice and watching the swap, because a reload loop would
be the worst thing this change could do:

```
v1   index-Hf9tuR6g   loads 1
     installing -> never observed WAITING, so skipWaiting works
v2   index-Ba0feVbs   loads 2 -> 3, exactly one reload
     6s later         loads 3, settled, NO LOOP
```

**A marker comment cannot prove a build changed.** Appending one to `main.jsx`
is stripped by minification, so the output was byte-identical, the hash never
moved, and the worker was correct that there was no update -- two runs
reported "swapped=false" for a build that had never been made. A side effect
on `window` survives. Checking the JS chunk hash after changing only CSS was
the same error one layer up: the CSS filename moves and the JS hash does not.

Live `sw.js` is served `public, max-age=0, must-revalidate`, so nothing blocks
the check in production. `vite preview` sends `no-cache`, so neither locally.

**The one-time catch:** this fix can only arrive by the mechanism it repairs.
Anyone already stranded on a gate screen of an older build still needs a
manual unstick once -- close every tab and the installed app, or unregister
the worker. After that nobody can enter the state again.
