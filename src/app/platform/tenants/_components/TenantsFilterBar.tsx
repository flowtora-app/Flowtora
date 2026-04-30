"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, MultiCombobox, Select } from "@/components/ui";

// TenantsFilterBar — Page 4 §Filters / Toolbar.
//
// Search + a comprehensive "Add filter" popover covering every chip
// listed in the spec. URL-driven so deep-links round-trip and saved
// views work out of the box.

const PLAN_OPTIONS = [
  { value: "STARTER",    label: "Starter" },
  { value: "GROWTH",     label: "Growth" },
  { value: "PRO",        label: "Pro" },
  { value: "ENTERPRISE", label: "Enterprise" },
];

const STATUS_OPTIONS = [
  { value: "ACTIVE",    label: "Active" },
  { value: "TRIAL",     label: "Trialing" },
  { value: "PAST_DUE",  label: "Past due" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "CANCELED",  label: "Cancelled" },
  { value: "ARCHIVED",  label: "Archived" },
];

const INDUSTRY_OPTIONS = [
  { value: "SIGN_SHOP",            label: "Sign shop" },
  { value: "PRINT_SHOP",           label: "Print shop" },
  { value: "APPAREL_SCREEN_PRINT", label: "Apparel / screen-print" },
  { value: "EMBROIDERY",           label: "Embroidery" },
  { value: "PROMO_PRODUCTS",       label: "Promo products" },
  { value: "TRADE_PRINTER",        label: "Trade printer" },
  { value: "WIDE_FORMAT_ONLY",     label: "Wide-format only" },
  { value: "MULTI_DISCIPLINE",     label: "Multi-discipline" },
  { value: "HYBRID",               label: "Hybrid" },
  { value: "OTHER",                label: "Other" },
];

const SOURCE_OPTIONS = [
  { value: "ORGANIC",  label: "Organic" },
  { value: "REFERRAL", label: "Referral" },
  { value: "PAID",     label: "Paid" },
  { value: "PARTNER",  label: "Partner" },
  { value: "OTHER",    label: "Other" },
];

export interface CountryOption { iso2: string; name: string }
export interface StaffOption { id: string; label: string }

export interface TenantsFilterBarProps {
  countryOptions: CountryOption[];
  staffOptions: StaffOption[];
  tagOptions: string[];
  /** Density toggle — "comfortable" or "compact". URL-stored as `density`. */
  density: "comfortable" | "compact";
}

