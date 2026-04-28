import * as React from "react";
import { savePlanFeatures } from "@/app/actions/pricing-plans";
import { PlanFeaturesFilterBar } from "@/components/platform/PlanFeaturesFilterBar";

// Plan features editor (transformation rewrite).
//
//   ┌────────────────────────────────────────────────────────────┐
//   │  PLAN STRENGTH                                              │
//   │  Advanced · 18/24 features enabled · 2 unlimited caps       │
//   │  ─── Core 4/4 ─── Team 2/3 ─── Workflow 5/5 ─── Limits 4/6  │
//   └────────────────────────────────────────────────────────────┘
//
//   [Filter ____________________________________]   18/24 enabled
//
//   ▼ Limits & quotas         (rendered first, distinct treatment)
//      Max users      [ 5     ]   -1 = unlimited   ★
//      Max customers  [ 500   ]   ……
//
//   ▼ Core
//      Quotes              Included ☑   "" footnote   ★
//      Orders              Included ☑   …
//
//   ▼ Team & access · Workflow · Reporting · Support
//      …
//
//   ─── sticky save bar ─────────────────────────────────────────
//   18/24 features enabled · changes save when you click here  [ Save ]
//
// All inputs post to the existing savePlanFeatures action with the
// same `feature[id][bool|number|text|footnote|highlight]` naming —
// no wiring changes.

export type PlanFeatureRow = {
  id: string;
  key: string;
  label: string;
  groupLabel: string | null;
  description: string | null;
  valueType: "BOOLEAN" | "NUMBER" | "TEXT";
  enforcement: "GATE" | "MARKETING_ONLY";
  sortOrder: number;
  groupSortOrder: number;
};

export type PlanFeatureValueRow = {
  id: string;
  planId: string;
  featureId: string;
  valueBool: boolean | null;
  valueNumber: number | null;
  valueText: string | null;
  footnote: string | null;
  highlight: boolean;
};

interface PlanFeaturesEditorProps {
  planId: string;
  features: PlanFeatureRow[];
  valueByFeature: Map<string, PlanFeatureValueRow>;
  canWrite: boolean;
}

// Where each group should render. Limits & storage rendered first as
// a distinct visual section. Anything else falls through to the
// "groups" lane in the order the seed defined.
const LIMITS_GROUP = "Limits & storage";

export function PlanFeaturesEditor({
  planId,
  features,
  valueByFeature,
  canWrite,
}: PlanFeaturesEditorProps) {
  if (features.length === 0) {
    return (
      <div
        className="rounded-xl px-5 py-10 text-center text-sm"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        No feature library defined yet. Run the pricing seed script to populate it.
      </div>
    );
  }

  // Group features by groupLabel preserving the seed-defined order.
  const groups = new Map<string, PlanFeatureRow[]>();
  for (const f of features) {
    const key = f.groupLabel ?? "Other";
    const arr = groups.get(key) ?? [];
    arr.push(f);
    groups.set(key, arr);
  }

  // Pull "Limits & storage" out so it can render first with distinct
  // styling. Everything else stays in original order.
  const limitsGroup = groups.get(LIMITS_GROUP);
  const otherGroups = Array.from(groups.entries()).filter(([k]) => k !== LIMITS_GROUP);

  // Compute summary stats.
  const summary = computeSummary(features, valueByFeature);

  return (
    <form
      action={savePlanFeatures.bind(null, planId)}
      className="space-y-5 pb-24"
    >
      <SummaryBand summary={summary} />

      <PlanFeaturesFilterBar
        totalCount={summary.totalCount}
        enabledCount={summary.enabledCount}
      />

      {limitsGroup && limitsGroup.length > 0 && (
        <LimitsSection
          rows={limitsGroup}
          valueByFeature={valueByFeature}
          canWrite={canWrite}
        />
      )}

      {otherGroups.map(([groupLabel, rows]) => (
        <FeatureGroupCard
          key={groupLabel}
          groupLabel={groupLabel}
          rows={rows}
          valueByFeature={valueByFeature}
          canWrite={canWrite}
        />
      ))}

      {/* Empty-state placeholder — only visible when filter has no matches.
          Toggled in/out by PlanFeaturesFilterBar. */}
      <div
        data-feature-empty
        style={{ display: "none" }}
        className="rounded-xl px-5 py-8 text-center text-sm"
      >
        <div style={{ color: "var(--text-default)" }}>No features match.</div>
        <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          Clear the filter or try a different keyword.
        </div>
      </div>

      {canWrite && <StickySaveBar enabledCount={summary.enabledCount} totalCount={summary.totalCount} />}
    </form>
  );
}

