"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import type { PlatformDisputeStatus } from "@prisma/client";

const STATUS_LABEL: Record<PlatformDisputeStatus, string> = {
  NEEDS_RESPONSE: "Needs response",
  UNDER_REVIEW: "Under review",
  WON: "Won",
  LOST: "Lost",
};

const ROUTE = "/platform/billing/refunds";

export function DisputesFiltersBar({
  tenants, statuses,
}: {
  tenants: { id: string; label: string }[];
  statuses: PlatformDisputeStatus[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? "";
  const update = React.useCallback(
    (overrides: Record<string, string | null>) => {
      const u = new URLSearchParams(sp.toString());
      u.set("tab", "disputes");
      for (const [k, v] of Object.entries(overrides)) {
        if (v == null || v === "") u.delete(k);
        else u.set(k, v);
      }
      u.delete("page");
      router.replace(`${ROUTE}?${u.toString()}`);
    },
    [router, sp],
  );

  const [searchValue, setSearchValue] = React.useState(get("q"));
  React.useEffect(() => { setSearchValue(get("q")); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [sp]);
  React.useEffect(() => {
    if (searchValue === get("q")) return;
    const id = setTimeout(() => update({ q: searchValue || null }), 250);
    return () => clearTimeout(id);
  }, [searchValue, sp]); // eslint-disable-line react-hooks/exhaustive-deps

  const otherKeys = Array.from(sp.keys()).filter((k) => k !== "tab");
  const hasAny = otherKeys.length > 0;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px] flex-1">
        <Input label="Search" size="sm" placeholder="dispute id, gateway id, invoice #, tenant…"
               value={searchValue} onChange={(e) => setSearchValue(e.target.value)} />
      </div>
      <div className="min-w-[160px]">
        <Select label="Status" size="sm" value={get("status")}
                onChange={(e) => update({ status: e.target.value || null })}>
          <option value="">Any</option>
          {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
      </div>
      <div className="min-w-[180px]">
        <Select label="Tenant" size="sm" value={get("tenant")}
                onChange={(e) => update({ tenant: e.target.value || null })}>
          <option value="">Any</option>
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
      </div>
      <div className="min-w-[160px]">
        <Select label="Evidence due" size="sm" value={get("due")}
                onChange={(e) => update({ due: e.target.value || null })}>
          <option value="">Any</option>
          <option value="0">Overdue (today)</option>
          <option value="3">≤ 3 days</option>
          <option value="7">≤ 7 days</option>
        </Select>
      </div>
      <Input label="Min amount" size="sm" type="number" step="0.01"
             value={get("amountMin")}
             onChange={(e) => update({ amountMin: e.target.value || null })} />
      <Input label="Max amount" size="sm" type="number" step="0.01"
             value={get("amountMax")}
             onChange={(e) => update({ amountMax: e.target.value || null })} />
      {hasAny && (
        <Button size="sm" variant="ghost" onClick={() => router.replace(`${ROUTE}?tab=disputes`)}>
          Clear
        </Button>
      )}
    </div>
  );
}
