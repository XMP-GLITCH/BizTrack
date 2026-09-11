# Generates the branded Supabase auth email templates for BizTrack.
import io, os

BROWN  = "#2C1810"
CREAM  = "#FAF8F4"
MUTED  = "#9B7B5E"
BORDER = "#E0D6C8"
CARD   = "#FFFFFF"

SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif"
SANS  = "'Inter', 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

# Absolute, publicly reachable, and not behind a login -- an inbox has no
# session. Supabase Storage is the default because it exists today and does not
# depend on the app being deployed. Override with BIZTRACK_LOGO_URL.
LOGO_URL = os.environ.get(
    "BIZTRACK_LOGO_URL",
    "https://ufyyurmekegbzkqjisdb.supabase.co/storage/v1/object/public/brand/wordmark-light.png")

TOKEN = "{{ .Token }}"
URL   = "{{ .ConfirmationURL }}"


def para(text):
    return ('<p style="margin:0 0 14px;font-family:%s;font-size:15px;'
            'line-height:1.65;color:%s;">%s</p>' % (SANS, BROWN, text))


def shell(title, preheader, heading, body, cta_label=None,
          code_caption="Or enter this code in the app:", footer_note=""):

    cta = ""
    if cta_label:
        # Padding sits on the <a> so the whole block is tappable on a phone,
        # which is where essentially every one of these is opened.
        cta = """
              <tr>
                <td align="center" style="padding:4px 0 8px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td align="center" bgcolor="%s" style="border-radius:12px;">
                        <a href="%s" target="_blank"
                           style="display:inline-block;padding:15px 34px;font-family:%s;font-size:15px;font-weight:700;color:%s;text-decoration:none;border-radius:12px;">%s</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>""" % (BROWN, URL, SANS, CREAM, cta_label)

    # The six-digit code is not a fallback. On Android a link often opens a
    # different browser than the installed PWA, dropping the session -- the
    # "the link signed me out" complaint the auth module already documents.
    code_block = """
              <tr>
                <td style="padding:22px 0 4px;">
                  <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0"
                         style="border:1px solid %s;border-radius:12px;background:%s;">
                    <tr>
                      <td align="center" style="padding:16px 20px 14px;">
                        <p style="margin:0 0 8px;font-family:%s;font-size:12px;font-weight:600;color:%s;">%s</p>
                        <p style="margin:0;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:29px;font-weight:700;letter-spacing:7px;color:%s;">%s</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>""" % (BORDER, CREAM, SANS, MUTED, code_caption, BROWN, TOKEN)

    note = ""
    if footer_note:
        note = """
              <tr>
                <td style="padding:18px 0 0;">
                  <p style="margin:0;font-family:%s;font-size:13px;line-height:1.6;color:%s;">%s</p>
                </td>
              </tr>""" % (SANS, MUTED, footer_note)

    return """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>%(title)s</title>
</head>
<body style="margin:0;padding:0;background:%(cream)s;">

<div style="display:none;font-size:1px;color:%(cream)s;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
  %(preheader)s&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
</div>

<table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" style="background:%(cream)s;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">

        <tr>
          <td align="center" style="padding:0 0 22px;">
            <!-- The alt text is styled to match the wordmark, so a blocked
                 image (the default in most inboxes) still reads as BizTrack
                 rather than as a broken box. -->
            <img src="%(logo)s" alt="BizTrack" width="150" height="47"
                 style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:150px;font-family:%(serif)s;font-size:19px;font-weight:700;color:%(brown)s;">
          </td>
        </tr>

        <tr>
          <td bgcolor="%(card)s" style="border:1px solid %(border)s;border-radius:18px;padding:34px 30px;">
            <table role="presentation" width="100%%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td>
                  <h1 style="margin:0 0 12px;font-family:%(serif)s;font-size:25px;line-height:1.25;font-weight:700;color:%(brown)s;">%(heading)s</h1>
                  %(body)s
                </td>
              </tr>%(cta)s%(code)s%(note)s
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:22px 8px 0;">
            <p style="margin:0 0 6px;font-family:%(sans)s;font-size:12px;line-height:1.6;color:%(muted)s;">
              Didn't ask for this? Ignore this email — nothing on your account changes, and no one reaches your books without it.
            </p>
            <p style="margin:0;font-family:%(sans)s;font-size:12px;line-height:1.6;color:%(muted)s;">
              BizTrack — inventory, sales and profit for small businesses.
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>
""" % dict(title=title, preheader=preheader, heading=heading, body=body,
           cta=cta, code=code_block, note=note,
           brown=BROWN, cream=CREAM, muted=MUTED, border=BORDER, card=CARD,
           serif=SERIF, sans=SANS, logo=LOGO_URL)


TEMPLATES = {
    "confirm-signup.html": shell(
        title="Confirm your email",
        preheader="One tap and your books start backing up.",
        heading="Confirm your email",
        body=para("Welcome to BizTrack. Confirm this address and your inventory, sales and profit "
                  "start backing up — so your books survive a lost, stolen or replaced phone.")
             + para("This is the last step."),
        cta_label="Confirm my email",
        footer_note="The link and the code both expire after a while. If yours has, sign in again and a fresh one is sent."),

    "magic-link.html": shell(
        title="Your sign-in link",
        preheader="Your sign-in link and code for BizTrack.",
        heading="Sign in to BizTrack",
        body=para("Here is your sign-in link. It works once, and only from this email."),
        cta_label="Sign in",
        footer_note="If the button opens a browser where you are not signed in, return to the app and enter the code above instead."),

    "reset-password.html": shell(
        title="Reset your password",
        preheader="Set a new BizTrack password.",
        heading="Set a new password",
        body=para("Someone asked to reset the password on this BizTrack account. If that was you, choose a new one now.")
             + para("Your books are untouched either way — nothing is deleted, and nothing is lost if you ignore this."),
        cta_label="Choose a new password",
        footer_note="Only the newest reset link works. Asking again replaces the one above."),

    "change-email.html": shell(
        title="Confirm your new email",
        preheader="Confirm the new address on your BizTrack account.",
        heading="Confirm your new address",
        body=para('You asked to move your BizTrack account to <strong style="color:#2C1810;">{{ .NewEmail }}</strong>. '
                  "Confirm it to finish the change.")
             + para("Until you do, your old address keeps working and nothing about your account changes."),
        cta_label="Confirm the change",
        footer_note="Didn't request this? Ignore it, then change your password — someone may know your current one."),

    "reauthentication.html": shell(
        title="Your confirmation code",
        preheader="Your BizTrack confirmation code.",
        heading="Confirm it's you",
        body=para("Enter this code in BizTrack to confirm the change you just asked for."),
        cta_label=None,
        code_caption="Your confirmation code:",
        footer_note="Never share this code. BizTrack will never ask you for it by phone, WhatsApp or message."),
}

os.makedirs("supabase/emails", exist_ok=True)
for name, html in sorted(TEMPLATES.items()):
    path = os.path.join("supabase", "emails", name)
    io.open(path, "w", encoding="utf-8", newline="\n").write(html)
    print("wrote %s (%d bytes)" % (path, len(html)))
