# BizTrack: the four-layer audit

Started 17 September 2026, before the first push of a week's work. Nothing in
this file is a change; it is what was found, measured where measuring was
possible.

**Why this is not in CLAUDE.md.** That file is read into context at the start of
every session and is already around four thousand lines. An audit of this size
living inside it would tax every future session forever, for a document that is
read once and acted on. CLAUDE.md carries a one-line pointer here instead.

---

## The four layers, and what was actually run

Skills **used**, not skills available. The distinction matters: an audit that
lists tools it did not run is claiming coverage it does not have.

| # | Layer | Run with | Not run |
|---|---|---|---|
| 1 | **UI / UX** | a nine-screen measured census, then `design-review`, then `design-deslop` | `dataviz` over the three charts; `frontend-anchors` |
| 2 | **Security** | `owasp-security` as the lens, plus direct verification: bundle scan, `npm audit`, a live RLS write probe, a parse of all 61 policies | the `sast-*` family, `semgrep`, `codeql`, `supply-chain-risk-auditor` |
| 3 | **Legal** | `privacy-legal/policy-monitor` and `product-legal/marketing-claims-review`, read from the clone and followed by hand | the other ten plugins in the suite |
| 4 | **User psychology** | `ux-psychology` | -- |

### Layer 3 was not blocked after all

It is recorded here because the first version of this document said it was. The
plugins are cloned at `C:/Users/EAE/claude-plugins/claude-for-legal` (pinned
`4a6c651`, Apache-2.0, hooks empty) and never installed -- `~/.claude/plugins/`
still holds nothing, `/plugin` is an interactive slash command, and the
`claude.bat` on this machine proxies to OpenRouter rather than being the Claude
Code CLI.

None of that mattered. **A skill is a markdown file with a procedure in it**, and
the procedures were read from disk and followed directly. Installing buys
discoverability, not capability. The layer ran in full.

### Layer 4's skill was chosen against its stars, not by them

`Nuclear-Marmalade/ux-psychology-skill`, MIT, **18 stars**. That is essentially
unvetted and it is worth saying so plainly rather than presenting it beside a
9,465-star Anthropic repo as though they carry the same weight.

It was picked by reading it. Two better-known alternatives were rejected on
their content: `rastian/behavioral-design-skills` (20 stars) ships **no
licence**, which is no grant of rights; `woakin/growth-design-review` optimises
"Net Persuasion", which is conversion tuning and the wrong instrument entirely
for an app two people use to run their livelihoods. The one chosen is
audit-first and explicitly ranks accessibility and trust ABOVE psychological
technique, with stated bright lines against manipulation.

Upstream ships no YAML frontmatter, so it could not register. A frontmatter
block was added locally and nothing below it was touched; the block says so.

---

## What is being audited

A week of unpushed work sits on top of `18bc4f7`: 61 modified or new files, and
the largest single artefact is `src/App.jsx` at roughly 6,000 lines. Product
photos, receipts, invoices, sale editing, real feedback, the ring, a six-finding
Analytics audit and a per-business deep analysis page all landed in that week
and **none of it has been reviewed as a whole.** Every pass so far has been a
pass over one screen or one concern.

That is the actual argument for this audit: the parts were each measured, the
whole never was.

---

## Layer 1: UI / UX

Measured first, across **nine screens in one pass**: home, the four business
tabs, the deep analysis page, analytics, settings, account. That is the point of
this layer. Every previous audit in this project measured one screen, and the
two findings that cost the most (four photo columns, four shadow recipes) were
only visible ACROSS screens.

`scratchpad/census.mjs` walks all nine and aggregates left edges, type steps,
surfaces, radii, tap targets, accessible names and section rhythm.

### What is clean, and it is worth saying

- **The alignment system holds.** 24 (gutter, x29), 40 (text on a surface, x28),
  72 (after an icon, x36), 100 (the photo column, x52), used heavily and spread
  across most screens. Four lines, doing what they were designed to do.
- **Every tap target is 44px or more.** Not one exception in nine screens.
- **Every control has an accessible name.** Not one unnamed button or input.
- **Radii are 0, 12 and 16 only** in the census, against a scale of
  12/16/22/99/50%. The missing ones are sheets and pills, which were not open.
- Weights are 400/500/600/700 and nothing else.

### 1. Home has the rhythm defect Analytics was fixed for, and never got the fix

```
 77h  Good evening, Arrey
 gap 8
162h  PROFIT · SEPTEMBER
 gap 16
 87h  Low Stock on 4 items
 gap 14
 36h  My Businesses
```

**8, then 16, then 14.** Three gaps doing one job, none of them chosen, and
**16 against 14 is a two-pixel near-miss** -- the exact class this project spent
a whole pass removing, described in its own notes as "visibly wrong while being
too small to name".

This is finding 1 of the Analytics audit, unfixed, on **the screen people open
twenty times a day**. Analytics got 28/12 and a `sectionHead` that owns its
break; Home was never re-measured afterwards.

### 2. There is a fifth column, at 92, on Settings and Account

The app has three deliberate columns after a mark: 72 for a 20px icon slot, 100
for the 48px photo. Settings and Account put text on **92**:

```jsx
<div style={{ ...S.avatar, width: 40, height: 40 }}>
```

24 gutter + 16 padding + **40** + 12 = 92. A third mark size, landing on the
precise number the photo-column pass removed from four other places. It was
missed because that pass looked at lists that lead with a picture, and this is a
settings row that leads with an avatar.

92 against 100 is eight pixels, on screens a person moves between.

### 3. The deep analysis page opens on a 20px gap

```
 44h  Sabi Crochet
 gap 20        <- off the system
150h  PROFIT · LAST 3 MONTHS
 gap 28
 69h  WORTH LOOKING AT
```

Built this week, and 20 is neither 12 nor 28. Everything below it is correct,
which is what makes the first gap conspicuous.

### 4. Two more rhythm irregularities

- **biz/overview** runs `12 12 28 12 12 12 16 12`. The lone **16** is off a
  system of 12-within and 28-between.
- **Settings and Account are uniformly `16 16 16 16 16`.** Not wrong, but there
  is no two-tier rhythm at all: every break is the same size, so nothing groups.
  That is the monotony finding from the Analytics audit, on two more screens.

### 5. A 10px type step, created by a rule meant for a 36px figure

Sizes app-wide: 26, 24, 20, 18, 16, 14, 12, 11, **10**, against a scale of
11/12/14/16/20/26/36.

