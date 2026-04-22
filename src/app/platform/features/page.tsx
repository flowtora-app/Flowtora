import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/Card";
import { createPlanFeature } from "@/app/actions/plan-features";

// /platform/features — feature library list (M4).
//
// Shows every PlanFeature grouped by `groupLabel`. Each row is a
// link to the feature editor. Support agents see the list but the
// "+ New feature" button is hidden; their click-through also fails
// at the server action via requirePlatformAdmin.

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

export default async function PlatformFeaturesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;

  const features = await db.planFeature.findMany({
    orderBy: [{ groupSortOrder: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      key: true,
      label: true,
      groupLabel: true,
      valueType: true,
      enforcement: true,
      sortOrder: true,
      groupSortOrder: true,
      _count: { select: { values: true } },
    },
  });

  // Count "meaningful" cells per feature — cells where at least one
  // value field is non-empty. This is the signal for "is this bullet
  // actually shown on any plan card". Single groupBy avoids N+1.
  const activeCells = await db.planFeatureValue.groupBy({
    by: ["featureId"],
    where: {
      OR: [
        { valueBool: true },
        { valueNumber: { not: null } },
        { valueText: { not: null } },
      ],
    },
    _count: { _all: true },
  });
  const activeByFeature = new Map(activeCells.map((c) => [c.featureId, c._count._all]));

  // Bucket by groupLabel in the order we fetched (sorted by
  // groupSortOrder asc, so "Limits" / "Core" / etc. come out stable).
  const groups = new Map<string, typeof features>();
  for (const f of features) {
    const key = f.groupLabel ?? "Ungrouped";
    const arr = groups.get(key) ?? [];
    arr.push(f);
    groups.set(key, arr);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Feature library</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Master list of bullets shown on pricing cards. Renaming a key on a <em>GATE</em> feature
            also needs the matching{" "}
            <code
              className="rounded px-1 py-0.5 font-mono text-[11px]"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
            >
              hasFeature(ctx, &quot;key&quot;)
            </code>{" "}
            call in code to be updated.
          </p>
        </div>
        {ctx.canWrite && (
          <form action={createPlanFeature}>
            <button
              type="submit"
              className="rounded-md px-4 py-2 text-sm font-medium"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              + New feature
            </button>
          </form>
        )}
      </div>

      {sp.ok && (
        <Banner tone="ok">
          {sp.ok === "deleted" ? "Feature deleted." : "Saved."}
        </Banner>
      )}
      {sp.error && <Banner tone="error">{sp.error}</Banner>}

      <Card>
        <CardHeader
          title="Features"
          description={`${features.length} features · ${groups.size} groups. Click a row to edit.`}
        />
        {features.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            No features yet. Click “+ New feature” to add one.
          </p>
        ) : (
          <div className="space-y-0">
            {Array.from(groups.entries()).map(([group, rows]) => (
              <section key={group} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <div
                  className="px-5 py-3 text-[11px] font-semibold uppercase tracking-wider"
                  style={{
                    color: "var(--text-muted)",
                    background: "var(--surface-2)",
                  }}
                >
                  {group}
                </div>
                <table className="w-full text-sm">
                  <thead style={{ color: "var(--text-muted)" }}>
                    <tr className="text-left">
                      <th className="px-5 py-2 font-normal">Label</th>
                      <th className="px-5 py-2 font-normal">Key</th>
                      <th className="px-5 py-2 font-normal">Type</th>
                      <th className="px-5 py-2 font-normal">Enforcement</th>
                      <th className="px-5 py-2 font-normal text-right">Active cells</th>
                      <th className="px-5 py-2 font-normal text-right">Sort</th>
                      <th className="px-5 py-2 font-normal"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((f) => {
                      const active = activeByFeature.get(f.id) ?? 0;
                      return (
                        <tr
                          key={f.id}
                          style={{ borderTop: "1px solid var(--border-subtle)" }}
                        >
                          <td className="px-5 py-3">
                            <Link
                              href={`/platform/features/${f.id}`}
                              className="font-medium hover:underline"
                              style={{ color: "var(--text-default)" }}
                            >
                              {f.label}
                            </Link>
                          </td>
                          <td className="px-5 py-3 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                            {f.key}
                          </td>
                          <td className="px-5 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                            {f.valueType.toLowerCase()}
                          </td>
                          <td className="px-5 py-3">
                            <EnforcementChip enforcement={f.enforcement} />
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span
                              style={{ color: active > 0 ? "var(--text-default)" : "var(--text-faint)" }}
                            >
                              {active} / {f._count.values}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                            {f.sortOrder}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <Link
                              href={`/platform/features/${f.id}`}
                              className="text-xs underline"
                              style={{ color: "var(--accent-primary)" }}
                            >
                              Edit →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}
      </Card>

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        <strong style={{ color: "var(--text-muted)" }}>GATE</strong> features control runtime entitlements via{" "}
        <code
          className="rounded px-1 py-0.5 font-mono text-[11px]"
          style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
        >
          hasFeature(tenant, key)
        </code>
        .{" "}
        <strong style={{ color: "var(--text-muted)" }}>MARKETING_ONLY</strong> features are text-only bullets with no
        code effect — they&apos;re safe to rename freely.
      </p>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */

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

function EnforcementChip({ enforcement }: { enforcement: "GATE" | "MARKETING_ONLY" }) {
  const style: React.CSSProperties =
    enforcement === "GATE"
      ? {
          background: "var(--accent-surface)",
          color: "var(--accent-primary)",
          border: "1px solid var(--accent-primary)",
        }
      : {
          background: "var(--surface-2)",
          color: "var(--text-muted)",
          border: "1px solid var(--border-subtle)",
        };
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider"
      style={style}
    >
      {enforcement === "GATE" ? "gate" : "marketing"}
    </span>
  );
}
