"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import type { SessionFilterOptions } from "@/server/platform/sessions";

export function SessionsFiltersBar({ options }: { options: SessionFilterOptions }) {
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
      router.replace(q ? `/platform/access/sessions?${q}` : "/platform/access/sessions");
    },
    [router, sp],
  );
  const hasAny = sp.toString().length > 0;
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-[180px]">
        <Select label="Admin" size="sm" value={get("admin")}
                onChange={(e) => update({ admin: e.target.value || null })}>
          <option value="">Any</option>
          {options.admins.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </Select>
      </div>
      <div className="min-w-[120px]">
        <Select label="Device" size="sm" value={get("device")}
                onChange={(e) => update({ device: e.target.value || null })}>
          <option value="">Any</option>
          {options.deviceTypes.map((d) => <option key={d} value={d}>{d}</option>)}
        </Select>
      </div>
      <div className="min-w-[120px]">
        <Select label="Browser" size="sm" value={get("browser")}
                onChange={(e) => update({ browser: e.target.value || null })}>
          <option value="">Any</option>
          {options.browsers.map((b) => <option key={b} value={b}>{b}</option>)}
        </Select>
      </div>
      <div className="min-w-[120px]">
        <Select label="OS" size="sm" value={get("os")}
                onChange={(e) => update({ os: e.target.value || null })}>
          <option value="">Any</option>
          {options.oses.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
      </div>
      <Input label="IP" size="sm" placeholder="203.0.113.7"
             value={get("ip")}
             onChange={(e) => update({ ip: e.target.value || null })} />
      <div className="min-w-[120px]">
        <Select label="Country" size="sm" value={get("country")}
                onChange={(e) => update({ country: e.target.value || null })}>
          <option value="">Any</option>
          {options.countries.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      </div>
      <Input label="Last active since" size="sm" type="date"
             value={get("lastSince")}
             onChange={(e) => update({ lastSince: e.target.value || null })} />
      <Input label="Until" size="sm" type="date"
             value={get("lastUntil")}
             onChange={(e) => update({ lastUntil: e.target.value || null })} />
      <div className="min-w-[120px]">
        <Select label="MFA" size="sm" value={get("mfa")}
                onChange={(e) => update({ mfa: e.target.value || null })}>
          <option value="">Any</option>
          <option value="totp">TOTP</option>
          <option value="webauthn">WebAuthn</option>
          <option value="sms">SMS</option>
          <option value="none">No MFA</option>
        </Select>
      </div>
      {hasAny && (
        <Button size="sm" variant="ghost" onClick={() => router.replace("/platform/access/sessions")}>
          Clear
        </Button>
      )}
    </div>
  );
}
