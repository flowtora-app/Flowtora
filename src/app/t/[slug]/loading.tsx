// Phase 18 Slice H — generic loading skeleton.
//
// Next.js renders this under the tenant layout during server fetches for
// any route segment that doesn't ship its own loading.tsx. Kept quiet on
// purpose — a blinking spinner is more distracting than a few
// pulsing panels, and lets the actual page "swap in" without layout jank.

export default function TenantLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <div
        className="h-7 w-52 animate-pulse rounded"
        style={{ background: "var(--surface-2)" }}
      />
      <div
        className="h-4 w-72 animate-pulse rounded"
        style={{ background: "var(--surface-2)" }}
      />
      <div
        className="mt-6 animate-pulse rounded-xl"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          height: 280,
        }}
      />
      <div
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
        aria-hidden
      >
        <div
          className="animate-pulse rounded-xl"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            height: 160,
          }}
        />
        <div
          className="animate-pulse rounded-xl"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            height: 160,
          }}
        />
      </div>
    </div>
  );
}
