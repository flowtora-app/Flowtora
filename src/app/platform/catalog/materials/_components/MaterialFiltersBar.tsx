"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import type {
  MasterMaterialCategory,
  MasterMaterialFinish,
  MasterMaterialStatus,
  MasterMaterialUsage,
} from "@prisma/client";
import { CATEGORY_LABEL, FINISH_LABEL, USAGE_LABEL } from "./shared";

const ROUTE = "/platform/catalog/materials";

const STATUS_LABEL: Record<MasterMaterialStatus, string> = {
  ACTIVE: "Active", DISCONTINUED: "Discontinued",
};

export function MaterialFiltersBar({
  options, categories, finishes, usages, statuses,
}: {
  options: { subcategories: string[]; tags: string[] };
  categories: MasterMaterialCategory[];
  finishes: MasterMaterialFinish[];
  usages: MasterMaterialUsage[];
  statuses: MasterMaterialStatus[];
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
        <Input label="Search" size="sm" placeholder="name, SKU, tag, supplier…"
               value={searchValue} onChange={(e) => setSearchValue(e.target.value)} />
      </div>
      <div className="min-w-[140px]">
        <Select label="Category" size="sm" value={get("category")}
                onChange={(e) => update({ category: e.target.value || null })}>
          <option value="">Any</option>
          {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </Select>
      </div>
      <div className="min-w-[160px]">
        <Select label="Subcategory" size="sm" value={get("subcategory")}
                onChange={(e) => update({ subcategory: e.target.value || null })}>
          <option value="">Any</option>
          {options.subcategories.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>
      <div className="min-w-[140px]">
        <Select label="Usage" size="sm" value={get("usage")}
                onChange={(e) => update({ usage: e.target.value || null })}>
          <option value="">Any</option>
          {usages.map((u) => <option key={u} value={u}>{USAGE_LABEL[u]}</option>)}
        </Select>
      </div>
      <div className="min-w-[140px]">
        <Select label="Finish" size="sm" value={get("finish")}
                onChange={(e) => update({ finish: e.target.value || null })}>
          <option value="">Any</option>
          {finishes.map((f) => <option key={f} value={f}>{FINISH_LABEL[f]}</option>)}
        </Select>
      </div>
      <div className="min-w-[140px]">
        <Select label="Durability" size="sm" value={get("durability")}
                onChange={(e) => update({ durability: e.target.value || null })}>
          <option value="">Any</option>
          <option value="1">1 year</option>
          <option value="3">3 year</option>
          <option value="5">5 year</option>
          <option value="7">7+ year</option>
        </Select>
      </div>
      <div className="min-w-[140px]">
        <Select label="Status" size="sm" value={get("status")}
                onChange={(e) => update({ status: e.target.value || null })}>
          <option value="">Any</option>
          {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
      </div>
      <div className="min-w-[140px]">
        <Select label="Tag" size="sm" value={get("tag")}
                onChange={(e) => update({ tag: e.target.value || null })}>
          <option value="">Any</option>
          {options.tags.map((t) => <option key={t} value={t}>{t}</option>)}
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
