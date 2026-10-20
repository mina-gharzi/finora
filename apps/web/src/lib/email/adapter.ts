import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAppUrl, isProduction } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import {
  buildEmailChangeEmail,
  buildPasswordResetEmail,
  buildVerificationEmail,
  type OutboundEmail,
} from "./templates";

/**
 * Email delivery boundary.
 *
 * The adapter is chosen strictly by environment:
 *
 * 1. Production with BOTH `RESEND_API_KEY` and `EMAIL_FROM` set: messages are
 *    sent through Resend (official SDK, imported lazily). This is the only
 *    production adapter; the API key stays inside the adapter closure and is
 *    never interpolated into messages, errors or logs.
 * 2. Production without that configuration: every send fails with
 *    `EmailDeliveryUnavailableError`, which callers map to a generic,
 *    enumeration-safe "service unavailable" answer. There is deliberately NO
 *    console or file-outbox fallback in production — both would turn server
 *    logs or the filesystem into a token-disclosure surface.
 * 3. Development / test — explicit opt-in: `EMAIL_PROVIDER=resend` with BOTH
 *    Resend variables set: messages are sent through Resend so real delivery
 *    can be exercised manually from local development (the credentials live
 *    in `apps/web/.env.development.local`, which only `next dev` loads). The
 *    flag is read ONLY in this non-production branch, so production selection
 *    never depends on it; an unknown flag value or an incomplete Resend
 *    configuration falls through to behaviours 4 and 5 unchanged.
 * 4. Development / test — `EMAIL_OUTBOX_DIR` set: each message is written as a
 *    JSON file into that directory (a local "outbox"). This is a filesystem
 *    artefact for developers and test suites, NOT an HTTP endpoint, and the
 *    directory is gitignored.
 * 5. Development / test — no outbox directory: messages, including the raw
 *    token link, are logged to the server console. Explicitly development
 *    only; production never logs tokens.
 *
 * Development sends real email ONLY after that explicit opt-in; with the flag
 * absent — the default, and what the automated tests enforce — local runs log
 * or file messages instead. Production is unaffected by the flag: real
 * delivery there is decided solely by configuration.
 *
 * `isEmailDeliveryAvailable` lets request handlers pre-check delivery before
 * touching the database, so an unconfigured deployment answers identically
 * for existing and unknown email addresses. It reports configuration only —
 * it does not guarantee that the provider accepts any individual send (an
 * invalid key, an unverified sender domain or a provider outage still fail
 * closed as the same generic answer at send time).
 *
 * Secrets: `RESEND_API_KEY` is read by this server-only module and never
 * logged. Provider failures are reduced to short machine codes before they
 * can reach a log line, and the shared failure log additionally redacts token
 * query values and email addresses.
 */

export class EmailDeliveryUnavailableError extends Error {
  constructor() {
    super("Email delivery is not configured for this environment.");
    this.name = "EmailDeliveryUnavailableError";
  }
}

/**
 * A configured provider attempt failed. Carries only a short, sanitized
 * machine code derived from the failure (e.g. "rate_limit_exceeded") — never
 * the provider's error message (which can echo request details such as the
 * recipient), never anything from the message payload — so it is safe to log.
 */
export class EmailProviderError extends Error {
  /** Sanitized failure code; safe for server logs. */
  readonly code: string;

  constructor(code: string) {
    super(`email provider send failed (${code})`);
    this.name = "EmailProviderError";
    this.code = code;
  }
}

export interface EmailAdapter {
  readonly name: string;
  send(message: OutboundEmail): Promise<void>;
}

/** Development adapter that appends each message to a local outbox directory. */
function fileOutboxAdapter(directory: string): EmailAdapter {
  return {
    name: "file-outbox",
    async send(message) {
      await mkdir(directory, { recursive: true });
      const safeStamp = new Date().toISOString().replaceAll(":", "-");
      const safeAddress = message.to.replace(/[^a-zA-Z0-9@._-]/g, "_");
      const file = join(directory, `${safeStamp}_${safeAddress}.json`);
      await writeFile(
        file,
        JSON.stringify(
          { sentAt: new Date().toISOString(), ...message },
          null,
          2,
        ),
        "utf8",
      );
    },
  };
}

/** Development adapter that prints the full message to the server console. */
const consoleAdapter: EmailAdapter = {
  name: "console",
  async send(message) {
    // Tokens are printed here ON PURPOSE in development so flows can be
    // exercised without a provider. This adapter must never be selected in
    // production (see resolveEmailAdapter).
    console.info(
      `[finora][dev-email] to=${message.to} subject=${message.subject}\n${message.text}`,
    );
  },
};

/** Production fallback when Resend is not configured: fails loudly instead of dropping mail. */
const unconfiguredAdapter: EmailAdapter = {
  name: "unconfigured",
  async send() {
    throw new EmailDeliveryUnavailableError();
  },
};

/**
 * Server-only Resend configuration, read lazily so importing this module
 * never throws. BOTH values are required: partial configuration counts as
 * unconfigured so a half-set-up deployment fails closed rather than sending
 * from an unverified sender or with a missing key.
 */
function getResendConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

/**
 * Reduces any failure label to `[A-Za-z0-9_]` (capped at 40 characters), so
 * nothing provider-supplied can ride along into a log line.
 */
