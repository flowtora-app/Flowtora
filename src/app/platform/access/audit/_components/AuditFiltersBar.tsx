"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import type { AuditFilterOptions } from "@/server/platform/audit-log";
import type { AuditSeverity, AuditSource } from "@prisma/client";

export function AuditFiltersBar({
  options, severities, sources,
}: {
  options: AuditFilterOptions;
  severities: AuditSeverity[];
  sources: AuditSource[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? "";
  const update = React.useCallback(
    (overrides: Record<string, string | null>) => {
      const u = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(overrides)) {
        if (v == null || v === "") u.delete(k);
        else u.set(k, v);
      }
      u.delete("detail");
      u.delete("page");
      const q = u.toString();
      router.replace(q ? `/platform/access/audit?${q}` : "/platform/access/audit");
    },
    [router, sp],
  );

  const [searchValue, setSearchValue] = React.useState(get("q"));
  React.useEffect(() => { setSearchValue(get("q")); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [sp]);
  React.useEffect(() => {
    if (searchValue === get("q")) return;
    const id = setTimeout(() => update({ q: searchValue || null }), 300);
    return () => clearTimeout(id);
  }, [searchValue, sp]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasAny = sp.toString().length > 0;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px] flex-1">
        <Input label="Search" size="sm"
               placeholder="action / entity / id / correlation"
               value={searchValue} onChange={(e) => setSearchValue(e.target.value)} />
      </div>
      <div className="min-w-[180px]">
        <Select label="Actor" size="sm" value={get("actor")}
                onChange={(e) => update({ actor: e.target.value || null })}>
          <option value="">Any</option>
          {options.actors.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </Select>
      </div>
      <div className="min-w-[180px]">
        <Select label="Tenant" size="sm" value={get("tenant")}
                onChange={(e) => update({ tenant: e.target.value || null })}>
          <option value="">Any</option>
          {options.tenants.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
      </div>
      <div className="min-w-[140px]">
        <Select label="Resource" size="sm" value={get("entity")}
                onChange={(e) => update({ entity: e.target.value || null })}>
          <option value="">Any</option>
          {options.entityTypes.map((e) => <option key={e} value={e}>{e}</option>)}
        </Select>
      </div>
      <div className="min-w-[180px]">
        <Select label="Action" size="sm" value={get("action")}
                onChange={(e) => update({ action: e.target.value || null })}>
          <option value="">Any</option>
          {options.actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </Select>
      </div>
      <div className="min-w-[120px]">
        <Select label="Severity" size="sm" value={get("severity")}
                onChange={(e) => update({ severity: e.target.value || null })}>
          <option value="">Any</option>
          {severities.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
        </Select>
      </div>
      <div className="min-w-[120px]">
        <Select label="Source" size="sm" value={get("source")}
                onChange={(e) => update({ source: e.target.value || null })}>
          <option value="">Any</option>
          {sources.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
        </Select>
      </div>
      <div className="min-w-[120px]">
        <Select label="Status" size="sm" value={get("success")}
                onChange={(e) => update({ success: e.target.value || null })}>
          <option value="">Any</option>
          <option value="1">Success</option>
          <option value="0">Failure</option>
        </Select>
      </div>
      <Input label="IP" size="sm" placeholder="203.0.113.7"
             value={get("ip")}
             onChange={(e) => update({ ip: e.target.value || null })} />
      <Input label="Since" size="sm" type="date" value={get("since")}
             onChange={(e) => update({ since: e.target.value || null })} />
      <Input label="Until" size="sm" type="date" value={get("until")}
             onChange={(e) => update({ until: e.target.value || null })} />
      {hasAny && (
        <Button size="sm" variant="ghost" onClick={() => router.replace("/platform/access/audit")}>
          Clear
        </Button>
      )}
    </div>
  );
}
