// Phase 15 Slice A — friendly landing for a known-expired share link.
// Reached explicitly when an action detects an expired token (the main
// /share/[token] page 404s instead, so this page is used by server
// actions that want to be kinder).

export default function ShareExpiredPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--surface-0)" }}>
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div
          className="rounded-lg px-6 py-10"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div className="text-2xl font-semibold">Link expired</div>
          <div className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            This share link is no longer active. Please contact the shop to
            request a fresh link.
          </div>
        </div>
      </div>
    </div>
  );
}
