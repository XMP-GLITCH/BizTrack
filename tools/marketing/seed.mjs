/**
 * The books behind every marketing screenshot, AND THIS FILE IS TRACKED.
 *
 * `scratchpad/seedMarket.mjs` and `scratchpad/demoscreens.mjs` were never
 * gitignored -- they were simply never committed, so they existed on one
 * machine and are now gone. CLAUDE.md tells every future session to "re-run
 * that script whenever the screens it photographs change", which has been an
 * instruction to run a file the repo does not contain.
 *
 * This is the data half, recovered by reading the shipped WebP screenshots
 * back (Chrome decodes them; a canvas re-encodes to PNG). It is data only:
 * the capture script assembles the books IN THE PAGE using the app's own
 * `makeBusiness`/`makeItem`/`makeSale`, because this project has recorded
 * three separate fixture faults that all came from a seed not going through
 * the real write path.
 *
 * WHAT THE PICTURES HAVE TO KEEP SAYING. These are not decoration; the
 * landing page's copy and alt text refer to them:
 *
 *   - Cooking Oil 1L is OVERSOLD at -2. The Analytics finding names it, and
 *     the hero's low-stock banner and "1 oversold" on Mami Joy depend on it.
 *   - Six products are low. The banner counts them.
 *   - Margins differ sharply by shop -- 23% groceries, 41% electronics, 65%
 *     repairs -- because that contrast is the product's whole argument.
 *
 * Any currency table below has to preserve all three, which is why cost is
 * DERIVED from a ratio rather than listed per currency: the same ratio gives
 * the same margin, so the story survives translation.
 */

/** Prices in each currency's MINOR unit, as the app stores money.
 *  XAF has no subunit, so 6500 is 6,500 francs; NGN has two, so 900000 is
 *  ₦9,000. These are plausible LOCAL retail prices, not FX conversions of the
 *  XAF figures -- converting 6,500 XAF gives about $11, which is not what a
 *  5kg bag of rice costs in Nairobi. */
export const PRICES = {
  //              XAF      NGN       GHS      KES       USD     EUR
  rice:    { XAF:  6500, NGN:  900000, GHS:  9500, KES: 130000, USD: 1100, EUR: 1000 },
  oil:     { XAF:  2200, NGN:  320000, GHS:  3500, KES:  45000, USD:  400, EUR:  360 },
  sugar:   { XAF:  1400, NGN:  200000, GHS:  2200, KES:  28000, USD:  250, EUR:  230 },
  milk:    { XAF:   900, NGN:  120000, GHS:  1400, KES:  18000, USD:  150, EUR:  140 },
  soap:    { XAF:   500, NGN:   70000, GHS:   800, KES:  10000, USD:   90, EUR:   80 },
  speaker: { XAF: 18000, NGN: 2800000, GHS: 30000, KES: 380000, USD: 3200, EUR: 2900 },
  bank:    { XAF: 12000, NGN: 1800000, GHS: 19000, KES: 240000, USD: 2100, EUR: 1900 },
  cable:   { XAF:  4500, NGN:  650000, GHS:  7000, KES:  90000, USD:  800, EUR:  720 },
  screen:  { XAF: 25000, NGN: 3500000, GHS: 38000, KES: 480000, USD: 4200, EUR: 3800 },
  battery: { XAF:  9000, NGN: 1200000, GHS: 13000, KES: 170000, USD: 1500, EUR: 1400 },
  puff:    { XAF:   300, NGN:   45000, GHS:   500, KES:   6000, USD:   50, EUR:   45 },
  jollof:  { XAF:  1500, NGN:  220000, GHS:  2400, KES:  30000, USD:  270, EUR:  250 },
};

/** cost / price. Fixed across currencies so every screen shows the same
 *  margin and the same story wherever it is read. */
export const COST_RATIO = {
  rice: 0.80, oil: 0.773, sugar: 0.75, milk: 0.72, soap: 0.70,
  speaker: 0.611, bank: 0.583, cable: 0.578,
  screen: 0.36, battery: 0.333,
  puff: 0.40, jollof: 0.42,
};

