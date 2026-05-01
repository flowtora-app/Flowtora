"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";

// HealthFiltersBar — search + plan + CSM + score range + trend filter.
// Drives URL params; the server component re-runs filtering on each
// navigation.

export function HealthFiltersBar({
  planOptions,
  csmOptions,
}: {
  planOptions: string[];
  csmOptions: { id: string; label: string }[];
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
      const q = u.toString();
      router.replace(q ? `/platform/tenants/health?${q}` : "/platform/tenants/health");
    },
    [router, sp],
  );

  const hasAny = !!get("q") || !!get("plan") || !!get("csm") ||
                 !!get("min") || !!get("max") || !!get("trend");

  const [searchValue, setSearchValue] = React.useState(get("q"));
  React.useEffect(() => { setSearchValue(get("q")); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [sp]);

  // Debounce search updates so each keystroke doesn't slam the server.
  React.useEffect(() => {
    if (searchValue === get("q")) return;
    const id = setTimeout(() => update({ q: searchValue || null }), 250);
    return () => clearTimeout(id);
  }, [searchValue, sp]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[200px] flex-1">
        <Input
          label="Search"
          size="sm"
          placeholder="Tenant, slug, owner email"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
      </div>
      <div className="min-w-[120px]">
        <Select
          label="Plan"
          size="sm"
          value={get("plan")}
          onChange={(e) => update({ plan: e.target.value || null })}
        >
          <option value="">Any</option>
          {planOptions.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
      </div>
      <div className="min-w-[180px]">
        <Select
          label="CSM"
          size="sm"
          value={get("csm")}
          onChange={(e) => update({ csm: e.target.value || null })}
        >
          <option value="">Any</option>
          {csmOptions.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </Select>
      </div>
      <Input
        label="Score min"
        size="sm"
        type="number"
        min={0}
        max={100}
        value={get("min")}
        onChange={(e) => update({ min: e.target.value || null })}
      />
      <Input
        label="Score max"
        size="sm"
        type="number"
        min={0}
        max={100}
        value={get("max")}
        onChange={(e) => update({ max: e.target.value || null })}
      />
      <div className="min-w-[120px]">
        <Select
          label="Trend"
          size="sm"
          value={get("trend")}
          onChange={(e) => update({ trend: e.target.value || null })}
        >
          <option value="">Any</option>
          <option value="up">Up vs last week</option>
          <option value="down">Down vs last week</option>
          <option value="flat">Flat (±2)</option>
        </Select>
      </div>
      {hasAny && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => update({ q: null, plan: null, csm: null, min: null, max: null, trend: null })}
        >
          Clear
        </Button>
      )}
    </div>
  );
}
