import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getAppUrl, isProduction } from "@/lib/env";
import {
  buildPasswordResetEmail,
  buildVerificationEmail,
  type OutboundEmail,
} from "./templates";

/**
 * Email delivery boundary.
 *
 * No transactional-email provider is integrated with this project yet, so the
 * application ships three explicitly distinct behaviours instead of pretending
 * mail works:
 *
 * 1. Development / test — `EMAIL_OUTBOX_DIR` set: each message is written as a
 *    JSON file into that directory (a local "outbox"). This is a filesystem
 *    artefact for developers and test suites, NOT an HTTP endpoint, and the
 *    directory is gitignored.
 * 2. Development / test — no outbox directory: messages, including the raw
 *    token link, are logged to the server console. Explicitly development
 *    only; production never logs tokens.
 * 3. Production — no provider is wired: every send fails with
 *    `EmailDeliveryUnavailableError`. Callers map that to a generic,
 *    enumeration-safe "service unavailable" answer. Wiring a real provider
 *    means implementing `EmailAdapter` and selecting it here; production
 *    credentials/keys are not defined (and must not be invented) until then.
 *
 * `isEmailDeliveryAvailable` lets request handlers pre-check delivery before
 * touching the database, so an unconfigured production deployment answers
 * identically for existing and unknown email addresses.
 */

export class EmailDeliveryUnavailableError extends Error {
  constructor() {
    super("Email delivery is not configured for this environment.");
    this.name = "EmailDeliveryUnavailableError";
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

/** Production adapter placeholder: fails loudly instead of dropping mail. */
const unconfiguredAdapter: EmailAdapter = {
  name: "unconfigured",
  async send() {
    throw new EmailDeliveryUnavailableError();
  },
};

export function resolveEmailAdapter(): EmailAdapter {
  if (isProduction()) {
    // Never fall back to console/outbox in production: both would turn the
    // server logs or filesystem into a token-disclosure surface.
    return unconfiguredAdapter;
  }
  const outbox = process.env.EMAIL_OUTBOX_DIR?.trim();
  if (outbox) {
    return fileOutboxAdapter(outbox);
  }
  return consoleAdapter;
}

/**
 * True when this environment can actually attempt delivery. Handlers must
 * check this BEFORE looking up an account so an unconfigured deployment
 * cannot be used to probe which addresses exist.
 */
export function isEmailDeliveryAvailable(): boolean {
  return resolveEmailAdapter().name !== "unconfigured";
}

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
    // error, ...) is still an outage of the same user-visible kind. Never
    // let the raw error — or the recipient — escape to the client.
    console.error(
      `[finora] email delivery failed via ${resolveEmailAdapter().name}:`,
      error instanceof Error ? error.message : "unknown error",
    );
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
