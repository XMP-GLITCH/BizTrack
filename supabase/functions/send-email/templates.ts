/**
 * Auth emails, rendered from code.
 *
 * These are the messages Supabase would otherwise send itself: confirm your
 * address, reset your password, sign in, confirm a new address, confirm it's
 * you. They are rendered here instead because Supabase is calling us through a
 * Send Email Hook rather than talking to an SMTP server.
 *
 * Two things that buys, beyond unblocking delivery:
 *
 *  - The branded templates live in the repo and are reviewed like code, rather
 *    than being pasted into five dashboard tabs and silently drifting.
 *  - They go out through the Brevo API, which is the path already proven to
 *    work for this project.
 *
 * The numeric code is the primary action in every one of them. On Android a
 * link frequently opens a browser that is not the installed PWA, so the code is
 * the route that reliably works -- the same reasoning that shaped AuthScreen's
 * `verify` mode, which is where these codes are spent.
 */

import { COLORS, escapeHtml, p, shell } from "../_shared/render.ts";

export interface EmailData {
  token: string;
  token_hash: string;
  redirect_to: string;
  email_action_type: string;
  site_url?: string;
  token_new?: string;
  token_hash_new?: string;
}

export interface Rendered {
  subject: string;
  html: string;
}

/**
 * The link Supabase would have put in its own email. Verified server-side by
 * GoTrue, which then redirects to `redirect_to`.
 */
export function confirmationUrl(supabaseUrl: string, d: EmailData): string {
  const base = supabaseUrl.replace(/\/+$/, "");
  const params = new URLSearchParams({
    token: d.token_hash,
    type: d.email_action_type,
  });
  if (d.redirect_to) params.set("redirect_to", d.redirect_to);
  return `${base}/auth/v1/verify?${params.toString()}`;
}

/** The code block. Deliberately the same shape as the rest of the family. */
function codeBlock(token: string, caption = "Or enter this code in the app:"): string {
  return `<tr>
    <td style="padding:22px 0 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="border:1px solid ${COLORS.BORDER};border-radius:12px;background:${COLORS.CREAM};">
        <tr><td align="center" style="padding:16px 20px 14px;">
          <p style="margin:0 0 8px;font-family:${COLORS.SANS};font-size:12px;font-weight:600;color:${COLORS.MUTED};">${escapeHtml(caption)}</p>
          <p style="margin:0;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:29px;font-weight:700;letter-spacing:7px;color:${COLORS.BROWN};">${escapeHtml(token)}</p>
        </td></tr>
      </table>
    </td>
  </tr>`;
}

/**
 * `shell()` has no slot for the code block, so it is spliced in ahead of the
 * footer row. Crude, but it keeps one shell shared with the notification
 * emails -- two shells would drift apart within a month.
 */
function withCode(html: string, token: string, caption?: string): string {
  const marker = `        ${""}`;
  const anchor = "      </table>\n    </td></tr>";
  const i = html.indexOf(anchor);
  if (i === -1) return html;
  return html.slice(0, i) + codeBlock(token, caption) + "\n" + html.slice(i) + marker;
}

export function render(
  type: string,
  d: EmailData,
  supabaseUrl: string,
  userEmail: string,
): Rendered | null {
  const url = confirmationUrl(supabaseUrl, d);

  switch (type) {
    case "signup":
      return {
        subject: "Confirm your email — BizTrack",
        html: withCode(shell({
          preheader: "One tap and your books start backing up.",
          heading: "Confirm your email",
          body:
            p("Welcome to BizTrack. Confirm this address and your inventory, sales and profit start backing up — so your books survive a lost, stolen or replaced phone.") +
            p("This is the last step."),
          ctaLabel: "Confirm my email",
          ctaUrl: url,
          footerNote: "The link and the code both expire after a while. If yours has, sign in again and a fresh one is sent.",
        }), d.token),
      };

    case "recovery":
      return {
        subject: "Set a new BizTrack password",
        html: withCode(shell({
          preheader: "Set a new BizTrack password.",
          heading: "Set a new password",
          body:
            p("Someone asked to reset the password on this BizTrack account. If that was you, choose a new one now.") +
            p("Your books are untouched either way — nothing is deleted, and nothing is lost if you ignore this."),
          ctaLabel: "Choose a new password",
          ctaUrl: url,
          footerNote: "Only the newest reset link works. Asking again replaces the one above.",
        }), d.token),
      };

    case "magiclink":
      return {
        subject: "Your BizTrack sign-in link",
        html: withCode(shell({
          preheader: "Your sign-in link and code for BizTrack.",
          heading: "Sign in to BizTrack",
          body: p("Here is your sign-in link. It works once, and only from this email."),
          ctaLabel: "Sign in",
          ctaUrl: url,
          footerNote: "If the button opens a browser where you are not signed in, return to the app and enter the code above instead.",
        }), d.token),
      };

    case "email_change":
      return {
        subject: "Confirm your new email — BizTrack",
        html: withCode(shell({
          preheader: "Confirm the new address on your BizTrack account.",
          heading: "Confirm your new address",
          body:
            p(`You asked to move your BizTrack account to <strong style="color:${COLORS.BROWN};">${escapeHtml(userEmail)}</strong>. Confirm it to finish the change.`) +
            p("Until you do, your old address keeps working and nothing about your account changes."),
          ctaLabel: "Confirm the change",
          ctaUrl: url,
          footerNote: "Didn't request this? Ignore it, then change your password — someone may know your current one.",
        }), d.token),
      };

    case "reauthentication":
      return {
        subject: "Your BizTrack confirmation code",
        html: withCode(shell({
          preheader: "Your BizTrack confirmation code.",
          heading: "Confirm it's you",
          body: p("Enter this code in BizTrack to confirm the change you just asked for."),
          footerNote: "Never share this code. BizTrack will never ask you for it by phone, WhatsApp or message.",
        }), d.token, "Your confirmation code:"),
      };

    default:
      // Unknown action type. The caller refuses rather than inventing a
      // message, because a wrong email about someone's account is worse than
      // a missing one -- and the failure is visible in the auth logs.
      return null;
  }
}