// ────────────────────────────────────────────────────────────────
// SUMMARY BAND
// ────────────────────────────────────────────────────────────────

interface FeaturesSummary {
  totalCount: number;
  enabledCount: number;
  unlimitedCount: number;
  highlightedCount: number;
  perGroup: { group: string; enabled: number; total: number }[];
  strength: "Basic" | "Advanced" | "Full";
}

function computeSummary(
  features: PlanFeatureRow[],
  values: Map<string, PlanFeatureValueRow>,
): FeaturesSummary {
  const perGroupMap = new Map<string, { enabled: number; total: number }>();
  let enabledCount = 0;
  let unlimitedCount = 0;
  let highlightedCount = 0;

  for (const f of features) {
    const g = f.groupLabel ?? "Other";
    const stats = perGroupMap.get(g) ?? { enabled: 0, total: 0 };
    stats.total++;
    const v = values.get(f.id);
    const isEnabled = featureIsEnabled(f, v);
    if (isEnabled) {
      enabledCount++;
      stats.enabled++;
    }
    if (f.valueType === "NUMBER" && v?.valueNumber === -1) unlimitedCount++;
    if (v?.highlight) highlightedCount++;
    perGroupMap.set(g, stats);
  }

  const ratio = features.length === 0 ? 0 : enabledCount / features.length;
  const strength: FeaturesSummary["strength"] =
    ratio >= 0.7 ? "Full" : ratio >= 0.4 ? "Advanced" : "Basic";

  return {
    totalCount: features.length,
    enabledCount,
    unlimitedCount,
    highlightedCount,
    perGroup: Array.from(perGroupMap.entries()).map(([group, s]) => ({ group, ...s })),
    strength,
  };
}

function featureIsEnabled(f: PlanFeatureRow, v: PlanFeatureValueRow | undefined): boolean {
  if (!v) return false;
  if (f.valueType === "BOOLEAN") return !!v.valueBool;
  if (f.valueType === "NUMBER") return v.valueNumber != null && v.valueNumber !== 0;
  if (f.valueType === "TEXT")    return !!v.valueText && v.valueText.length > 0;
  return false;
}