Three of those are exempt by existing rules: 24 is an emoji (a glyph, not a
step) and 18 is `DisplayAmount` demoting its currency unit to 0.5em of 36.

**10 is the ring's centre**, demoting its unit to 0.5em of a 20px figure. The
demotion rule was written for a display figure and reads well there; applied to
a 20px figure it produces text below the scale's own floor, on the 720p Android
screens this app is actually read on. This was introduced deliberately to stop
the total printing over its own band, so the fix is not to revert it.

### Two things that looked like findings and are not

Recorded because the discipline here is to say when a detector cried wolf.

- **A 48px left edge on biz/invoices.** It is `emptyState`, which is
  `padding: "40px 24px"` and `textAlign: center`. The 48 is the BOX edge of
  centred text, not a text column: the probe reads `getBoundingClientRect` on a
  block-level `<p>`, which is full width regardless of where the glyphs sit.
- **The low-stock banner at `pad13/15`, flat, with no hairline.** That is the
  documented bordered-card exception: a visible border eats padding, so 15
  horizontal lands its text on the same line as a borderless card's 16, and the
  border replaces the hairline.

### A limit of the census worth knowing

The probe skips any element with children, so `DisplayAmount` -- which wraps a
`<span>` for the demoted unit inside its heading -- is not counted. **The 36px
and 20px display figures are therefore missing from the type census above.**
They exist; the tool cannot see them. Anyone re-running this should not read
their absence as a finding.

### The judgement pass

Run with `design-review` over all nine screens rendered at 390x820. The census
above asks "is it on the system"; this asks "was it decided".

**The headline: the craft work has been applied to Home and Analytics, and the
business tabs never got it.** Every audit in this project so far looked at Home,
the sign-in screens, or Analytics. Inventory and Sales have been carrying the
exact patterns those passes removed, for a week, unlooked at.

#### BLOCKER 1 - the inventory row is the parking lot section B removed

Eight elements per row, and three of them coloured:

```
Crochet Beanie   [Low]            +FCFA 3,500/unit     <- green
Avg cost: FCFA 2,500 · Asking: FCFA 6,000        58%   <- green pill
13 in stock · 11 sold                              X   <- danger red
[ + Restock ]
```

This file already records the verdict on this exact shape, written about the
Home list: "six devices per row all saying look here". Home was reduced to a
rule and a wash. **Inventory still has eight, on every row, eight rows deep.**

Three specific costs:

- **Green means nothing here.** `+FCFA 3,500/unit` is green AND `58%` is a green
  pill: two marks, same fact, same colour, on every row. The app's own rule is
  "colour means act on this: amber and red where something needs doing, muted
  otherwise". Green on all eight rows is decoration, and it is the loudest thing
  on the screen.
- **A destructive control at full danger red, permanently visible, on every
  row.** Deleting an item is the most dangerous thing on this screen and it sits
  one mis-tap from the data, at the same weight as the data. The Danger zone on
  Account was put behind a disclosure for exactly this reason: "one deliberate
  tap before either is on screen at all". Inventory does the opposite.
- **Three different "add" affordances on one screen**: a dashed `+ Add New
  Item`, a filled `+ Restock` in every row, and the solid `+ Sale` pill floating
  over it. Three plus-buttons, three treatments.

#### BLOCKER 2 - the Sales tab states its own hero twice

The brown hero reads `Profit FCFA 45,500 · Revenue FCFA 66,500 · Margin 68%`.
Two hundred pixels below it, a green `infoCard` reads `ALL TIME · Revenue:
FCFA 66,500 · Profit: FCFA 45,500`.

Same two numbers, same period, same screen, one scroll apart. This is finding 3
of the Analytics audit ("the same figure twice") on a tab that audit never
opened. It is also the only green SURFACE in the app, so the duplicate is drawn
more loudly than the original.

#### BLOCKER 3 - two controls for recording a sale, both on screen at once

`SalesTab` opens with an unconditional dashed `+ Record New Sale`
(`S.dashedBtn`), and the floating `+ Sale` button is over it. The same action,
twice, visible simultaneously.

The floating button exists BECAUSE recording a sale used to be four taps; that
work is recorded here as "Record a sale is one tap". The dashed button is what
it replaced, and it was never removed.

#### SHOULD-FIX 4 - raw ISO dates, next to the formatter that would fix them

The Sales list reads `Yesterday`, then `2026-09-14`, then `2026-09-12`.

```js
const dateLabel = (occurredAt) => { ...; return d; };   // d is "2026-09-14"
const shortDate = (iso) => ...                          // "14 Sep", directly below
```

`shortDate` was written this week, sits six lines under `dateLabel`, and
`dateLabel` still falls through to the raw ISO string. A date in that form is a
developer artefact on a screen read by a shopkeeper, and there are now two date
formatters where there should be one.

#### SHOULD-FIX 5 - the floating button covers list content

On Home it sits on the last business's status note; on Inventory it covers the
third row's figures outright. The ladder in this file positions it against the
NAV (90px up, 12px clear) but never against the CONTENT it floats over. A list
long enough to scroll always has a row underneath it.

#### SHOULD-FIX 6 - the loudest colour in Settings is on the least important control

The five feedback rating faces are large saturated emoji (a purple star-eyed
face among them) on a screen that is otherwise muted terracotta on cream. They
are the first thing the eye lands on, and they rank the app rather than doing
anything for the owner.

#### NOTE 7 - "Version v1.5.9"

A redundant `v`, and stale: `v1.5.9` is what `main` reports, and this branch has
a week of features on top of it. Two of the three sentences a user reads about
what they are running are wrong.

### Verdict: NOT APPROVED

Three blockers, and the pattern behind all three is the same and worth naming
plainly: **this app has been audited screen by screen, and the screens that were
never picked have drifted.** Home and Analytics are genuinely crafted now. The
business tabs, which are where an owner actually spends their day, still carry
the parking-lot row, the duplicated figure and the superseded control that every
previous pass removed from somewhere else.

That is not a new class of defect. It is the same defect, in the places nobody
looked.

### The deslop pass

Run with `design-deslop`, adapted: this is an audit, so the lens was run and the
findings recorded rather than fixes applied.

**Most of what this skill looks for is not here**, and that is the honest
headline. The tells it hunts are a defaulted typeface, size-only hierarchy,
several competing accents, `transition: all`, missing interaction states,
off-grid spacing, hand-rolled inaccessible controls. This app has one family
chosen after three passes, a documented type scale with weight and colour tiers,
one accent with a separate token for when it is read rather than filled,
tabular numerals, four motion durations and a reduced-motion block, press
feedback in CSS rather than eighty handlers, and a census that found **no
unnamed control and no tap target under 44px** on nine screens.

