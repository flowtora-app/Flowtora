import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/Card";
import { Button, Checkbox, Field } from "@/components/Field";
import { PLAN_ENTITLEMENTS } from "@/lib/entitlements";
import { upsertFeatureFlag, deleteFeatureFlag } from "@/app/actions/platform";

// Phase 17 Slice C — global feature flag matrix.
//
// Shows the plan default for every known feature across all plans (so
// platform staff can sanity-check "who gets what"), then a flat list of
// every override row in the DB grouped by scope (global vs per-tenant).

export default async function FeatureFlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;

  const flagRows = await db.featureFlag.findMany({
    orderBy: [{ tenantId: "asc" }, { key: "asc" }],
    take: 500,
  });

  // Attach tenant names for the per-tenant rows.
  const tenantIds = Array.from(
    new Set(flagRows.map((f) => f.tenantId).filter(Boolean)),
  ) as string[];
  const tenants = tenantIds.length
    ? await db.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true, slug: true },
      })
    : [];
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  const globalRows = flagRows.filter((f) => f.tenantId === null);
  const tenantRows = flagRows.filter((f) => f.tenantId !== null);

  // The canonical key list drives both the "plan grid" panel and the
  // "add a global override" form.
  const ALL_KEYS = Object.keys(PLAN_ENTITLEMENTS.STARTER.features);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Feature flags</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Plan defaults live in code; overrides live in this table.
          Per-tenant rows take precedence over global rows, which take precedence over plan defaults.
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

      {/* ── Plan grid ── */}
      <Card>
        <CardHeader
          title="Plan defaults"
          description="The matrix marketing shows on the pricing page. Change these in lib/entitlements.ts."
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead style={{ color: "var(--muted)" }}>
              <tr className="text-left">
                <th className="px-4 py-3 font-normal">Feature</th>
                {Object.keys(PLAN_ENTITLEMENTS).map((p) => (
                  <th key={p} className="px-4 py-3 font-normal">{p}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ALL_KEYS.map((k) => (
                <tr key={k} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-4 py-3 font-mono text-xs">{k}</td>
                  {Object.keys(PLAN_ENTITLEMENTS).map((p) => {
                    const enabled = (PLAN_ENTITLEMENTS as Record<string, { features: Record<string, boolean> }>)[p].features[k];
                    return (
                      <td key={p} className="px-4 py-3">
                        {enabled ? (
                          <span style={{ color: "#7dd688" }}>✓</span>
                        ) : (
                          <span style={{ color: "var(--muted)" }}>—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ── Global overrides ── */}
      <Card>
        <CardHeader
          title="Global overrides"
          description="Flip a feature ON or OFF for every tenant regardless of plan. Use sparingly."
        />
        {globalRows.length === 0 ? (
          <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
            No global overrides set.
          </p>
        ) : (
          <ul>
            {globalRows.map((f) => (
              <li
                key={f.id}
                className="flex items-center justify-between px-5 py-3 text-sm"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <div>
                  <div className="font-mono text-xs">{f.key}</div>
                  <div className="text-xs" style={{ color: f.enabled ? "#7dd688" : "#ff8b8b" }}>
                    {f.enabled ? "ENABLED globally" : "DISABLED globally"}
                    {f.note && <> · <span style={{ color: "var(--muted)" }}>{f.note}</span></>}
                  </div>
                </div>
                {ctx.canWrite && (
                  <form action={deleteFeatureFlag.bind(null, f.id)}>
                    <button type="submit" className="text-xs underline" style={{ color: "#ff8b8b" }}>
                      Clear
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        {ctx.canWrite && (
          <form action={upsertFeatureFlag} className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-[1fr_auto_2fr_auto]" style={{ borderTop: "1px solid var(--border)" }}>
            <label className="block">
              <span className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Key</span>
              <select
                name="key"
                className="w-full rounded-md px-3 py-2 text-sm outline-none"
                style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
                required
              >
                {ALL_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <div className="flex items-end pb-2">
              <Checkbox label="Enabled" name="enabled" defaultChecked />
            </div>
            <Field label="Note (optional)" name="note" placeholder="e.g. Beta rollout week of 2026-04-20" />
            <div className="flex items-end">
              <Button type="submit">Set global</Button>
            </div>
          </form>
        )}
      </Card>

      {/* ── Per-tenant overrides ── */}
      <Card>
        <CardHeader
          title="Per-tenant overrides"
          description="Wins over plan defaults and global overrides. Manage these from each tenant's detail page."
        />
        {tenantRows.length === 0 ? (
          <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
            No per-tenant overrides.
          </p>
        ) : (
          <ul>
            {tenantRows.map((f) => {
              const t = f.tenantId ? tenantById.get(f.tenantId) : null;
              return (
                <li
                  key={f.id}
                  className="flex items-center justify-between px-5 py-3 text-sm"
                  style={{ borderTop: "1px solid var(--border)" }}
                >
                  <div>
                    <div>
                      {t ? (
                        <Link href={`/platform/tenants/${t.id}`} className="font-medium underline">{t.name}</Link>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>deleted tenant</span>
                      )}
                    </div>
                    <div className="mt-0.5 font-mono text-xs">
                      {f.key}{" "}
                      <span style={{ color: f.enabled ? "#7dd688" : "#ff8b8b" }}>
                        = {f.enabled ? "on" : "off"}
                      </span>
                      {f.note && <> · <span style={{ color: "var(--muted)" }}>{f.note}</span></>}
                    </div>
                  </div>
                  {ctx.canWrite && (
                    <form action={deleteFeatureFlag.bind(null, f.id)}>
                      <button type="submit" className="text-xs underline" style={{ color: "#ff8b8b" }}>
                        Clear
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
