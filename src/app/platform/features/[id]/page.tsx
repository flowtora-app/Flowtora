import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { updatePlanFeature, deletePlanFeature } from "@/app/actions/plan-features";

// /platform/features/[id] — feature editor (transformation rewrite).
//
// Sticky-style header with breadcrumb + chips, multi-section layout,
// and a Plan usage matrix at the bottom showing where this feature
// has a value set across the plan catalog.
//
// Renaming a key on a GATE feature stays the loudest concern — we
// surface the warning banner and keep a danger-zone Delete on a
// separate card.

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

export default async function PlatformFeatureEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();

  const feature = await db.planFeature.findUnique({
    where: { id },
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
  if (!feature) notFound();

  // Fire two things in parallel:
  //   1. Plans we'll show in the usage matrix
  //   2. PlanFeatureValue rows that already exist for this feature
  // We then merge per-plan in memory.
  const [plans, values, activeCells] = await Promise.all([
    db.pricingPlan.findMany({
      where: { status: { in: ["PUBLISHED", "DRAFT", "HIDDEN"] } },
      orderBy: [{ status: "asc" }, { sortOrder: "asc" }],
      select: { id: true, slug: true, name: true, status: true },
    }),
    db.planFeatureValue.findMany({
      where: { featureId: id },
      select: {
        planId: true,
        valueBool: true,
        valueNumber: true,
        valueText: true,
        footnote: true,
        highlight: true,
      },
    }),
    db.planFeatureValue.count({
      where: {
        featureId: id,
        OR: [
          { valueBool: true },
          { valueNumber: { not: null } },
          { valueText: { not: null } },
        ],
      },
    }),
  ]);

  const valueByPlan = new Map(values.map((v) => [v.planId, v]));

  const canWrite = ctx.canWrite;

  // Header chips.
  const enforcementTone =
    feature.enforcement === "GATE" ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)", label: "Gated" }
                                   : { bg: "var(--surface-2)",       fg: "var(--text-muted)", label: "Marketing-only" };
  const typeTone =
    feature.valueType === "NUMBER"  ? { bg: "var(--accent-surface)", fg: "var(--accent-primary)" }
                                    : { bg: "var(--surface-2)",      fg: "var(--text-muted)"     };

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <header>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/platform/features" className="hover:underline">
            Feature library
          </Link>
          <span className="mx-1.5">/</span>
          <span className="font-mono">{feature.key}</span>
        </div>
        <div className="mt-1 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: "var(--text-default)" }}
            >
              {feature.label || <span style={{ color: "var(--text-faint)" }}>Untitled feature</span>}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Chip {...enforcementTone} />
              <Chip bg={typeTone.bg} fg={typeTone.fg} label={feature.valueType.toLowerCase()} />
              {feature.groupLabel && (
                <Chip bg="var(--surface-2)" fg="var(--text-default)" label={feature.groupLabel} title="Group" />
              )}
              <Chip
                bg={activeCells > 0 ? "var(--success-surface)" : "var(--surface-2)"}
                fg={activeCells > 0 ? "var(--success-fg)"     : "var(--text-muted)"}
                label={`${activeCells} active`}
                title={`${activeCells} of ${feature._count.values} cells set across plans`}
              />
              <Chip
                bg="var(--surface-2)"
                fg="var(--text-muted)"
                label={`sort ${feature.sortOrder}`}
                title="Within-group sort"
              />
            </div>
          </div>
          {canWrite && (
            <form action={deletePlanFeature.bind(null, feature.id)}>
              <button
                type="submit"
                className="ts-focus rounded-md px-3 py-2 text-xs font-medium"
                style={{
                  background: "var(--danger-surface)",
                  color: "var(--danger-fg)",
                  border: "1px solid var(--danger-fg)",
                }}
                title={`Permanently removes this feature and ${feature._count.values} cell${feature._count.values === 1 ? "" : "s"} across plans.`}
              >
                Delete feature
              </button>
            </form>
          )}
        </div>
      </header>

      {/* ── Banners ─────────────────────────────────────────── */}
      {sp.ok && <Banner tone="success" title="Saved" body="Changes saved." />}
      {sp.error && <Banner tone="danger" title="Action failed" body={decodeURIComponent(sp.error)} />}

      {feature.enforcement === "GATE" && (
        <Banner
          tone="warning"
          title="Code-referenced feature"
          body={`This key is referenced in app code via hasFeature(tenant, "${feature.key}"). Renaming it without updating call sites silently disables the gate.`}
        />
      )}

      {/* ── Edit form ───────────────────────────────────────── */}
      <form action={updatePlanFeature.bind(null, feature.id)} className="space-y-5">
        <Section title="Identity & display" description="Key, label, group. Group controls which section of the pricing matrix this feature appears in.">
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label="Key"
              name="key"
              defaultValue={feature.key}
              required
              hint="Letters, digits, underscores. e.g. installScheduling. Changes here DO NOT update call sites."
              disabled={!canWrite}
            />
            <FormField
              label="Label"
              name="label"
              defaultValue={feature.label}
              required
              maxLength={120}
              hint="Text shown on the pricing card / comparison table."
              disabled={!canWrite}
            />
            <FormField
              label="Group"
              name="groupLabel"
              defaultValue={feature.groupLabel ?? ""}
              maxLength={60}
              hint='e.g. "Limits & storage", "Workflow & operations". Blank = Ungrouped.'
              disabled={!canWrite}
            />
          </div>
          <label className="block">
            <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-default)" }}>
              Description
            </span>
            <textarea
              name="description"
              defaultValue={feature.description ?? ""}
              rows={3}
              maxLength={400}
              disabled={!canWrite}
              className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-default)",
                color: "var(--text-default)",
              }}
            />
            <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
              Optional hover tooltip on /pricing. 400 chars max.
            </span>
          </label>
        </Section>

        <Section
          title="Behavior"
          description="What kind of value this feature carries and whether it gates runtime access."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Value type"
              name="valueType"
              defaultValue={feature.valueType}
              options={[
                { value: "BOOLEAN", label: "Boolean — included / not included" },
                { value: "NUMBER",  label: "Number — cap (-1 = unlimited)" },
                { value: "TEXT",    label: "Text — free-form label" },
              ]}
              hint="Changes per-plan cell shape; existing values in the wrong shape become inert."
              disabled={!canWrite}
            />
            <SelectField
              label="Enforcement"
              name="enforcement"
              defaultValue={feature.enforcement}
              options={[
                { value: "GATE",            label: "GATE — runtime entitlement (code references key)" },
                { value: "MARKETING_ONLY",  label: "MARKETING_ONLY — bullet text only, no code effect" },
              ]}
              hint="Marketing-only features are safe to rename at will."
              disabled={!canWrite}
            />
          </div>
        </Section>

        <Section
          title="Position"
          description="Where this feature appears in the pricing matrix and within its group."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label="Sort order (within group)"
              name="sortOrder"
              type="number"
              defaultValue={String(feature.sortOrder)}
              hint="Lower = earlier within the group."
              disabled={!canWrite}
            />
            <FormField
              label="Group sort order"
              name="groupSortOrder"
              type="number"
              defaultValue={String(feature.groupSortOrder)}
              hint="Lower = group appears higher in the matrix."
              disabled={!canWrite}
            />
          </div>
        </Section>

        {canWrite && (
          <div className="flex justify-end">
            <button
              type="submit"
              className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              Save changes
            </button>
          </div>
        )}
      </form>

      {/* ── Plan usage matrix ─────────────────────────────────── */}
      <Section
        title="Plan usage"
        description="Which plans have a value set for this feature. Edit per-plan values from the plan's Features tab."
      >
        {plans.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No plans yet.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-5 -mb-5">
            <table className="w-full text-sm">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <th className="px-5 py-2.5 font-medium">Plan</th>
                  <th className="px-5 py-2.5 font-medium">Status</th>
                  <th className="px-5 py-2.5 font-medium">Value</th>
                  <th className="px-5 py-2.5 font-medium">Footnote</th>
                  <th className="px-5 py-2.5 text-center font-medium">★</th>
                  <th className="px-5 py-2.5 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan, idx) => {
                  const value = valueByPlan.get(plan.id);
                  const display = renderValue(feature.valueType, value);
                  return (
                    <tr key={plan.id} style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}>
                      <td className="px-5 py-3">
                        <Link
                          href={`/platform/plans/${plan.id}?tab=features`}
                          className="hover:underline"
                          style={{ color: "var(--text-default)" }}
                        >
                          {plan.name}
                        </Link>
                        <div className="mt-0.5 font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                          {plan.slug}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <PlanStatusPill status={plan.status} />
                      </td>
                      <td className="px-5 py-3">
                        {display.set ? (
                          <span style={{ color: display.tone }}>{display.text}</span>
                        ) : (
                          <span style={{ color: "var(--text-faint)" }}>not set</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                        {value?.footnote ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                      </td>
                      <td className="px-5 py-3 text-center">
                        {value?.highlight ? (
                          <span style={{ color: "var(--accent-primary)" }}>★</span>
                        ) : (
                          <span style={{ color: "var(--text-faint)" }}>—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/platform/plans/${plan.id}?tab=features`}
                          className="text-xs"
                          style={{ color: "var(--accent-primary)" }}
                        >
                          Edit on plan →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function renderValue(
  type: "BOOLEAN" | "NUMBER" | "TEXT",
  value: { valueBool: boolean | null; valueNumber: number | null; valueText: string | null } | undefined,
): { set: boolean; text: string; tone: string } {
  if (!value) return { set: false, text: "", tone: "var(--text-faint)" };
  if (type === "BOOLEAN") {
    if (value.valueBool === true)  return { set: true, text: "✓ Included",     tone: "var(--success-fg)" };
    if (value.valueBool === false) return { set: true, text: "Not included",   tone: "var(--text-muted)" };
    return { set: false, text: "", tone: "var(--text-faint)" };
  }
  if (type === "NUMBER") {
    if (value.valueNumber == null) return { set: false, text: "", tone: "var(--text-faint)" };
    if (value.valueNumber === -1)  return { set: true, text: "∞ Unlimited",    tone: "var(--success-fg)" };
    return { set: true, text: value.valueNumber.toLocaleString(), tone: "var(--text-default)" };
  }
  // TEXT
  if (!value.valueText) return { set: false, text: "", tone: "var(--text-faint)" };
  return { set: true, text: value.valueText, tone: "var(--text-default)" };
}

function PlanStatusPill({ status }: { status: string }) {
  const palette =
    status === "PUBLISHED" ? { bg: "var(--success-surface)", fg: "var(--success-fg)" } :
    status === "HIDDEN"    ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)" } :
                              { bg: "var(--surface-2)",       fg: "var(--text-muted)" };
  return (
    <span
      className="inline-block rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{ background: palette.bg, color: palette.fg }}
    >
      {status.toLowerCase()}
    </span>
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
        className="flex items-start justify-between gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {description}
            </p>
          )}
        </div>
        {right}
      </header>
      <div className="space-y-5 p-5">{children}</div>
    </section>
  );
}

function Chip({
  bg,
  fg,
  label,
  title,
}: {
  bg: string;
  fg: string;
  label: string;
  title?: string;
}) {
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: bg, color: fg, border: `1px solid ${fg}` }}
      title={title}
    >
      {label}
    </span>
  );
}

function FormField({
  label,
  hint,
  name,
  defaultValue,
  type = "text",
  required,
  placeholder,
  maxLength,
  disabled,
}: {
  label: string;
  hint?: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-default)" }}>
        {label}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          color: "var(--text-default)",
        }}
      />
      {hint && (
        <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function SelectField({
  label,
  hint,
  name,
  defaultValue,
  options,
  disabled,
}: {
  label: string;
  hint?: string;
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium" style={{ color: "var(--text-default)" }}>
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          color: "var(--text-default)",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && (
        <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      )}
    </label>
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
