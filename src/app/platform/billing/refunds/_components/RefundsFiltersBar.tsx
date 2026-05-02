"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import type { PlatformRefundReason, PlatformRefundStatus } from "@prisma/client";

const STATUS_LABEL: Record<PlatformRefundStatus, string> = {
  PENDING: "Pending", SUCCEEDED: "Succeeded", FAILED: "Failed",
};
const REASON_LABEL: Record<PlatformRefundReason, string> = {
  CUSTOMER_REQUEST: "Customer request",
  FRAUD: "Fraud",
  DUPLICATE: "Duplicate",
  SUBSCRIPTION_MISTAKE: "Subscription mistake",
  SERVICE_ISSUE: "Service issue",
  OTHER: "Other",
};

const ROUTE = "/platform/billing/refunds";

export function RefundsFiltersBar({
  tenants, statuses, reasons,
}: {
  tenants: { id: string; label: string }[];
  statuses: PlatformRefundStatus[];
  reasons: PlatformRefundReason[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? "";
  const update = React.useCallback(
    (overrides: Record<string, string | null>) => {
      const u = new URLSearchParams(sp.toString());
      // Always preserve `tab=refunds`.
      u.set("tab", "refunds");
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

  // Count any non-tab filter as a "filter" for the Clear button.
  const otherKeys = Array.from(sp.keys()).filter((k) => k !== "tab");
  const hasAny = otherKeys.length > 0;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px] flex-1">
        <Input label="Search" size="sm" placeholder="refund id, payment id, invoice #, tenant…"
               value={searchValue} onChange={(e) => setSearchValue(e.target.value)} />
      </div>
      <div className="min-w-[140px]">
        <Select label="Status" size="sm" value={get("status")}
                onChange={(e) => update({ status: e.target.value || null })}>
          <option value="">Any</option>
          {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
      </div>
      <div className="min-w-[180px]">
        <Select label="Reason" size="sm" value={get("reason")}
                onChange={(e) => update({ reason: e.target.value || null })}>
          <option value="">Any</option>
          {reasons.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
        </Select>
      </div>
      <div className="min-w-[140px]">
        <Select label="Type" size="sm" value={get("credit")}
                onChange={(e) => update({ credit: e.target.value || null })}>
          <option value="">Any</option>
          <option value="0">Gateway refund</option>
          <option value="1">Internal credit</option>
        </Select>
      </div>
      <div className="min-w-[180px]">
        <Select label="Tenant" size="sm" value={get("tenant")}
                onChange={(e) => update({ tenant: e.target.value || null })}>
          <option value="">Any</option>
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
      </div>
      <Input label="Since" size="sm" type="date"
             value={get("since")}
             onChange={(e) => update({ since: e.target.value || null })} />
      <Input label="Until" size="sm" type="date"
             value={get("until")}
             onChange={(e) => update({ until: e.target.value || null })} />
      <Input label="Min amount" size="sm" type="number" step="0.01"
             value={get("amountMin")}
             onChange={(e) => update({ amountMin: e.target.value || null })} />
      <Input label="Max amount" size="sm" type="number" step="0.01"
             value={get("amountMax")}
             onChange={(e) => update({ amountMax: e.target.value || null })} />
      {hasAny && (
        <Button size="sm" variant="ghost" onClick={() => router.replace(`${ROUTE}?tab=refunds`)}>
          Clear
        </Button>
      )}
    </div>
  );
}
