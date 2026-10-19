/**
 * Email templates for account recovery. Pure functions: no database, no
 * framework, no delivery — they only build message content.
 *
 * All user-controlled values (display name, email) are HTML-escaped before
 * interpolation, and the raw token appears exclusively inside the link's
 * query string — never in the subject, where it could leak through mail
 * previews, notification trays or forwarded headers.
 */

export interface OutboundEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Escapes the five significant characters so template text cannot inject markup. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildLink(baseUrl: string, path: string, token: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const url = new URL(`${base}${path}`);
  url.searchParams.set("token", token);
  return url.toString();
}

export function verificationLink(baseUrl: string, rawToken: string): string {
  return buildLink(baseUrl, "/verify-email", rawToken);
}

export function passwordResetLink(baseUrl: string, rawToken: string): string {
  return buildLink(baseUrl, "/reset-password", rawToken);
}

/**
 * Wraps body copy in a minimal RTL HTML shell. Deliberately plain: no remote
 * images or styles, so nothing phones home when the email is rendered.
 */
function shell(title: string, paragraphs: string[]): OutboundEmail["html"] {
  return [
    '<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title></head>`,
    '<body style="font-family:Tahoma,Arial,sans-serif;line-height:1.8">',
    ...paragraphs,
    "</body></html>",
  ].join("");
}

export function buildVerificationEmail(input: {
  to: string;
  name: string;
  baseUrl: string;
  rawToken: string;
}): OutboundEmail {
  const link = verificationLink(input.baseUrl, input.rawToken);
  const greeting = escapeHtml(input.name);
  return {
    to: input.to,
    subject: "تأیید ایمیل — فینورا",
    text:
      `سلام ${input.name}،\n\n` +
      "برای تأیید ایمیل خود در فینورا روی پیوند زیر کلیک کنید:\n" +
      `${link}\n\n` +
      "این پیوند ۲۴ ساعت معتبر است. اگر شما این درخواست را ثبت نکرده‌اید، این ایمیل را نادیده بگیرید.\n",
    html: shell("تأیید ایمیل — فینورا", [
      `<p>سلام ${greeting}،</p>`,
      "<p>برای تأیید ایمیل خود در فینورا روی پیوند زیر کلیک کنید:</p>",
      `<p><a href="${escapeHtml(link)}">تأیید ایمیل</a></p>`,
      '<p style="color:#666;font-size:12px">این پیوند ۲۴ ساعت معتبر است. اگر شما این درخواست را ثبت نکرده‌اید، این ایمیل را نادیده بگیرید.</p>',
    ]),
  };
}

export function buildPasswordResetEmail(input: {
  to: string;
  name: string;
  baseUrl: string;
  rawToken: string;
}): OutboundEmail {
  const link = passwordResetLink(input.baseUrl, input.rawToken);
  const greeting = escapeHtml(input.name);
  return {
    to: input.to,
    subject: "بازیابی گذرواژه — فینورا",
    text:
      `سلام ${input.name}،\n\n` +
      "درخواست بازیابی گذرواژه برای حساب شما ثبت شده است. برای تعیین گذرواژه جدید روی پیوند زیر کلیک کنید:\n" +
      `${link}\n\n` +
      "این پیوند ۱ ساعت معتبر است و فقط یک بار قابل استفاده است. " +
      "اگر شما این درخواست را ثبت نکرده‌اید، این ایمیل را نادیده بگیرید؛ گذرواژه شما تغییری نکرده است.\n",
    html: shell("بازیابی گذرواژه — فینورا", [
      `<p>سلام ${greeting}،</p>`,
      "<p>درخواست بازیابی گذرواژه برای حساب شما ثبت شده است. برای تعیین گذرواژه جدید روی پیوند زیر کلیک کنید:</p>",
      `<p><a href="${escapeHtml(link)}">تغییر گذرواژه</a></p>`,
      '<p style="color:#666;font-size:12px">این پیوند ۱ ساعت معتبر است و فقط یک بار قابل استفاده است. اگر شما این درخواست را ثبت نکرده‌اید، این ایمیل را نادیده بگیرید؛ گذرواژه شما تغییری نکرده است.</p>',
    ]),
  };
}