Four things did come out of it.

#### 1. The depth strategy is "surface + hairline". Measured, the surface half does nothing.

```
                       card vs page       border vs card
light   #FFFFFF / #FAF8F4   1.061:1        #E0D6C8   1.436:1
dark    #2C1810 / #1A0E0A   1.121:1        #3D271D   1.210:1
```

In light mode the tonal step between a card and the page it sits on is **six
per cent** -- essentially invisible -- while its outline is seven times that
contrast. So every one of the 25 cards in the census is defined **entirely by
its line**, which is the deslop tell "structure drawn with borders instead of
space", arrived at from the opposite direction: not by adding borders, but by
choosing a surface step too small to be seen.

This is not slop, because section C explicitly chose "surface + a hairline". It
is a decision that is not being delivered: the strategy names two devices and
only one is working.

#### 2. `--border-color` is a solid hex

`#E0D6C8` light, `#3D271D` dark. Both this skill and the guidance section C was
written from say the same thing: a border should be **low-opacity rgba**, so it
blends with whatever is behind it and disappears until looked for. A solid hex
cannot do that, which is why the same token reads at a different weight on the
page than it does on a card.

Every semantic colour in this app already has the alpha treatment for exactly
this reason, recorded as "in dark mode the tints are alpha over whatever is
behind them, so one value is correct on the page and on a card". The border is
the one that never got it.

#### 3. Settings and Account are the monotone tell

Five outlined cards, identical radius, identical padding, identical 16px gaps,
one after another. The census said `16 16 16 16 16`; this is what that looks
like. Nothing groups, because every break is the same size.

A settings list is allowed to be a list, so this is not a blocker. But it is the
same finding as the Analytics monotony one, which was worth a whole pass there.

#### 4. `emptyState` pads 24 where every card pads 16

```js
emptyState: { padding: "40px 24px", textAlign: "center" },
```

This is what produced the 48px left edge the census flagged and the alignment
section then cleared as centred-text noise. It is not an alignment defect, but
it IS a spacing one: 24 is off a system where every other surface spends 16.

### A harness miss, recorded rather than buried

The nine-screen shooter's ninth step clicked the section TITLE "ACCOUNT" rather
than the profile row, so `s9-lt-9-account.png` is a second photograph of
Settings. **The Account screen was not captured and is not covered by the
judgement or deslop passes.** The click helper returns `MISS` and the shooter
discarded it, which is the failure mode this project already has written down:
a step that silently matched nothing is indistinguishable from one that worked.

### Layer 1: closed

Census, judgement pass and deslop pass complete over eight of nine screens.
Verdict stands at **NOT APPROVED** on the three blockers above, all of them on
the business tabs, all of them patterns this project removed from somewhere
else and never came back for.

Outstanding within this layer: Account (harness miss) and a `dataviz` read of
the three charts.

## Layer 2: Security

Run with `owasp-security` as the lens and verified against the artefacts rather
than the source where that was possible: the built bundle, `npm audit`, the five
Edge Functions, and the RLS in the migrations.

The threat model that matters here: a client-side PWA holding a business's books,
a Postgres with RLS as the only authorization boundary, four public HTTP
functions, and a publishable key that is in the bundle **by design**.

### Clean, and each of these was checked rather than assumed

- **No secret in the shipped bundle.** The inlined key is `sb_publishable_...`,
  which is the correct type and meant to be public. No JWT anywhere in `dist/`,
  and the string `service_role` appears nowhere in it.
- **`.env.local` is gitignored AND untracked.** Both checked; either alone is
  not enough.
- **`delete-account` verifies its caller.** Reads the bearer token, calls
  `auth.getUser()`, acts as that user. The service key is used only after.
- **`send-email` is HMAC-verified, constant-time, with a five-minute replay
  window.** This endpoint sends as a DKIM-passing BizTrack address, so an open
  one would be a phishing gift; it is not open.
- **`unsubscribe` is sound despite being the riskiest shape** (no JWT, service
  key). It anchors a UUID regex on the token, allowlists the category, delegates
  the lookup to an RPC, and the capability it grants is only "stop sending me
  email". Brute force is a 2^122 space.
- **Every HTML interpolation in every email goes through `esc()` /
  `escapeHtml()`.** No `innerHTML` and no `dangerouslySetInnerHTML` anywhere in
  `src/`.
- **Invoices RLS covers all four verbs** through `is_business_member()`, and
  UPDATE carries both `using` and `with check` -- the distinction that stops
  someone rewriting a row into another business.
- **Feedback RLS has no select, update or delete policy at all**, its insert
  check prevents filing under another user's id, and it bounds message length.

### FINDING 1 - feedback spam became an email flood, and the policy comment predates it

`20260917000200_feedback.sql` accepts inserts from `anon`, and says why:

> The spam surface is real and accepted ... the volume at this product's scale
> is small enough to **clear by hand**.

That was true when it was written. It stopped being true two sessions later,
when `notify` gained phase 3 and began **emailing every unnotified feedback
row** to `hello@biztrack.store` through Brevo.

So the cost of a junk row is no longer a row to delete. It is an outbound email
on a paid quota, from an endpoint reachable by anyone who reads the publishable
key out of the bundle, which is exactly what the bundle is for. `notify` bounds
each run with `.limit(BATCH)`, but `biztrack-drain` fires every fifteen minutes,
so the bound is per-run and not in aggregate.

Two costs, neither of them data: **Brevo spend, and sending reputation** on the
domain that also carries password resets and sign-in codes.

**This is the pattern this project keeps rediscovering**: a statement that was
accurate when written and was made false by something added later, three
directories away, with nothing connecting them.

### FINDING 2 - a comment claims constant-time comparison; the code is not

```ts
// notify/index.ts
// Compared in full so a wrong secret costs the same as a missing one.
if (!NOTIFY_SECRET || provided !== NOTIFY_SECRET) {
```

`!==` on strings short-circuits, both on length and on the first differing byte.
The comment asserts a property the line does not have. `analytics-forward` has
the same comparison and **shares the same secret**.

Three directories away, `send-email` does it properly:

```ts
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
```

Exploitability over the internet is poor: network jitter swamps the signal and
the secret is high-entropy and in Vault. The finding is not the timing channel,
it is that **one function knows how and two do not**, and that a comment is
vouching for something untrue.

