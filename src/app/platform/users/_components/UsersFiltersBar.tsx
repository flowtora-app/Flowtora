"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import type { PlatformRole, TenantRole } from "@prisma/client";

const TENANT_ROLE_LABEL: Record<TenantRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  SALES_REP: "Sales rep",
  CSR: "CSR",
  DESIGNER: "Designer",
  PRODUCTION_MANAGER: "Production",
  INSTALLER: "Installer",
  ACCOUNTING: "Accounting",
  EMPLOYEE: "Employee",
  CUSTOMER_PORTAL: "Customer portal",
};

const PLATFORM_ROLE_LABEL: Record<PlatformRole, string> = {
  SUPER_ADMIN: "Super admin",
  SITE_MANAGER: "Site manager",
  SUPPORT_AGENT: "Support agent",
  ADMIN: "Admin",
  MANAGER: "Manager",
  SUPPORT_LEAD: "Support lead",
  BILLING_MANAGER: "Billing manager",
  DEVELOPER: "Developer",
  MARKETING_MANAGER: "Marketing manager",
  CONTENT_MANAGER: "Content manager",
  ANALYST: "Analyst",
  READ_ONLY_VIEWER: "Read-only viewer",
};

export function UsersFiltersBar({
  tenantOptions,
  countryOptions,
  tenantRoleOptions,
  platformRoleOptions,
}: {
  tenantOptions: { id: string; label: string }[];
  countryOptions: string[];
  tenantRoleOptions: TenantRole[];
  platformRoleOptions: PlatformRole[];
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
      router.replace(q ? `/platform/users?${q}` : "/platform/users");
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
        <Input label="Search" size="sm" placeholder="name, email, or id"
               value={searchValue} onChange={(e) => setSearchValue(e.target.value)} />
      </div>
      <div className="min-w-[180px]">
        <Select label="Tenant" size="sm" value={get("tenant")}
                onChange={(e) => update({ tenant: e.target.value || null })}>
          <option value="">Any</option>
          {tenantOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </Select>
      </div>
      <div className="min-w-[140px]">
        <Select label="Tenant role" size="sm" value={get("tRole")}
                onChange={(e) => update({ tRole: e.target.value || null })}>
          <option value="">Any</option>
          {tenantRoleOptions.map((r) => <option key={r} value={r}>{TENANT_ROLE_LABEL[r]}</option>)}
        </Select>
      </div>
      <div className="min-w-[140px]">
        <Select label="Platform role" size="sm" value={get("pRole")}
                onChange={(e) => update({ pRole: e.target.value || null })}>
          <option value="">Any</option>
          {platformRoleOptions.map((r) => <option key={r} value={r}>{PLATFORM_ROLE_LABEL[r]}</option>)}
        </Select>
      </div>
      <div className="min-w-[120px]">
        <Select label="Status" size="sm" value={get("status")}
                onChange={(e) => update({ status: e.target.value || null })}>
          <option value="">Any</option>
          <option value="active">Active</option>
          <option value="deactivated">Deactivated</option>
          <option value="banned">Banned</option>
          <option value="locked">Locked</option>
          <option value="merged">Merged</option>
        </Select>
      </div>
      <div className="min-w-[110px]">
        <Select label="MFA" size="sm" value={get("mfa")}
                onChange={(e) => update({ mfa: e.target.value || null })}>
          <option value="">Any</option>
          <option value="1">Enabled</option>
          <option value="0">Disabled</option>
        </Select>
      </div>
      <div className="min-w-[120px]">
        <Select label="Verified" size="sm" value={get("verified")}
                onChange={(e) => update({ verified: e.target.value || null })}>
          <option value="">Any</option>
          <option value="1">Verified</option>
          <option value="0">Unverified</option>
        </Select>
      </div>
      <div className="min-w-[120px]">
        <Select label="Country" size="sm" value={get("country")}
                onChange={(e) => update({ country: e.target.value || null })}>
          <option value="">Any</option>
          {countryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <div className="min-w-[140px]">
        <Select label="Sign-in method" size="sm" value={get("signin")}
                onChange={(e) => update({ signin: e.target.value || null })}>
          <option value="">Any</option>
          <option value="credentials">Password</option>
          <option value="google">Google</option>
          <option value="microsoft">Microsoft</option>
          <option value="sso">SAML / OIDC SSO</option>
          <option value="other">Other</option>
        </Select>
      </div>
      <Input label="Last login since" size="sm" type="date"
             value={get("lastSince")}
             onChange={(e) => update({ lastSince: e.target.value || null })} />
      <Input label="Until" size="sm" type="date"
             value={get("lastUntil")}
             onChange={(e) => update({ lastUntil: e.target.value || null })} />
      {hasAny && (
        <Button size="sm" variant="ghost"
                onClick={() => router.replace("/platform/users")}>
          Clear
        </Button>
      )}
    </div>
  );
}
