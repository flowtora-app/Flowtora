"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import type {
  PaymentStatus,
  PaymentsFilterOptions,
} from "@/server/platform/payments";

const STATUS_LABEL: Record<PaymentStatus, string> = {
  succeeded: "Succeeded", failed: "Failed", pending: "Pending",
  refunded: "Refunded", partial_refund: "Partial refund", disputed: "Disputed",
};

export function PaymentsFiltersBar({
  options, statuses,
}: {
  options: PaymentsFilterOptions;
  statuses: PaymentStatus[];
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
      u.delete("detail");
      const q = u.toString();
      router.replace(q ? `/platform/billing/payments?${q}` : "/platform/billing/payments");
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

  const hasAny = sp.toString().length > 0;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px] flex-1">
        <Input label="Search" size="sm" placeholder="payment id, gateway id, or invoice #"
               value={searchValue} onChange={(e) => setSearchValue(e.target.value)} />
      </div>
      <div className="min-w-[140px]">
        <Select label="Status" size="sm" value={get("status")}
                onChange={(e) => update({ status: e.target.value || null })}>
          <option value="">Any</option>
          {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
      </div>
      <div className="min-w-[140px]">
        <Select label="Gateway" size="sm" value={get("gateway")}
                onChange={(e) => update({ gateway: e.target.value || null })}>
          <option value="">Any</option>
          {options.gateways.map((g) => <option key={g} value={g}>{g}</option>)}
        </Select>
      </div>
      <Input label="Method" size="sm" placeholder="card, ACH, wire…"
             value={get("method")}
             onChange={(e) => update({ method: e.target.value || null })} />
      <div className="min-w-[120px]">
        <Select label="Currency" size="sm" value={get("currency")}
                onChange={(e) => update({ currency: e.target.value || null })}>
          <option value="">Any</option>
          {options.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <div className="min-w-[180px]">
        <Select label="Tenant" size="sm" value={get("tenant")}
                onChange={(e) => update({ tenant: e.target.value || null })}>
          <option value="">Any</option>
          {options.tenants.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
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
      <div className="min-w-[180px]">
        <Select label="Failure code" size="sm" value={get("failure")}
                onChange={(e) => update({ failure: e.target.value || null })}>
          <option value="">Any</option>
          {options.failureCodes.map((f) => <option key={f} value={f}>{f}</option>)}
        </Select>
      </div>
      {hasAny && (
        <Button size="sm" variant="ghost" onClick={() => router.replace("/platform/billing/payments")}>
          Clear
        </Button>
      )}
    </div>
  );
}
