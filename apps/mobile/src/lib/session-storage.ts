import * as SecureStore from "expo-secure-store";
import type { MobileAuthUser } from "@finora/shared";

const SESSION_KEY = "finora.mobile.session.v1";

const SECURE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export interface StoredMobileSession {
  token: string;
  expiresAt: string;
  user: MobileAuthUser;
}

function isStoredSession(value: unknown): value is StoredMobileSession {
  if (typeof value !== "object" || value === null) return false;
  const session = value as Record<string, unknown>;
  const user = session.user;
  if (typeof user !== "object" || user === null) return false;
  const record = user as Record<string, unknown>;

  return (
    typeof session.token === "string" &&
    session.token.length > 0 &&
    typeof session.expiresAt === "string" &&
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.email === "string" &&
    (typeof record.emailVerifiedAt === "string" ||
      record.emailVerifiedAt === null)
  );
}

export async function readStoredSession(): Promise<StoredMobileSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY, SECURE_OPTIONS);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    await deleteStoredSession();
    return null;
  }

  if (!isStoredSession(parsed)) {
    await deleteStoredSession();
    return null;
  }

  const expiresAt = Date.parse(parsed.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await deleteStoredSession();
    return null;
  }

  return parsed;
}

export async function writeStoredSession(
  session: StoredMobileSession,
): Promise<void> {
  await SecureStore.setItemAsync(
    SESSION_KEY,
    JSON.stringify(session),
    SECURE_OPTIONS,
  );
}

export async function deleteStoredSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY, SECURE_OPTIONS);
}
