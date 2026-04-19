// Phase 15 Slice A — friendly landing for an invalid share token.

export default function ShareInvalidPage() {
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
          <div className="text-2xl font-semibold">Link not found</div>
          <div className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            This share link isn&apos;t valid. Please double-check the URL or
            ask the shop to re-send it.
          </div>
        </div>
      </div>
    </div>
  );
}
