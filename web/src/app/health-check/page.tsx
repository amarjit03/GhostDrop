
"use client";

import { useEffect, useState } from "react";

type ApiStatus = "checking" | "ok" | "error";

export default function HealthCheckPage() {
  const [status, setStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    const controller = new AbortController();

    async function checkApi() {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

        if (!baseUrl) {
          throw new Error("API base URL is not configured");
        }

        const response = await fetch(
          `${baseUrl.replace(/\/$/, "")}/health`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        setStatus("ok");
      } catch {
        if (!controller.signal.aborted) {
          setStatus("error");
        }
      }
    }

    void checkApi();

    return () => controller.abort();
  }, []);

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-bold">Ghostdrop API Health</h1>
      <p className="mt-4" role="status">
        {status === "checking" && "API: checking..."}
        {status === "ok" && "API: ok"}
        {status === "error" && "API: error — check backend and CORS"}
      </p>
    </main>
  );
}
