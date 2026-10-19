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
 */
export async function mintAuthToken(input: {
  email: string;
  purpose: "email_verify" | "password_reset";
  rawToken: string;
  expiresAt?: Date;
}): Promise<void> {
  const { email, purpose, rawToken } = input;
  const expiresAt =
    input.expiresAt ??
    new Date(Date.now() + (purpose === "email_verify" ? 24 : 1) * 3_600_000);
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
      `INSERT INTO auth_tokens (id, user_id, purpose, token_hash, expires_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
      [userId, purpose, tokenHash, expiresAt],
    );
  });
}
