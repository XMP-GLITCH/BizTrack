/**
 * Privacy Policy and Terms of Service.
 *
 * Kept as data, in one file, so they can be read and edited by a lawyer without
 * touching React, and so the app renders exactly the text that was reviewed.
 *
 * THESE ARE DRAFTS. They were written to be accurate about what this software
 * actually does -- which is the part a lawyer cannot check for you -- but they
 * have not been reviewed by anyone qualified. Before charging money, have a
 * Cameroonian lawyer review at least: the governing-law clause, the liability
 * cap, VAT and invoicing obligations, and whether cross-border transfer to
 * Supabase requires anything more than the consent collected at sign-up.
 *
 * Any claim made here must stay true of the code. The "industrial-grade
 * encryption" line that once appeared in About is exactly the kind of statement
 * that turns a technical shortcoming into a legal problem, so the security
 * section below deliberately understates rather than reassures.
 */

// ── fill these in before launch ────────────────────────────────────────────
// Every one of these appears in the rendered documents. A policy naming no
// controller and giving no contact address does not satisfy any of the regimes
// this product operates under.
export const ENTITY = {
  name: "Ewube Arrey Neville Arrey",
  address: "Buea, Cameroon",
  // Must be an address that is actually monitored -- every regime here requires
  // a reachable contact for the data controller. hello@biztrack.store is the
  // intended home for this, but the alias does not exist yet: a test to it came
  // back "554 5.7.1 Relay access denied". Switch once it forwards.
  email: "arreyewube273@gmail.com",
  // WhatsApp is how this audience actually makes contact, so it is offered
  // alongside email rather than instead of it.
  phone: "+237 677 71 69 08",
  country: "Cameroon",
};

export const LAST_UPDATED = "11 September 2026";

const P = (...paragraphs) => paragraphs;

