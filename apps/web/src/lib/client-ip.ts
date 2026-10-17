/**
 * Best-effort client address for rate-limit bucketing.
 *
 * SECURITY NOTE: `x-forwarded-for` is only trustworthy when the app runs
 * behind a reverse proxy that overwrites it. Otherwise a client can forge it,
 * so the per-IP limit is only a secondary defence; the per-account limit does
 * not depend on this value.
 */
export interface HeaderReader {
  get(name: string): string | null;
}

const IP_PATTERN = /^[0-9a-fA-F:.]{1,45}$/;

export function getClientIp(headers: HeaderReader): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = forwarded || headers.get("x-real-ip")?.trim() || "";
  return IP_PATTERN.test(candidate) ? candidate : "unknown";
}