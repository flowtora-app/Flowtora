import Link from "next/link";

// Phase 23 — tenant-scoped 404. Renders inside the tenant layout so users
// still have the sidebar to navigate away — a dead-end 404 in the middle
// of a workspace session is worse than one that gives them an obvious
// route back to work.

export default function TenantNotFound() {
  return (
    <main className="mx-auto max-w-md px-6 py-20 text-center">
      <h1 className="text-xl font-semibold" style={{ color: "var(--text-default)" }}>
        Not found
      </h1>
      <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
        That page doesn&apos;t exist, or it belongs to a different workspace.
      </p>
      <Link href="." className="mt-6 inline-block text-sm underline" style={{ color: "var(--text-default)" }}>
        Back to this workspace
      </Link>
    </main>
  );
}
