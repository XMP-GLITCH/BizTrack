/**
 * Brevo transactional email.
 *
 * Deliberately a thin wrapper over one HTTP call rather than an SDK: this sends
 * exactly one kind of request, and a dependency here would have to be vendored
 * into the Edge Function bundle for no gain.
 *
 * Swapping provider means reimplementing `send` against a different endpoint;
 * nothing outside this file knows Brevo exists.
 */

const ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export interface Message {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  /** Groups sends in Brevo's dashboard, so bounce rates can be read per kind. */
  tag?: string;
}

export interface SendResult {
  ok: boolean;
  /** True when retrying later could plausibly succeed. */
  retryable: boolean;
  error?: string;
  messageId?: string;
}

export class Brevo {
  constructor(
    private apiKey: string,
    private senderEmail: string,
    private senderName = "BizTrack",
  ) {}

  async send(m: Message): Promise<SendResult> {
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "api-key": this.apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: { name: this.senderName, email: this.senderEmail },
          to: [{ email: m.to, ...(m.toName ? { name: m.toName } : {}) }],
          subject: m.subject,
          htmlContent: m.html,
          ...(m.tag ? { tags: [m.tag] } : {}),
        }),
      });
    } catch (err) {
      // Network failure. Always worth another attempt.
      return { ok: false, retryable: true, error: `network: ${(err as Error).message}` };
    }

    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: true, retryable: false, messageId: body?.messageId };
    }

    const text = await res.text().catch(() => "");

    // 429 is the daily cap on Brevo's free tier, 5xx is their side. Both clear
    // on their own, so the row stays pending rather than being marked failed.
    const retryable = res.status === 429 || res.status >= 500;

    return {
      ok: false,
      retryable,
      error: `brevo ${res.status}: ${text.slice(0, 300)}`,
    };
  }
}
