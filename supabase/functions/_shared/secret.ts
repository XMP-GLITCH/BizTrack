/**
 * Comparing a shared secret without leaking it through timing.
 *
 * `a !== b` on strings short-circuits twice: on a length mismatch, and on the
 * first differing byte. So the time a rejection takes is a function of how much
 * of the secret the caller got right, which is the signal a guessing attack
 * needs.
 *
 * `send-email` has had this since it shipped, because a webhook signature is
 * obviously security-sensitive. `notify` and `analytics-forward` used `!==`,
 * and `notify` carried a comment saying "compared in full so a wrong secret
 * costs the same as a missing one" -- asserting the property this function
 * provides, over a line that did not provide it.
 *
 * Over the public internet the timing signal is largely buried by network
 * jitter, and these secrets are high-entropy and held in Vault. The reason to
 * fix it is not the attack. It is that one function in this repo knew how and
 * two did not, and a comment was vouching for something untrue.
 */
export function safeEqual(a: string, b: string): boolean {
  // A length difference is itself observable, and there is no way around that
  // without hashing both sides first. What this avoids is leaking WHERE the
  // first difference falls, which is the part that makes guessing tractable.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The cron-caller check both scheduled functions run.
 *
 * Returns true only when the function is configured AND the header matches.
 * An unset secret is a refusal rather than a pass: a function that authorises
 * everyone because nobody configured it is the worst of both.
 */
export function callerIsCron(req: Request, secret: string): boolean {
  if (!secret) return false;
  return safeEqual(req.headers.get("x-notify-secret") ?? "", secret);
}
