"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardBody,
  CardHeader,
  useToast,
} from "@/components/ui";
import { unblockIp } from "@/app/actions/platform-sessions";
import type { IpBlockRow } from "@/server/platform/sessions";

export function IpBlocksPanel({
  rows,
  canEdit,
}: {
  rows: IpBlockRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  const onUnblock = async (cidr: string) => {
    if (!window.confirm(`Unblock ${cidr}?`)) return;
    setBusy(cidr);
    try {
      const fd = new FormData();
      fd.set("cidr", cidr);
      const res = await unblockIp(fd);
      if (res.ok) { toast.success("Unblocked"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't unblock");
    } finally { setBusy(null); }
  };

  return (
    <Card>
      <CardHeader title={`Blocked IPs (${rows.length})`}
                  description="Platform-wide blocklist. Refuses sign-ins from listed CIDRs." />
      <CardBody>
        {rows.length === 0 ? (
          <div className="rounded-md border border-dashed py-6 text-center text-[12px]"
               style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
            No blocked IPs.
          </div>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {rows.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-2 py-2 text-[12px]">
                <div className="min-w-0 flex-1">
                  <div className="font-mono" style={{ color: "var(--text-default)" }}>{r.cidr}</div>
                  {r.reason && (
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{r.reason}</div>
                  )}
                  <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                    Added {r.createdAt.toLocaleDateString()}
                    {r.expiresAt && ` · expires ${r.expiresAt.toLocaleDateString()}`}
                    {r.triggeredCount > 0 && ` · triggered ${r.triggeredCount}×`}
                  </div>
                </div>
                {canEdit && (
                  <button type="button"
                          onClick={() => onUnblock(r.cidr)}
                          disabled={busy === r.cidr}
                          className="ts-focus inline-flex h-6 items-center rounded-md border px-2 text-[10px] font-medium hover:bg-[var(--surface-2)] disabled:opacity-50"
                          style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}>
                    Unblock
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
