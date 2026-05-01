"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import type {
  SubscriptionStatus,
  SubscriptionsFilterOptions,
} from "@/server/platform/subscriptions";

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  active: "Active", trialing: "Trialing", past_due: "Past due",
  canceled: "Canceled", paused: "Paused", incomplete: "Incomplete",
};

export function SubscriptionsFiltersBar({
  options, statuses,
}: {
  options: SubscriptionsFilterOptions;
  statuses: SubscriptionStatus[];
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
      router.replace(q ? `/platform/billing/subscriptions?${q}` : "/platform/billing/subscriptions");
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
      <div className="min-w-[200px] flex-1">
        <Input label="Search" size="sm" placeholder="tenant or sub ID"
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
        <Select label="Plan" size="sm" value={get("plan")}
                onChange={(e) => update({ plan: e.target.value || null })}>
          <option value="">Any</option>
          {options.plans.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
        </Select>
      </div>
      <div className="min-w-[120px]">
        <Select label="Cycle" size="sm" value={get("cycle")}
                onChange={(e) => update({ cycle: e.target.value || null })}>
          <option value="">Any</option>
          <option value="MONTHLY">Monthly</option>
          <option value="ANNUAL">Annual</option>
        </Select>
      </div>
      <div className="min-w-[120px]">
        <Select label="Currency" size="sm" value={get("currency")}
                onChange={(e) => update({ currency: e.target.value || null })}>
          <option value="">Any</option>
          {options.currencies.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <Input label="Created since" size="sm" type="date" value={get("since")}
             onChange={(e) => update({ since: e.target.value || null })} />
      <Input label="Until" size="sm" type="date" value={get("until")}
             onChange={(e) => update({ until: e.target.value || null })} />
      <Input label="Trial expiring (days)" size="sm" type="number" min={1} max={60}
             value={get("trialDays")}
             onChange={(e) => update({ trialDays: e.target.value || null })} />
      <div className="min-w-[160px]">
        <Select label="Cancellation" size="sm" value={get("cancelScheduled")}
                onChange={(e) => update({ cancelScheduled: e.target.value || null })}>
          <option value="">Any</option>
          <option value="1">Scheduled</option>
          <option value="0">Not scheduled</option>
        </Select>
      </div>
      <div className="min-w-[140px]">
        <Select label="Discount" size="sm" value={get("discount")}
                onChange={(e) => update({ discount: e.target.value || null })}>
          <option value="">Any</option>
          <option value="1">Has coupon</option>
          <option value="0">No coupon</option>
        </Select>
      </div>
      <div className="min-w-[200px]">
        <Select label="Owner" size="sm" value={get("owner")}
                onChange={(e) => update({ owner: e.target.value || null })}>
          <option value="">Any</option>
          {options.owners.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </Select>
      </div>
      {hasAny && (
        <Button size="sm" variant="ghost" onClick={() => router.replace("/platform/billing/subscriptions")}>
          Clear
        </Button>
      )}
    </div>
  );
}
