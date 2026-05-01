"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar, Card, useToast } from "@/components/ui";
import type { SubscriptionRow, SubscriptionStatus } from "@/server/platform/subscriptions";
import { RowMenu } from "./RowMenu";

const STATUS_PILL: Record<SubscriptionStatus, { bg: string; fg: string }> = {
  active:    { bg: "var(--emerald-50)", fg: "var(--emerald-700)" },
  trialing:  { bg: "var(--amber-50)",   fg: "var(--amber-700)" },
  past_due:  { bg: "var(--rose-50)",    fg: "var(--rose-700)" },
  canceled:  { bg: "var(--surface-2)",  fg: "var(--text-muted)" },
  paused:    { bg: "var(--accent-surface)", fg: "var(--accent-primary)" },
  incomplete:{ bg: "var(--surface-2)",  fg: "var(--text-muted)" },
};

export function SubscriptionsTable({
  rows, total, filteredTotal, page, pageSize,
  canEdit, canCoupon,
}: {
  rows: SubscriptionRow[];
  total: number;
  filteredTotal: number;
  page: number;
  pageSize: number;
  canEdit: boolean;
  canCoupon: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();
  const goToPage = (n: number) => {
    const u = new URLSearchParams(sp.toString());
    u.set("page", String(n));
    router.replace(`/platform/billing/subscriptions?${u.toString()}`);
  };
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

  const onCopy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch { toast.error("Couldn't copy"); }
  };

  if (rows.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center">
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            No subscriptions match
          </h3>
          <p className="mx-auto mt-1 max-w-md text-[12px]" style={{ color: "var(--text-muted)" }}>
            Adjust the filter bar.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border" style={{ borderColor: "var(--border-subtle)" }}>
        <table className="w-full text-[12px]">
          <thead style={{ background: "var(--surface-2)" }}>
            <tr>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Tenant</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Sub ID</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Plan</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Cycle</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Status</th>
              <th className="px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>MRR</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Started</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Period end</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Trial end</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Cancel?</th>
              <th className="w-12 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar size="xs" name={r.tenantName} src={r.logoUrl ?? undefined} />
                    <Link href={`/platform/billing/subscriptions/${r.tenantId}`}
                          className="font-semibold hover:underline"
                          style={{ color: "var(--text-default)" }}>
                      {r.tenantName}
                    </Link>
                    <span className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>
                      {r.tenantSlug}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => onCopy("Subscription ID", r.stripeSubscriptionId ?? r.id)}
                          className="font-mono text-[11px] hover:underline"
                          style={{ color: "var(--text-default)" }}>
                    {(r.stripeSubscriptionId ?? r.id).slice(0, 14)}…
                  </button>
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-default)" }}>
                  {r.planName}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>
                  {r.cycle.toLowerCase()}
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ background: STATUS_PILL[r.status].bg, color: STATUS_PILL[r.status].fg }}>
                    {r.status.replace("_", " ")}
                  </span>
                  {r.hasCoupon && (
                    <span className="ml-1 inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
                      coupon
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                  {r.mrr === 0 ? "—" : `$${r.mrr.toLocaleString()}`}
                </td>
                <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.startedAt.toLocaleDateString()}
                </td>
                <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.currentPeriodEnd ? r.currentPeriodEnd.toLocaleDateString() :
                    <span style={{ color: "var(--text-faint)" }}>—</span>}
                </td>
                <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {r.trialEndsAt ? r.trialEndsAt.toLocaleDateString() :
                    <span style={{ color: "var(--text-faint)" }}>—</span>}
                </td>
                <td className="px-3 py-2">
                  {r.cancelAtPeriodEnd ? (
                    <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: "var(--rose-50)", color: "var(--rose-700)" }}>
                      end of period
                    </span>
                  ) : r.cancelScheduledFor ? (
                    <span className="inline-flex items-center rounded-full px-1.5 text-[10px]"
                          style={{ background: "var(--rose-50)", color: "var(--rose-700)" }}>
                      {r.cancelScheduledFor.toLocaleDateString()}
                    </span>
                  ) : (
                    <span style={{ color: "var(--text-faint)" }}>—</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  <RowMenu row={r} canEdit={canEdit} canCoupon={canCoupon} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
        <span>
          {filteredTotal === total
            ? `${total.toLocaleString()} subscription${total === 1 ? "" : "s"}`
            : `${filteredTotal.toLocaleString()} of ${total.toLocaleString()}`}
        </span>
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
