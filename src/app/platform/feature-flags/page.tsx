import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { PLAN_ENTITLEMENTS } from "@/lib/entitlements";
import { FEATURE_GATE_META, getFeatureGateMeta } from "@/lib/feature-gates";
import { FeatureFlagsKPIBand, type FeatureFlagsKpi } from "@/components/platform/FeatureFlagsKPIBand";
import { FeatureFlagsFilterBar } from "@/components/platform/FeatureFlagsFilterBar";

export const dynamic = "force-dynamic";

// /platform/feature-flags — feature-centric flag management.
//
// Layout:
//   1. KPI band (5 tiles) — Total · Global overrides · Tenant overrides ·
//      High-impact (gated) · Stale overrides (>30d)
//   2. Search + state filter chips (live, client-side)
//   3. Plan-default matrix card (read-only — defined in code)
//   4. Per-feature board: one row per feature key, with plan-default
//      pills, GLOBAL override status, count of TENANT overrides, gate
//      flag, partial-rollout / expires badges. Click → drill-down
//   5. Recent flag changes (audit-derived)
//
// Hierarchy reminder always visible:
//   Plan default  →  Global override  →  Per-tenant override  (highest)
//
// Mutations live on the per-feature drill-down page; this index is
// scan-and-decide, drill-to-act.

const DAY_MS = 86_400_000;

type FeatureMeta = {
  key: string;
  label: string;
  description: string;
  isGated: boolean;
};

