"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, MultiCombobox } from "@/components/ui";
import { EVENT_TYPE_OPTIONS, type ActivitySeverity, type ActivitySource } from "@/server/platform/activity-feed";

// ActivityFilters — Page 2 §Filters / Toolbar.
//
// Pure URL-driven: every filter writes to the page querystring and
// the server re-renders. The server component uses parseActivityFilters
// to round-trip the same shape.

const SEVERITIES: { value: ActivitySeverity; label: string }[] = [
  { value: "info",     label: "Info" },
  { value: "notice",   label: "Notice" },
  { value: "warning",  label: "Warning" },
  { value: "critical", label: "Critical" },
];

const SOURCES: { value: ActivitySource; label: string }[] = [
  { value: "web",        label: "Web" },
  { value: "api",        label: "API" },
  { value: "webhook",    label: "Webhook" },
  { value: "system",     label: "System" },
  { value: "background", label: "Background" },
];

export interface TenantOption { id: string; name: string; slug: string }
export interface UserOption   { id: string; name: string | null; email: string }

export interface ActivityFiltersProps {
  initial: {
    q?: string;
    types?: string[];
    severities?: string[];
    sources?: string[];
    tenantIds?: string[];
    userIds?: string[];
    since?: string; // ISO
    until?: string; // ISO
    ip?: string;
    country?: string;
  };
  /** Pre-fetched tenants for the combobox. */
  tenants: TenantOption[];
  /** Pre-fetched staff users for the combobox. */
  users: UserOption[];
}

export function ActivityFilters({ initial, tenants, users }: ActivityFiltersProps) {
  const router = useRouter();

  const [q, setQ] = React.useState(initial.q ?? "");
  const [types, setTypes] = React.useState<string[]>(initial.types ?? []);
  const [severities, setSeverities] = React.useState<string[]>(initial.severities ?? []);
  const [sources, setSources] = React.useState<string[]>(initial.sources ?? []);
  const [tenantIds, setTenantIds] = React.useState<string[]>(initial.tenantIds ?? []);
  const [userIds, setUserIds] = React.useState<string[]>(initial.userIds ?? []);
  const [since, setSince] = React.useState(initial.since?.slice(0, 10) ?? "");
  const [until, setUntil] = React.useState(initial.until?.slice(0, 10) ?? "");
  const [ip, setIp] = React.useState(initial.ip ?? "");
  const [country, setCountry] = React.useState(initial.country ?? "");

  // Debounced URL push so typing in the search box doesn't refetch
  // every keystroke.
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const push = React.useCallback(() => {
    const u = new URLSearchParams();
    if (q.trim()) u.set("q", q.trim());
    for (const t of types) u.append("types", t);
    for (const s of severities) u.append("severities", s);
    for (const s of sources) u.append("sources", s);
    for (const id of tenantIds) u.append("tenantIds", id);
    for (const id of userIds) u.append("userIds", id);
    if (since) u.set("since", new Date(since).toISOString());
    if (until) {
      const d = new Date(until);
      d.setHours(23, 59, 59, 999);
      u.set("until", d.toISOString());
    }
    if (ip.trim()) u.set("ip", ip.trim());
    if (country.trim()) u.set("country", country.trim().toUpperCase());
    router.push(`/platform/activity${u.toString() ? `?${u.toString()}` : ""}`);
  }, [router, q, types, severities, sources, tenantIds, userIds, since, until, ip, country]);

  // Push on any filter change with a 250ms debounce on `q` only —
  // dropdowns push immediately.
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(push, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const onReset = () => {
    setQ(""); setTypes([]); setSeverities([]); setSources([]); setTenantIds([]); setUserIds([]); setSince(""); setUntil(""); setIp(""); setCountry("");
    router.push("/platform/activity");
  };

  const tenantOptions = React.useMemo(
    () => tenants.map((t) => ({ value: t.id, label: t.name, description: t.slug })),
    [tenants],
  );
  const userOptions = React.useMemo(
    () => users.map((u) => ({ value: u.id, label: u.name ?? u.email, description: u.email })),
    [users],
  );
  const eventTypeOptions = React.useMemo(
    () => EVENT_TYPE_OPTIONS.map((e) => ({ value: e.prefix, label: e.label, group: e.group })),
    [],
  );
  const severityOptions = React.useMemo(
    () => SEVERITIES.map((s) => ({ value: s.value, label: s.label })),
    [],
  );
  const sourceOptions = React.useMemo(
    () => SOURCES.map((s) => ({ value: s.value, label: s.label })),
    [],
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Search row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[280px] flex-1">
          <Input
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === "Enter") push(); }}
            placeholder="Search action, entity id, or IP…"
            prefix={<span aria-hidden>🔍</span>}
            size="sm"
          />
        </div>
        <Button size="sm" variant="ghost" onClick={onReset}>Reset</Button>
      </div>

      {/* Multi-select chips */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <MultiCombobox
          label="Event type"
          value={types}
          onChange={(next) => { setTypes(next); push(); }}
          options={eventTypeOptions}
        />
        <MultiCombobox
          label="Severity"
          value={severities}
          onChange={(next) => { setSeverities(next); push(); }}
          options={severityOptions}
        />
        <MultiCombobox
          label="Source"
          value={sources}
          onChange={(next) => { setSources(next); push(); }}
          options={sourceOptions}
        />
        <MultiCombobox
          label="Tenant"
          value={tenantIds}
          onChange={(next) => { setTenantIds(next); push(); }}
          options={tenantOptions}
        />
        <MultiCombobox
          label="Actor (staff user)"
          value={userIds}
          onChange={(next) => { setUserIds(next); push(); }}
          options={userOptions}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input label="Since (UTC)" type="date" size="sm"
            value={since} onChange={(e) => setSince(e.currentTarget.value)}
            onBlur={push} />
          <Input label="Until (UTC)" type="date" size="sm"
            value={until} onChange={(e) => setUntil(e.currentTarget.value)}
            onBlur={push} />
        </div>
        <Input label="IP / CIDR" size="sm"
          value={ip} onChange={(e) => setIp(e.currentTarget.value)}
          onBlur={push} placeholder="1.2.3.4 or 1.2.3.0/24" />
        <Input label="Country (ISO2)" size="sm"
          value={country} onChange={(e) => setCountry(e.currentTarget.value)}
          onBlur={push} placeholder="US, GB, DE…" />
      </div>
    </div>
  );
}
