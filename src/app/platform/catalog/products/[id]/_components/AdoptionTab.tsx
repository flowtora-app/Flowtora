import Link from "next/link";
import { pushMasterProductUpdate } from "@/app/actions/platform-catalog";
import type { CatalogDetail } from "@/server/platform/catalog";
import { DeferredNote, Kpi } from "../../_components/shared";

export function AdoptionTab({
  detail, canManage,
}: {
  detail: CatalogDetail;
  canManage: boolean;
}) {
  const isPublished = detail.status === "PUBLISHED";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Kpi label="Tenant clones"
             value={String(detail.cloneCount)}
             tone={detail.cloneCount > 0 ? "good" : "default"}
             sub="Tenants who cloned this template" />
        <Kpi label="Status"
             value={detail.status}
             tone={detail.status === "PUBLISHED" ? "good" : detail.status === "DRAFT" ? "warning" : "default"} />
        <Kpi label="Last published"
             value={detail.publishedAt ? detail.publishedAt.toLocaleDateString() : "—"} />
      </div>

      <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3"
             style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            Push update
          </h2>
          {canManage && isPublished && (
            <form action={pushMasterProductUpdate.bind(null, detail.id)}>
              <button type="submit"
                      className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                      style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
                Push to all clones
              </button>
            </form>
          )}
        </div>
        <div className="p-4 text-[12px]" style={{ color: "var(--text-default)" }}>
          {!isPublished ? (
            <p style={{ color: "var(--text-muted)" }}>
              Publish this product first before pushing — drafts can&apos;t propagate to tenants.
            </p>
          ) : detail.cloneCount === 0 ? (
            <p style={{ color: "var(--text-muted)" }}>
              No tenants have cloned this template yet — there&apos;s nothing to push to.
            </p>
          ) : (
            <p>
              Pushing updates the headline fields (name, description, image, base price) on every
              cloned tenant product. Tenant-local customizations on option groups, pricing tiers,
              and waste factors are <strong>preserved</strong>.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            Tenants using this template ({detail.cloneCount})
          </h2>
        </div>
        {detail.clones.length === 0 ? (
          <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
            No clones yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Tenant</th>
                  <th className="px-4 py-2 font-medium">Cloned product name</th>
                  <th className="px-4 py-2 font-medium">Cloned at</th>
                </tr>
              </thead>
              <tbody>
                {detail.clones.map((c) => (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-4 py-2">
                      <Link href={`/platform/tenants/${c.tenantId}`}
                            className="hover:underline" style={{ color: "var(--text-default)" }}>
                        {c.tenantName}
                      </Link>
                    </td>
                    <td className="px-4 py-2" style={{ color: "var(--text-default)" }}>{c.name}</td>
                    <td className="px-4 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {c.createdAt.toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DeferredNote>
        <strong>Per-tenant approval workflow on pushes is deferred.</strong> Today push updates
        every cloned product synchronously. The "tenant approves before applying" flow ships
        when the worker pipeline + workspace notification stream land.
      </DeferredNote>
    </div>
  );
}
