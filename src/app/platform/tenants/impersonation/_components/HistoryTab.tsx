"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Avatar,
  Card,
  Drawer,
  Input,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { addImpersonationNote } from "@/app/actions/impersonation-admin";
import {
  IMPERSONATION_CATEGORY_LABEL,
  IMPERSONATION_END_REASON_LABEL,
  type HistoryRow,
  type SessionDetail,
} from "@/server/platform/impersonation";
import type { ImpersonationEndReason } from "@prisma/client";

// HistoryTab — paged table over every impersonation session with
// rich filter bar. Click any row to open a detail drawer with the
// full action timeline (chronological audit-log rows that were
// tagged with this session id).

const END_REASON_OPTIONS: ImpersonationEndReason[] = ["COMPLETED", "FORCE_ENDED", "EXPIRED", "IDLE_TIMEOUT"];

export function HistoryTab({
  rows,
  total,
  adminOptions,
  tenantOptions,
  detail,
}: {
  rows: HistoryRow[];
  total: number;
  adminOptions: { id: string; label: string }[];
  tenantOptions: { id: string; label: string }[];
  canEnd: boolean;
  detail: SessionDetail | null;
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
      router.replace(q ? `/platform/tenants/impersonation?${q}` : "/platform/tenants/impersonation");
    },
    [router, sp],
  );

  const closeDetail = () => update({ detail: null });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card padding="md">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[180px]">
            <Select label="Admin" size="sm" value={get("admin")}
                    onChange={(e) => update({ admin: e.target.value || null, page: null })}>
              <option value="">Any</option>
              {adminOptions.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </Select>
          </div>
          <div className="min-w-[180px]">
            <Select label="Tenant" size="sm" value={get("tenant")}
                    onChange={(e) => update({ tenant: e.target.value || null, page: null })}>
              <option value="">Any</option>
              {tenantOptions.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </Select>
          </div>
          <Input label="Since" size="sm" type="date"
                 value={get("since")}
                 onChange={(e) => update({ since: e.target.value || null, page: null })} />
          <Input label="Until" size="sm" type="date"
                 value={get("until")}
                 onChange={(e) => update({ until: e.target.value || null, page: null })} />
          <Input label="Min duration (m)" size="sm" type="number" min={0}
                 value={get("minDur")}
                 onChange={(e) => update({ minDur: e.target.value || null, page: null })} />
          <Input label="Max duration (m)" size="sm" type="number" min={0}
                 value={get("maxDur")}
                 onChange={(e) => update({ maxDur: e.target.value || null, page: null })} />
          <div className="min-w-[140px]">
            <Select label="Has actions" size="sm" value={get("hasActions")}
                    onChange={(e) => update({ hasActions: e.target.value || null, page: null })}>
              <option value="">Any</option>
              <option value="1">Yes</option>
              <option value="0">No</option>
            </Select>
          </div>
          <div className="min-w-[140px]">
            <Select label="Ended reason" size="sm" value={get("ended")}
                    onChange={(e) => update({ ended: e.target.value || null, page: null })}>
              <option value="">Any</option>
              {END_REASON_OPTIONS.map((r) => (
                <option key={r} value={r}>{IMPERSONATION_END_REASON_LABEL[r]}</option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* Table */}
      <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
        <table className="w-full text-[12px]">
          <thead style={{ background: "var(--surface-2)" }}>
            <tr>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Admin</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Tenant</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Started</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Ended</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Duration</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Reason</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Actions</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Status</th>
              <th className="w-8 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center" style={{ color: "var(--text-faint)" }}>
                No sessions match the filter.
              </td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar size="xs" name={r.admin.name ?? r.admin.email} />
                    <span style={{ color: "var(--text-default)" }}>{r.admin.name?.trim() || r.admin.email}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Link href={`/platform/tenants/${r.tenant.id}`} className="hover:underline"
                        style={{ color: "var(--text-default)" }}>
                    {r.tenant.name}
                  </Link>
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                  {r.startedAt.toLocaleString()}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                  {r.endedAt ? r.endedAt.toLocaleString() : <span style={{ color: "var(--emerald-700)" }}>active</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                  {r.durationMin == null ? "—" : `${r.durationMin}m`}
                </td>
                <td className="px-3 py-2 max-w-[260px] truncate" style={{ color: "var(--text-muted)" }}
                    title={`${IMPERSONATION_CATEGORY_LABEL[r.categoryCode]}${r.reason ? " · " + r.reason : ""}`}>
                  <span className="text-[10px] mr-1" style={{ color: "var(--text-faint)" }}>
                    {IMPERSONATION_CATEGORY_LABEL[r.categoryCode]}
                  </span>
                  {r.reason ?? <span style={{ color: "var(--text-faint)" }}>—</span>}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                  {r.actionsCount}
                </td>
                <td className="px-3 py-2">
                  {r.endedReason ? (
                    <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{
                            background: r.endedReason === "FORCE_ENDED" ? "var(--rose-50)"
                                     : r.endedReason === "EXPIRED" || r.endedReason === "IDLE_TIMEOUT" ? "var(--amber-50)"
                                     : "var(--emerald-50)",
                            color: r.endedReason === "FORCE_ENDED" ? "var(--rose-700)"
                                : r.endedReason === "EXPIRED" || r.endedReason === "IDLE_TIMEOUT" ? "var(--amber-700)"
                                : "var(--emerald-700)",
                          }}>
                      {IMPERSONATION_END_REASON_LABEL[r.endedReason]}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: "var(--emerald-50)", color: "var(--emerald-700)" }}>
                      Active
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => update({ detail: r.id })}
                    className="text-[11px] hover:underline"
                    style={{ color: "var(--accent-primary)" }}
                  >
                    Inspect
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 50 && (
        <div className="flex items-center justify-end gap-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
          <span>{total.toLocaleString()} sessions total</span>
          <Pagination total={total} pageSize={50} sp={sp} update={update} />
        </div>
      )}

      {/* Detail drawer */}
      {detail && <SessionDetailDrawer detail={detail} onClose={closeDetail} />}
    </div>
  );
}

