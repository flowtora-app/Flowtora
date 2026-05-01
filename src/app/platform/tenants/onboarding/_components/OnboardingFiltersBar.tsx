"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import type { BusinessType, TenantSource } from "@prisma/client";

// Onboarding-pipeline filter bar. Drops every selection into the URL
// so deep-linkable + the server can re-filter on each navigation.

const INDUSTRY_LABEL: Record<BusinessType, string> = {
  SIGN_SHOP: "Sign shop",
  PRINT_SHOP: "Print shop",
  HYBRID: "Hybrid",
  APPAREL_SCREEN_PRINT: "Apparel / Screen print",
  EMBROIDERY: "Embroidery",
  PROMO_PRODUCTS: "Promo products",
  TRADE_PRINTER: "Trade printer",
  WIDE_FORMAT_ONLY: "Wide format only",
  MULTI_DISCIPLINE: "Multi-discipline",
  OTHER: "Other",
};

const SOURCE_LABEL: Record<TenantSource, string> = {
  ORGANIC: "Organic",
  REFERRAL: "Referral",
  PAID: "Paid",
  PARTNER: "Partner",
  OTHER: "Other",
};

export function OnboardingFiltersBar({
  planOptions,
  countryOptions,
  sourceOptions,
  industryOptions,
}: {
  planOptions: string[];
  countryOptions: string[];
  sourceOptions: TenantSource[];
  industryOptions: BusinessType[];
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
      router.replace(q ? `/platform/tenants/onboarding?${q}` : "/platform/tenants/onboarding");
    },
    [router, sp],
  );

  const hasAny =
    !!get("plan") || !!get("source") || !!get("country") ||
    !!get("industry") || !!get("since") || !!get("until") ||
    !!get("stuck") || !!get("stage");

  return (
    <div className="flex flex-wrap items-end gap-2">
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
      <div className="min-w-[120px]">
        <Select
          label="Source"
          size="sm"
          value={get("source")}
          onChange={(e) => update({ source: e.target.value || null })}
        >
          <option value="">Any</option>
          {sourceOptions.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
        </Select>
      </div>
      <div className="min-w-[120px]">
        <Select
          label="Country"
          size="sm"
          value={get("country")}
          onChange={(e) => update({ country: e.target.value || null })}
        >
          <option value="">Any</option>
          {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <div className="min-w-[160px]">
        <Select
          label="Industry"
          size="sm"
          value={get("industry")}
          onChange={(e) => update({ industry: e.target.value || null })}
        >
          <option value="">Any</option>
          {industryOptions.map((b) => <option key={b} value={b}>{INDUSTRY_LABEL[b]}</option>)}
        </Select>
      </div>
      <Input
        label="Created since"
        size="sm"
        type="date"
        value={get("since")}
        onChange={(e) => update({ since: e.target.value || null })}
      />
      <Input
        label="Until"
        size="sm"
        type="date"
        value={get("until")}
        onChange={(e) => update({ until: e.target.value || null })}
      />
      <label className="ts-focus inline-flex h-9 items-center gap-2 rounded-md border px-2.5 text-[12px]"
             style={{ borderColor: "var(--border-default)", background: "var(--surface-1)", color: "var(--text-default)" }}>
        <input
          type="checkbox"
          checked={get("stuck") === "1"}
          onChange={(e) => update({ stuck: e.target.checked ? "1" : null })}
        />
        Stuck only
      </label>
      {hasAny && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            update({ plan: null, source: null, country: null, industry: null,
                     since: null, until: null, stuck: null, stage: null })
          }
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
