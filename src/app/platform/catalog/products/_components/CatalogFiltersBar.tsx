"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import type { MasterProductCategory, MasterProductStatus } from "@prisma/client";
import { CATEGORY_LABEL } from "./shared";

const ROUTE = "/platform/catalog/products";

const STATUS_LABEL: Record<MasterProductStatus, string> = {
  DRAFT: "Draft", PUBLISHED: "Published", ARCHIVED: "Archived",
};

export function CatalogFiltersBar({
  options, categories, statuses,
}: {
  options: { industries: string[]; tags: string[] };
  categories: MasterProductCategory[];
  statuses: MasterProductStatus[];
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

  const otherKeys = Array.from(sp.keys()).filter((k) => k !== "view");
  const hasAny = otherKeys.length > 0;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px] flex-1">
        <Input label="Search" size="sm" placeholder="name, slug, SKU, tag…"
               value={searchValue} onChange={(e) => setSearchValue(e.target.value)} />
      </div>
      <div className="min-w-[180px]">
        <Select label="Category" size="sm" value={get("category")}
                onChange={(e) => update({ category: e.target.value || null })}>
          <option value="">Any</option>
          {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </Select>
      </div>
      <div className="min-w-[140px]">
        <Select label="Status" size="sm" value={get("status")}
                onChange={(e) => update({ status: e.target.value || null })}>
          <option value="">Any</option>
          {statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
      </div>
      <div className="min-w-[160px]">
        <Select label="Adoption" size="sm" value={get("adoption")}
                onChange={(e) => update({ adoption: e.target.value || null })}>
          <option value="">Any</option>
          <option value="low">Low (0 clones)</option>
          <option value="mid">Mid (1–5)</option>
          <option value="high">High (6+)</option>
        </Select>
      </div>
      <div className="min-w-[180px]">
        <Select label="Industry" size="sm" value={get("industry")}
                onChange={(e) => update({ industry: e.target.value || null })}>
          <option value="">Any</option>
          {options.industries.map((i) => <option key={i} value={i}>{i}</option>)}
        </Select>
      </div>
      <div className="min-w-[160px]">
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
