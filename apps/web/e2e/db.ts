import { Client } from "pg";

/**
 * Direct Postgres access for the e2e suite only.
 *
 * The production app verifies emails through the emailed link; tests have no
 * inbox, so they apply the same end state the link would produce (and mint
 * purpose-bound tokens the same way the server does — hashed, single-use,
 * expiring). This is test plumbing against the local dev database, not a
 * production code path.
 */

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL must be set for e2e database helpers");
  }
  return url;
}

async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

/** Applies the end state of a completed email verification. */
export async function markEmailVerified(email: string): Promise<void> {
  await withClient((client) =>
    client.query(
      "UPDATE users SET email_verified_at = NOW() WHERE email = $1 AND email_verified_at IS NULL",
      [email],
    ),
  );
}

/**
 * Empties the persistent rate-limit counters.
 *
 * The counters live in Postgres and survive across runs. Every e2e test uses a
 * fresh forwarded IP (see e2e/fixtures.ts), so buckets never collide within a
 * run — but a previous run (or a developer's manual testing) could have left a
 * bucket at its limit. A clean slate per run keeps the suite deterministic.
 * This touches only the rate-limit table, never application data.
 */
export async function clearRateLimitCounters(): Promise<void> {
  await withClient((client) => client.query("DELETE FROM rate_limit_counters"));
}

/** Undoes verification so a flow can exercise the unverified state. */
export async function markEmailUnverified(email: string): Promise<void> {
  await withClient((client) =>
    client.query(
      "UPDATE users SET email_verified_at = NULL WHERE email = $1",
      [email],
    ),
  );
}

/**
 * Inserts a purpose-bound auth token exactly the way the server stores it:
 * SHA-256 hash of the raw token, fixed expiry window, unconsumed.
 *
 * `email_change` rows must carry `targetEmail` — the same NOT NULL/parity
 * constraint the production table enforces (a CHECK requires exactly those
 * rows to have a destination).
 */
export async function mintAuthToken(input: {
  email: string;
  purpose: "email_verify" | "password_reset" | "email_change";
  rawToken: string;
  /** Destination for `email_change` tokens (required by the table CHECK). */
  targetEmail?: string;
  expiresAt?: Date;
}): Promise<void> {
  const { email, purpose, rawToken } = input;
  const expiresAt =
    input.expiresAt ??
    new Date(Date.now() + (purpose === "email_verify" ? 24 : 1) * 3_600_000);
  const targetEmail = input.targetEmail ?? null;
  if (purpose === "email_change" && !targetEmail) {
    throw new Error("mintAuthToken(email_change) requires targetEmail");
  }
  if (purpose !== "email_change" && targetEmail) {
    throw new Error(
      `mintAuthToken(${purpose}) must not set targetEmail (table CHECK forbids it)`,
    );
  }
  const { createHash } = await import("node:crypto");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  await withClient(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [email],
    );
    const userId = rows[0]?.id;
    if (!userId) {
      throw new Error(`No user with email ${email} to mint a token for`);
    }
    // Mirror the server's issue step: previous tokens of this purpose die.
    await client.query(
      "DELETE FROM auth_tokens WHERE user_id = $1 AND purpose = $2",
      [userId, purpose],
    );
    await client.query(
      `INSERT INTO auth_tokens (id, user_id, purpose, token_hash, target_email, expires_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
      [userId, purpose, tokenHash, targetEmail, expiresAt],
    );
  });
}