export default async function FeatureFlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  await requirePlatformStaff();
  const sp = await searchParams;

  // ── Master feature list ──
  // Source of truth = PLAN_ENTITLEMENTS.STARTER.features keys (every
  // feature key is in every plan record by construction). FEATURE_GATE_META
  // gives us label / description / gate-vs-marketing.
  const ALL_KEYS = Object.keys(PLAN_ENTITLEMENTS.STARTER.features);
  const allFeatures: FeatureMeta[] = ALL_KEYS.map((key) => ({
    key,
    label: getFeatureGateMeta(key).label,
    description: getFeatureGateMeta(key).reason,
    isGated: Boolean(FEATURE_GATE_META[key]),
  }));

  const now = new Date();
  const days30Ago = new Date(now.getTime() - 30 * DAY_MS);

  // ── Parallel data fetch ──
  const [flagRows, recentAudits] = await Promise.all([
    db.featureFlag.findMany({
      orderBy: [{ tenantId: "asc" }, { key: "asc" }],
      take: 1000,
    }),
    db.auditLog.findMany({
      where: {
        action: { in: ["platform.feature_flag_set", "platform.feature_flag_cleared"] },
      },
      orderBy: { createdAt: "desc" },
      take: 15,
    }),
  ]);

  // Look up tenant + user names for the audit trail and tenant overrides.
  const tenantIds = Array.from(new Set([
    ...flagRows.map((f) => f.tenantId).filter((x): x is string => Boolean(x)),
    ...recentAudits.map((a) => a.tenantId).filter((x): x is string => Boolean(x)),
  ]));
  const userIds = Array.from(new Set(recentAudits.map((a) => a.userId).filter((x): x is string => Boolean(x))));
  const [tenants, users] = await Promise.all([
    tenantIds.length
      ? db.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, slug: true } })
      : Promise.resolve([] as { id: string; name: string; slug: string }[]),
    userIds.length
      ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, email: true, name: true } })
      : Promise.resolve([] as { id: string; email: string; name: string | null }[]),
  ]);
  const tenantById = new Map(tenants.map((t) => [t.id, t]));
  const userById   = new Map(users.map((u) => [u.id, u]));

  // ── Group flag rows by feature key ──
  const globalByKey = new Map<string, (typeof flagRows)[number]>();
  const tenantOverridesByKey = new Map<string, (typeof flagRows)>();
  for (const f of flagRows) {
    if (f.tenantId === null) {
      globalByKey.set(f.key, f);
    } else {
      const arr = tenantOverridesByKey.get(f.key) ?? [];
      arr.push(f);
      tenantOverridesByKey.set(f.key, arr);
    }
  }

  // ── KPI metrics ──
  const globalCount = Array.from(globalByKey.values()).length;
  const tenantCount = flagRows.filter((f) => f.tenantId !== null).length;
  const gatedCount = allFeatures.filter((f) => f.isGated).length;
  const staleCount = flagRows.filter((f) => f.updatedAt.getTime() < days30Ago.getTime()).length;
  const expiringCount = flagRows.filter((f) =>
    f.expiresAt && f.expiresAt.getTime() > now.getTime() && f.expiresAt.getTime() <= now.getTime() + 7 * DAY_MS,
  ).length;

  const kpis: FeatureFlagsKpi[] = [
    {
      label: "Total features",
      value: allFeatures.length.toLocaleString(),
      hint: `${gatedCount} gated · ${allFeatures.length - gatedCount} marketing`,
    },
    {
      label: "Global overrides",
      value: globalCount.toLocaleString(),
      hint: globalCount === 0 ? "All plans use code defaults" : "Wins over plan default",
      tone: globalCount > 0 ? "accent" : "default",
    },
    {
      label: "Tenant overrides",
      value: tenantCount.toLocaleString(),
      hint: "Highest precedence",
      tone: tenantCount > 0 ? "accent" : "default",
    },
    {
      label: "Expiring (7d)",
      value: expiringCount.toLocaleString(),
      hint: expiringCount === 0 ? "Nothing scheduled to expire" : "Auto-clears soon",
      tone: expiringCount > 0 ? "warning" : "default",
    },
    {
      label: "Stale (>30d)",
      value: staleCount.toLocaleString(),
      hint: staleCount === 0 ? "All overrides recently touched" : "Review old overrides",
      tone: staleCount > 0 ? "warning" : "default",
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
          Feature flags
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Runtime overrides on top of plan defaults. Order of precedence (highest wins):{" "}
          <b style={{ color: "var(--text-default)" }}>per-tenant</b> →{" "}
          <b style={{ color: "var(--text-default)" }}>global</b> →{" "}
          <b style={{ color: "var(--text-default)" }}>plan default</b>.
        </p>
      </div>

      {/* ── Banners ────────────────────────────────────── */}
      {sp.ok && (
        <Banner tone="success" title="Saved" body="Override applied. Tenants pick it up on the next request." />
      )}
      {sp.error && <Banner tone="danger" title="Action failed" body={decodeURIComponent(sp.error)} />}

      {/* ── Hierarchy explainer ────────────────────────── */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <HierarchyTile
          step="1"
          title="Plan default"
          body="In code (lib/entitlements.ts). Feeds the matrix below."
          tone="default"
        />
        <HierarchyTile
          step="2"
          title="Global override"
          body="A row with tenantId=null. Flips the feature ON or OFF for every tenant."
          tone="accent"
        />
        <HierarchyTile
          step="3"
          title="Per-tenant override"
          body="A row with tenantId set. Wins over both — surgical control."
          tone="warning"
        />
      </div>

      {/* ── KPI band ───────────────────────────────────── */}
      <FeatureFlagsKPIBand kpis={kpis} />

      {/* ── Plan default matrix ────────────────────────── */}
      <Section
        title="Plan defaults"
        description="The matrix marketing shows on /pricing. Edit in lib/entitlements.ts. Flags below override these."
      >
        <div className="overflow-x-auto -mx-5 -mb-5">
          <table className="w-full text-sm">
            <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
              <tr className="text-left">
                <th className="px-5 py-2.5 font-medium">Feature</th>
                {Object.keys(PLAN_ENTITLEMENTS).map((p) => (
                  <th key={p} className="px-3 py-2.5 text-center font-medium">{p}</th>
                ))}
                <th className="px-3 py-2.5 text-center font-medium">Type</th>
              </tr>
            </thead>
            <tbody>
              {allFeatures.map((f, idx) => (
                <tr key={f.key} style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}>
                  <td className="px-5 py-2.5">
                    <div className="font-mono text-[11px]" style={{ color: "var(--text-default)" }}>
                      {f.key}
                    </div>
                    <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                      {f.label}
                    </div>
                  </td>
                  {Object.keys(PLAN_ENTITLEMENTS).map((p) => {
                    const enabled = (PLAN_ENTITLEMENTS as Record<string, { features: Record<string, boolean> }>)[p].features[f.key];
                    return (
                      <td key={p} className="px-3 py-2.5 text-center">
                        {enabled ? (
                          <span style={{ color: "var(--success-fg)" }}>✓</span>
                        ) : (
                          <span style={{ color: "var(--text-faint)" }}>—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-center">
                    {f.isGated ? (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: "var(--warning-surface)", color: "var(--warning-fg)" }}
                        title="Code-enforced via hasFeature()"
                      >
                        gated
                      </span>
                    ) : (
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                      >
                        marketing
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Filter ─────────────────────────────────────── */}
      <FeatureFlagsFilterBar totalFeatures={allFeatures.length} />

      {/* ── Per-feature board ──────────────────────────── */}
      <div className="space-y-3">
        {allFeatures.map((f) => {
          const global = globalByKey.get(f.key);
          const tenants = tenantOverridesByKey.get(f.key) ?? [];
          const stateTags: string[] = [];
          if (f.isGated) stateTags.push("GATED");
          if (global || tenants.length > 0) stateTags.push("OVERRIDDEN");
          if (
            (global?.expiresAt && global.expiresAt.getTime() > now.getTime() && global.expiresAt.getTime() <= now.getTime() + 7 * DAY_MS) ||
            tenants.some((t) => t.expiresAt && t.expiresAt.getTime() > now.getTime() && t.expiresAt.getTime() <= now.getTime() + 7 * DAY_MS)
          ) stateTags.push("EXPIRING");
          const haystack = `${f.key} ${f.label} ${f.description}`.toLowerCase();
          return (
            <FeatureRow
              key={f.key}
              feature={f}
              globalOverride={global ?? null}
              tenantOverrides={tenants}
              tenantById={tenantById}
              haystack={haystack}
              stateTags={stateTags.join(" ")}
            />
          );
        })}
        <div
          data-flag-empty
          style={{ display: "none" }}
          className="rounded-xl px-5 py-8 text-center text-sm"
        >
          <div style={{ color: "var(--text-default)" }}>No features match.</div>
          <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>Adjust the filter or clear it.</div>
        </div>
      </div>

      {/* ── Recent flag changes ────────────────────────── */}
      <Section
        title="Recent flag activity"
        description="Last 15 audit events for feature_flag_set / feature_flag_cleared."
      >
        {recentAudits.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No flag changes audited yet.
          </p>
        ) : (
          <ol className="-mx-5 -mb-5">
            {recentAudits.map((a, idx) => {
              const t = a.tenantId ? tenantById.get(a.tenantId) : null;
              const u = a.userId ? userById.get(a.userId) : null;
              const meta = a.metadata as Record<string, unknown> | null;
              const key = typeof meta?.key === "string" ? meta.key : null;
              const enabled = typeof meta?.enabled === "boolean" ? meta.enabled : null;
              const tone =
                a.action === "platform.feature_flag_cleared" ? { fg: "var(--text-muted)", label: "Cleared" } :
                enabled === true ? { fg: "var(--success-fg)", label: "Set ON" } :
                enabled === false ? { fg: "var(--danger-fg)", label: "Set OFF" } :
                { fg: "var(--text-muted)", label: "Set" };
              return (
                <li
                  key={a.id}
                  className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm"
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2 text-xs">
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ background: "var(--surface-2)", color: tone.fg, border: `1px solid ${tone.fg}` }}
                      >
                        {tone.label}
                      </span>
                      {key && (
                        <Link
                          href={`/platform/feature-flags/${encodeURIComponent(key)}`}
                          className="font-mono"
                          style={{ color: "var(--accent-primary)" }}
                        >
                          {key}
                        </Link>
                      )}
                      <span style={{ color: "var(--text-muted)" }}>
                        {t ? <>· <Link href={`/platform/tenants/${t.id}`} className="underline">{t.name}</Link></> : <>· global</>}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      {u ? `by ${u.name ?? u.email}` : "by system"}
                    </div>
                  </div>
                  <div className="text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    {a.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Section>

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        Every flag change is audit-logged. View the full history at{" "}
        <Link href="/platform/audit?action=platform.feature_flag_" className="underline">/platform/audit</Link>.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function FeatureRow({
  feature,
  globalOverride,
  tenantOverrides,
  tenantById,
  haystack,
  stateTags,
}: {
  feature: FeatureMeta;
  globalOverride: { id: string; enabled: boolean; note: string | null; rolloutPct: number | null; expiresAt: Date | null; updatedAt: Date } | null;
  tenantOverrides: Array<{ id: string; tenantId: string | null; enabled: boolean; rolloutPct: number | null; expiresAt: Date | null; note: string | null; updatedAt: Date }>;
  tenantById: Map<string, { id: string; name: string; slug: string }>;
  haystack: string;
  stateTags: string;
}) {
  const overrideCount = (globalOverride ? 1 : 0) + tenantOverrides.length;

  return (
    <Link
      href={`/platform/feature-flags/${encodeURIComponent(feature.key)}`}
      data-flag-row
      data-flag-haystack={haystack}
      data-flag-state={stateTags}
      className="block rounded-xl p-4 transition-colors hover:opacity-95"
      style={{
        background: "var(--surface-1)",
        border: `1px solid ${overrideCount > 0 ? "var(--accent-primary)" : "var(--border-subtle)"}`,
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px_180px_60px] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
              {feature.label}
            </span>
            {feature.isGated && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: "var(--warning-surface)", color: "var(--warning-fg)" }}
                title="High-impact: enforced in code via hasFeature()"
              >
                Gated
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
            {feature.key}
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {feature.description}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Global override
          </div>
          <div className="mt-0.5">
            {globalOverride ? (
              <OverridePill enabled={globalOverride.enabled} rolloutPct={globalOverride.rolloutPct} expiresAt={globalOverride.expiresAt} />
            ) : (
              <span className="text-xs" style={{ color: "var(--text-faint)" }}>none — uses plan default</span>
            )}
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Tenant overrides
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <span
              className="text-sm font-semibold tabular-nums"
              style={{ color: tenantOverrides.length > 0 ? "var(--accent-primary)" : "var(--text-faint)" }}
            >
              {tenantOverrides.length}
            </span>
            {tenantOverrides.length > 0 && (
              <span className="text-[10px] truncate" style={{ color: "var(--text-muted)" }}>
                e.g. {tenantOverrides
                  .slice(0, 2)
                  .map((o) => (o.tenantId && tenantById.get(o.tenantId)?.name) ?? "?")
                  .join(", ")}
                {tenantOverrides.length > 2 && ` +${tenantOverrides.length - 2}`}
              </span>
            )}
          </div>
        </div>

        <div className="text-right">
          <span
            className="ts-focus inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-default)",
              border: "1px solid var(--border-default)",
            }}
          >
            Manage →
          </span>
        </div>
      </div>
    </Link>
  );
}

function OverridePill({
  enabled,
  rolloutPct,
  expiresAt,
}: {
  enabled: boolean;
  rolloutPct: number | null;
  expiresAt: Date | null;
}) {
  const fg = enabled ? "var(--success-fg)" : "var(--danger-fg)";
  const bg = enabled ? "var(--success-surface)" : "var(--danger-surface)";
  const label = rolloutPct != null ? `${enabled ? "ON" : "OFF"} · ${rolloutPct}%` : (enabled ? "ON" : "OFF");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
        style={{ background: bg, color: fg, border: `1px solid ${fg}` }}
      >
        {label}
      </span>
      {expiresAt && (
        <span className="text-[10px]" style={{ color: "var(--warning-fg)" }} title={`Expires ${expiresAt.toISOString()}`}>
          ⌛ {expiresAt.toISOString().slice(0, 10)}
        </span>
      )}
    </div>
  );
}

function HierarchyTile({
  step,
  title,
  body,
  tone,
}: {
  step: string;
  title: string;
  body: string;
  tone: "default" | "accent" | "warning";
}) {
  const palette =
    tone === "accent"  ? { bg: "var(--accent-surface)",  border: "var(--accent-primary)", fg: "var(--accent-primary)" } :
    tone === "warning" ? { bg: "var(--warning-surface)", border: "var(--warning-fg)",     fg: "var(--warning-fg)"     } :
                          { bg: "var(--surface-1)",       border: "var(--border-subtle)",  fg: "var(--text-muted)"     };
  return (
    <div
      className="flex items-start gap-3 rounded-xl p-4"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, boxShadow: "var(--shadow-sm)" }}
    >
      <span
        aria-hidden
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold"
        style={{ background: palette.fg, color: "var(--text-inverse)" }}
      >
        {step}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-semibold" style={{ color: palette.fg }}>{title}</div>
        <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{body}</div>
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  right,
  children,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <header
        className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{description}</p>
          )}
        </div>
        {right}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Banner({
  tone,
  title,
  body,
}: {
  tone: "danger" | "success";
  title: string;
  body: string;
}) {
  const palette =
    tone === "danger"
      ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",  border: "var(--danger-fg)"  }
      : { bg: "var(--success-surface)", fg: "var(--success-fg)", border: "var(--success-fg)" };
  return (
    <div
      className="rounded-md px-4 py-3 text-sm"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.fg }}
    >
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5 text-xs" style={{ opacity: 0.85 }}>{body}</div>
    </div>
  );
}

