/**
 * Money.
 *
 * Every amount is stored as an INTEGER in the currency's minor unit, never as a
 * float. XAF has no subunit, so 1 500 XAF is stored as 1500; USD has two, so
 * $15.00 is stored as 1500. Floats accumulate rounding error across the sums we
 * do on every screen (revenue, COGS, profit), and money that is off by a franc
 * destroys trust in a bookkeeping app faster than any crash.
 *
 * Amounts are only meaningful alongside a currency, which is why currency is
 * stored per business rather than as one global setting.
 */

export const CURRENCIES = ["XAF", "NGN", "GHS", "KES", "USD", "EUR"];
export const DEFAULT_CURRENCY = "XAF";

const EXPONENT = { XAF: 0, NGN: 2, GHS: 2, KES: 2, USD: 2, EUR: 2 };

export const normalizeCurrency = (currency) =>
  CURRENCIES.includes(currency) ? currency : DEFAULT_CURRENCY;

export const exponentFor = (currency) => EXPONENT[normalizeCurrency(currency)];

const scaleFor = (currency) => 10 ** exponentFor(currency);

/** What the user typed -> what we store. */
export function toMinor(major, currency) {
  const n = Number(major);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * scaleFor(currency));
}

/** What we store -> a number safe to show in an input. */
export function toMajor(minor, currency) {
  const n = Number(minor);
  if (!Number.isFinite(n)) return 0;
  return n / scaleFor(currency);
}

export function formatMoney(minor, currency) {
  const cur = normalizeCurrency(currency);
  const digits = exponentFor(cur);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: cur,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(toMajor(minor, cur));
}

/** Integer percentage, guarding the divide-by-zero that produced NaN% badges. */
export function marginPercent(revenue, cost) {
  const r = Number(revenue) || 0;
  if (r === 0) return 0;
  return Math.round(((r - (Number(cost) || 0)) / r) * 100);
}
