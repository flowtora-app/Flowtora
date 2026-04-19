"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Root-level error boundary. Required by Next.js to avoid the dev-mode
// "missing required error components, refreshing…" loop when something
// throws above the tenant-scoped boundary at /t/[slug]/error.tsx.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-boundary]", error);
    // Hand the error to Sentry. A no-op when the DSN isn't set, so
    // local dev without a key still behaves like before.
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 40 }}>
        <main style={{ maxWidth: 560, margin: "80px auto", textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p style={{ marginTop: 8, color: "#666" }}>
            We hit an unexpected error. Please try again.
          </p>
          {error.digest && (
            <p style={{ marginTop: 8, fontSize: 12, color: "#999", fontFamily: "monospace" }}>
              Reference: {error.digest}
            </p>
          )}
          {error.message && (
            <pre
              style={{
                marginTop: 16,
                padding: 12,
                background: "#f5f5f5",
                borderRadius: 6,
                fontSize: 12,
                textAlign: "left",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 20,
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              background: "#111",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