### FINDING 3 - eight advisories, all build-time, two of them pointed at this laptop

```
high      vite 8.0.0-8.0.15    launch-editor NTLMv2 hash disclosure via UNC paths (Windows)
high      vite 8.0.0-8.0.15    server.fs.deny bypass on Windows alternate paths
high      brace-expansion, browserslist, fast-uri, nanoid, postcss
moderate  baseline-browser-mapping
low       @babel/core
```

**None of these reaches a user.** Nothing in the list ships to a browser; the
runtime dependencies are clean.

The two `vite` ones are worth separating out anyway, because they are not
theoretical here: both are **Windows dev-server** issues, this is a Windows
machine, and a `vite preview` server has been running throughout this work. The
exposure is to the developer's machine, not to anyone's books. `npm audit fix`
is available.

### A methodology correction, recorded so the check is not trusted blindly

The first secret scan looked for JWTs (`eyJ...`) and reported the bundle clean.
That was the right answer for the wrong reason: Supabase's current publishable
keys are `sb_publishable_...` and are **not JWTs**, so the scan would have
reported clean whatever was in there. It was re-run against the actual key
material from `.env.local`. **A scan that returns clean for the wrong reason is
worse than no scan**, because it is believed.

### Verifying what layer 2 had only read

No Docker and no `psql` on this machine, so `supabase/tests/run.sh` cannot run.
Two things were verifiable anyway, and both were done.

#### A write probe against the live project, which proves more than a read can

An anonymous insert refused by RLS returns **42501**: the row was rejected
before the foreign key was even evaluated. With RLS off the same request reaches
the FK and returns 23503 instead, so the two states are distinguishable without
writing a single row. A READ probe cannot tell them apart -- an empty table and a
protected one both return `[]`.

```
businesses           401  42501   RLS refused
business_members     401  42501   RLS refused
items                401  42501   RLS refused
sales                401  42501   RLS refused
stock_movements      401  42501   RLS refused
profiles             401  42501   RLS refused
notification_queue   401  42501   RLS refused
analytics_events     401  42501   RLS refused
invoices             404  PGRST205   table does not exist
feedback             404  PGRST205   table does not exist
```

**Eight of eight live tables are protected, verified from outside.** Nothing was
written: every payload was chosen to be refused, and `feedback` -- the one table
that accepts anonymous inserts by design -- was probed with a row claiming
another user's id, which its own check must reject.

**And the migration status is now evidence rather than a note.** This audit has
been repeating "five migrations unapplied" from the session log. `PGRST205` on
both new tables confirms it against the live project.

#### A static audit of all 61 policies

```
policies with no explicit `to` clause (defaulting to PUBLIC)   none
policies reachable by anon        1   public.feedback insert   (the documented one)
UPDATE or ALL policies missing `with check`                    none
every table with RLS enabled                                   10 of 10
SECURITY DEFINER functions pinning search_path                 14 of 14
```

The last line is the one worth dwelling on. A `SECURITY DEFINER` function
without a pinned `search_path` is a standard Postgres privilege-escalation
route: the caller controls resolution and can shadow a table the function
trusts. **All fourteen pin it**, including `is_business_member`, which is the
function the entire tenancy model rests on.

Coverage spans all ten tables plus four policies on `storage.objects` for the
photo bucket.

### Two methodology failures in this layer, both the same shape

Recorded because the conclusions rested on them, and because one of them is the
reason to distrust the other.

1. **The first secret scan searched for JWTs** and reported the bundle clean.
   Supabase's current publishable keys are not JWTs, so it would have reported
   clean regardless of what was in there.
2. **The first policy audit matched 5 of 35 policies**, because its regex
   assumed a single-line `create policy ... on public.X for Y to Z` shape and
   most of them are multi-line, some target `storage.objects`, and some use
   `for all`. On that basis it concluded there was one UPDATE policy and one
   anon policy. Re-parsed properly: **61 policies**, and the conclusions happen
   to hold -- but they were unfounded when first stated.

**A check that reports clean for the wrong reason is worse than no check**,
because it gets believed and it stops anyone looking again. Both were caught by
asking the same question twice: how many things should this have found?

### Still genuinely unverified

The **invoices and feedback policies have never been executed.** Static analysis
says they are well-formed and name the right roles; it cannot show that
`is_business_member()` actually returns false for a non-member at runtime, or
that the feedback check really refuses an impersonated `user_id`. The live probe
could not reach either, because the tables are not there.

That needs `supabase/tests/run.sh` against a local Postgres, or
`supabase/rls-check.sql` against the live project once the migrations land. The
project's own standing rule already says to run the latter after any schema
change, and it is now the single most load-bearing unrun check in the repo.

## Layer 3: Legal

Not blocked after all. The plugins are cloned at
`C:/Users/EAE/claude-plugins/claude-for-legal`, so their procedures were read
from disk and followed directly; `/plugin install` buys discoverability, not
capability.

Two were used. `privacy-legal/policy-monitor` in its direct-query mode, which
diffs **actual practice against the policy on data categories, purposes, third
parties, retention and rights**; and `product-legal/marketing-claims-review`,
whose step 4 is "cross-check against product reality -- does it actually do
this?".

### Verified, and each of these was checked against the code

- **Every third party the code reaches is named in the policy.** Code touches
  Supabase, Brevo, PostHog and Google; the policy names Supabase, Brevo,
  PostHog and Google. **No undisclosed processor.**
- **"nothing about PostHog is placed on your phone" -- TRUE.** No SDK, no
  script, no cookie. The only occurrence of the string "PostHog" in the built
  bundle is **the privacy policy sentence itself**, because `documents.js` ships
  so the policy renders offline. The grep hit is the disclosure, not the
  tracker.
- **"it goes from our servers to theirs" -- TRUE.** `analytics-forward` is a
  scheduled Edge Function; nothing client-side talks to PostHog.
- **The allowlist is real and enforced twice**: `ALLOWED_PROPS` client-side,
  `analytics_props_guard` in the database.
- **`ENTITY` is filled in.** Real name, real address, `hello@biztrack.store`,
  real WhatsApp number. **CLAUDE.md's own launch-blocker list is stale on this**
  and still says it is placeholders.
- `LEGAL_VERSION` is `2026-09-17` and PostHog defaults to the EU region.

### LEGAL-1 (REQUIRED) - feedback is collected and the policy never mentions it

