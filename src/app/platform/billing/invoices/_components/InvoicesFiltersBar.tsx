"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import type {
  InvoicesFilterOptions,
} from "@/server/platform/invoices";
import type {
  PlatformInvoiceSource,
  PlatformInvoiceStatus,
} from "@prisma/client";

const STATUS_LABEL: Record<PlatformInvoiceStatus, string> = {
  DRAFT: "Draft", SENT: "Sent", OPEN: "Open", PAID: "Paid",
  VOIDED: "Voided", UNCOLLECTIBLE: "Uncollectible", REFUNDED: "Refunded",
};

const SOURCE_LABEL: Record<PlatformInvoiceSource, string> = {
  SUBSCRIPTION: "Subscription",
  MANUAL: "Manual",
};

export function InvoicesFiltersBar({
  options, statuses, sources,
}: {
  options: InvoicesFilterOptions;
  statuses: PlatformInvoiceStatus[];
  sources: PlatformInvoiceSource[];
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
      const q = u.toString();
      router.replace(q ? `/platform/billing/invoices?${q}` : "/platform/billing/invoices");
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
        <Input label="Search" size="sm" placeholder="invoice # or tenant"
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
        <Select label="Tenant" size="sm" value={get("tenant")}
                onChange={(e) => update({ tenant: e.target.value || null })}>
          <option value="">Any</option>
          {options.tenants.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
      </div>
      <div className="min-w-[140px]">
        <Select label="Plan" size="sm" value={get("plan")}
                onChange={(e) => update({ plan: e.target.value || null })}>
          <option value="">Any</option>
          {options.plans.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </Select>
      </div>
      <div className="min-w-[120px]">
        <Select label="Currency" size="sm" value={get("currency")}
                onChange={(e) => update({ currency: e.target.value || null })}>
          <option value="">Any</option>
          {options.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <div className="min-w-[140px]">
        <Select label="Source" size="sm" value={get("source")}
                onChange={(e) => update({ source: e.target.value || null })}>
          <option value="">Any</option>
          {sources.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
        </Select>
      </div>
      <Input label="Issued since" size="sm" type="date"
             value={get("issuedSince")}
             onChange={(e) => update({ issuedSince: e.target.value || null })} />
      <Input label="Issued until" size="sm" type="date"
             value={get("issuedUntil")}
             onChange={(e) => update({ issuedUntil: e.target.value || null })} />
      <Input label="Due since" size="sm" type="date"
             value={get("dueSince")}
             onChange={(e) => update({ dueSince: e.target.value || null })} />
      <Input label="Due until" size="sm" type="date"
             value={get("dueUntil")}
             onChange={(e) => update({ dueUntil: e.target.value || null })} />
      <Input label="Min amount" size="sm" type="number" step="0.01"
             value={get("amountMin")}
             onChange={(e) => update({ amountMin: e.target.value || null })} />
      <Input label="Max amount" size="sm" type="number" step="0.01"
             value={get("amountMax")}
             onChange={(e) => update({ amountMax: e.target.value || null })} />
      <div className="min-w-[110px]">
        <Select label="Tax" size="sm" value={get("hasTax")}
                onChange={(e) => update({ hasTax: e.target.value || null })}>
          <option value="">Any</option>
          <option value="1">Has tax</option>
          <option value="0">No tax</option>
        </Select>
      </div>
      <div className="min-w-[120px]">
        <Select label="Discount" size="sm" value={get("hasDiscount")}
                onChange={(e) => update({ hasDiscount: e.target.value || null })}>
          <option value="">Any</option>
          <option value="1">Has discount</option>
          <option value="0">No discount</option>
        </Select>
      </div>
      {hasAny && (
        <Button size="sm" variant="ghost" onClick={() => router.replace("/platform/billing/invoices")}>
          Clear
        </Button>
      )}
    </div>
  );
}
