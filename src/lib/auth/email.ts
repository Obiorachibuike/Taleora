import crypto from "node:crypto";

export interface ResendEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Send an email through Resend when configured; otherwise log it (never throws). */
export async function sendEmail(email: ResendEmail): Promise<{ delivered: boolean; provider: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL ?? "Taleora <noreply@taleora.app>";
  if (!apiKey) {
    // Dev mode: never block the flow; log to stdout so local devs can see it
    console.log("[email:local]", JSON.stringify({ to: email.to, subject: email.subject, text: email.text }));
    return { delivered: false, provider: "local-log" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to: email.to, subject: email.subject, text: email.text, html: email.html ?? email.text }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[email] Resend failed", res.status, body.slice(0, 300));
      return { delivered: false, provider: "resend" };
    }
    return { delivered: true, provider: "resend" };
  } catch (err) {
    console.error("[email] Resend error", err instanceof Error ? err.message : err);
    return { delivered: false, provider: "resend" };
  }
}

export function verificationEmailTemplate(name: string, url: string) {
  const html = `<!doctype html><html><body style="font-family:Georgia,serif;background:#080B0D;color:#F5F7F5;padding:32px">
    <div style="max-width:520px;margin:0 auto;background:#101518;border:1px solid #1E262A;border-radius:16px;padding:32px">
      <h1 style="color:#39FF14;font-size:24px;margin:0 0 16px">Welcome to Taleora</h1>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Confirm your email address to activate your Taleora account.</p>
      <p style="margin:24px 0"><a href="${url}" style="background:#39FF14;color:#080B0D;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Verify email</a></p>
      <p style="color:#A0AAA5;font-size:12px">If you did not create this account, you can ignore this email. This link expires in 24 hours.</p>
    </div></body></html>`;
  const text = `Hi ${name},\n\nConfirm your email address by opening: ${url}\n\nThis link expires in 24 hours.`;
  return { subject: "Verify your Taleora email", text, html };
}

export function passwordResetEmailTemplate(name: string, url: string) {
  const html = `<!doctype html><html><body style="font-family:Georgia,serif;background:#080B0D;color:#F5F7F5;padding:32px">
    <div style="max-width:520px;margin:0 auto;background:#101518;border:1px solid #1E262A;border-radius:16px;padding:32px">
      <h1 style="color:#39FF14;font-size:24px;margin:0 0 16px">Reset your password</h1>
      <p>Hi ${escapeHtml(name)},</p>
      <p>We received a request to reset your Taleora password. Click below to set a new password.</p>
      <p style="margin:24px 0"><a href="${url}" style="background:#39FF14;color:#080B0D;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Reset password</a></p>
      <p style="color:#A0AAA5;font-size:12px">If you did not request this, ignore this email. This link expires in 1 hour.</p>
    </div></body></html>`;
  const text = `Hi ${name},\n\nReset your password by opening: ${url}\n\nThis link expires in 1 hour.`;
  return { subject: "Reset your Taleora password", text, html };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