The word "feedback" appears **zero times** in `src/legal/documents.js`.

What the feature actually does: takes a rating and **free text the user writes**,
plus app version, plus their `user_id` when signed in, stores it server-side,
and -- since `notify` gained phase 3 -- **emails it onward through Brevo**.
`anon` can insert, so a user with no account can send it.

Nothing in the policy describes this collection: not the category, not the
purpose, not the retention, not the onward disclosure.

Beside it sits: *"Without an account, your records stay on your device and are
not sent anywhere."* That sentence is not false, because feedback is not
"records" -- but it is the sentence a local-only user reads immediately before
typing a message that leaves their phone.

`LEGAL_VERSION` was bumped to `2026-09-17` for product photos and customer
contacts. **Feedback shipped the same day and did not make it into the bump.**

### LEGAL-2 (REQUIRED) - an absolute the crash path cannot keep

> "They receive the same usage events described above, **never** your item
> names, prices, sales figures or customers"

`message` is on the allowlist deliberately, because crash reports are the point.
It is **free text from arbitrary runtime errors**, and the only filter is:

```js
.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
.replace(/\b\d{6,}\b/g, "[number]")
```

Emails, and numbers of **six digits or more**. XAF prices in this app are
routinely four and five digits -- 2,500 / 9,500 / 45,500 -- and pass straight
through. The app also throws `${table}: ${error.message}`, and a Postgres
constraint message can name the value that violated it.

The policy says "never". The code says "we filter what we thought of". The gap
does not need a demonstrated leak to be a finding: an absolute is being stated
about a best-effort mechanism, and the field is forwarded to a third party.

Three ways out, and the third is cleanest: soften the wording; raise the scrub;
or **stop forwarding `message` to PostHog altogether** -- crash detail is
arguably not a "usage event", which is precisely what the sentence says PostHog
receives. That keeps crash text in the database the 90-day rule already covers.

### LEGAL-3 (ADVISABLE) - the policy never says usage events are attributed to you

It describes *what* is recorded -- "which screens you open, which features you
use" -- and never says each event carries your account id, nor that the id is
exported to PostHog as `distinct_id`:

```ts
distinct_id: r.user_id ?? `anon:${r.session_id}`,
```

The comment beside it reasons that a random UUID "carries no personal
information on its own", which is true in isolation and beside the point: it is
**the same id as in our own database**, so it is pseudonymous rather than
anonymous, and PostHog's entire model is the per-person journey.

Someone reading "which screens you open" would reasonably take that as aggregate
statistics. The policy is not wrong; it is silent on a material fact.

### LEGAL-4 (note) - the blocker list disagrees with the code

CLAUDE.md still lists "`ENTITY` in `src/legal/documents.js` is placeholders" as
a thing standing between this and paying users. It was filled in at some point
and the list was never updated, which is the same drift this audit keeps
finding, pointed at the project's own notes.

### What no skill in this layer can do

These plugins know FTC, GDPR and CCPA. **They do not know Cameroonian law.** The
standing item -- a lawyer on governing law, the liability cap, VAT, and whether
cross-border transfer needs more than the consent collected at signup -- is
untouched by this layer and remains a launch blocker. `marketing-claims-review`
researches "the jurisdiction" and will reach for US advertising law unless told
otherwise.

Both REQUIRED findings are wording changes to `documents.js` plus, for LEGAL-2,
one optional line in `analytics-forward`. Neither is a large job. Both are the
same failure this project has logged four times: **a sentence that was true when
written and was made false, or left incomplete, by something shipped later.**

## Layer 4: User psychology

Run with `ux-psychology`. The skill's own caveat is the right frame for this
layer: *"NOT a replacement for user research -- real user data always beats
theory."* This project has two observed behaviours from its only two users, and
neither has ever been explained. That is what this layer is for.

### Behaviour 1: she wipes the entire app when new stock arrives

The strongest finding in the whole audit, and it is a **mental model mismatch**
(Sensemaking).

**Her model is a CYCLE.** Buy a batch, sell the batch, that batch is finished,
start the next one. That is how trading at this scale actually works.

**The app's model is a PERPETUAL LEDGER.** Everything accumulates forever, by
design: stock is a running sum of movements, profit is all-time or this-month,
and restocking deliberately averages the new price into the old.

When a person's model and the system's model disagree, the person forces the
system into their model with whatever tool is available. **The only tool this
app offers for "begin a new cycle" is Erase this phone.**

Three mechanisms make it worse, and each is checkable:

- **`archivedAt` exists in the schema and has ZERO references in the UI.** The
  app already has the concept of retiring an item and never exposed it.
- **The inventory list filters only `deletedAt`.** Every sold-out product stays
  in the list forever, so after a few cycles her Inventory tab is a graveyard
  she has to read past to find the batch she is actually selling. That is a
  direct **recognition-over-recall** failure: the current batch is not
  recognisable among the dead ones, so she has to remember which is which.
- **The wipe produces exactly the state she wants.** A clean month on Home, an
  inventory list containing only the new stock. The destructive path is the one
  that yields the desired result, and nothing else does.

So this is not a user doing something odd. **It is the only path the product
left open**, and the product rewards it.

The stock-cycle marker already scoped in CLAUDE.md is the right shape of answer:
a date the owner declares, with everything after it counted separately, and
nothing destroyed. It gives her the clean slate she is reaching for, at zero
cost to her history. An archive UI for sold-out items is the smaller half of the
same fix.

### Behaviour 2: he exports his books to an AI to understand his own business

**Satisficing**, and the dashboard prescription names it exactly: *"Highlight
the single most important insight."*

The app enumerated. It ranked businesses, ranked products, and stopped -- the
finding the Analytics audit reached independently and called "ranking has no
climax". A ranked list answers *how much*. He needed *so what*. So he took the
data somewhere that would synthesise, and got back a seven-page review naming
12.8M FCFA of dead stock.

The psychology explains why the lead-with-one-finding work was the right
response, and it also sets the bar: **the thing he already gets by pasting into
an AI is the standard the in-app version has to beat**, or he will keep pasting.

### Where the app already gets this right

- **Ethics: the app passes every bright line in this skill.** No fake scarcity,
  no confirmshaming, no hidden costs, no dark defaults (analytics consent is
  opt-in and the receipt toggle is off), and no roach motel -- an expired plan
  goes read-only with everything still visible and exportable, which is the
  opposite of the usual pattern. That is notable rather than neutral: a
  trial-to-paid product is exactly where most teams reach for loss-framing.
