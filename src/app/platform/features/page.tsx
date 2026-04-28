import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { createPlanFeature } from "@/app/actions/plan-features";
import { FeatureLibraryFilterBar } from "@/components/platform/FeatureLibraryFilterBar";

// /platform/features — feature library catalog (transformation rewrite).
//
// Master list of every PlanFeature. Layout:
//   1. Stats band — total / by-type / by-enforcement / groups / active cells
//   2. Live filter (text + type + enforcement chips)
//   3. Group sections (collapsible) with cleaner per-row layout
//
// Renaming a key on a GATE feature is the sharpest edge here, so the
// banner reminding you to update call sites stays prominent.

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
      description: true,
      valueType: true,
      enforcement: true,
      sortOrder: true,
      groupSortOrder: true,
      _count: { select: { values: true } },
    },
  });

  // Active cells per feature — cells with a meaningful (non-empty) value.
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

  // Group rows by groupLabel preserving fetch order.
  const groups = new Map<string, typeof features>();
  for (const f of features) {
    const key = f.groupLabel ?? "Ungrouped";
    const arr = groups.get(key) ?? [];
    arr.push(f);
    groups.set(key, arr);
  }

  // ── Stats ────────────────────────────────────────────────
  const byType = { BOOLEAN: 0, NUMBER: 0, TEXT: 0 };
  const byEnforcement = { GATE: 0, MARKETING_ONLY: 0 };
  let activeTotal = 0;
  for (const f of features) {
    byType[f.valueType]++;
    byEnforcement[f.enforcement]++;
    activeTotal += activeByFeature.get(f.id) ?? 0;
  }

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
            Feature library
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Master list of bullets shown on pricing cards and the rows you set per-plan values against.
            Renaming a key on a <em>GATE</em> feature also needs the matching{" "}
            <code
              className="rounded px-1 py-0.5 font-mono text-[11px]"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
            >
              hasFeature(ctx, "key")
            </code>{" "}
            call updated.
          </p>
        </div>
        {ctx.canWrite && (
          <form action={createPlanFeature}>
            <button
              type="submit"
              className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              + New feature
            </button>
          </form>
        )}
      </div>

      {/* ── Banners ─────────────────────────────────────────── */}
      {sp.ok && (
        <Banner tone="success" title="Saved" body={sp.ok === "deleted" ? "Feature deleted." : "Changes saved."} />
      )}
      {sp.error && <Banner tone="danger" title="Action failed" body={decodeURIComponent(sp.error)} />}

      {/* ── Stats band ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Total features"   value={features.length.toString()} hint={`${groups.size} groups`} tone="default" />
        <StatTile label="Gated"            value={byEnforcement.GATE.toString()} hint="Code-enforced" tone="warning" />
        <StatTile label="Marketing-only"   value={byEnforcement.MARKETING_ONLY.toString()} hint="Display only" tone="default" />
        <StatTile
          label="By type"
          value={`${byType.BOOLEAN}·${byType.NUMBER}·${byType.TEXT}`}
          hint={`${byType.BOOLEAN} bool · ${byType.NUMBER} num · ${byType.TEXT} text`}
          tone="default"
        />
        <StatTile label="Active cells"     value={activeTotal.toLocaleString()} hint="Set across all plans" tone="success" />
      </div>

      {/* ── Filter bar ──────────────────────────────────────── */}
      <FeatureLibraryFilterBar totalCount={features.length} />

      {/* ── Catalog ─────────────────────────────────────────── */}
      {features.length === 0 ? (
        <div
          className="rounded-xl px-5 py-10 text-center text-sm"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          No features yet. Click "+ New feature" to add one.
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(groups.entries()).map(([groupLabel, rows]) => {
            const groupActive = rows.reduce(
              (s, r) => s + (activeByFeature.get(r.id) ?? 0),
              0,
            );
            return (
              <section
                key={groupLabel}
                data-feature-group
                className="overflow-hidden rounded-xl"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  boxShadow: "var(--shadow-sm)",
                }}
              >
                <details open>
                  <summary
                    className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4"
                    style={{ borderBottom: "1px solid var(--border-subtle)" }}
                  >
                    <div>
                      <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
                        {groupLabel}
                      </h2>
                      <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                        {rows.length} feature{rows.length === 1 ? "" : "s"} ·{" "}
                        {groupActive} active cell{groupActive === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      ▾
                    </span>
                  </summary>

                  <ul>
                    {rows.map((f, idx) => {
                      const active = activeByFeature.get(f.id) ?? 0;
                      const haystack = [
                        f.label,
                        f.key,
                        f.groupLabel ?? "",
                        f.description ?? "",
                      ].join(" ").toLowerCase();
                      return (
                        <li
                          key={f.id}
                          data-feature-row
                          data-feature-haystack={haystack}
                          data-feature-type={f.valueType}
                          data-feature-enforcement={f.enforcement}
                          style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                        >
                          <Link
                            href={`/platform/features/${f.id}`}
                            className="grid grid-cols-1 gap-3 px-5 py-3 transition-colors hover:opacity-90 md:grid-cols-[1fr_140px_140px_140px_60px] md:items-center"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className="text-sm font-medium"
                                  style={{ color: "var(--text-default)" }}
                                >
                                  {f.label}
                                </span>
                                <span
                                  className="font-mono text-[11px]"
                                  style={{ color: "var(--text-faint)" }}
                                >
                                  {f.key}
                                </span>
                              </div>
                              {f.description && (
                                <div
                                  className="mt-0.5 truncate text-xs"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  {f.description}
                                </div>
                              )}
                            </div>
                            <div>
                              <TypePill type={f.valueType} />
                            </div>
                            <div>
                              <EnforcementPill enforcement={f.enforcement} />
                            </div>
                            <div className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                              <span style={{ color: active > 0 ? "var(--text-default)" : "var(--text-faint)" }}>
                                {active}
                              </span>
                              <span style={{ color: "var(--text-faint)" }}>
                                {" / "}{f._count.values}
                              </span>
                              <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                                active / cells
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs" style={{ color: "var(--accent-primary)" }}>
                                Edit →
                              </span>
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </section>
            );
          })}

          <div
            data-feature-empty
            style={{ display: "none" }}
            className="rounded-xl px-5 py-8 text-center text-sm"
          >
            <div style={{ color: "var(--text-default)" }}>No features match.</div>
            <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Adjust the filter or clear it.
            </div>
          </div>
        </div>
      )}

      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        <b style={{ color: "var(--text-muted)" }}>GATE</b> features control runtime entitlements via{" "}
        <code className="rounded px-1 py-0.5 font-mono text-[11px]" style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
          hasFeature(tenant, key)
        </code>.{" "}
        <b style={{ color: "var(--text-muted)" }}>MARKETING_ONLY</b> features are bullet text only — safe to rename freely.
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "default" | "accent" | "success" | "warning";
}) {
  const palette =
    tone === "accent"  ? { bg: "var(--accent-surface)",  border: "var(--accent-primary)", label: "var(--accent-primary)" } :
    tone === "success" ? { bg: "var(--success-surface)", border: "var(--success-fg)",     label: "var(--success-fg)"     } :
    tone === "warning" ? { bg: "var(--warning-surface)", border: "var(--warning-fg)",     label: "var(--warning-fg)"     } :
                          { bg: "var(--surface-1)",       border: "var(--border-subtle)",  label: "var(--text-muted)"     };
  return (
    <div
      className="rounded-xl p-4"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, boxShadow: "var(--shadow-sm)" }}
    >
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: palette.label }}>
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight" style={{ color: "var(--text-default)" }}>
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{hint}</div>
      )}
    </div>
  );
}

function TypePill({ type }: { type: "BOOLEAN" | "NUMBER" | "TEXT" }) {
  const palette =
    type === "NUMBER"  ? { bg: "var(--accent-surface)", fg: "var(--accent-primary)" } :
                          { bg: "var(--surface-2)",      fg: "var(--text-muted)"     };
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {type.toLowerCase()}
    </span>
  );
}

function EnforcementPill({ enforcement }: { enforcement: "GATE" | "MARKETING_ONLY" }) {
  const palette =
    enforcement === "GATE"
      ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)", label: "Gated" }
      : { bg: "var(--surface-2)",       fg: "var(--text-muted)", label: "Marketing" };
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {palette.label}
    </span>
  );
}

function Banner({
  tone,
  title,
  body,
}: {
  tone: "danger" | "warning" | "success";
  title: string;
  body: string;
}) {
  const palette =
    tone === "danger"  ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",  border: "var(--danger-fg)"  } :
    tone === "warning" ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)", border: "var(--warning-fg)" } :
                          { bg: "var(--success-surface)", fg: "var(--success-fg)", border: "var(--success-fg)" };
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