function Pagination({
  total, pageSize, sp, update,
}: {
  total: number;
  pageSize: number;
  sp: URLSearchParams;
  update: (o: Record<string, string | null>) => void;
}) {
  const page = Math.max(1, Number(sp.get("page") ?? "1") || 1);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => update({ page: String(page - 1) })}
        className="ts-focus inline-flex h-7 items-center rounded-md border px-2 text-[12px] font-medium hover:bg-[var(--surface-2)] disabled:opacity-50"
        style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}
      >
        ← Prev
      </button>
      <span className="px-2">{page} / {totalPages}</span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => update({ page: String(page + 1) })}
        className="ts-focus inline-flex h-7 items-center rounded-md border px-2 text-[12px] font-medium hover:bg-[var(--surface-2)] disabled:opacity-50"
        style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}
      >
        Next →
      </button>
    </div>
  );
}

/* ── Session detail drawer ──────────────────────────────────── */

function SessionDetailDrawer({
  detail,
  onClose,
}: {
  detail: SessionDetail;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const onAddNote = async () => {
    if (note.trim().length < 1) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("sessionId", detail.id);
      fd.set("note", note.trim());
      const res = await addImpersonationNote(fd);
      if (res.ok) {
        toast.success("Note added");
        setNote("");
        router.refresh();
      } else toast.error(res.error ?? "Couldn't add note");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add note");
    } finally { setPending(false); }
  };

  return (
    <Drawer
      open
      onOpenChange={(o) => { if (!o) onClose(); }}
      side="right"
      size="lg"
      title={`${detail.admin.name?.trim() || detail.admin.email} → ${detail.tenant.name}`}
      description={`${IMPERSONATION_CATEGORY_LABEL[detail.categoryCode]}${detail.endedReason ? " · " + IMPERSONATION_END_REASON_LABEL[detail.endedReason] : " · active"}`}
    >
      <div className="flex flex-col gap-5">
        {/* Meta panel */}
        <section>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Meta
          </h3>
          <dl className="grid grid-cols-2 gap-y-1 text-[12px]">
            <Meta label="Started"  value={detail.startedAt.toLocaleString()} />
            <Meta label="Ended"    value={detail.endedAt ? detail.endedAt.toLocaleString() : "active"} />
            <Meta label="Duration" value={formatDuration(detail.durationSec)} />
            <Meta label="Actions"  value={detail.actionsCount.toString()} />
            <Meta label="Expected" value={detail.expectedDurationMin == null ? "—" : `${detail.expectedDurationMin}m`} />
            <Meta label="IP"       value={detail.ip ?? "—"} mono />
            {detail.endedBy && <Meta label="Ended by" value={detail.endedBy.name ?? detail.endedBy.email} />}
            {detail.approvedBy && <Meta label="Approved by" value={detail.approvedBy.name ?? detail.approvedBy.email} />}
          </dl>
          {detail.userAgent && (
            <div className="mt-1 break-all text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>
              {detail.userAgent}
            </div>
          )}
          {detail.reason && (
            <div className="mt-2 rounded-md border p-2 text-[12px]"
                 style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-default)" }}>
              <div className="text-[9px] font-semibold uppercase" style={{ color: "var(--text-faint)" }}>Reason</div>
              {detail.reason}
            </div>
          )}
        </section>

        {/* Action timeline */}
        <section>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Action timeline ({detail.timeline.length})
          </h3>
          {detail.timeline.length === 0 ? (
            <div className="rounded-md border border-dashed py-6 text-center text-[11px]"
                 style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
              No mutating actions logged in this session.
            </div>
          ) : (
            <ol className="ts-impersonation-timeline">
              {detail.timeline.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-2 border-b py-1.5 text-[11px]"
                    style={{ borderColor: "var(--border-subtle)" }}>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono" style={{ color: "var(--text-default)" }}>{t.action}</div>
                    {(t.entityType || t.entityId) && (
                      <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                        {t.entityType}{t.entityId ? `:${t.entityId}` : ""}
                      </div>
                    )}
                  </div>
                  <span className="shrink-0 tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {t.createdAt.toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Notes + add-note */}
        <section>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Notes
          </h3>
          {detail.notes ? (
            <pre className="whitespace-pre-wrap rounded-md border p-2 text-[11px] font-mono"
                 style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-default)" }}>
              {detail.notes}
            </pre>
          ) : (
            <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>No notes yet.</div>
          )}
          <div className="mt-2 flex flex-col gap-1.5">
            <Textarea
              label="Add a note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Compliance review note · what was looked at"
              maxLength={2000}
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onAddNote}
                disabled={pending || note.trim().length === 0}
                className="ts-focus inline-flex h-8 items-center rounded-md border px-2.5 text-[12px] font-medium hover:bg-[var(--surface-2)] disabled:opacity-50"
                style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}
              >
                {pending ? "Saving…" : "Add note"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </Drawer>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-[11px]" style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd className={mono ? "text-[11px] font-mono" : "text-[11px]"} style={{ color: "var(--text-default)" }}>
        {value}
      </dd>
    </>
  );
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
