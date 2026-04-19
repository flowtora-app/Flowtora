import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/Card";
import { Button } from "@/components/Field";
import {
  fulfillDataExport,
  executeAccountDeletion,
  cancelAccountDeletionAsStaff,
} from "@/app/actions/compliance";

// Phase 17 Slice E — platform-staff compliance queue.
//
// Two tables: open export requests (pending/processing/failed) and
// scheduled deletions. Exports get a "Fulfill" action that synchronously
// generates the payload; deletions get "Execute" once the grace period
// has elapsed, or "Cancel" at any point to retract.

export default async function PlatformCompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;

  const [openExports, completedExports, scheduledDeletions, doneDeletions] = await Promise.all([
    db.dataExportRequest.findMany({
      where: { status: { in: ["PENDING", "PROCESSING", "FAILED"] } },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    db.dataExportRequest.findMany({
      where: { status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: 25,
    }),
    db.accountDeletionRequest.findMany({
      where: { status: "SCHEDULED" },
      orderBy: { scheduledFor: "asc" },
      take: 100,
    }),
    db.accountDeletionRequest.findMany({
      where: { status: { in: ["CANCELED", "COMPLETED"] } },
      orderBy: { updatedAt: "desc" },
      take: 25,
    }),
  ]);

  // Decorate with tenant info for rendering.
  const tenantIds = Array.from(new Set([
    ...openExports.map((e) => e.tenantId),
    ...completedExports.map((e) => e.tenantId),
    ...scheduledDeletions.map((d) => d.tenantId),
    ...doneDeletions.map((d) => d.tenantId),
  ]));
  const tenants = tenantIds.length
    ? await db.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true, slug: true, plan: true, status: true },
      })
    : [];
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Compliance queue</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Data-export requests and pending account deletions from tenants.
        </p>
      </div>

      {sp.error && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{ background: "#3a1517", color: "#ff8b8b", border: "1px solid #5b2024" }}
        >
          {decodeURIComponent(sp.error)}
        </div>
      )}

      {/* ── Pending exports ── */}
      <Card>
        <CardHeader
          title={`Export requests (${openExports.length} open)`}
          description="Click Fulfill to generate the JSON bundle. Tenants download via /api/exports/:id."
        />
        {openExports.length === 0 ? (
          <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
            No open export requests.
          </p>
        ) : (
          <ul>
            {openExports.map((e) => {
              const t = tenantById.get(e.tenantId);
              return (
                <li
                  key={e.id}
                  className="flex items-center justify-between px-5 py-3 text-sm"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <div>
                    <div className="font-medium">
                      {t ? (
                        <Link href={`/platform/tenants/${t.id}`} className="underline">{t.name}</Link>
                      ) : "deleted tenant"}
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                      requested {e.createdAt.toISOString().slice(0, 16).replace("T", " ")} · status {e.status.toLowerCase()}
                      {e.errorMessage ? <> · <span style={{ color: "#ff8b8b" }}>{e.errorMessage}</span></> : null}
                    </div>
                  </div>
                  {ctx.canWrite && (
                    <form action={fulfillDataExport.bind(null, e.id)}>
                      <Button type="submit">
                        {e.status === "FAILED" ? "Retry" : "Fulfill"}
                      </Button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ── Recently completed exports ── */}
      {completedExports.length > 0 && (
        <Card>
          <CardHeader title="Recent exports" description="Last 25 completed." />
          <ul>
            {completedExports.map((e) => {
              const t = tenantById.get(e.tenantId);
              const expired = e.expiresAt && e.expiresAt.getTime() < Date.now();
              return (
                <li
                  key={e.id}
                  className="flex items-center justify-between px-5 py-3 text-sm"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <div>
                    <div>{t ? t.name : "deleted tenant"}</div>
                    <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                      completed {e.completedAt?.toISOString().slice(0, 10)} ·{" "}
                      {expired
                        ? "link expired"
                        : `expires ${e.expiresAt?.toISOString().slice(0, 10)}`}
                    </div>
                  </div>
                  {!expired && (
                    <a href={`/api/exports/${e.id}`} className="text-xs underline" style={{ color: "var(--muted)" }}>
                      Download (staff)
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* ── Scheduled deletions ── */}
      <Card>
        <CardHeader
          title={`Scheduled deletions (${scheduledDeletions.length})`}
          description="Execute is disabled until the grace period elapses; cancellation is always available."
        />
        {scheduledDeletions.length === 0 ? (
          <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
            No pending deletions.
          </p>
        ) : (
          <ul>
            {scheduledDeletions.map((d) => {
              const t = tenantById.get(d.tenantId);
              const daysLeft = Math.ceil((d.scheduledFor.getTime() - Date.now()) / 86_400_000);
              const executable = daysLeft <= 0;
              return (
                <li
                  key={d.id}
                  className="flex items-start justify-between gap-3 px-5 py-3 text-sm"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">
                      {t ? (
                        <Link href={`/platform/tenants/${t.id}`} className="underline">{t.name}</Link>
                      ) : "deleted tenant"}
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                      scheduled {d.scheduledFor.toISOString().slice(0, 10)} · {" "}
                      {executable ? (
                        <span style={{ color: "#ff8b8b" }}>grace period elapsed</span>
                      ) : (
                        <span>{daysLeft}d remaining</span>
                      )}
                    </div>
                    {d.reason && (
                      <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                        &quot;{d.reason}&quot;
                      </div>
                    )}
                  </div>
                  {ctx.canWrite && (
                    <div className="flex shrink-0 gap-2">
                      <form action={cancelAccountDeletionAsStaff.bind(null, d.id)}>
                        <button
                          type="submit"
                          className="rounded-md px-3 py-1.5 text-xs"
                          style={{ border: "1px solid var(--border)" }}
                        >
                          Cancel
                        </button>
                      </form>
                      <form action={executeAccountDeletion.bind(null, d.id)}>
                        <button
                          type="submit"
                          className="rounded-md px-3 py-1.5 text-xs"
                          disabled={!executable}
                          style={{
                            background: executable ? "#3a1517" : "var(--panel)",
                            color: executable ? "#ff8b8b" : "var(--muted)",
                            border: "1px solid " + (executable ? "#5b2024" : "var(--border)"),
                          }}
                        >
                          Execute
                        </button>
                      </form>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* ── Recent deletion outcomes ── */}
      {doneDeletions.length > 0 && (
        <Card>
          <CardHeader title="Recent deletion outcomes" />
          <ul>
            {doneDeletions.map((d) => {
              const t = tenantById.get(d.tenantId);
              return (
                <li
                  key={d.id}
                  className="px-5 py-2 text-sm"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <span>{t ? t.name : "deleted tenant"}</span>
                  <span className="ml-2 text-xs" style={{ color: d.status === "COMPLETED" ? "#ff8b8b" : "var(--muted)" }}>
                    · {d.status.toLowerCase()}
                  </span>
                  <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
                    {(d.completedAt ?? d.canceledAt ?? d.updatedAt).toISOString().slice(0, 10)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
