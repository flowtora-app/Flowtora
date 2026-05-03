// Shared field components + carry-over inputs for the equipment editor tabs.

import * as React from "react";
import type { EquipmentDetail } from "@/server/platform/equipment";

export function Field({
  label, name, type = "text", required, defaultValue, maxLength, disabled, hint, placeholder, step, wide,
}: {
  label: string; name: string; type?: string; required?: boolean;
  defaultValue?: string; maxLength?: number; disabled?: boolean;
  hint?: string; placeholder?: string; step?: number; wide?: boolean;
}) {
  return (
    <label className={"block " + (wide ? "md:col-span-2" : "")}>
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}{required ? " *" : ""}
      </span>
      <input type={type} name={name} required={required}
             defaultValue={defaultValue} maxLength={maxLength}
             disabled={disabled} placeholder={placeholder} step={step}
             className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      {hint && <span className="mt-1 block text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );
}

export function TextArea({
  label, name, defaultValue, rows = 3, maxLength, disabled, hint,
}: {
  label: string; name: string; defaultValue?: string; rows?: number;
  maxLength?: number; disabled?: boolean; hint?: string;
}) {
  return (
    <label className="block md:col-span-2">
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <textarea name={name} defaultValue={defaultValue} rows={rows} maxLength={maxLength} disabled={disabled}
                className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      {hint && <span className="mt-1 block text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );
}

export function Select({
  label, name, defaultValue, disabled, options,
}: {
  label: string; name: string; defaultValue?: string; disabled?: boolean;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <select name={name} defaultValue={defaultValue} disabled={disabled}
              className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function Section({
  title, description, children,
}: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border md:col-span-2"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>{title}</h2>
        {description && (
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

export function CarryOverInputs({
  detail, except,
}: {
  detail: EquipmentDetail;
  except: string[];
}) {
  const all: Record<string, string> = {
    slug: detail.slug,
    brand: detail.brand,
    model: detail.model,
    category: detail.category,
    displayName: detail.displayName ?? "",
    maxWidthIn: detail.maxWidthIn != null ? String(detail.maxWidthIn) : "",
    maxLengthFt: detail.maxLengthFt != null ? String(detail.maxLengthFt) : "",
    colorModes: detail.colorModes.join(", "),
    inkTypes: detail.inkTypes.join(", "),
    resolution: detail.resolution ?? "",
    ratedSpeed: detail.ratedSpeed != null ? String(detail.ratedSpeed) : "",
    speedUnit: detail.speedUnit ?? "",
    warmupMinutes: String(detail.warmupMinutes),
    changeoverMinutes: String(detail.changeoverMinutes),
    defaultUptimePct: String(detail.defaultUptimePct),
    defaultWastePct: String(detail.defaultWastePct),
    purchaseCostMinor: String(detail.purchaseCostMinor),
    depreciationYears: String(detail.depreciationYears),
    hourlyOperatingCostMinor: String(detail.hourlyOperatingCostMinor),
    imageUrl: detail.imageUrl ?? "",
    manualUrl: detail.manualUrl ?? "",
    status: detail.status,
    internalNotes: detail.internalNotes ?? "",
    tags: detail.tags.join(", "),
  };
  return (
    <>
      {Object.entries(all)
        .filter(([k]) => !except.includes(k))
        .map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
    </>
  );
}
