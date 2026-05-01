"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import type { PlatformInviteStatus, PlatformRole } from "@prisma/client";

const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  SUPER_ADMIN: "Super admin", SITE_MANAGER: "Site manager", SUPPORT_AGENT: "Support agent",
  ADMIN: "Admin", MANAGER: "Manager", SUPPORT_LEAD: "Support lead",
  BILLING_MANAGER: "Billing manager", DEVELOPER: "Developer",
  MARKETING_MANAGER: "Marketing manager", CONTENT_MANAGER: "Content manager",
  ANALYST: "Analyst", READ_ONLY_VIEWER: "Read-only viewer",
};

export function InvitesFiltersBar({
  statuses,
  roles,
}: {
  statuses: PlatformInviteStatus[];
  roles: PlatformRole[];
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
      router.replace(q ? `/platform/access/invitations?${q}` : "/platform/access/invitations");
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
        <Input label="Search email" size="sm" placeholder="invitee@example.com"
               value={searchValue} onChange={(e) => setSearchValue(e.target.value)} />
      </div>
      <div className="min-w-[140px]">
        <Select label="Status" size="sm" value={get("status")}
                onChange={(e) => update({ status: e.target.value || null })}>
          <option value="">Any</option>
          {statuses.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
        </Select>
      </div>
      <div className="min-w-[160px]">
        <Select label="Role" size="sm" value={get("role")}
                onChange={(e) => update({ role: e.target.value || null })}>
          <option value="">Any</option>
          {roles.map((r) => <option key={r} value={r}>{PLATFORM_ROLE_LABEL[r]}</option>)}
        </Select>
      </div>
      <Input label="Since" size="sm" type="date" value={get("since")}
             onChange={(e) => update({ since: e.target.value || null })} />
      <Input label="Until" size="sm" type="date" value={get("until")}
             onChange={(e) => update({ until: e.target.value || null })} />
      {hasAny && (
        <Button size="sm" variant="ghost" onClick={() => router.replace("/platform/access/invitations")}>
          Clear
        </Button>
      )}
    </div>
  );
}
