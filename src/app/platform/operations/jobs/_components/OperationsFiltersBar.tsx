"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import type { OrderStatus } from "@prisma/client";
import { STATUS_LABEL } from "./shared";

const ROUTE = "/platform/operations/jobs";

export function OperationsFiltersBar({
  options, statuses,
}: {
  options: { tenants: { id: string; name: string }[]; regions: string[]; planSlugs: string[] };
  statuses: OrderStatus[];
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
      u.delete("page");
      router.replace(`${ROUTE}?${u.toString()}`);
    },
    [router, sp],
  );

  const hasAny = sp.toString().length > 0;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px]">
        <Select label="Tenant" size="sm" value={get("tenant")}
                onChange={(e) => update({ tenant: e.target.value || null })}>
          <option value="">Aggregate (all)</option>
          {options.tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </div>
      <div className="min-w-[160px]">
        <Select label="Status" size="sm" value={get("status")}
                onChange={(e) => update({ status: e.target.value || null })}>
          <option value="">Any</option>
          {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
      </div>
      <div className="min-w-[160px]">
        <Select label="Region" size="sm" value={get("region")}
                onChange={(e) => update({ region: e.target.value || null })}>
          <option value="">Any</option>
          {options.regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      </div>
      <div className="min-w-[160px]">
        <Select label="Plan tier" size="sm" value={get("plan")}
                onChange={(e) => update({ plan: e.target.value || null })}>
          <option value="">Any</option>
          {options.planSlugs.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
      </div>
      <Input label="Since" size="sm" type="date"
             value={get("since")}
             onChange={(e) => update({ since: e.target.value || null })} />
      <Input label="Until" size="sm" type="date"
             value={get("until")}
             onChange={(e) => update({ until: e.target.value || null })} />
      {hasAny && (
        <Button size="sm" variant="ghost" onClick={() => router.replace(ROUTE)}>
          Clear
        </Button>
      )}
    </div>
  );
}
