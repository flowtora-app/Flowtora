import { DeferredNote } from "../../_components/shared";

export function VersionsTab({
  versions,
}: {
  versions: {
    id: string;
    version: number;
    note: string | null;
    publishedByUserId: string | null;
    publishedByName: string | null;
    createdAt: Date;
  }[];
}) {
  return (
    <div className="space-y-5">
      <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            Version history ({versions.length})
          </h2>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Each Publish appends a snapshot. Newest first, capped at 25.
          </p>
        </div>
        {versions.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            No versions yet. Click <strong>Publish</strong> in the header to mint v1.
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {versions.map((v) => (
              <li key={v.id} className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[80px_1fr_auto]">
                <span className="font-mono text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
                  v{v.version}
                </span>
                <div>
                  <div className="text-[12px]" style={{ color: "var(--text-default)" }}>
                    {v.note ?? "(no note)"}
                  </div>
                  <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    by {v.publishedByName ?? "system"} · {v.createdAt.toLocaleString()}
                  </div>
                </div>
                <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                  {v.id.slice(0, 8)}…
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DeferredNote>
        <strong>Diff viewer + rollback are deferred.</strong> Snapshots are stored as JSON
        under <span className="font-mono">IndustryTemplateVersion.snapshot</span>; the diff +
        rollback UI ships with the JSON-diff component (same dependency as Plans changelog
        and Pricing Formulas).
      </DeferredNote>
    </div>
  );
}
