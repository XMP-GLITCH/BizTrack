# Branded auth emails

The five templates Supabase sends on your behalf, in BizTrack's palette rather
than the default blue. They are plain HTML files here so they live in version
control and can be diffed; the dashboard is the only place they can be
*installed*, because Supabase stores template bodies in the project, not in a
migration.

| File | Dashboard template | Subject to set |
|---|---|---|
| `confirm-signup.html` | Confirm signup | `Confirm your email — BizTrack` |
| `magic-link.html` | Magic Link | `Your BizTrack sign-in link` |
| `reset-password.html` | Reset Password | `Set a new BizTrack password` |
| `change-email.html` | Change Email Address | `Confirm your new email — BizTrack` |
| `reauthentication.html` | Reauthentication | `Your BizTrack confirmation code` |

## Installing

Dashboard → **Authentication** → **Emails** → pick the template tab → paste the
file's whole contents into the message body → set the subject from the table
above → **Save**. One tab at a time; there is no bulk import.

`Invite user` is deliberately not included. The UI never invites anyone —
`business_members` exists so tenancy does not have to be retrofitted later, but
nothing creates a second row. A template for a flow that cannot happen would
just rot.

## The decisions in these files

**One image, and only one.** The wordmark, and nothing else. Most inboxes block
remote images by default, so every additional image is a broken box on first
open and bytes on a metered connection — a real cost for this audience rather
than a rounding error. The logo earns its place because it is what makes the
message recognisably yours; it degrades to styled alt text when blocked (see
**The logo** below). Nothing else in these files is an image: the rules, the
code block and the buttons are all drawn in CSS.

**The six-digit code is not a fallback.** Every template shows `{{ .Token }}`
next to the button. On Android, tapping a link frequently opens a browser that
is *not* the installed PWA, so the session lands somewhere the user cannot see
it — the same reasoning that kept magic-link-only sign-in out of `auth.js`. The
code lets someone finish inside the app they already have open.

**Tap targets.** Padding is on the `<a>`, not its container, so the entire
button responds to a thumb.

**Copy assumes anxiety about the books.** People whose only records live in this
app read an unexpected account email as a threat. Each one states plainly that
nothing was deleted and nothing changes if they ignore it.

**Light-only.** `color-scheme: light` is declared rather than fighting each
client's dark-mode inversion, which mangles hand-built table layouts differently
in Gmail, Outlook and Apple Mail.

## Personalisation, if you want it

Supabase renders Go templates, so `{{ .Data.display_name }}` reaches the
metadata `signUp` sets. It is left out on purpose: Google sign-in users may have
no `display_name`, and a greeting reading "Hi ," is worse than no greeting. If
you add it, guard it:

```
{{ if .Data.display_name }}Hi {{ .Data.display_name }},{{ else }}Hi there,{{ end }}
```

Send yourself a test through each provider before shipping that.

## Before real users: custom SMTP

**This is a launch blocker, not a nicety.** Supabase's built-in email service is
for development only:

- It delivers **only to addresses on your Supabase team**. A beta tester's
  address gets nothing — no bounce, no error in the app, just silence.
- It is rate-limited to a handful of messages per hour, shared across every
  template.

So a stranger signing up today never receives the confirmation email at all.
That is invisible from inside the app, which is what makes it dangerous: sign-up
appears to work and the account is simply never confirmed.

Fix it at **Project Settings → Authentication → SMTP Settings** with any
transactional provider — Resend, Brevo and Mailgun all have free tiers that
cover a beta at this scale. Then set **Sender name** to `BizTrack` and use a
sender address on a domain you control.

Deliverability to Gmail, which is most of this audience, needs SPF and DKIM
records on that domain. Every provider above walks through it, and skipping it
lands these emails in spam no matter how good they look.

Email confirmation is currently **off** (`mailer_autoconfirm = true`), so none
of this blocks the beta. It all has to be true before confirmation goes back on
for launch.

## The logo

All five templates load the wordmark from an absolute URL. It is the only image
in them — everything else is drawn with type and table cells, because inboxes
block remote images by default and each one costs bytes on a metered connection.

The `<img>` carries `alt="BizTrack"` styled in the brand serif, so a blocked
image still reads as the wordmark rather than as a broken box. That is the
normal first-open experience for most recipients, so check it looks right.

**Host the file before sending anything.** The default URL points at Supabase
Storage, which works today and does not depend on the app being deployed:

1. Dashboard → **Storage** → **New bucket** → name it `brand`, tick **Public**.
2. Upload `public/wordmark-light.png` into it.
3. Confirm it opens in a private window:
   `https://ufyyurmekegbzkqjisdb.supabase.co/storage/v1/object/public/brand/wordmark-light.png`

To host it somewhere else — the deployed app serves it at `/wordmark-light.png`
— regenerate with that URL instead:

```sh
BIZTRACK_LOGO_URL=https://yourdomain/wordmark-light.png python supabase/emails/generate.py
```

`generate.py` is the source of truth for these files. Edit copy there and
regenerate; editing the HTML by hand means the next regeneration silently
discards your change.

The notification emails read the same URL from the `BRAND_LOGO_URL` secret,
falling back to `APP_URL` + `/wordmark-light.png`.