- **Defaults reduce decisions rather than exploit them.** The receipt toggle is
  off because most stall sales do not get one; the period control opens on three
  months because that is the window the page is about.
- **Error prevention on the thing that matters.** Overselling asks rather than
  refuses, which respects autonomy while blocking the slip.

### PSY-1 - the low-stock warning demands recall in the one place it should not

The same information appears twice, treated differently:

- **Home** -- `"Tote Bag, Baby Booties, Power Bank, Screen Replacement"`. Four
  names in a comma list. No photo, no quantity, no business name. To act on it
  you must remember which shop each product belongs to.
- **The business Overview tab** -- the same products with a picture and a count
  each.

Home is the screen with the most context missing and the least support for
recognising it. The version with photos is on the screen you only reach once you
already know which business you are looking at.

### PSY-2 - adding a second business silently relocates the whole Analytics screen

**Spatial memory**: *"Consistent layout so returning users find things
instantly. Don't move things."*

With one business the Analytics tab IS that business's deep page. Add a second
and it becomes a portfolio overview, with everything that was on the tab now one
tap further away.

This is a real cost of a decision made deliberately earlier in this session, and
it is worth stating against my own work: the single-business rule is right --
an overview of one row is a tollbooth -- but **the transition is unannounced**.
A user who adds a second shop finds their analytics screen replaced without
having asked for it. Worth a line of copy at minimum.

### PSY-3 - the destructive control sits where the eye already is

Layer 1 flagged the red delete on every inventory row as a craft problem. The
psychological reading is sharper: it is placed adjacent to the controls a person
taps most often, at the highest-salience colour on the screen, on a row that
already carries eight elements. That combination -- high load, high salience,
destructive, adjacent to routine targets -- is the standard recipe for a slip,
and the cost is a product line vanishing from someone's books.

### What this layer cannot settle, and it is one message

Everything about behaviour 1 above is a **theory that fits the evidence**. It
predicts the batch model, the graveyard list, and the timing. It has not been
checked with the person doing it.

**Ask her to walk through what she does when new stock arrives, and why** --
not "do you reset the app", which invites a yes. If the archive theory is right
the fix is small and already scoped. If it is wrong, building the marker would
be building on a guess, and this project has a rule about that.


---

# Fixes

## Layer 1: applied

### The three blockers

**BLOCKER 3 and BLOCKER 2, both on the Sales tab, both removals.** The dashed
`+ Record New Sale` is gone -- it is what the floating Sale button REPLACED when
recording a sale went from four taps to one, and it survived the change. The
green `All Time` card is gone -- the hero two hundred pixels above already
stated both figures for the same period, and being the app's only green SURFACE
it was drawn louder than the original.

**BLOCKER 1, the inventory row**, rebuilt on the order the Home list settled:

```
was                                    now
[photo] Name [Low]    +FCFA/unit       [photo] Name              13 left
        Avg cost · Asking       58%            FCFA 6,000 ·       [Low]
        13 in stock · 11 sold     X            cost FCFA 2,500 ·
        [ + Restock ]                          11 sold
                                               [ + Restock ]
8 elements, 3 coloured                 5 elements, 1 coloured and only
                                       when something needs doing
```

Three decisions inside that:

- **The figure leads, and it is stock on hand.** Inventory is the screen you
  open to manage stock, and it is the number the badge qualifies -- so the badge
  moved to sit with it rather than beside the name.
- **Green is gone.** It was on every row, so it discriminated nothing, against
  this app's own rule that colour means "act on this". The margin percentage and
  the profit-per-unit were also both DERIVED from the price and cost already on
  the line, which is what the two green marks were showing twice.
- **Delete left the row.** It sat at full danger red beside the figures, on
  every row, one mis-tap from the data. It is at the foot of the restock sheet
  now, behind a deliberate tap, exactly where `EditSaleModal` puts "Delete this
  sale" and for the same reason the Account danger zone is behind a disclosure.

### Rhythm: every screen in the app is now on one ratio

```
                 before                          after
home             8 16 14 0 0 0                   12 28 28 0 0 0
biz/overview     12 12 28 12 12 12 16 12         12 12 28 12 12 12 28 12
biz/analysis     20 28 28 12 ...                 12 28 28 12 ...
analytics        28 28 12 ... 16 12 12           28 28 12 ... 28 12 12
settings         16 16 16 16 16                  28 28 28 28 12
account          16 16 16 16 16                  28 28 28 28 12
```

**Nine screens, 12 within a group and 28 between, no exceptions.**

Home was the important one: `8 / 16 / 14`, three breaks doing one job with a
two-pixel near-miss in the middle, on the screen people open twenty times a day.
Every break now belongs to the block that starts.

**The same trap caught me three times in one pass**, and it is worth writing
down because it is not obvious: *a component with its own outer margin, nested
in a container that already has a gap, produces the SUM.* Giving `summaryCard` a
12px top margin for Home leaked 24 onto the deep analysis page; giving
`settingsSection` 28 produced 40. Both are fixed by the component clearing its
own margin when it is nested, or by subtracting the container's gap.

### Alignment: the fifth column is gone

The Settings/Account avatar was 40px, putting its text on **92** -- neither the
72 icon line nor the 100 photo column. It is `PHOTO.size` now, so an avatar is
treated as what it is, a picture of a person, and lands on the photo column.

`emptyState` also came down from 24px of horizontal padding to 16, which every
other surface spends. That moves the Invoices empty state from 48 to 40.

**App-wide left edges are now 24 / 40 / 72 / 100 and nothing else.**

### Smaller things

- **`dateLabel` fell through to a raw `2026-09-14`.** It calls `shortDate` now,
  which was written this week and sat six lines below it. `shortDate` also moved
  ABOVE `dateLabel`, because a `const` arrow referenced from a function declared
  earlier is the exact temporal-dead-zone shape this project already logged once.
- **"Version v1.5.9" said the v twice.** `VERSION` already carries it.

### One finding was WRONG, and the revert is the point

**SHOULD-FIX 5, "the floating button covers list content", is a false positive.**

Measured rather than re-read: scroll either list to the bottom and the last row
clears the button -- Home by 69px, Inventory by exactly **12px, which is the
app's own documented rung** ("the Sale button, 12px clear"). `.bt-has-fab`
already pads the scroller by 148px at every width.

What the screenshot showed was a row under the button MID-SCROLL, which is
inherent to a floating button and not a defect. A `screenWithFab` style had
already been added to "fix" it and was removed again -- it would have been a
dead entry duplicating a working CSS rule, which is precisely what the retouch
pass deleted four of.