function SummaryBand({ summary }: { summary: FeaturesSummary }) {
  const strengthTone =
    summary.strength === "Full"     ? { bg: "var(--success-surface)", fg: "var(--success-fg)"     } :
    summary.strength === "Advanced" ? { bg: "var(--accent-surface)",  fg: "var(--accent-primary)" } :
                                      { bg: "var(--surface-2)",       fg: "var(--text-muted)"     };
  return (
    <section
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="grid gap-px md:grid-cols-[1fr_auto]" style={{ background: "var(--border-subtle)" }}>
        <div className="p-5" style={{ background: "var(--surface-1)" }}>
          <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Plan strength
          </div>
          <div className="mt-2 flex items-baseline gap-3">
            <span
              className="rounded-full px-3 py-1 text-sm font-semibold"
              style={{ background: strengthTone.bg, color: strengthTone.fg }}
            >
              {summary.strength}
            </span>
            <span
              className="text-2xl font-semibold tabular-nums tracking-tight"
              style={{ color: "var(--text-default)" }}
            >
              {summary.enabledCount}/{summary.totalCount}
            </span>
            <span className="text-sm" style={{ color: "var(--text-muted)" }}>
              features enabled
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            {summary.unlimitedCount > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}
              >
                ∞ {summary.unlimitedCount} unlimited
              </span>
            )}
            {summary.highlightedCount > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
              >
                ★ {summary.highlightedCount} highlighted
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px sm:grid-cols-3 md:grid-cols-6" style={{ background: "var(--border-subtle)" }}>
          {summary.perGroup.map((g) => {
            const pct = g.total === 0 ? 0 : Math.round((g.enabled / g.total) * 100);
            const tone =
              g.enabled === g.total ? "var(--success-fg)" :
              g.enabled === 0       ? "var(--text-faint)" :
                                       "var(--text-default)";
            return (
              <div
                key={g.group}
                className="px-4 py-3 text-xs"
                style={{ background: "var(--surface-1)" }}
              >
                <div className="truncate text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  {g.group}
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-sm font-semibold tabular-nums" style={{ color: tone }}>
                    {g.enabled}
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    /{g.total}
                  </span>
                  <span className="ml-auto text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {pct}%
                  </span>
                </div>
                <div
                  className="mt-1 h-1 w-full overflow-hidden rounded-full"
                  style={{ background: "var(--surface-3)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background:
                        pct === 100 ? "var(--success-fg)" :
                        pct > 0     ? "var(--accent-primary)" :
                                       "var(--text-faint)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────────
// LIMITS & QUOTAS — distinct treatment for numeric caps
// ────────────────────────────────────────────────────────────────

function LimitsSection({
  rows,
  valueByFeature,
  canWrite,
}: {
  rows: PlanFeatureRow[];
  valueByFeature: Map<string, PlanFeatureValueRow>;
  canWrite: boolean;
}) {
  return (
    <section
      data-feature-group
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--accent-primary)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <header
        className="flex items-center gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)", background: "var(--accent-surface)" }}
      >
        <span aria-hidden style={{ color: "var(--accent-primary)" }}>📊</span>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--accent-primary)" }}>
            Limits &amp; quotas
          </h2>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            Numeric caps the plan enforces. <code className="font-mono">-1</code> = unlimited.
          </p>
        </div>
      </header>

      <div className="grid gap-px md:grid-cols-2" style={{ background: "var(--border-subtle)" }}>
        {rows.map((f) => (
          <LimitRow
            key={f.id}
            feature={f}
            value={valueByFeature.get(f.id)}
            canWrite={canWrite}
          />
        ))}
      </div>
    </section>
  );
}

function LimitRow({
  feature,
  value,
  canWrite,
}: {
  feature: PlanFeatureRow;
  value: PlanFeatureValueRow | undefined;
  canWrite: boolean;
}) {
  const isUnlimited = feature.valueType === "NUMBER" && value?.valueNumber === -1;
  const haystack = featureHaystack(feature);
  return (
    <div
      data-feature-row
      data-feature-haystack={haystack}
      className="grid gap-2 px-5 py-4"
      style={{ background: "var(--surface-1)" }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
              {feature.label}
            </span>
            {isUnlimited && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}
              >
                ∞ Unlimited
              </span>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
            {feature.key}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <FeatureSourcePill enforcement={feature.enforcement} />
          <HighlightCheckbox feature={feature} value={value} disabled={!canWrite} />
        </div>
      </div>

      <FeatureValueInput feature={feature} value={value} disabled={!canWrite} />

      {feature.description && (
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {feature.description}
        </div>
      )}

      <FootnoteInput feature={feature} value={value} disabled={!canWrite} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// FEATURE GROUPS
// ────────────────────────────────────────────────────────────────

function FeatureGroupCard({
  groupLabel,
  rows,
  valueByFeature,
  canWrite,
}: {
  groupLabel: string;
  rows: PlanFeatureRow[];
  valueByFeature: Map<string, PlanFeatureValueRow>;
  canWrite: boolean;
}) {
  const enabled = rows.filter((f) => featureIsEnabled(f, valueByFeature.get(f.id))).length;
  return (
    <section
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
              {enabled} of {rows.length} enabled
            </p>
          </div>
          <span
            aria-hidden
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            click to toggle ▾
          </span>
        </summary>

        <ul>
          {rows.map((f, idx) => (
            <FeatureRow
              key={f.id}
              feature={f}
              value={valueByFeature.get(f.id)}
              canWrite={canWrite}
              isFirst={idx === 0}
            />
          ))}
        </ul>
      </details>
    </section>
  );
}

function FeatureRow({
  feature,
  value,
  canWrite,
  isFirst,
}: {
  feature: PlanFeatureRow;
  value: PlanFeatureValueRow | undefined;
  canWrite: boolean;
  isFirst: boolean;
}) {
  const haystack = featureHaystack(feature);
  return (
    <li
      data-feature-row
      data-feature-haystack={haystack}
      className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_220px_220px_60px] md:items-start"
      style={{ borderTop: isFirst ? "none" : "1px solid var(--border-subtle)" }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
            {feature.label}
          </span>
          <FeatureTypePill type={feature.valueType} />
          <FeatureSourcePill enforcement={feature.enforcement} />
        </div>
        <div className="mt-0.5 font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
          {feature.key}
        </div>
        {feature.description && (
          <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {feature.description}
          </div>
        )}
      </div>
      <div>
        <FeatureValueInput feature={feature} value={value} disabled={!canWrite} />
      </div>
      <div>
        <FootnoteInput feature={feature} value={value} disabled={!canWrite} />
      </div>
      <div className="flex items-center justify-center md:pt-1">
        <HighlightCheckbox feature={feature} value={value} disabled={!canWrite} />
      </div>
    </li>
  );
}

// ────────────────────────────────────────────────────────────────
// INPUTS / PILLS
// ────────────────────────────────────────────────────────────────

function FeatureValueInput({
  feature,
  value,
  disabled,
}: {
  feature: PlanFeatureRow;
  value: PlanFeatureValueRow | undefined;
  disabled: boolean;
}) {
  const baseStyle: React.CSSProperties = {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-default)",
  };

  if (feature.valueType === "BOOLEAN") {
    const on = !!value?.valueBool;
    return (
      <label
        className="ts-focus inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm"
        style={{
          background: on ? "var(--success-surface)" : "var(--surface-2)",
          border: `1px solid ${on ? "var(--success-fg)" : "var(--border-default)"}`,
          color: on ? "var(--success-fg)" : "var(--text-muted)",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <input
          type="checkbox"
          name={`feature[${feature.id}][bool]`}
          defaultChecked={on}
          disabled={disabled}
          className="h-4 w-4 cursor-inherit"
        />
        <span className="font-medium">
          {on ? "Included" : "Not included"}
        </span>
      </label>
    );
  }

  if (feature.valueType === "NUMBER") {
    const isUnlimited = value?.valueNumber === -1;
    return (
      <div className="flex items-stretch gap-1">
        <input
          type="number"
          name={`feature[${feature.id}][number]`}
          defaultValue={value?.valueNumber == null ? "" : String(value.valueNumber)}
          placeholder="e.g. 5"
          disabled={disabled}
          className="ts-focus w-full rounded-md px-2.5 py-1.5 text-sm tabular-nums outline-none"
          style={{
            ...baseStyle,
            color: isUnlimited ? "var(--success-fg)" : baseStyle.color,
            fontWeight: isUnlimited ? 600 : undefined,
          }}
          title="Set the cap. Use -1 for unlimited."
        />
        {!disabled && (
          <span
            className="inline-flex items-center px-2 text-[10px] font-medium uppercase tracking-wide"
            style={{
              color: "var(--text-faint)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm, 4px)",
              whiteSpace: "nowrap",
            }}
            title="Type -1 in the number field for unlimited"
          >
            -1 = ∞
          </span>
        )}
      </div>
    );
  }

  // TEXT
  return (
    <input
      type="text"
      name={`feature[${feature.id}][text]`}
      defaultValue={value?.valueText ?? ""}
      placeholder='e.g. "Priority + chat"'
      maxLength={120}
      disabled={disabled}
      className="ts-focus w-full rounded-md px-2.5 py-1.5 text-sm outline-none"
      style={baseStyle}
    />
  );
}

function FootnoteInput({
  feature,
  value,
  disabled,
}: {
  feature: PlanFeatureRow;
  value: PlanFeatureValueRow | undefined;
  disabled: boolean;
}) {
  return (
    <input
      type="text"
      name={`feature[${feature.id}][footnote]`}
      defaultValue={value?.footnote ?? ""}
      maxLength={120}
      disabled={disabled}
      placeholder='Footnote — e.g. "+$12/seat after 15"'
      className="ts-focus w-full rounded-md px-2.5 py-1.5 text-xs outline-none"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        color: "var(--text-muted)",
      }}
      title="Optional footnote shown under the feature on /pricing."
    />
  );
}

function HighlightCheckbox({
  feature,
  value,
  disabled,
}: {
  feature: PlanFeatureRow;
  value: PlanFeatureValueRow | undefined;
  disabled: boolean;
}) {
  return (
    <label
      className="inline-flex cursor-pointer items-center gap-1 text-xs"
      style={{ color: value?.highlight ? "var(--accent-primary)" : "var(--text-muted)" }}
      title="Highlight this feature in accent color on /pricing."
    >
      <input
        type="checkbox"
        name={`feature[${feature.id}][highlight]`}
        defaultChecked={value?.highlight ?? false}
        disabled={disabled}
        className="cursor-pointer"
      />
      <span aria-hidden>★</span>
    </label>
  );
}

function FeatureTypePill({ type }: { type: PlanFeatureRow["valueType"] }) {
  const palette =
    type === "BOOLEAN" ? { bg: "var(--surface-2)",      fg: "var(--text-muted)" } :
    type === "NUMBER"  ? { bg: "var(--accent-surface)", fg: "var(--accent-primary)" } :
                          { bg: "var(--surface-2)",      fg: "var(--text-muted)" };
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {type.toLowerCase()}
    </span>
  );
}

function FeatureSourcePill({ enforcement }: { enforcement: PlanFeatureRow["enforcement"] }) {
  const palette =
    enforcement === "GATE"
      ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)", label: "Gated" }
      : { bg: "var(--surface-2)",       fg: "var(--text-muted)", label: "Marketing" };
  return (
    <span
      className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      style={{ background: palette.bg, color: palette.fg }}
      title={
        enforcement === "GATE"
          ? "Hard-gated. The app blocks tenants without this feature."
          : "Marketing only. Shown on /pricing but not enforced in code."
      }
    >
      {palette.label}
    </span>
  );
}

// Lower-cased blob the client filter searches against. Includes label,
// key, group, and description so a single search box hits any of them.
function featureHaystack(f: PlanFeatureRow): string {
  return [f.label, f.key, f.groupLabel ?? "", f.description ?? ""]
    .join(" ")
    .toLowerCase();
}

// ────────────────────────────────────────────────────────────────
// STICKY SAVE BAR
// ────────────────────────────────────────────────────────────────

function StickySaveBar({
  enabledCount,
  totalCount,
}: {
  enabledCount: number;
  totalCount: number;
}) {
  return (
    <div
      className="sticky bottom-0 z-30 -mx-8 mt-4 flex items-center justify-between gap-3 px-8 py-3"
      style={{
        background: "color-mix(in oklab, var(--surface-0) 92%, transparent)",
        borderTop: "1px solid var(--border-default)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        <b style={{ color: "var(--text-default)" }} className="tabular-nums">
          {enabledCount}/{totalCount}
        </b>{" "}
        features enabled · changes save when you click below
      </div>
      <button
        type="submit"
        className="ts-focus rounded-md px-4 py-2 text-sm font-semibold"
        style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
      >
        Save all features
      </button>
    </div>
  );
}