export function TenantsFilterBar({ countryOptions, staffOptions, tagOptions, density }: TenantsFilterBarProps) {
  const router = useRouter();
  const sp = useSearchParams();

  const [q, setQ] = React.useState(sp.get("q") ?? "");
  const [showAdd, setShowAdd] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!showAdd) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShowAdd(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAdd]);

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const u = new URLSearchParams(sp.toString());
      if (q.trim()) u.set("q", q.trim());
      else u.delete("q");
      u.delete("page");
      router.push(`/platform/tenants?${u.toString()}`);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const setParam = (key: string, value: string | string[] | boolean | null) => {
    const u = new URLSearchParams(sp.toString());
    u.delete(key);
    u.delete("page");
    if (Array.isArray(value)) {
      for (const v of value) u.append(key, v);
    } else if (typeof value === "boolean") {
      u.set(key, value ? "1" : "0");
    } else if (value != null && value !== "") {
      u.set(key, value);
    }
    router.push(`/platform/tenants?${u.toString()}`);
  };

  const setMulti = (key: string, values: string[]) => {
    const u = new URLSearchParams(sp.toString());
    u.delete(key);
    u.delete("page");
    for (const v of values) u.append(key, v);
    router.push(`/platform/tenants?${u.toString()}`);
  };

  const setDensity = (next: "comfortable" | "compact") => {
    const u = new URLSearchParams(sp.toString());
    u.set("density", next);
    router.push(`/platform/tenants?${u.toString()}`);
  };

  // Active chips display.
  const chips = collectActiveChips(sp, { staffOptions, countryOptions });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[300px] flex-1">
          <Input
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            placeholder="Search by name, slug, owner email, or ID…"
            prefix={<span aria-hidden>🔍</span>}
            size="sm"
          />
        </div>
        <div ref={ref} className="relative">
          <Button size="sm" variant="secondary" onClick={() => setShowAdd((o) => !o)}>+ Add filter</Button>
          {showAdd && (
            <div
              className="absolute right-0 z-30 mt-1 w-[440px] overflow-hidden rounded-lg border shadow-xl"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}
            >
              <div className="p-3">
                <div className="grid grid-cols-1 gap-3">
                  <MultiCombobox
                    label="Plan"
                    value={sp.getAll("plans")}
                    onChange={(v) => setMulti("plans", v)}
                    options={PLAN_OPTIONS}
                  />
                  <MultiCombobox
                    label="Status"
                    value={sp.getAll("statuses")}
                    onChange={(v) => setMulti("statuses", v)}
                    options={STATUS_OPTIONS}
                  />
                  <MultiCombobox
                    label="Industry"
                    value={sp.getAll("industries")}
                    onChange={(v) => setMulti("industries", v)}
                    options={INDUSTRY_OPTIONS}
                  />
                  <MultiCombobox
                    label="Country"
                    value={sp.getAll("countries")}
                    onChange={(v) => setMulti("countries", v)}
                    options={countryOptions.map((c) => ({ value: c.iso2, label: `${c.name} (${c.iso2})` }))}
                  />
                  <MultiCombobox
                    label="Source"
                    value={sp.getAll("sources")}
                    onChange={(v) => setMulti("sources", v)}
                    options={SOURCE_OPTIONS}
                  />
                  <MultiCombobox
                    label="Account manager"
                    value={sp.getAll("accountManagerIds")}
                    onChange={(v) => setMulti("accountManagerIds", v)}
                    options={staffOptions.map((s) => ({ value: s.id, label: s.label }))}
                  />
                  <MultiCombobox
                    label="Tags"
                    value={sp.getAll("tags")}
                    onChange={(v) => setMulti("tags", v.map((x) => x.toLowerCase()))}
                    options={tagOptions.map((t) => ({ value: t, label: t }))}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Created since" type="date" size="sm"
                           defaultValue={sp.get("createdSince")?.slice(0, 10) ?? ""}
                           onBlur={(e) => setParam("createdSince", e.currentTarget.value ? new Date(e.currentTarget.value).toISOString() : null)} />
                    <Input label="Created until" type="date" size="sm"
                           defaultValue={sp.get("createdUntil")?.slice(0, 10) ?? ""}
                           onBlur={(e) => setParam("createdUntil", e.currentTarget.value ? new Date(e.currentTarget.value).toISOString() : null)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="MRR min ($)" type="number" size="sm"
                           defaultValue={sp.get("mrrMin") ?? ""}
                           onBlur={(e) => setParam("mrrMin", e.currentTarget.value || null)} />
                    <Input label="MRR max ($)" type="number" size="sm"
                           defaultValue={sp.get("mrrMax") ?? ""}
                           onBlur={(e) => setParam("mrrMax", e.currentTarget.value || null)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Health min (0-100)" type="number" size="sm" min={0} max={100}
                           defaultValue={sp.get("healthMin") ?? ""}
                           onBlur={(e) => setParam("healthMin", e.currentTarget.value || null)} />
                    <Input label="Health max" type="number" size="sm" min={0} max={100}
                           defaultValue={sp.get("healthMax") ?? ""}
                           onBlur={(e) => setParam("healthMax", e.currentTarget.value || null)} />
                  </div>
                  <Input label="Trial expires within (days)" type="number" size="sm" min={0}
                         defaultValue={sp.get("trialExpiresWithinDays") ?? ""}
                         onBlur={(e) => setParam("trialExpiresWithinDays", e.currentTarget.value || null)} />
                  <Input label="Owner email contains" size="sm"
                         defaultValue={sp.get("ownerEmailContains") ?? ""}
                         onBlur={(e) => setParam("ownerEmailContains", e.currentTarget.value || null)} />
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Users min" type="number" size="sm" min={0}
                           defaultValue={sp.get("usersMin") ?? ""}
                           onBlur={(e) => setParam("usersMin", e.currentTarget.value || null)} />
                    <Input label="Users max" type="number" size="sm" min={0}
                           defaultValue={sp.get("usersMax") ?? ""}
                           onBlur={(e) => setParam("usersMax", e.currentTarget.value || null)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input label="Jobs/mo min" type="number" size="sm" min={0}
                           defaultValue={sp.get("jobsMin") ?? ""}
                           onBlur={(e) => setParam("jobsMin", e.currentTarget.value || null)} />
                    <Input label="Jobs/mo max" type="number" size="sm" min={0}
                           defaultValue={sp.get("jobsMax") ?? ""}
                           onBlur={(e) => setParam("jobsMax", e.currentTarget.value || null)} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select label="Has past-due" size="sm"
                            defaultValue={sp.get("hasPastDue") ?? ""}
                            onChange={(e) => setParam("hasPastDue", e.currentTarget.value === "" ? null : e.currentTarget.value)}
                            options={[
                              { value: "",  label: "Any" },
                              { value: "1", label: "Yes" },
                              { value: "0", label: "No" },
                            ]} />
                    <Select label="Has integrations" size="sm"
                            defaultValue={sp.get("hasIntegrations") ?? ""}
                            onChange={(e) => setParam("hasIntegrations", e.currentTarget.value === "" ? null : e.currentTarget.value)}
                            options={[
                              { value: "",  label: "Any" },
                              { value: "1", label: "Yes" },
                              { value: "0", label: "No" },
                            ]} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select label="Custom domain" size="sm"
                            defaultValue={sp.get("hasCustomDomain") ?? ""}
                            onChange={(e) => setParam("hasCustomDomain", e.currentTarget.value === "" ? null : e.currentTarget.value)}
                            options={[
                              { value: "",  label: "Any" },
                              { value: "1", label: "Yes" },
                              { value: "0", label: "No" },
                            ]} />
                    <Select label="SSO enabled" size="sm"
                            defaultValue={sp.get("ssoEnabled") ?? ""}
                            onChange={(e) => setParam("ssoEnabled", e.currentTarget.value === "" ? null : e.currentTarget.value)}
                            options={[
                              { value: "",  label: "Any" },
                              { value: "1", label: "Yes" },
                              { value: "0", label: "No" },
                            ]} />
                  </div>
                  <Select label="MFA enforced" size="sm"
                          defaultValue={sp.get("mfaEnforced") ?? ""}
                          onChange={(e) => setParam("mfaEnforced", e.currentTarget.value === "" ? null : e.currentTarget.value)}
                          options={[
                            { value: "",  label: "Any" },
                            { value: "1", label: "Yes" },
                            { value: "0", label: "No" },
                          ]} />
                </div>
                <div className="mt-3 flex justify-end">
                  <Button size="xs" variant="ghost" onClick={() => setShowAdd(false)}>Done</Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          <button
            type="button"
            onClick={() => setDensity("comfortable")}
            className="ts-focus h-7 rounded-md border px-2"
            aria-pressed={density === "comfortable"}
            style={{
              background: density === "comfortable" ? "var(--surface-2)" : "var(--surface-1)",
              borderColor: "var(--border-default)",
              color: "var(--text-default)",
            }}
          >Comfortable</button>
          <button
            type="button"
            onClick={() => setDensity("compact")}
            className="ts-focus h-7 rounded-md border px-2"
            aria-pressed={density === "compact"}
            style={{
              background: density === "compact" ? "var(--surface-2)" : "var(--surface-1)",
              borderColor: "var(--border-default)",
              color: "var(--text-default)",
            }}
          >Compact</button>
        </div>
      </div>

      {/* Active filter chips */}
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {chips.map((chip) => (
            <span key={chip.key + ":" + chip.value} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"
                  style={{ background: "var(--surface-2)", borderColor: "var(--border-default)", color: "var(--text-default)" }}>
              <span style={{ color: "var(--text-muted)" }}>{chip.label}:</span>
              <span>{chip.value}</span>
              <Link
                href={chip.removeHref}
                className="ml-0.5 text-[12px] hover:underline"
                style={{ color: "var(--text-faint)" }}
              >×</Link>
            </span>
          ))}
          <Link href="/platform/tenants" className="text-[12px] underline" style={{ color: "var(--text-muted)" }}>
            Clear all
          </Link>
        </div>
      )}
    </div>
  );
}

