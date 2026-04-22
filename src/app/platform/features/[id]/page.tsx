import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/Card";
import { updatePlanFeature, deletePlanFeature } from "@/app/actions/plan-features";

// /platform/features/[id] — feature editor (M4).
//
// Edits the master PlanFeature row. Renaming a `key` on a GATE feature
// is a foot-gun (needs matching code change in the same commit), so the
// form flags it with a warning chip. MARKETING_ONLY features are free
// to rename — they don't gate any runtime behavior.
//
// Delete is the loud kind: removes the row, cascades to every
// PlanFeatureValue cell across all plans. Admins are shown the
// count-of-active-cells before committing.

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

  // Count active cells (non-empty values). Helps the admin understand
  // what will vanish from marketing cards if they delete this row.
  const activeCells = await db.planFeatureValue.count({
    where: {
      featureId: id,
      OR: [
        { valueBool: true },
        { valueNumber: { not: null } },
        { valueText: { not: null } },
      ],
    },
  });

  const canWrite = ctx.canWrite;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/platform/features"
            className="text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            ← Features
          </Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold">
            {feature.label}
            <EnforcementChip enforcement={feature.enforcement} />
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            <span className="font-mono text-xs">{feature.key}</span>
            {" · "}
            {feature.valueType.toLowerCase()}
            {" · "}
            {activeCells} active / {feature._count.values} total cells
          </p>
        </div>

        {canWrite && (
          <form
            action={deletePlanFeature.bind(null, feature.id)}
            // A trivial native confirm keeps the flow 1-click without
            // pulling in client JS just for a modal. Admins only.
          >
            <button
              type="submit"
              className="rounded-md px-3 py-2 text-xs font-medium"
              style={{
                background: "var(--danger-surface)",
                color: "var(--danger-fg)",
                border: "1px solid var(--danger-border)",
              }}
            >
              Delete feature
            </button>
          </form>
        )}
      </div>

      {sp.ok && <Banner tone="ok">Saved.</Banner>}
      {sp.error && <Banner tone="error">{sp.error}</Banner>}

      {feature.enforcement === "GATE" && (
        <div
          className="rounded-md px-4 py-3 text-xs"
          style={{
            background: "var(--warning-surface)",
            color: "var(--warning-fg)",
            border: "1px solid var(--warning-fg)",
          }}
        >
          <strong>Gate feature.</strong> This key is referenced from app code via{" "}
          <code
            className="rounded px-1 py-0.5 font-mono text-[11px]"
            style={{ background: "var(--surface-0)", border: "1px solid var(--warning-fg)" }}
          >
            hasFeature(tenant, &quot;{feature.key}&quot;)
          </code>
          . Renaming the key here without updating the call sites will silently disable the gate.
        </div>
      )}

      <Card>
        <CardHeader
          title="Identity & display"
          description="Key, label, group. Group controls which section of the pricing matrix this feature appears in."
        />
        <form action={updatePlanFeature.bind(null, feature.id)} className="space-y-5 px-5 py-5">
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
              hint={'e.g. "Limits", "Workflow", "Insights". Blank = Ungrouped.'}
              disabled={!canWrite}
            />
            <SelectField
              label="Value type"
              name="valueType"
              defaultValue={feature.valueType}
              options={[
                { value: "BOOLEAN", label: "Boolean — included / not included" },
                { value: "NUMBER", label: "Number — cap (-1 = unlimited)" },
                { value: "TEXT", label: "Text — free-form label" },
              ]}
              hint="Changes per-plan cell shape; existing values in the wrong shape become inert."
              disabled={!canWrite}
            />
            <SelectField
              label="Enforcement"
              name="enforcement"
              defaultValue={feature.enforcement}
              options={[
                { value: "GATE", label: "GATE — runtime entitlement (code references key)" },
                { value: "MARKETING_ONLY", label: "MARKETING_ONLY — bullet text only, no code effect" },
              ]}
              hint="Marketing-only features are safe to rename at will."
              disabled={!canWrite}
            />
            <FormField
              label="Sort order"
              name="sortOrder"
              type="number"
              defaultValue={String(feature.sortOrder)}
              hint="Lower = shown first within its group."
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

          <label className="block">
            <span className="mb-1 block text-sm">Description</span>
            <textarea
              name="description"
              defaultValue={feature.description ?? ""}
              rows={3}
              maxLength={400}
              disabled={!canWrite}
              className="w-full rounded-md px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
            <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
              Optional hover tooltip on /pricing. 400 chars max.
            </span>
          </label>

          {canWrite && (
            <div className="flex justify-end pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <button
                type="submit"
                className="mt-4 rounded-md px-4 py-2 text-sm font-medium"
                style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
              >
                Save changes
              </button>
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */

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
      <span className="mb-1 block text-sm">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        className="w-full rounded-md px-3 py-2 text-sm outline-none"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          color: "var(--text)",
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
      <span className="mb-1 block text-sm">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className="w-full rounded-md px-3 py-2 text-sm outline-none"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          color: "var(--text)",
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
