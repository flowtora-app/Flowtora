// Temporary — verifies Sentry is receiving server errors. Delete after
// the first event lands in the dashboard.

export default function SentryTestPage() {
  throw new Error("Flowtora Sentry smoke test — server component");
}
