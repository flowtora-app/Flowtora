import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/Card";
import { rollbackPlan } from "@/app/actions/pricing-plans";

// /platform/plans/[id]/versions — version history (M4).
//
// Every publish and every rollback appends a PlanVersion row with a
// serialized snapshot of the plan + its feature cells. This page lists
// them newest-first and exposes a one-click rollback per row.
//
// A rollback snapshots the current state as a new version before
// replaying the target — so "undo the undo" is always one more click.

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

type VersionSnapshot = {
  plan?: {
    name?: string;
    slug?: string;
    status?: string;
    priceMonthly?: string | null;
    priceAnnual?: string | null;
    isContactSales?: boolean;
    highlight?: boolean;
  };
  featureValues?: Array<unknown>;
};

export default async function PlatformPlanVersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();

  const plan = await db.pricingPlan.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true, status: true },
  });
  if (!plan) notFound();

  const versions = await db.planVersion.findMany({
    where: { planId: id },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      snapshot: true,
      publishedByUserId: true,
      note: true,
      createdAt: true,
    },
  });

  // Resolve user IDs → display emails for "published by" column. One
  // findMany for the distinct set of IDs is cheaper than per-row joins.
  const userIds = Array.from(
    new Set(versions.map((v) => v.publishedByUserId).filter((x): x is string => !!x)),
  );
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/platform/plans/${plan.id}`}
          className="text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          ← {plan.name}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Version history</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Every publish of <span className="font-mono text-xs">{plan.slug}</span> writes an immutable snapshot.
          Rollback restores scalar fields + feature cells and stamps a new version so the move is itself undoable.
        </p>
      </div>

      {sp.ok && <Banner tone="ok">Rollback complete. Marketing pages have been flushed.</Banner>}
      {sp.error && <Banner tone="error">{sp.error}</Banner>}

      <Card>
        <CardHeader
          title="Versions"
          description={`${versions.length} version${versions.length === 1 ? "" : "s"} recorded. Newest first.`}
        />
        {versions.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No versions yet — a version is written the first time the plan is published.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ color: "var(--text-muted)" }}>
                <tr className="text-left">
                  <th className="px-5 py-3 font-normal">Version</th>
                  <th className="px-5 py-3 font-normal">When</th>
                  <th className="px-5 py-3 font-normal">By</th>
                  <th className="px-5 py-3 font-normal">Summary</th>
                  <th className="px-5 py-3 font-normal">Note</th>
                  <th className="px-5 py-3 font-normal"></th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v, idx) => {
                  // idx === 0 is the current published state (or the last
                  // thing published). Rolling back to yourself is a no-op,
                  // so we hide the button on row 0.
                  const isCurrent = idx === 0;
                  const snap = v.snapshot as unknown as VersionSnapshot;
                  const snapPlan = snap?.plan;
                  const user = v.publishedByUserId
                    ? userById.get(v.publishedByUserId)
                    : null;
                  const userLabel = user?.email ?? user?.name ?? v.publishedByUserId ?? "—";
                  return (
                    <tr
                      key={v.id}
                      style={{ borderTop: "1px solid var(--border-subtle)" }}
                    >
                      <td className="px-5 py-3 font-mono text-xs">
                        v{v.version}
                        {isCurrent && (
                          <span
                            className="ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
                            style={{
                              background: "var(--success-surface)",
                              color: "var(--success-fg)",
                              border: "1px solid var(--success-fg)",
                            }}
                          >
                            current
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3" style={{ color: "var(--text-muted)" }}>
                        {formatDate(v.createdAt)}
                      </td>
                      <td className="px-5 py-3 font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {userLabel}
                      </td>
                      <td className="px-5 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        <SnapshotSummary snap={snapPlan} featureCount={snap?.featureValues?.length ?? 0} />
                      </td>
                      <td className="px-5 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        {v.note ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {ctx.canWrite && !isCurrent ? (
                          <form action={rollbackPlan.bind(null, plan.id, v.version)}>
                            <button
                              type="submit"
                              className="rounded-md px-2 py-1 text-xs font-medium"
                              style={{
                                background: "var(--surface-2)",
                                color: "var(--text-default)",
                                border: "1px solid var(--border-subtle)",
                              }}
                            >
                              Rollback
                            </button>
                          </form>
                        ) : (
                          <span style={{ color: "var(--text-faint)" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        Rollback restores scalar plan fields and feature cells. Add-ons are untouched (that editor ships in M5).
        If the target snapshot references features that have since been deleted, those cells are silently dropped.
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */

function SnapshotSummary({
  snap,
  featureCount,
}: {
  snap: VersionSnapshot["plan"] | undefined;
  featureCount: number;
}) {
  if (!snap) return <span>—</span>;
  const price = snap.isContactSales
    ? "Contact sales"
    : snap.priceMonthly != null
    ? `$${snap.priceMonthly}/mo`
    : "no price";
  const status = snap.status ? snap.status.toLowerCase() : "unknown";
  return (
    <span>
      {status} · {price} · {featureCount} cell{featureCount === 1 ? "" : "s"}
      {snap.highlight ? " · highlighted" : ""}
    </span>
  );
}

function Banner({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  const style: React.CSSProperties =
    tone === "ok"
      ? {
          background: "var(--success-surface)",
          color: "var(--success-fg)",
          border: "1px solid var(--success-fg)",
        }
      : {
          background: "var(--danger-surface)",
          color: "var(--danger-fg)",
          border: "1px solid var(--danger-fg)",
        };
  return (
    <div className="rounded-md px-4 py-3 text-sm" style={style}>
      {children}
    </div>
  );
}

// "Apr 22, 14:03 UTC" — compact timestamp, UTC to avoid server TZ drift.
function formatDate(d: Date): string {
  const month = d.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const day = d.getUTCDate();
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${month} ${day}, ${hh}:${mm} UTC`;
}
