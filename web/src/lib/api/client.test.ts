
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "./errors";
import { apiRequest } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("apiRequest", () => {
  it("sends JSON requests with the configured API base URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "http://localhost:8000/");

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "drop_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const result = await apiRequest<{ id: string }>("/v1/drops", {
      method: "POST",
      body: { kind: "text", ttl_seconds: 3600, max_views: 1 },
    });

    expect(result).toEqual({ id: "drop_123" });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit,
    ];

    expect(url).toBe("http://localhost:8000/v1/drops");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      kind: "text",
      ttl_seconds: 3600,
      max_views: 1,
    });
  });

  it("sends binary data with a bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const bytes = new Uint8Array([1, 2, 3, 4]);

    await apiRequest<{ status: string }>("/v1/drops/drop_123/envelope", {
      method: "PUT",
      bearerToken: "test-owner-token",
      body: bytes,
      contentType: "application/octet-stream",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);

    expect(headers.get("Authorization")).toBe(
      "Bearer test-owner-token",
    );
    expect(headers.get("Content-Type")).toBe(
      "application/octet-stream",
    );
    expect(init.body).toBeInstanceOf(Blob);
    expect(new Uint8Array(
      await (init.body as Blob).arrayBuffer(),
    )).toEqual(bytes);
  });

  it("returns undefined for HTTP 204", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest<void>("/v1/drops/drop_123", {
        method: "DELETE",
        bearerToken: "test-owner-token",
      }),
    ).resolves.toBeUndefined();
  });

  it("maps HTTP 429 to a rate-limit error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Too many requests" }), {
        status: 429,
        headers: { "Content-Type": "application/json", "Retry-After": "30" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("/v1/drops"),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      retryAfterSeconds: 30,
    });
  });

  it("rejects paths that could override the configured API host", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("//evil.example/steal"),
    ).rejects.toThrow("API paths must be absolute paths");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed successful JSON responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("not-json", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("/v1/drops"),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
      status: 200,
    });
  });

  it("converts network failures to ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Network unavailable")),
    );

    await expect(
      apiRequest("/v1/drops"),
    ).rejects.toBeInstanceOf(ApiError);

    await expect(
      apiRequest("/v1/drops"),
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});