### Not done in this layer, and why

- **`--border-color` is still a solid hex.** The finding stands, but the fix
  changes the edge of every surface in the app in both themes, so it wants a
  look rather than a blind swap.
- **The 10px type step** in the ring's centre is a deliberate fix for the total
  printing over its own band. It needs a decision, not a revert.
- **The feedback rating emoji** are still the loudest colour in Settings.
  Replacing them is a design question, not a spacing one.
- **The Account screen** was never captured by the harness, so it has still not
  been looked at.

154 tests, lint still 3 errors and 3 warnings.

## Layer 2: applied

### FINDING 1 - the email flood is capped where the comment always said it should be

`notify` phase 3 sent **one email per feedback row**. `.limit(BATCH)` bounded a
single run and nothing bounded the aggregate, because `biztrack-drain` fires
every fifteen minutes forever. Anyone who can read the publishable key out of
the bundle -- which is what the bundle is for -- could turn junk rows into
unbounded outbound mail on a paid Brevo quota, from the domain that also carries
password resets and sign-in codes.

It now sends **one digest per run whatever arrives**: the batch is rendered into
a single message, sent once, and marked together.

```
was   N rows  ->  N emails, forever, 96 runs a day
now   N rows  ->  1 email per run, capped by the schedule
```

Flooding the table is still possible and still costs only rows. **Flooding the
inbox, the quota and the sending reputation is not.**

The fix is deliberately in the Edge Function rather than in the policy, which is
where the migration's own comment always said a rate limit belonged. That
comment has also been corrected: it claimed the volume was "small enough to
clear by hand", which was true when written and was made false by this very
phase shipping two sessions later.

### FINDING 2 - one definition of the comparison, used by all three

`_shared/secret.ts` now holds `safeEqual` and `callerIsCron`. `notify` and
`analytics-forward` used `!==`, which short-circuits on length and on the first
differing byte; `notify` carried a comment asserting the opposite. `send-email`
had a correct local copy, which is now the shared one, so there is a single
definition rather than one right and two wrong.

`callerIsCron` also makes the unset-secret case explicit: **no secret configured
is a refusal, not a pass.** A function that authorises everyone because nobody
configured it is the worst of both.

Typechecked with a temporary `tsc`, and **the check was proved capable of
failing** before its clean result was believed: a deliberately broken copy of
`secret.ts` (second parameter retyped to `number`) reports `TS2339` and
`TS2345`. The real files report only the pre-existing Deno/DOM
`Uint8Array`/`BufferSource` mismatch in `send-email`, which predates this work.

### FINDING 3 - zero vulnerabilities

```
before   8 vulnerabilities (1 low, 1 moderate, 6 high)
after    found 0 vulnerabilities
```

`npm audit fix` took **vite 8.0.10 to 8.3.0**, which closes both Windows
dev-server advisories -- the NTLMv2 hash disclosure via UNC paths and the
`server.fs.deny` bypass -- that were live on this machine while a preview server
ran all week.

A minor-version bump of the build tool is not a free change, so it was verified
rather than assumed: **build passes, 154 tests pass, lint unchanged at 3 errors
and 3 warnings, and the full sweep is clean at 5 screens x 6 widths in both
themes.** Only `package-lock.json` moved; `package.json` is untouched, so every
bump was inside the ranges already declared.

### Still not done in this layer

**The invoices and feedback policies have still never been executed.** No Docker
and no `psql` here, and the tables do not exist on the live project. That check
is `supabase/tests/run.sh` locally, or `supabase/rls-check.sql` after the
migrations land, and it remains the most load-bearing unrun check in the repo.

Two of the three fixes above are also **inert until deployment**: `notify` and
`analytics-forward` have to be redeployed, and `send-email` too now that it
imports the shared module.

## Layer 3: applied

### LEGAL-1 - the undisclosed collection now has a section

**"When you write to us in the app"**, placed between the usage section and the
emails section, because it is a collection and it ends in an email. It says what
the box sends (the words, the rating, the app version, and your account if you
are signed in), where it goes (our database, then our inbox through Brevo),
what it is used for, and how to have a message deleted.

It also states the thing that made the omission matter: **this is the one thing
that leaves the device whether or not you have an account**, and why -- someone
using BizTrack without signing up is the person most likely to have something to
tell us.

### LEGAL-2 - the absolute was made TRUE rather than softened

The policy promised PostHog "never" receives item names, prices or sales
figures. `message` and `stack` are on the analytics allowlist deliberately,
because a crash report without them is useless, and they are free text from
arbitrary runtime errors. `scrubText` removes emails and numbers of six digits
or more; XAF prices here are four and five.

Rather than weaken the sentence, **the two free-text fields are now dropped
before anything is sent to PostHog**:

```ts
const FREE_TEXT = new Set(["message", "stack"]);
properties: { ...forwardable(r.props), ... }
```

PostHog still receives the event, the code location and the counts, which is
what "which parts of the app are used and which are breaking" actually needs.
Nothing is lost: **the full crash text stays in our own database** under the
90-day rule, which is the function's own stated position -- PostHog is a view
onto the data, not the system of record.

The policy now says exactly that, and it is a claim the code can keep.

### LEGAL-3 - the per-person identifier is disclosed

One sentence before the PostHog paragraph: events carry a random identifier for
the account, or for the session when there is no account, so a sequence of
screens reads as one journey; it is not a name or an email, but it is the same
one across visits. The PostHog paragraph then says they receive it.

### LEGAL_VERSION bumped to 2026-09-18, and the reasoning is in the file

This does not obviously fit the project's own rule, which reserves a bump for a
change to WHAT IS COLLECTED rather than to wording. **Nothing new is collected**
-- feedback was already collected, and PostHog now receives strictly less.

What changed is the disclosure, and a whole category was missing from it. Anyone
who agreed to the previous version agreed to a document that did not mention
it. **That is a change to the deal from their side**, which is what the rule
protects. It also costs nothing today: both real users are local-only and have
never consented to any version.

### Verified

The policy was opened in the running app rather than read in the source: all
thirteen sections render, the new one in its place between "Understanding how
the app is used" and "Emails we send", and all three new passages present.

`analytics-forward` typechecks clean. 154 tests, lint unchanged.