interface ActiveChip { key: string; label: string; value: string; removeHref: string }

function collectActiveChips(
  sp: ReturnType<typeof useSearchParams>,
  options: { staffOptions: StaffOption[]; countryOptions: CountryOption[] },
): ActiveChip[] {
  const chips: ActiveChip[] = [];
  const removeKey = (key: string, valueToRemove?: string): string => {
    const u = new URLSearchParams(sp.toString());
    if (valueToRemove == null) {
      u.delete(key);
    } else {
      const remaining = u.getAll(key).filter((x) => x !== valueToRemove);
      u.delete(key);
      for (const r of remaining) u.append(key, r);
    }
    u.delete("page");
    return `/platform/tenants?${u.toString()}`;
  };
  const pushMulti = (key: string, values: string[], labelFor: (v: string) => string, label: string) => {
    for (const v of values) {
      chips.push({ key, label, value: labelFor(v), removeHref: removeKey(key, v) });
    }
  };
  const pushSingle = (key: string, label: string, formatter: (v: string) => string) => {
    const v = sp.get(key);
    if (!v) return;
    chips.push({ key, label, value: formatter(v), removeHref: removeKey(key) });
  };

  pushMulti("plans",       sp.getAll("plans"),      (v) => v.toLowerCase(), "Plan");
  pushMulti("statuses",    sp.getAll("statuses"),   (v) => v.toLowerCase().replace("_", " "), "Status");
  pushMulti("industries",  sp.getAll("industries"), (v) => v.replace(/_/g, " ").toLowerCase(), "Industry");
  pushMulti("sources",     sp.getAll("sources"),    (v) => v.toLowerCase(), "Source");
  pushMulti("countries",   sp.getAll("countries"),  (v) => options.countryOptions.find((c) => c.iso2 === v)?.name ?? v, "Country");
  pushMulti("accountManagerIds", sp.getAll("accountManagerIds"), (v) => options.staffOptions.find((s) => s.id === v)?.label ?? v, "CSM");
  pushMulti("tags",        sp.getAll("tags"),       (v) => v, "Tag");
  pushSingle("createdSince",   "Created since",   (v) => new Date(v).toLocaleDateString());
  pushSingle("createdUntil",   "Created until",   (v) => new Date(v).toLocaleDateString());
  pushSingle("mrrMin",         "MRR ≥",          (v) => `$${v}`);
  pushSingle("mrrMax",         "MRR ≤",          (v) => `$${v}`);
  pushSingle("healthMin",      "Health ≥",       (v) => v);
  pushSingle("healthMax",      "Health ≤",       (v) => v);
  pushSingle("hasPastDue",     "Past-due",        (v) => v === "1" ? "yes" : "no");
  pushSingle("hasIntegrations","Integrations",    (v) => v === "1" ? "yes" : "no");
  pushSingle("trialExpiresWithinDays", "Trial ends in", (v) => `${v}d`);
  pushSingle("ownerEmailContains",     "Owner email contains", (v) => v);
  pushSingle("hasCustomDomain", "Custom domain",  (v) => v === "1" ? "yes" : "no");
  pushSingle("ssoEnabled",     "SSO",             (v) => v === "1" ? "on" : "off");
  pushSingle("mfaEnforced",    "MFA",             (v) => v === "1" ? "enforced" : "off");
  pushSingle("usersMin",       "Users ≥",        (v) => v);
  pushSingle("usersMax",       "Users ≤",        (v) => v);
  pushSingle("jobsMin",        "Jobs ≥",         (v) => v);
  pushSingle("jobsMax",        "Jobs ≤",         (v) => v);

  return chips;
}
