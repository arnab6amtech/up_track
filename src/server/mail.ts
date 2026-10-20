import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transport: Transporter | null = null;

/** Whether this server can send email (SMTP_URL is set). */
export const mailConfigured = () => !!process.env.SMTP_URL?.trim();

/**
 * Sends an email through SMTP_URL. Without it, the email is written to the server log instead (handy in
 * development) and this returns false, so callers can offer the link to copy.
 */
export async function sendMail(mail: Mail): Promise<boolean> {
  const url = process.env.SMTP_URL?.trim();
  if (!url) {
    console.info(`[mail] SMTP_URL isn't set, so this email wasn't sent.\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
    return false;
  }
  transport ??= nodemailer.createTransport(url);
  await transport.sendMail({ from: process.env.MAIL_FROM?.trim() || "UpTrack <no-reply@uptrack.local>", ...mail });
  return true;
}

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The invitation email: who invited them, to what and as what, with Accept and Decline buttons. */
export function invitationMail(input: { to: string; orgName: string; inviterName: string; roleName: string; link: string }): Mail {
  const { to, orgName, inviterName, roleName, link } = input;
  const decline = `${link}?answer=decline`;
  const subject = `${inviterName} invited you to ${orgName} on UpTrack`;
  const text = [
    `${inviterName} invited you to join ${orgName} on UpTrack as ${roleName}.`,
    "",
    `Accept: ${link}`,
    `Decline: ${decline}`,
    "",
    "The invitation works once and expires in 7 days. If you weren't expecting it, you can ignore this email.",
  ].join("\n");
  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${escape(href)}" style="display:inline-block;padding:10px 18px;border-radius:8px;font-weight:600;text-decoration:none;${
      primary ? "background:#171717;color:#ffffff" : "border:1px solid #d4d4d4;color:#171717"
    }">${label}</a>`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#fafafa;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#171717">
<div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px;padding:28px">
<p style="margin:0 0 4px;font-size:13px;color:#737373">UpTrack</p>
<h1 style="margin:0 0 12px;font-size:20px">Join ${escape(orgName)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5"><strong>${escape(inviterName)}</strong> invited you to join <strong>${escape(orgName)}</strong> as <strong>${escape(roleName)}</strong>.</p>
<p style="margin:0 0 20px">${button(link, "Accept invitation", true)}&nbsp;&nbsp;${button(decline, "Decline", false)}</p>
<p style="margin:0;font-size:13px;color:#737373;line-height:1.5">The invitation works once and expires in 7 days. If you weren't expecting it, you can ignore this email.</p>
</div></body></html>`;
  return { to, subject, text, html };
}
