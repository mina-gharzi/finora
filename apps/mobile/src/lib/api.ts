import type {
  MobileApiError as MobileApiErrorBody,
  MobileDashboardPeriod,
  MobileLoginResponse,
  MobileOverviewResponse,
} from "@finora/shared";

import { API_BASE_URL } from "./api-config.ts";

const REQUEST_TIMEOUT_MS = 15_000;

export class MobileApiError extends Error {
  readonly status: number;
  readonly code: MobileApiErrorBody["error"] | "network" | "invalid_response";

  constructor(
    message: string,
    status: number,
    code: MobileApiErrorBody["error"] | "network" | "invalid_response",
  ) {
    super(message);
    this.name = "MobileApiError";
    this.status = status;
    this.code = code;
  }
}

async function requestJson<T>(
  path: string,
  init: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...init.headers,
      },
    });
  } catch {
    throw new MobileApiError(
      "ارتباط با سرور برقرار نشد. اتصال شبکه را بررسی کنید.",
      0,
      "network",
    );
  } finally {
    clearTimeout(timeout);
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    const errorBody = body as Partial<MobileApiErrorBody> | null;
    const code =
      errorBody?.error === "bad_request" ||
      errorBody?.error === "unauthorized" ||
      errorBody?.error === "rate_limited"
        ? errorBody.error
        : "network";
    throw new MobileApiError(
      typeof errorBody?.message === "string"
        ? errorBody.message
        : "درخواست انجام نشد. لطفاً دوباره تلاش کنید.",
      response.status,
      code,
    );
  }

  if (body === null || typeof body !== "object") {
    throw new MobileApiError(
      "پاسخ سرور نامعتبر بود.",
      response.status,
      "invalid_response",
    );
  }

  return body as T;
}

export async function loginMobile(
  email: string,
  password: string,
): Promise<MobileLoginResponse> {
  const response = await requestJson<MobileLoginResponse>(
    "/api/mobile/auth/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
  );

  if (
    typeof response.token !== "string" ||
    typeof response.expiresAt !== "string" ||
    typeof response.user?.id !== "string"
  ) {
    throw new MobileApiError(
      "پاسخ سرور نامعتبر بود.",
      200,
      "invalid_response",
    );
  }

  return response;
}

export async function fetchMobileOverview(
  token: string,
  period: MobileDashboardPeriod = "this-month",
): Promise<MobileOverviewResponse> {
  return requestJson<MobileOverviewResponse>(
    `/api/mobile/overview?period=${encodeURIComponent(period)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    },
  );
}
