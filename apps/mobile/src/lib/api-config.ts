import { Platform } from "react-native";

export function resolveApiBaseUrl(
  explicitUrl: string | undefined,
  platform: string,
): string {
  const configured = explicitUrl?.trim();
  if (configured) {
    return configured.replace(/\/+$/, "");
  }
  const host = platform === "android" ? "10.0.2.2" : "127.0.0.1";
  return `http://${host}:3000`;
}

export const API_BASE_URL = resolveApiBaseUrl(
  process.env.EXPO_PUBLIC_API_URL,
  Platform.OS,
);
