import { createHash, randomBytes } from "node:crypto";

/**
 * Pure helpers and shared constants for email verification and password
 * recovery. No `server-only` marker and no framework imports, so unit tests
 * can exercise the cryptography directly.
 */

export const AUTH_TOKEN_PURPOSES = [
  "email_verify",
  "password_reset",
  "email_change",
] as const;
export type AuthTokenPurpose = (typeof AUTH_TOKEN_PURPOSES)[number];

/** Email-verification links are valid for one day. */
export const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

/** Password-reset links are valid for one hour: shorter because they can
 * change credentials, and the flow is interactive (the user is waiting). */
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/** Email-change links get the one-hour policy window too: like a password
 * reset they change an account-identity attribute, so they deliberately
 * share the stricter TTL rather than the 24-hour verification window. */
export const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;

const TOKEN_TTL_MS: Record<AuthTokenPurpose, number> = {
  email_verify: EMAIL_VERIFY_TTL_MS,
  password_reset: PASSWORD_RESET_TTL_MS,
  email_change: EMAIL_CHANGE_TTL_MS,
};

export function tokenTtlMs(purpose: AuthTokenPurpose): number {
  return TOKEN_TTL_MS[purpose];
}

/**
 * 32 random bytes (256 bits) rendered base64url. This is the value that goes
 * into the emailed link; it is never persisted — only its hash is stored.
 */
export function generateAuthToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * SHA-256 of the raw token, hex-encoded, for storage.
 *
 * No salt is needed: the input is already a uniformly random 256-bit value,
 * so plain hashing defeats database-leak replay without slowing lookups.
 */
export function hashAuthToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/** Issue an expiry timestamp `ttl` milliseconds from now. */
export function authTokenExpiry(purpose: AuthTokenPurpose, now = Date.now()): Date {
  return new Date(now + tokenTtlMs(purpose));
}

/**
 * Shared user-facing copy. Every recovery/verification response that must not
 * reveal account existence is drawn from here so existing and unknown emails
 * are answered with byte-identical messages.
 */

/** Generic "check your inbox" answer, returned whether or not the account exists. */
export const RECOVERY_REQUEST_SENT_MESSAGE =
  "اگر حسابی با این ایمیل وجود داشته باشد، ایمیلی برای بازیابی گذرواژه ارسال شده است.";

/** Shown for EVERY request (existing or not) when email delivery is unavailable. */
export const EMAIL_DELIVERY_UNAVAILABLE_MESSAGE =
  "سرویس ایمیل موقتاً در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید.";

/** Invalid/expired/consumed/wrong-purpose token: one indistinguishable answer. */
export const INVALID_TOKEN_MESSAGE =
  "این پیوند معتبر نیست یا منقضی شده است. لطفاً درخواست جدیدی ثبت کنید.";

export const VERIFY_EMAIL_REQUIRED_MESSAGE =
  "برای انجام این عملیات ابتدا باید ایمیل خود را تأیید کنید.";

export const VERIFICATION_EMAIL_SENT_MESSAGE =
  "ایمیل تأیید ارسال شد. لطفاً صندوق ورودی (و پوشه هرزنامه) خود را بررسی کنید.";

export const ALREADY_VERIFIED_MESSAGE =
  "ایمیل شما قبلاً تأیید شده است. نیازی به اقدام دیگری نیست.";

export const EMAIL_VERIFIED_MESSAGE = "ایمیل شما با موفقیت تأیید شد.";

export const PASSWORD_RESET_DONE_MESSAGE =
  "گذرواژه شما با موفقیت تغییر کرد. اکنون می‌توانید با گذرواژه جدید وارد شوید.";

/** Neutral confirmation after the email-change link was queued for the NEW address. */
export const EMAIL_CHANGE_SENT_MESSAGE =
  "پیوند تأیید به نشانی جدید ارسال شد. ایمیل حساب شما تنها پس از باز کردن آن پیوند تغییر می‌کند.";

/** The change has been applied; sign-in now needs the new address. */
export const EMAIL_CHANGED_MESSAGE =
  "ایمیل حساب شما با موفقیت تغییر کرد. اکنون می‌توانید با نشانی جدید وارد شوید.";

/** The requested address was claimed by another account before completion. */
export const EMAIL_ADDRESS_TAKEN_MESSAGE =
  "این ایمیل دیگر در دسترس نیست. لطفاً درخواست جدیدی با نشانی دیگر ثبت کنید.";

/**
 * A correctly purposed link that was already spent. Deliberately distinct
 * from the generic invalid answer: the holder of this link was the intended
 * recipient, and telling them the link is stale reveals nothing an attacker
 * could not already infer from clicking it themselves.
 */
export const EMAIL_CHANGE_ALREADY_USED_MESSAGE =
  "این پیوند قبلاً استفاده شده است. برای تغییر دیگر، درخواست جدیدی ثبت کنید.";
