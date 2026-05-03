"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import type {
  DesignAssetKind,
  DesignAssetLicense,
  DesignAssetStatus,
} from "@prisma/client";
import { LICENSE_LABEL, STATUS_LABEL } from "./shared";

const ROUTE = "/platform/catalog/assets";

export function AssetFiltersBar({
  activeKind, licenses, statuses,
}: {
  activeKind: DesignAssetKind;
  licenses: DesignAssetLicense[];
  statuses: DesignAssetStatus[];
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const get = (k: string) => sp.get(k) ?? "";
  const update = React.useCallback(
    (overrides: Record<string, string | null>) => {
      const u = new URLSearchParams(sp.toString());
      u.set("kind", activeKind);
      for (const [k, v] of Object.entries(overrides)) {
        if (v == null || v === "") u.delete(k);
        else u.set(k, v);
      }
      u.delete("page");
      router.replace(`${ROUTE}?${u.toString()}`);
    },
    [router, sp, activeKind],
  );

  const [searchValue, setSearchValue] = React.useState(get("q"));
  React.useEffect(() => { setSearchValue(get("q")); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [sp]);
  React.useEffect(() => {
    if (searchValue === get("q")) return;
    const id = setTimeout(() => update({ q: searchValue || null }), 250);
    return () => clearTimeout(id);
  }, [searchValue, sp]); // eslint-disable-line react-hooks/exhaustive-deps

  const otherKeys = Array.from(sp.keys()).filter((k) => k !== "kind");
  const hasAny = otherKeys.length > 0;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px] flex-1">
        <Input label="Search" size="sm" placeholder="name, slug, tag, description…"
               value={searchValue} onChange={(e) => setSearchValue(e.target.value)} />
      </div>
      <div className="min-w-[180px]">
        <Select label="License" size="sm" value={get("license")}
                onChange={(e) => update({ license: e.target.value || null })}>
          <option value="">Any</option>
          {licenses.map((l) => <option key={l} value={l}>{LICENSE_LABEL[l]}</option>)}
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
        <Button size="sm" variant="ghost"
                onClick={() => router.replace(`${ROUTE}?kind=${activeKind}`)}>
          Clear
        </Button>
      )}
    </div>
  );
}
