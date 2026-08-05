/**
 * Email transport settings for the invoice sender (src/lib/email.config.ts).
 *
 * Login no longer sends email — Clerk owns authentication. This is kept free
 * of SDK imports so importing it stays cheap wherever it is pulled in.
 */

/** Which transport to use. Set EMAIL_PROVIDER=brevo for local development. */
export const emailProvider =
  process.env.EMAIL_PROVIDER === "brevo" ? "brevo" : "resend";

/** Sender shown on outgoing mail. Must be a verified sender on the active provider. */
export const emailFrom = process.env.EMAIL_FROM!;

const brevoPort = Number(process.env.BREVO_SMTP_PORT ?? 587);

export const brevoTransport = {
  host: process.env.BREVO_SMTP_HOST ?? "smtp-relay.brevo.com",
  port: brevoPort,
  secure: brevoPort === 465,
  auth: {
    user: process.env.BREVO_SMTP_LOGIN,
    pass: process.env.BREVO_SMTP_KEY,
  },
};