export const PRIVACY_POLICY = {
  id: "privacy",
  title: "Privacy Policy",
  updated: LAST_UPDATED,
  intro:
    `This policy explains what BizTrack collects, why, where it goes, and what you can do about it. ` +
    `It describes what the software actually does.`,
  sections: [
    {
      heading: "Who is responsible",
      body: P(
        `BizTrack is operated by ${ENTITY.name}, ${ENTITY.address}. For any question about your data, or to exercise any right described below, write to ${ENTITY.email} or message ${ENTITY.phone} on WhatsApp.`,
      ),
    },
    {
      heading: "What BizTrack stores",
      body: P(
        "On your device, whether or not you have an account: the businesses you create, your items and their prices, your sales, your stock movements, your display name, and your app settings.",
        "If you create an account, additionally: your email address, and — if you sign in with Google — the name and email Google returns to us. We do not receive your Google password.",
        "If you agree to share usage data, we also store which screens and features you used and details of any crash. That is described in its own section below.",
        "We do not collect your location, your contacts, your phone number, or anything from other apps. BizTrack contains no advertising and no third-party trackers.",
      ),
    },
    {
      heading: "Where your data goes",
      body: P(
        "Without an account, your records stay on your device and are not sent anywhere.",
        "With an account, your records are copied to our database so you can reach them from another device and recover them if your phone is lost. That database is operated by Supabase, and it is hosted outside Cameroon. Sending your data to us therefore involves a transfer of personal data abroad, which we ask you to consent to when you create an account.",
        "The other companies that handle your data on our behalf, and only on our instructions, are: Supabase (database, authentication and hosting), Google (only if you choose to sign in with Google), and Brevo (sending the emails described below). We do not sell your data, and we do not share it for advertising.",
      ),
    },
    {
      heading: "Why we are allowed to hold it",
      body: P(
        "To provide the service you asked for: keeping your books, syncing them between your devices, and restoring them if you lose a phone.",
        "To contact you about your account: confirming your email, resetting your password, telling you before your trial ends, and telling you when someone signs in.",
        "Where the law requires consent — in particular for transferring your data outside Cameroon — we ask for it explicitly when you create an account, and you can withdraw it by deleting your account.",
      ),
    },
    {
      heading: "Storage on your device, and cookies",
      body: P(
        "BizTrack stores data in your browser's local storage. That is what makes the app work offline, which is the point of it. It holds your books, your settings, and — when signed in — the token that keeps you signed in.",
        "We use no advertising cookies and no third-party tracking cookies. Nothing you do here is shared with an advertising network.",
        "If you agree to it, we also store a small queue of usage events (described in the next section) until they can be sent. You are asked before any of that is collected, and turning it off in Settings deletes anything still waiting to be sent.",
        "Clearing your browser's site data for BizTrack erases your local records. If you have no account and no export, that copy is not recoverable.",
      ),
    },
    {
      heading: "Understanding how the app is used",
      body: P(
        "BizTrack is in beta, and we need to know which parts work. If you agree, the app records which screens you open, which features you use, and details of any crash — including the error message and the part of the code it came from.",
        "We never collect your business data this way. Not your item names, not your prices, not your sales figures, not your customers, not your business names. The app checks every value against a list of what is allowed to leave your device, and anything that looks like an email address or a long number is removed before it is sent.",
        "We ask before collecting any of it, and nothing is collected until you say yes. You can change your mind at any time in Settings → Privacy; switching it off also deletes anything still waiting to be sent from your device.",
        "This information is kept for 90 days and then deleted automatically. It is stored in our own database and is not shared with an analytics company.",
      ),
    },
    {
      heading: "Emails we send",
      body: P(
        "Account emails: confirming your address, resetting your password, and telling you when someone signs into your account. These cannot be switched off while you have an account, because they are how you find out about a problem with it.",
        "Trial and billing emails, and business alerts such as low stock and a weekly summary: these can be switched off from any of them, or in the app.",
      ),
    },
    {
      heading: "How long we keep it",
      body: P(
        "For as long as you have an account. Delete your account and your records are deleted from our database.",
        "The copy on your own device is under your control and is not deleted by us. Signing out does not erase it, because it may not be backed up yet.",
        "Backups of our database may retain deleted data for a short period before being overwritten.",
      ),
    },
    {
      heading: "Your rights",
      body: P(
        "You can get a copy of your data at any time: Settings → Backup Data, or the CSV export, without asking us.",
        "You can delete your account and everything in it from Settings → Delete Account. It is immediate and cannot be undone.",
        "You can correct anything that is wrong by editing it in the app.",
        "You can withdraw your agreement to usage data at any time in Settings → Privacy, without losing any feature of the app.",
        `You can object to how we use your data, or complain, by writing to ${ENTITY.email} or messaging ${ENTITY.phone} on WhatsApp. If you are in a country with a data protection authority, you may also complain to it.`,
      ),
    },
    {
      heading: "Security, stated plainly",
      body: P(
        "Your data is separated from other users' data in our database by row-level security rules, so one account cannot read another's records.",
        "Traffic between the app and our servers is encrypted in transit.",
        "The optional PIN lock is a screen lock on your own device. It is not encryption, and it will not stop someone with technical skill and physical access to your unlocked phone. We say this because the opposite claim would be untrue.",
        "No service is perfectly secure. If we discover a breach affecting your data, we will tell you and any authority we are required to tell.",
      ),
    },
    {
      heading: "Children",
      body: P("BizTrack is for people running a business and is not intended for children."),
    },
    {
      heading: "Changes",
      body: P(
        "If we change this policy in a way that affects you, we will tell you in the app before it takes effect. The date at the top always shows the current version.",
      ),
    },
  ],
};