export const priceOf = (key, currency) => PRICES[key][currency] ?? PRICES[key].XAF;
export const costOf = (key, currency) => Math.round(priceOf(key, currency) * COST_RATIO[key]);

/**
 * `stocked` is what was put on the shelf and `sold` what left it, so the
 * quantity on hand is DERIVED the way the app derives it -- from the ledger,
 * not from a stored counter. Cooking Oil sells 12 against 10 stocked, which
 * is what puts it at -2.
 */
export const SHOPS = [
  {
    key: "b1", name: "Mami Joy Provisions", category: "Groceries & provisions",
    emoji: "\u{1F6D2}", color: "#C17F5A",
    items: [
      { key: "rice",  name: "Rice 5kg",       stocked: 40, sold: 26 },
      { key: "oil",   name: "Cooking Oil 1L", stocked: 10, sold: 12 },
      { key: "sugar", name: "Sugar 1kg",      stocked: 30, sold: 26 },
      { key: "milk",  name: "Milk Tin",       stocked: 28, sold: 24 },
      { key: "soap",  name: "Soap Bar",       stocked: 36, sold: 30 },
    ],
    invoices: [
      { customer: "Ndip Catering", lines: ["rice", "oil"], qty: [12, 8], paid: false, issued: "-10d", due: "+4d" },
      { customer: "Tabi Store",    lines: ["sugar", "soap"], qty: [20, 16], paid: true, issued: "-25d", method: "Cash" },
    ],
  },
  {
    key: "b2", name: "Bamenda Electronics", category: "Electronics",
    emoji: "\u{1F50C}", color: "#475D9E",
    items: [
      { key: "speaker", name: "Bluetooth Speaker", stocked: 14, sold: 6 },
      { key: "bank",    name: "Power Bank",        stocked: 22, sold: 18 },
      { key: "cable",   name: "Extension Cable",   stocked: 25, sold: 19 },
    ],
    invoices: [
      { customer: "Akwa Hotel",  lines: ["bank", "cable"], qty: [6, 10], paid: false, issued: "-6d", due: "+8d" },
      { customer: "Limbe Lodge", lines: ["speaker"], qty: [3], paid: true, issued: "-19d", method: "Mobile money" },
    ],
  },
  {
    key: "b3", name: "QuickFix Phones", category: "Phone & computer repair",
    emoji: "\u{1F4F1}", color: "#9E4789",
    items: [
      { key: "screen",  name: "Screen Replacement", stocked: 9,  sold: 7 },
      { key: "battery", name: "Battery Swap",       stocked: 12, sold: 9 },
    ],
    invoices: [
      { customer: "Buea Poly", lines: ["screen"], qty: [4], paid: false, issued: "-3d", due: "+11d" },
      { customer: "Ayuk Ojong", lines: ["battery"], qty: [2], paid: true, issued: "-14d", method: "Cash" },
    ],
  },
  {
    // Fourth on Home and fourth in the share bar. Its name appears in no
    // shipped screenshot -- Home cuts off above it -- so this one is chosen
    // rather than recovered.
    key: "b4", name: "Corner Kitchen", category: "Food",
    emoji: "\u{1F372}", color: "#5C8B6E",
    items: [
      { key: "puff",   name: "Puff Puff (6)", stocked: 300, sold: 265 },
      { key: "jollof", name: "Jollof Plate",  stocked: 120, sold: 104 },
    ],
    invoices: [
      { customer: "Sonara Staff", lines: ["jollof"], qty: [30], paid: false, issued: "-2d", due: "+5d" },
    ],
  },
];

/** The owner's name on the greeting. */
export const OWNER = "Ebong";

/** Seven trading weeks, so the weekly chart has something to read across.
 *  Two weeks made it two 100px slabs, which is the shape `maxBarSize` exists
 *  because of. Sales are spread across this window with a gentle upward
 *  drift and a dip in the last week, matching the shipped chart. */
export const WEEKS = 7;
export const WEEK_WEIGHTS = [0.09, 0.12, 0.14, 0.15, 0.16, 0.19, 0.15];
