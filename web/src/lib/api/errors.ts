
import type { ApiErrorBody } from "./types";

export type ApiErrorCode =
  | "NETWORK_ERROR"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "SERVER_ERROR"
  | "HTTP_ERROR"
  | "INVALID_RESPONSE";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | undefined;
  readonly retryAfterSeconds: number | undefined;
  readonly serverCode: string | undefined;

  constructor(options: {
    code: ApiErrorCode;
    message: string;
    status?: number;
    retryAfterSeconds?: number;
    serverCode?: string;
  }) {
    super(options.message);

    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.retryAfterSeconds = options.retryAfterSeconds;
    this.serverCode = options.serverCode;
  }
}

export function getApiErrorMessage(
  body: unknown,
  fallback: string,
): string {
  if (!body || typeof body !== "object") {
    return fallback;
  }

  const errorBody = body as ApiErrorBody;
  const detail = errorBody.detail;

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (
    detail &&
    !Array.isArray(detail) &&
    typeof detail === "object"
  ) {
    if (typeof detail.message === "string" && detail.message.trim()) {
      return detail.message;
    }

    if (typeof detail.code === "string") {
      return detail.code;
    }
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const firstError = detail[0];

    if (firstError && typeof firstError.msg === "string") {
      return firstError.msg;
    }
  }

  return fallback;
}

export function createApiError(
  status: number,
  body: unknown,
  retryAfterHeader: string | null,
): ApiError {
  const retryAfterValue =
    retryAfterHeader === null ? NaN : Number(retryAfterHeader);

  const retryAfterSeconds =
    Number.isFinite(retryAfterValue) && retryAfterValue >= 0
      ? retryAfterValue
      : undefined;

  const serverCode =
    body &&
    typeof body === "object" &&
    "detail" in body &&
    (body as ApiErrorBody).detail &&
    !Array.isArray((body as ApiErrorBody).detail) &&
    typeof (body as ApiErrorBody).detail === "object"
      ? (body as {
          detail: { code?: unknown };
        }).detail.code
      : undefined;

  const safeServerCode =
    typeof serverCode === "string" ? serverCode : undefined;

  if (status === 429) {
    return new ApiError({
      code: "RATE_LIMITED",
      message: "Too many requests. Please wait before trying again.",
      status,
      retryAfterSeconds,
      serverCode: safeServerCode,
    });
  }

  if (status === 400 || status === 422) {
    return new ApiError({
      code: "VALIDATION_ERROR",
      message: getApiErrorMessage(
        body,
        "Some submitted information is invalid. Please check and try again.",
      ),
      status,
      serverCode: safeServerCode,
    });
  }

  if (status === 401 || status === 403) {
    return new ApiError({
      code: "UNAUTHORIZED",
      message: "This action could not be authorized.",
      status,
      serverCode: safeServerCode,
    });
  }

  if (status === 404) {
    return new ApiError({
      code: "NOT_FOUND",
      message: "This drop was not found or is no longer available.",
      status,
      serverCode: safeServerCode,
    });
  }

  if (status === 409) {
    return new ApiError({
      code: "CONFLICT",
      message: "This drop has changed or can no longer be modified.",
      status,
      serverCode: safeServerCode,
    });
  }

  if (status === 413) {
    return new ApiError({
      code: "PAYLOAD_TOO_LARGE",
      message: "The content exceeds the allowed size.",
      status,
      serverCode: safeServerCode,
    });
  }

  if (status >= 500) {
    return new ApiError({
      code: "SERVER_ERROR",
      message: "The server encountered a problem. Please try again later.",
      status,
      serverCode: safeServerCode,
    });
  }

  return new ApiError({
    code: "HTTP_ERROR",
    message: getApiErrorMessage(
      body,
      `The request failed (HTTP ${status}).`,
    ),
    status,
    serverCode: safeServerCode,
  });
}