**The harness reported MISS twice before it worked**, and both were real: "About"
is a shut `Disclosure` card, so the policy row does not exist in the DOM until
it is opened, and the first fix then clicked that card TWICE, opening and
shutting it. A step that silently matches nothing looks exactly like one that
worked, which is why the helper reports it.

### Not fixed, and not fixable here

- **LEGAL-4**: CLAUDE.md's launch-blocker list still says `ENTITY` is
  placeholders. It is not. That is a note in the project's own file, corrected
  when that file is next touched.
- **The lawyer.** Governing law, the liability cap, VAT, and whether
  cross-border transfer needs more than the consent collected at signup. No
  skill in this layer knows Cameroonian law, and this remains a launch blocker.

---

## Layer 4: applied

The layer splits cleanly in two, and the split is the point. PSY-1, PSY-2 and
the graveyard list are **verified defects**: they are true whatever anyone's
reason for anything. The stock-cycle marker rests on a **theory about why one
person resets her app**, and that theory has still not been checked with her.
So three are fixed and the fourth is not, and the reason is not caution for its
own sake: this project has a rule about building on a guess, and the guess is
one message away from being settled.

### The graveyard, which needed no theory at all

The inventory list filtered `deletedAt` and nothing else, so everything an
owner had ever stocked stayed in it forever. That is a verified fact about the
code and it is bad for anybody: a shop three seasons in shows three seasons of
rows, and the ones with something on the shelf are scattered between them.

Sold-out items now sit in a shut group at the foot of the list. **Nothing is
destroyed, nothing is archived, and no record changes** -- it is a filter on a
list, reversible by one tap, with the count on the header so a shorter list is
never a surprise.

`archivedAt` stays unused, deliberately. It is in the schema with zero UI
references and the obvious move was to wire it up; the right move was not to.
An owner-declared state needs an owner to declare it, and nothing here needs
declaring, because the ledger already knows what has sold.

**Sold out is `qty === 0 AND something sold`, and all three exclusions matter:**

```
qty < 0      OVERSOLD. It carries a badge saying the books and the shelf
             disagree, and hiding the one row that needs correcting would be
             the worst thing this change could do.
sold === 0   a product just added and not yet stocked. Nothing has gone
             anywhere; the owner is mid-way through setting it up.
deletedAt    already filtered upstream.
```

Verified in a browser on books seeded with all three: the oversold row stays in
the main list **with its Oversold badge**, the never-stocked row stays, and the
two genuinely finished products are in the group, which opens and shuts with
`aria-expanded` following.

The header is a **card row**, not a section label with a chevron -- the
`Disclosure` mistake this project already recorded once. Same surface, radius,
padding and hairline as the rows it holds. Its glyph takes the 20px icon slot,
putting the label on **72**, which is correct rather than inconsistent with the
product rows on 100: those lead with a photo, which is content, and this leads
with an interface mark.

`InventoryRow` was lifted out so both groups draw from one definition. Two
copies of that markup is exactly the drift this project keeps recording: the
sale row was byte-identical in two places and had already lost `sale.note` from
one of them before anyone noticed.

### PSY-1, and the wrong number it was hiding

Home's banner was `{allLowStock.map((i) => i.name).join(", ")}`. Every other
surface that names a product shows its picture and its number; the one place
low stock is reported across ALL the shops, read standing at a stall, asked the
owner to recall which jacket, how many were left, and which shop it was in.

It is four rows now -- a 20px mark, the name, the quantity, and the shop's name
when there is more than one shop -- then a count. **A count and not an
ellipsis**, because it answers "is it worth going to look" before anyone goes.

Then the fix found a live defect that had nothing to do with recall:

```
before   Low Stock on 11 items     ... Winter Scarf, Wool Blanket, ...
after    Low Stock on 6 items
```

**Three places in this app decide what "low stock" means and this was the only
one that did not exclude an empty shelf.** `bizNote` says
`qty > 0 && qty <= threshold`; the Overview strip says the same; Home said only
`qty <= threshold`. So a SOLD OUT product counted as low stock, and so did an
OVERSOLD one, whose negative balance already has its own banner directly above.

It survived because the banner printed names and nothing else. "Winter Scarf"
reads fine; it was only when the row grew "0 left" and "-2 left" that eleven
turned out to be seven. **The display that demanded recall was also the display
that hid a wrong number**, which is the recognition argument arriving from the
other end.

The same rule was wrong a third time, one row further in: an inventory item
with nothing on the shelf was badged **Low**, a badge disagreeing with the
figure it qualifies. It reads **Out** now. That got louder rather than quieter
when the sold-out rows moved into their own group, which is why it is here.

### PSY-2 is a sentence, because the shape change is correct

With one business the Analytics tab IS that business's deep page. Add a second
and the same tab becomes a portfolio overview, and everything the owner had
been reading -- months of cover, capital on the shelf, pace per product --
moves behind a tap with nothing saying where it went.

The one-business rule is still right, so what was missing was the sentence:
*"Tap a shop for its full analysis: what sells, what earns, and what is sitting
on the shelf."* It announces the new shape and teaches the drill-down in one
line.

It sits INSIDE the heading's own block rather than beside it, so `tabInner`'s
12px gap does not land between a head and its own subtitle. Measured after:
head and sub both on **24**, 4px apart, with the 28 break above them.

### The near-miss the screenshots caught and no measurement asked about

The banner's rows carry a shop name, so two of the four wrap at 320 AND at 390.
With the mark centred, a glyph on a two-line row sits half a line below one on
a one-line row: **a column of four marks that do not line up**, arriving the
usual way, which is nobody deciding. Anchored to the top the glyph's centre is
1.3px off the first line's at every row height.

The Overview strip is the same row shape and was changed with it, so the two
cannot disagree later.

The sold-out header's sub-line was shortened for the same reason -- it wrapped
at 320, which put its glyph between two lines. The advice it carried ("Restock
to bring one back") is inside the section already: every row in it has its own
+ Restock.

### PSY-3 was already fixed in Layer 1

Delete moved off every inventory row into the restock sheet. Nothing to do.

### Still not done, and it is still one message

**The stock-cycle marker.** The position has not changed and is worth stating
once more plainly: if the archive theory is right the fix is small and already
scoped; if it is wrong, building it would be building on a guess. **Ask her to
walk through what she does when new stock arrives, and why** -- not "do you
reset the app", which invites a yes.

What did land helps either way. If she is reaching for a clean slate because
finished products pile up in her list, the group is that clean slate without
destroying anything. If she is not, nothing here was wasted, because the
graveyard was a defect on its own terms.