export const TERMS = {
  id: "terms",
  title: "Terms of Service",
  updated: LAST_UPDATED,
  intro:
    `These are the terms you agree to when you use BizTrack. They are written to be read, not to be impressive.`,
  sections: [
    {
      heading: "What BizTrack is",
      body: P(
        "An app for recording inventory, sales and profit for small businesses. It works offline and syncs when it can.",
        `It is provided by ${ENTITY.name}, ${ENTITY.address}.`,
      ),
    },
    {
      heading: "It is not accounting or tax advice",
      body: P(
        "BizTrack records what you tell it. It does not check your figures, and it is not an accountant, an auditor or a tax adviser.",
        "It deliberately allows you to record a sale that takes your stock negative, because the sale really happened and refusing to record real money would be worse. That means your stock figures can show a discrepancy that only you can reconcile.",
        "Before you rely on anything here for a tax return, a loan application, or any legal or financial decision, check the figures yourself or have someone qualified check them. You remain responsible for your own records and your own filings.",
      ),
    },
    {
      heading: "Your account",
      body: P(
        "Keep your password to yourself. You are responsible for what happens under your account.",
        "You must be old enough to enter a contract where you live, and the business details you record must be yours.",
        `Tell us at ${ENTITY.email}, or on WhatsApp at ${ENTITY.phone}, if you think someone else has got into your account.`,
      ),
    },
    {
      heading: "Trial, price and payment",
      body: P(
        "New accounts get 30 days free, with everything switched on.",
        "After that: 3,500 XAF per month, or 30,000 XAF per year.",
        "Payment is arranged directly with us — by mobile money — and we record it against your account. Prices include any taxes we are required to charge unless we say otherwise.",
        "We may change the price. If we do, we will tell you before it applies to you, and you can stop paying.",
      ),
    },
    {
      heading: "What happens if you stop paying",
      body: P(
        "The app becomes read-only. It does not lock you out and it does not delete anything.",
        "Everything you recorded stays visible, searchable and exportable for as long as your account exists. What stops is recording new sales and stock.",
        "This is a commitment, not a courtesy: we will not hold your business records hostage over a payment.",
      ),
    },
    {
      heading: "Refunds",
      body: P(
        "If you pay for a year and want to stop within 14 days, write to us and we will refund it.",
        "After that we do not give refunds for time already paid, but you can cancel at any point and keep access until the period you paid for runs out.",
      ),
    },
    {
      heading: "Your data belongs to you",
      body: P(
        "Everything you put into BizTrack is yours. We do not claim ownership of it and we do not sell it.",
        "You can export it at any time without asking us, and you can delete your account at any time.",
      ),
    },
    {
      heading: "What we do not promise",
      body: P(
        "BizTrack is provided as it is. We work hard on it, but we do not promise it will be available without interruption or entirely free of faults.",
        "It is designed to work offline and to sync afterwards. Sync depends on your connection and on services we do not control.",
        "Keep your own copy of anything you cannot afford to lose. The export in Settings exists for exactly this, and using it is the single most useful thing you can do to protect your records.",
      ),
    },
    {
      heading: "Limits on what we owe you",
      body: P(
        "To the fullest extent the law allows, we are not liable for lost profits, lost business, or losses that follow indirectly from a problem with the app.",
        "Where we are liable, our total liability to you is limited to what you paid us in the twelve months before the problem arose.",
        "Nothing here removes any right you have under the law of your country that cannot be removed by agreement — including, if it applies to you, rights as a consumer.",
      ),
    },
    {
      heading: "Acceptable use",
      body: P(
        "Do not use BizTrack to break the law, to record someone else's business without their permission, or to try to reach another user's data.",
        "We may suspend an account being used this way. If we do, we will still let you export your own records.",
      ),
    },
    {
      heading: "Ending it",
      body: P(
        "You can stop and delete your account whenever you like.",
        "We may close an account that breaks these terms, or stop offering the service entirely — and if we stop, we will give you reasonable notice and time to export everything.",
      ),
    },
    {
      heading: "Which law applies",
      body: P(
        `These terms are governed by the law of ${ENTITY.country}, and disputes go to its courts, unless the law where you live gives you the right to bring a claim closer to home.`,
      ),
    },
    {
      heading: "Changes",
      body: P(
        "If we change these terms in a way that affects you, we will tell you in the app before it takes effect. Continuing to use BizTrack after that means you accept the new version.",
      ),
    },
  ],
};

export const DOCUMENTS = { privacy: PRIVACY_POLICY, terms: TERMS };

/**
 * Bumped when a change is material enough that people should re-accept.
 * Compared against what the user accepted, so a cosmetic edit does not nag
 * everyone and a real change is not silently applied to them.
 */
export const LEGAL_VERSION = "2026-09-11";
