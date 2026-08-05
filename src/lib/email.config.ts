import { Resend } from "resend";
import nodemailer from "nodemailer";
import { brevoTransport, emailFrom, emailProvider } from "./email.provider";

export async function sendEmail(to: string, subject: string, reactHTML: any) {
  if (emailProvider === "brevo") {
    // Brevo speaks SMTP, so the React template is rendered to HTML first.
    // Imported lazily: a static react-dom/server import is rejected by the
    // Next.js compiler because this module is reachable from Server Components.
    const { renderToStaticMarkup } = await import("react-dom/server");

    return nodemailer.createTransport(brevoTransport).sendMail({
      from: emailFrom,
      to,
      subject,
      html: renderToStaticMarkup(reactHTML),
    });
  }

  const resend = new Resend(process.env.AUTH_RESEND_KEY);
  const { data, error } = await resend.emails.send({
    from: emailFrom,
    to: to,
    subject: subject,
    react: reactHTML,
  });

  if (error) {
    return error;
  }
  return data;
}
