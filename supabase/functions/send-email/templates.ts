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

/**
 * The code, as a self-contained table so it can sit inside the body cell.
 *
 * It used to be a <tr> spliced into the shell by string match, which put it
 * wherever the anchor happened to land -- below the link -- and made the
 * position silently wrong when the shell changed. A block appended to the body
 * goes exactly where the body goes, every time.
 */
function codeBlock(token: string, caption = "Enter this code in the app:"): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="border:1px solid ${COLORS.BORDER};border-radius:12px;background:${COLORS.CREAM};margin:4px 0 2px;">
    <tr><td align="center" style="padding:16px 20px 14px;">
      <p style="margin:0 0 8px;font-family:${COLORS.SANS};font-size:12px;font-weight:600;color:${COLORS.MUTED};">${escapeHtml(caption)}</p>
      <p style="margin:0;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:29px;font-weight:700;letter-spacing:7px;color:${COLORS.BROWN};">${escapeHtml(token)}</p>
    </td></tr>
  </table>`;
}

export function render(
  type: string,
  d: EmailData,
  supabaseUrl: string,
  userEmail: string,
): Rendered | null {
  const url = confirmationUrl(supabaseUrl, d);
  const code = (caption?: string) => codeBlock(d.token, caption);

  switch (type) {
    case "signup":
      return {
        subject: "Confirm your BizTrack email",
        html: shell({
          preheader: "One tap and your books start backing up.",
          heading: "Confirm your email",
          body:
            p("Welcome to BizTrack. Confirm this address and your inventory, sales and profit start backing up, so your books survive a lost, stolen or replaced phone.") +
            p("This is the last step.") +
            code(),
          ctaLabel: "Or confirm in a browser instead",
          ctaUrl: url,
          ctaVariant: "link",
          footerNote: "The link and the code both expire after a while. If yours has, sign in again and a fresh one is sent.",
        }),
      };

    case "recovery":
      return {
        subject: "Set a new BizTrack password",
        html: shell({
          preheader: "Set a new BizTrack password.",
          heading: "Set a new password",
          body:
            p("Someone asked to reset the password on this BizTrack account. If that was you, choose a new one now.") +
            p("Your books are untouched either way. Nothing is deleted, and nothing is lost if you ignore this.") +
            code(),
          ctaLabel: "Or reset in a browser instead",
          ctaUrl: url,
          ctaVariant: "link",
          footerNote: "Only the newest reset link works. Asking again replaces the one above.",
        }),
      };

    case "magiclink":
      return {
        subject: "Your BizTrack sign-in link",
        html: shell({
          preheader: "Your sign-in link and code for BizTrack.",
          heading: "Sign in to BizTrack",
          body:
            p("Here is your sign-in code. It works once, and only from this email.") +
            code(),
          ctaLabel: "Or sign in through a browser",
          ctaUrl: url,
          ctaVariant: "link",
          footerNote: "If the button opens a browser where you are not signed in, return to the app and enter the code above instead.",
        }),
      };

    case "email_change":
      return {
        subject: "Confirm your new BizTrack email",
        html: shell({
          preheader: "Confirm the new address on your BizTrack account.",
          heading: "Confirm your new address",
          body:
            p(`You asked to move your BizTrack account to <strong style="color:${COLORS.BROWN};">${escapeHtml(userEmail)}</strong>. Confirm it to finish the change.`) +
            p("Until you do, your old address keeps working and nothing about your account changes.") +
            code(),
          ctaLabel: "Or confirm in a browser instead",
          ctaUrl: url,
          ctaVariant: "link",
          footerNote: "Didn't request this? Ignore it, then change your password. Someone may know your current one.",
        }),
      };

    case "reauthentication":
      return {
        subject: "Your BizTrack confirmation code",
        html: shell({
          preheader: "Your BizTrack confirmation code.",
          heading: "Confirm it's you",
          body:
            p("Enter this code in BizTrack to confirm the change you just asked for.") +
            code("Your confirmation code:"),
          footerNote: "Never share this code. BizTrack will never ask you for it by phone, WhatsApp or message.",
        }),
      };

    default:
      // Unknown action type. The caller refuses rather than inventing a
      // message, because a wrong email about someone's account is worse than
      // a missing one -- and the failure is visible in the auth logs.
      return null;
  }
}
