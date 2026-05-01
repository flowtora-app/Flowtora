"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Button,
  Card,
  useToast,
} from "@/components/ui";
import {
  blockIp,
  bulkBlockIps,
  bulkEndSessions,
  endAllAdminSessions,
  endPlatformSession,
  forceMfaPrompt,
} from "@/app/actions/platform-sessions";
import type { SessionRow } from "@/server/platform/sessions";

export function SessionsTable({
  rows,
  canEdit,
}: {
  rows: SessionRow[];
  canEdit: boolean;
}) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0 && !allSelected;
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const onBulkSignOut = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Sign out ${selected.size} session${selected.size === 1 ? "" : "s"}?`)) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("sessionIds", Array.from(selected).join(","));
      const res = await bulkEndSessions(fd);
      if (res.ok) {
        toast.success(`Signed out ${res.count}`);
        setSelected(new Set());
        router.refresh();
      } else toast.error(res.error ?? "Couldn't sign out");
    } finally { setPending(false); }
  };

  const onBulkBlockIps = async () => {
    const ips = Array.from(new Set(
      rows.filter((r) => selected.has(r.id))
          .map((r) => r.ipAddress)
          .filter((x): x is string => !!x),
    ));
    if (ips.length === 0) {
      toast.error("Selected sessions have no IPs to block");
      return;
    }
    if (!window.confirm(`Block ${ips.length} IP${ips.length === 1 ? "" : "s"}? Affected admins won't be able to sign in from these IPs.`)) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("cidrs", ips.join(","));
      fd.set("reason", "Bulk-blocked from Sessions & Devices");
      const res = await bulkBlockIps(fd);
      if (res.ok) {
        toast.success(`Blocked ${res.count} IP${res.count === 1 ? "" : "s"}`);
        setSelected(new Set());
        router.refresh();
      } else toast.error(res.error ?? "Couldn't block");
    } finally { setPending(false); }
  };

  if (rows.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center">
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>No active sessions</h3>
          <p className="mx-auto mt-1 max-w-md text-[12px]" style={{ color: "var(--text-muted)" }}>
            No DB-strategy sessions match the current filters. JWT sessions don&apos;t live here.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      {canEdit && selected.size > 0 && (
        <Card padding="sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px]" style={{ color: "var(--text-default)" }}>
              {selected.size} session{selected.size === 1 ? "" : "s"} selected
            </span>
            <Button size="sm" variant="secondary" onClick={onBulkSignOut} disabled={pending}>
              Sign out selected
            </Button>
            <Button size="sm" variant="secondary" onClick={onBulkBlockIps} disabled={pending}>
              Block IPs
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </Card>
      )}

      <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
        <table className="w-full text-[12px]">
          <thead style={{ background: "var(--surface-2)" }}>
            <tr>
              {canEdit && (
                <th className="w-8 px-2 py-2">
                  <input type="checkbox" checked={allSelected}
                         ref={(el) => { if (el) el.indeterminate = someSelected; }}
                         onChange={toggleAll}
                         aria-label="Select all" />
                </th>
              )}
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Admin</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Device</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>IP</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Location</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Started</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Last active</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>MFA</th>
              <th className="w-44 px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.id} row={r} canEdit={canEdit} selected={selected.has(r.id)}
                   onToggle={() => toggleOne(r.id)} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Row({
  row, canEdit, selected, onToggle,
}: {
  row: SessionRow; canEdit: boolean; selected: boolean; onToggle: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  const runAction = async (
    action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    fd: FormData,
    successMsg: string,
  ) => {
    setBusy(true);
    try {
      const res = await action(fd);
      if (res.ok) { toast.success(successMsg); router.refresh(); }
      else toast.error(res.error ?? "Couldn't run action");
    } finally { setBusy(false); }
  };

  const onSignOut = () => {
    const fd = new FormData();
    fd.set("sessionId", row.id);
    return runAction(endPlatformSession, fd, "Session signed out");
  };
  const onSignOutAll = () => {
    if (!window.confirm(`Sign out every session for ${row.admin.email}? Bumps sessionVersion + drops every DB-session row.`)) return;
    const fd = new FormData();
    fd.set("adminId", row.admin.id);
    return runAction(endAllAdminSessions, fd, "Signed out everywhere");
  };
  const onForceMfa = () => {
    const fd = new FormData();
    fd.set("sessionId", row.id);
    return runAction(forceMfaPrompt, fd, "Force-MFA flag set");
  };
  const onBlockIp = () => {
    if (!row.ipAddress) { toast.error("No IP captured for this session"); return; }
    if (!window.confirm(`Block ${row.ipAddress}?`)) return;
    const fd = new FormData();
    fd.set("cidr", row.ipAddress);
    fd.set("reason", `Blocked from Sessions table · admin ${row.admin.email}`);
    return runAction(blockIp, fd, "IP blocked");
  };

  return (
    <tr style={{
      borderTop: "1px solid var(--border-subtle)",
      background: row.isBlockedIp ? "var(--rose-50)" : undefined,
    }}>
      {canEdit && (
        <td className="px-2 py-2">
          <input type="checkbox" checked={selected} onChange={onToggle}
                 aria-label={`Select session for ${row.admin.email}`} />
        </td>
      )}
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <Avatar size="xs" name={row.admin.name ?? row.admin.email} src={row.admin.image ?? undefined} />
          <Link href={`/platform/users/${row.admin.id}`} className="font-medium hover:underline"
                style={{ color: "var(--text-default)" }}>
            {row.admin.name?.trim() || row.admin.email}
          </Link>
        </div>
      </td>
      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
        {row.browserName ? (
          <div className="flex flex-col">
            <span style={{ color: "var(--text-default)" }}>
              {row.browserName} {row.browserVersion ?? ""}
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
              {row.osName} {row.osVersion ?? ""} · {row.deviceType ?? "—"}
            </span>
          </div>
        ) : (
          <span style={{ color: "var(--text-faint)" }}>—</span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="font-mono" style={{ color: "var(--text-default)" }}>
            {row.ipAddress ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
          </span>
          {row.isBlockedIp && (
            <span className="inline-flex items-center rounded-full px-1.5 text-[9px] font-semibold uppercase tracking-wide"
                  style={{ background: "var(--rose-100)", color: "var(--rose-700)" }}>
              Blocked
            </span>
          )}
        </div>
      </td>
      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
        {row.country ? (
          <span>
            {row.city ? `${row.city}, ` : ""}{row.country}
          </span>
        ) : (
          <span style={{ color: "var(--text-faint)" }}>—</span>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>
        {row.startedAt.toLocaleString()}
      </td>
      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>
        {row.lastActiveAt
          ? relativeTime(new Date(row.lastActiveAt))
          : <span style={{ color: "var(--text-faint)" }}>—</span>}
      </td>
      <td className="px-3 py-2">
        {row.mfaMethod ? (
          <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: "var(--emerald-50)", color: "var(--emerald-700)" }}>
            {row.mfaMethod}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: "var(--rose-50)", color: "var(--rose-700)" }}>
            None
          </span>
        )}
        {row.forceMfaPromptAt && (
          <div className="mt-0.5 text-[10px]" style={{ color: "var(--amber-700)" }}>
            re-prompt pending
          </div>
        )}
      </td>
      <td className="px-3 py-2">
        {canEdit && (
          <div className="flex items-center justify-end gap-1.5">
            <Button size="xs" variant="ghost" onClick={onSignOut} disabled={busy}>Sign out</Button>
            <Button size="xs" variant="ghost" onClick={onSignOutAll} disabled={busy}>Sign out all</Button>
            <Button size="xs" variant="ghost" onClick={onForceMfa} disabled={busy}>Force MFA</Button>
            {row.ipAddress && !row.isBlockedIp && (
              <Button size="xs" variant="ghost" onClick={onBlockIp} disabled={busy}>Block IP</Button>
            )}
          </div>
        )}
      </td>
    </tr>
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
