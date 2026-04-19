import * as Sentry from "@sentry/nextjs";

// Next.js calls register() once per runtime (node / edge) when the
// server boots. We branch on NEXT_RUNTIME so each runtime gets the
// right SDK init — @sentry/nextjs ships separate entry points for
// Node and the Edge runtime and mixing them throws at build time.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
      // Sample 10% of traces in prod; full rate in dev so local issues
      // are never dropped. Adjust down if traces get noisy.
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      enabled: Boolean(
        process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
      ),
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
      enabled: Boolean(
        process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
      ),
    });
  }
}

// Required for Sentry to capture errors from nested React Server
// Components — re-exports Sentry.captureRequestError so Next hands
// RSC render errors to it automatically.
export const onRequestError = Sentry.captureRequestError;
