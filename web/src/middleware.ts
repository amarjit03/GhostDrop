import { NextRequest, NextResponse } from "next/server";

function getOrigin(value: string | undefined): string {
  if (!value) return "";

  try {
    return new URL(value).origin;
  } catch {
    throw new Error("Invalid configured origin");
  }
}

export function middleware(request: NextRequest) {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = btoa(String.fromCharCode(...nonceBytes));

  const apiOrigin = getOrigin(process.env.NEXT_PUBLIC_API_URL);
  const bucketOrigin = getOrigin(
    process.env.NEXT_PUBLIC_STORAGE_ORIGIN,
  );

  const isProduction = process.env.NODE_ENV === "production";

  const connectSources = [
    "'self'",
    apiOrigin,
    bucketOrigin,
  ].filter(Boolean).join(" ");

  const csp = isProduction
    ? [
        "default-src 'none'",
        `script-src 'self' 'nonce-${nonce}' 'wasm-unsafe-eval'`,
        `style-src 'self' 'nonce-${nonce}'`,
        `connect-src ${connectSources}`,
        "img-src 'self' data:",
        "font-src 'self'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; ")
    : [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`,
        `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'`,
        `connect-src ${connectSources} ws: wss:`,
        "img-src 'self' data:",
        "font-src 'self'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );

  if (request.nextUrl.pathname.startsWith("/d/")) {
    response.headers.set("Cache-Control", "no-store");
  }

  if (isProduction) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};