function safeCode(label: string): string {
  const code = label.replace(/[^A-Za-z0-9_]/g, "").slice(0, 40);
  return code || "unknown";
}

/**
 * Production adapter backed by Resend. Built only from a complete
 * configuration (see `resolveEmailAdapter`). `apiKey` lives in this closure
 * and is handed to the SDK constructor — it is never logged or echoed.
 *
 * Failure handling:
 * - Resend reports API failures as `{ error: { name, statusCode, message } }`.
 *   Only the stable machine `name` survives into an `EmailProviderError`; the
 *   message may contain request details (e.g. the recipient) and is dropped.
 * - Transport-level exceptions (DNS, TLS, timeouts) are likewise reduced to
 *   the error class name — their messages can contain request details.
 */
function resendAdapter(config: { apiKey: string; from: string }): EmailAdapter {
  return {
    name: "resend",
    async send(message) {
      // Lazy: environments without this adapter (dev/test/unconfigured
      // production) never load the SDK.
      const { Resend } = await import("resend");
      const resend = new Resend(config.apiKey);

      let response: Awaited<ReturnType<typeof resend.emails.send>>;
      try {
        response = await resend.emails.send({
          from: config.from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        });
      } catch (error) {
        throw new EmailProviderError(
          safeCode(error instanceof Error ? error.name : "unknown"),
        );
      }

      if (response.error) {
        throw new EmailProviderError(safeCode(response.error.name));
      }
    },
  };
}

export function resolveEmailAdapter(): EmailAdapter {
  if (isProduction()) {
    const resend = getResendConfig();
    if (resend) return resendAdapter(resend);
    // Fail closed: never fall back to console/outbox in production — both
    // would turn the server logs or filesystem into a token-disclosure
    // surface. Callers map the typed error to the generic unavailable answer.
    // EMAIL_PROVIDER is deliberately NOT read here: production selection is
    // decided by configuration alone (configured Resend or unconfigured).
    return unconfiguredAdapter;
  }
  // Development-only opt-in for manual delivery testing. Reading the flag
  // outside the production branch above is what keeps production structurally
  // incapable of selecting a development adapter.
  if (process.env.EMAIL_PROVIDER?.trim().toLowerCase() === "resend") {
    const resend = getResendConfig();
    if (resend) return resendAdapter(resend);
    // Incomplete configuration: fall through to the development defaults so a
    // half-set-up local environment keeps working (and visibly logs instead
    // of silently dropping mail).
  }
  const outbox = process.env.EMAIL_OUTBOX_DIR?.trim();
  if (outbox) {
    return fileOutboxAdapter(outbox);
  }
  return consoleAdapter;
}

/**
 * True when an adapter is configured to ATTEMPT delivery for this
 * environment. Handlers must check this BEFORE looking up an account, so an
 * unconfigured deployment cannot be used to probe which addresses exist.
 *
 * This is a configuration check, not a delivery guarantee: the provider may
 * still reject an individual send (invalid key, unverified sender domain,
 * outage), and every such failure maps to the same generic unavailable answer.
 */
export function isEmailDeliveryAvailable(): boolean {
  return resolveEmailAdapter().name !== "unconfigured";
}

/**
 * Structured logger for the email boundary. A module-level logger is correct
 * here: delivery is fire-and-forget from a server action that may not carry a
 * request id, and the event name plus adapter name are enough context. The
 * logger scrubs emails, tokens and URL query strings from any value, so the
 * raw provider message can never leak a recovery link even if an adapter
 * echoes one.
 */
const emailLogger = createLogger();

async function sendOrClassify(
  message: OutboundEmail,
): Promise<"sent" | "unavailable"> {
  try {
    await resolveEmailAdapter().send(message);
    return "sent";
  } catch (error) {
    if (error instanceof EmailDeliveryUnavailableError) {
      return "unavailable";
    }
    // A configured adapter that fails mid-flight (connection refused, API
    // error, ...) is still an outage of the same user-visible kind. Never let
    // the raw error — or the recipient — escape to the client. The logger
    // reduces the error to its name/code (with the message scrubbed) and drops
    // blocked keys, so token links and addresses never reach the log line.
    emailLogger.error("email.delivery.failed", {
      adapter: resolveEmailAdapter().name,
      error,
    });
    return "unavailable";
  }
}

export async function sendVerificationEmail(input: {
  to: string;
  name: string;
  rawToken: string;
}): Promise<"sent" | "unavailable"> {
  return sendOrClassify(
    buildVerificationEmail({ ...input, baseUrl: getAppUrl() }),
  );
}

export async function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  rawToken: string;
}): Promise<"sent" | "unavailable"> {
  return sendOrClassify(
    buildPasswordResetEmail({ ...input, baseUrl: getAppUrl() }),
  );
}

/**
 * Delivers the email-change confirmation link to the NEW address (the
 * pending destination — not the account's current one).
 */
export async function sendEmailChangeEmail(input: {
  to: string;
  name: string;
  rawToken: string;
}): Promise<"sent" | "unavailable"> {
  return sendOrClassify(
    buildEmailChangeEmail({ ...input, baseUrl: getAppUrl() }),
  );
}
