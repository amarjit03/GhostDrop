
import { ApiError, createApiError } from "./errors";

const DEFAULT_TIMEOUT_MS = 15_000;

function getApiBaseUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  const baseUrl = configuredUrl || "http://localhost:8000";

  return baseUrl.replace(/\/+$/, "");
}

function joinUrl(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("API paths must be absolute paths on the configured API host.");
  }

  return `${getApiBaseUrl()}${path}`;
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;

  const seconds = Number(value);

  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds;
  }

  const retryDate = Date.parse(value);

  if (!Number.isNaN(retryDate)) {
    return Math.max(0, Math.ceil((retryDate - Date.now()) / 1000));
  }

  return undefined;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError({
      code: "NETWORK_ERROR",
      message: "Unable to reach the server. Check your connection and try again.",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function readErrorBody(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export interface ApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  bearerToken?: string;
  contentType?: string;
  timeoutMs?: number;
}

export async function apiRequest<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const {
    method = "GET",
    body,
    bearerToken,
    contentType,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const headers = new Headers({
    Accept: "application/json",
  });

  if (bearerToken) {
    headers.set("Authorization", `Bearer ${bearerToken}`);
  }

  let requestBody: BodyInit | undefined;

  if (body instanceof Uint8Array) {
    requestBody = new Blob([body as BlobPart]);
    headers.set("Content-Type", contentType ?? "application/octet-stream");
  } else if (body !== undefined) {
    requestBody = JSON.stringify(body);
    headers.set("Content-Type", contentType ?? "application/json");
  }

  const response = await fetchWithTimeout(
    joinUrl(path),
    {
      method,
      headers,
      body: requestBody,
      cache: "no-store",
      credentials: "omit",
    },
    timeoutMs,
  );

  if (!response.ok) {
    const errorBody = await readErrorBody(response);
    const error = createApiError(
      response.status,
      errorBody,
      response.headers.get("Retry-After"),
    );

    const retryAfterSeconds = parseRetryAfter(
      response.headers.get("Retry-After"),
    );

    throw new ApiError({
      code: error.code,
      message: error.message,
      status: error.status,
      retryAfterSeconds,
      serverCode: error.serverCode,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError({
      code: "INVALID_RESPONSE",
      message: "The server returned an invalid response.",
      status: response.status,
    });
  }
}
