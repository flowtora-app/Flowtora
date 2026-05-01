"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Card,
  Select,
  useToast,
} from "@/components/ui";
import {
  changeMembershipRole,
  removeUserFromTenant,
} from "@/app/actions/platform-users";
import { TenantImpersonateButton } from "../../../tenants/[id]/_components/TenantImpersonateButton";
import type { UserMembership } from "@/server/platform/users-list";
import type { TenantRole } from "@prisma/client";

const ROLE_OPTIONS: TenantRole[] = [
  "OWNER", "ADMIN", "SALES_REP", "CSR", "DESIGNER",
  "PRODUCTION_MANAGER", "INSTALLER", "ACCOUNTING", "EMPLOYEE",
];

const ROLE_LABEL: Record<TenantRole, string> = {
  OWNER: "Owner", ADMIN: "Admin", SALES_REP: "Sales rep", CSR: "CSR",
  DESIGNER: "Designer", PRODUCTION_MANAGER: "Production manager",
  INSTALLER: "Installer", ACCOUNTING: "Accounting", EMPLOYEE: "Employee",
  CUSTOMER_PORTAL: "Customer portal",
};

export function TenantsTab({
  userId,
  memberships,
  canBan,
  canImpersonate,
}: {
  userId: string;
  memberships: UserMembership[];
  canBan: boolean;
  canImpersonate: boolean;
}) {
  if (memberships.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center">
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>No tenants</h3>
          <p className="mx-auto mt-1 max-w-md text-[12px]" style={{ color: "var(--text-muted)" }}>
            This user isn&apos;t a member of any tenant. Either an orphan signup or a deleted membership.
          </p>
        </div>
      </Card>
    );
  }
  return (
    <div className="space-y-3" id="tenants">
      <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        Click a tenant to open its detail page; impersonate is per-tenant.
      </p>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {memberships.map((m) => (
          <Row
            key={m.id}
            membership={m}
            userId={userId}
            canBan={canBan}
            canImpersonate={canImpersonate}
          />
        ))}
      </div>
    </div>
  );
}

function Row({
  membership,
  userId,
  canBan,
  canImpersonate,
}: {
  membership: UserMembership;
  userId: string;
  canBan: boolean;
  canImpersonate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  const [role, setRole] = React.useState<TenantRole>(membership.role);

  const onChangeRole = async (next: TenantRole) => {
    if (next === role) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("userId", userId);
      fd.set("membershipId", membership.id);
      fd.set("role", next);
      const res = await changeMembershipRole(fd);
      if (res.ok) { toast.success("Role updated"); setRole(next); router.refresh(); }
      else toast.error(res.error ?? "Couldn't update");
    } finally { setBusy(false); }
  };

  const onRemove = async () => {
    if (!window.confirm(`Remove this user from ${membership.tenant.name}?`)) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("userId", userId);
      fd.set("membershipId", membership.id);
      const res = await removeUserFromTenant(fd);
      if (res.ok) { toast.success("Removed"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't remove");
    } finally { setBusy(false); }
  };

  return (
    <Card padding="md" className="h-full">
      <div className="flex h-full flex-col gap-2.5">
        <div className="flex items-start gap-2">
          <Avatar size="sm" name={membership.tenant.name} />
          <div className="min-w-0 flex-1">
            <Link href={`/platform/tenants/${membership.tenant.id}`}
                  className="block truncate text-[13px] font-semibold hover:underline"
                  style={{ color: "var(--text-default)" }}>
              {membership.tenant.name}
            </Link>
            <div className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>{membership.tenant.slug}</div>
          </div>
          <span className="inline-flex shrink-0 items-center rounded-full px-1.5 text-[10px] font-semibold"
                style={{
                  background: membership.status === "ACTIVE" ? "var(--emerald-50)" : "var(--surface-2)",
                  color: membership.status === "ACTIVE" ? "var(--emerald-700)" : "var(--text-muted)",
                }}>
            {membership.status}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <Stat label="Joined" value={membership.joinedAt.toLocaleDateString()} />
          <Stat label="Last active" value={membership.lastActiveAt ? relativeTime(new Date(membership.lastActiveAt)) : "—"} />
        </div>
        {canBan ? (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Select
                label="Role"
                size="sm"
                value={role}
                disabled={busy}
                onChange={(e) => onChangeRole(e.target.value as TenantRole)}
              >
                {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </Select>
            </div>
            {role !== "OWNER" && (
              <button type="button" onClick={onRemove} disabled={busy}
                      className="ts-focus inline-flex h-9 items-center rounded-md border px-2.5 text-[11px] font-medium hover:bg-[var(--surface-2)] disabled:opacity-50"
                      style={{ borderColor: "var(--rose-300)", color: "var(--rose-700)" }}>
                Remove
              </button>
            )}
          </div>
        ) : (
          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Role: <span className="font-medium">{ROLE_LABEL[role]}</span>
          </div>
        )}
        {canImpersonate && (
          <div className="mt-auto">
            <TenantImpersonateButton
              tenantId={membership.tenant.id}
              tenantName={membership.tenant.name}
              size="xs"
              variant="ghost"
              enabled={canImpersonate}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</div>
      <div className="mt-0.5 text-[12px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{value}</div>
    </div>
  );
}

function relativeTime(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (ms < min) return "just now";
  if (ms < hour) return `${Math.floor(ms / min)}m`;
  if (ms < day) return `${Math.floor(ms / hour)}h`;
  return `${Math.floor(ms / day)}d`;
}
