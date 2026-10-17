import "server-only";
import { compare, hash } from "bcryptjs";

const BCRYPT_COST = 12;

/**
 * Valid bcrypt hash of a random, never-issued value. It is compared against on
 * failed logins for unknown emails so the response time does not reveal whether
 * an account exists. This is not a secret and grants no access.
 */
export const DUMMY_PASSWORD_HASH =
  "$2b$12$rIZJL4TdM5k39ajV3qDS2uG/Q5nhiF2XZ/aje1hH2DZEXxvOi/fIC";

export function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_COST);
}

export function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return compare(password, passwordHash);
}
