"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import type {
  MasterEquipmentCategory,
  MasterEquipmentStatus,
} from "@prisma/client";
import { CATEGORY_LABEL } from "./shared";

const ROUTE = "/platform/catalog/equipment";

const STATUS_LABEL: Record<MasterEquipmentStatus, string> = {
  ACTIVE: "Active", DISCONTINUED: "Discontinued",
};

export function EquipmentFiltersBar({
  options, categories, statuses,
}: {
  options: { brands: string[] };
  categories: MasterEquipmentCategory[];
  statuses: MasterEquipmentStatus[];
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
        <Input label="Search" size="sm" placeholder="brand, model, slug, tag…"
               value={searchValue} onChange={(e) => setSearchValue(e.target.value)} />
      </div>
      <div className="min-w-[160px]">
        <Select label="Category" size="sm" value={get("category")}
                onChange={(e) => update({ category: e.target.value || null })}>
          <option value="">Any</option>
          {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </Select>
      </div>
      <div className="min-w-[160px]">
        <Select label="Brand" size="sm" value={get("brand")}
                onChange={(e) => update({ brand: e.target.value || null })}>
          <option value="">Any</option>
          {options.brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </Select>
      </div>
      <div className="min-w-[140px]">
        <Select label="Status" size="sm" value={get("status")}
                onChange={(e) => update({ status: e.target.value || null })}>
          <option value="">Any</option>
          {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
      </div>
      {hasAny && (
        <Button size="sm" variant="ghost" onClick={() => router.replace(ROUTE)}>
          Clear
        </Button>
      )}
    </div>
  );
}
