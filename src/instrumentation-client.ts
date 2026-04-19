import * as Sentry from "@sentry/nextjs";

// Browser-side Sentry init. Next 15 loads this automatically on the
// client when present alongside instrumentation.ts. Kept small on
// purpose — no Replay or Session Replay integration yet so we don't
// ship that bundle to every page load.

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
});

// Required so Next.js router transitions are captured as Sentry
// performance spans. Without this, client-side navigations don't
// show up in the trace waterfall.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
