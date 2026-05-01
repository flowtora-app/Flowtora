"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar, Card } from "@/components/ui";
import type { AuditRow } from "@/server/platform/audit-log";
import type { AuditSeverity, AuditSource } from "@prisma/client";

export function AuditTable({
  rows, total, page, pageSize,
}: {
  rows: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const goToPage = (n: number) => {
    const u = new URLSearchParams(sp.toString());
    u.set("page", String(n));
    router.replace(`/platform/access/audit?${u.toString()}`);
  };
  const openDetail = (id: string) => {
    const u = new URLSearchParams(sp.toString());
    u.set("detail", id);
    router.replace(`/platform/access/audit?${u.toString()}`);
  };
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (rows.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center">
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>No events match</h3>
          <p className="mx-auto mt-1 max-w-md text-[12px]" style={{ color: "var(--text-muted)" }}>
            Adjust the filter bar or pick a different saved view.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
        <table className="w-full text-[11px]">
          <thead style={{ background: "var(--surface-2)" }}>
            <tr>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Time</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Actor</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Action</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Resource</th>
              <th className="px-3 py-2 text-center font-semibold" style={{ color: "var(--text-muted)" }}>Status</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Tenant</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>IP</th>
              <th className="w-12 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td className="px-3 py-1.5 tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.createdAt.toLocaleString()}
                </td>
                <td className="px-3 py-1.5">
                  {r.actor ? (
                    <div className="flex items-center gap-1.5">
                      <Avatar size="xs" name={r.actor.name ?? r.actor.email} src={r.actor.image ?? undefined} />
                      <Link href={`/platform/users/${r.actor.id}`} className="truncate hover:underline"
                            style={{ color: "var(--text-default)" }}>
                        {r.actor.name?.trim() || r.actor.email}
                      </Link>
                      {r.actor.platformRole && (
                        <span className="text-[9px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                          {r.actor.platformRole.toLowerCase().replaceAll("_", " ")}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: "var(--text-faint)" }}>system</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <SeverityPill severity={r.severity} />
                    <span className="font-mono" style={{ color: "var(--text-default)" }}>{r.action}</span>
                    <SourceTag source={r.source} />
                  </div>
                </td>
                <td className="px-3 py-1.5" style={{ color: "var(--text-muted)" }}>
                  {r.entityType ? (
                    <span>
                      <span className="font-mono">{r.entityType}</span>
                      {r.entityId && (
                        <span className="ml-1 font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                          :{r.entityId.slice(0, 8)}
                        </span>
                      )}
                    </span>
                  ) : <span style={{ color: "var(--text-faint)" }}>—</span>}
                </td>
                <td className="px-3 py-1.5 text-center">
                  <span aria-label={r.success ? "success" : "failure"}
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: r.success ? "var(--emerald-500)" : "var(--rose-500)" }} />
                </td>
                <td className="px-3 py-1.5">
                  {r.tenant ? (
                    <Link href={`/platform/tenants/${r.tenant.id}`} className="hover:underline"
                          style={{ color: "var(--text-default)" }}>
                      {r.tenant.name}
                    </Link>
                  ) : <span style={{ color: "var(--text-faint)" }}>—</span>}
                </td>
                <td className="px-3 py-1.5 font-mono" style={{ color: "var(--text-muted)" }}>
                  {r.ipAddress ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <button type="button"
                          onClick={() => openDetail(r.id)}
                          className="text-[10px] hover:underline"
                          style={{ color: "var(--accent-primary)" }}>
                    Inspect
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
        <span>{total.toLocaleString()} event{total === 1 ? "" : "s"}</span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button type="button" disabled={page <= 1}
                    onClick={() => goToPage(page - 1)}
                    className="ts-focus inline-flex h-7 items-center rounded-md border px-2 text-[12px] font-medium hover:bg-[var(--surface-2)] disabled:opacity-50"
                    style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}>
              ← Prev
            </button>
            <span className="px-2">{page} / {totalPages}</span>
            <button type="button" disabled={page >= totalPages}
                    onClick={() => goToPage(page + 1)}
                    className="ts-focus inline-flex h-7 items-center rounded-md border px-2 text-[12px] font-medium hover:bg-[var(--surface-2)] disabled:opacity-50"
                    style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}>
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SeverityPill({ severity }: { severity: AuditSeverity }) {
  const palette =
    severity === "CRITICAL" ? { bg: "var(--rose-50)",     fg: "var(--rose-700)" } :
    severity === "WARNING"  ? { bg: "var(--amber-50)",    fg: "var(--amber-700)" } :
                              { bg: "var(--surface-2)",   fg: "var(--text-muted)" };
  return (
    <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: palette.fg, opacity: severity === "INFO" ? 0.5 : 1 }}
          title={severity.toLowerCase()} />
  );
}

function SourceTag({ source }: { source: AuditSource }) {
  if (source === "WEB") return null;
  return (
    <span className="rounded-full px-1.5 text-[9px] font-semibold uppercase tracking-wide"
          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
      {source.toLowerCase()}
    </span>
  );
}
