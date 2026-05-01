"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
  cancelSubscription,
  pauseSubscription,
  reactivateSubscription,
  resumeSubscription,
} from "@/app/actions/platform-subscriptions";
import type { SubscriptionRow } from "@/server/platform/subscriptions";

export function RowMenu({
  row, canEdit, canCoupon,
}: {
  row: SubscriptionRow;
  canEdit: boolean;
  canCoupon: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const runAction = async (
    action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    fd: FormData,
    msg: string,
  ) => {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    try {
      const res = await action(fd);
      if (res.ok) { toast.success(msg); router.refresh(); }
      else toast.error(res.error ?? "Couldn't run action");
    } finally { setBusy(false); }
  };

  const onPause = () => {
    const days = window.prompt(`Pause ${row.tenantName} for how many days?`, "30");
    if (!days) return;
    const n = Number(days);
    if (Number.isNaN(n) || n < 1) { toast.error("Invalid number"); return; }
    const fd = new FormData();
    fd.set("tenantId", row.tenantId);
    fd.set("pausedUntil", new Date(Date.now() + n * 86_400_000).toISOString());
    return runAction(pauseSubscription, fd, "Paused");
  };
  const onResume = () => {
    const fd = new FormData();
    fd.set("tenantId", row.tenantId);
    return runAction(resumeSubscription, fd, "Resumed");
  };
  const onCancel = (when: "now" | "period_end") => {
    if (!window.confirm(`Cancel ${row.tenantName} ${when === "now" ? "immediately" : "at period end"}?`)) return;
    const fd = new FormData();
    fd.set("tenantId", row.tenantId);
    fd.set("when", when);
    return runAction(cancelSubscription, fd, "Cancellation queued");
  };
  const onReactivate = () => {
    const fd = new FormData();
    fd.set("tenantId", row.tenantId);
    return runAction(reactivateSubscription, fd, "Reactivated");
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button"
              aria-label={`Actions for ${row.tenantName}`}
              onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
              className="ts-focus inline-flex h-7 w-7 items-center justify-center rounded-md text-[14px] font-bold leading-none hover:bg-[var(--surface-2)]"
              style={{ color: "var(--text-muted)" }}>⋯</button>
      {open && (
        <div role="menu"
             className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-md border shadow-lg"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}
             onClick={(e) => e.stopPropagation()}>
          <Link href={`/platform/tenants/${row.tenantId}`} role="menuitem"
                className="block px-3 py-2 text-[12px] hover:bg-[var(--surface-2)]"
                style={{ color: "var(--text-default)" }}>
            Open in tenant detail
          </Link>
          <Link href={`/platform/billing/subscriptions/${row.tenantId}`} role="menuitem"
                className="block px-3 py-2 text-[12px] hover:bg-[var(--surface-2)]"
                style={{ color: "var(--text-default)" }}>
            Subscription detail
          </Link>
          {canEdit && (
            <Link href={`/platform/billing/subscriptions/${row.tenantId}#change-plan`} role="menuitem"
                  className="block px-3 py-2 text-[12px] hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--text-default)" }}>
              Change plan
            </Link>
          )}
          {canCoupon && (
            <Link href={`/platform/billing/subscriptions/${row.tenantId}#coupon`} role="menuitem"
                  className="block px-3 py-2 text-[12px] hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--text-default)" }}>
              Apply coupon
            </Link>
          )}
          {canEdit && row.status !== "paused" && (
            <button type="button" role="menuitem" onClick={onPause}
                    className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--text-default)" }}>
              Pause
            </button>
          )}
          {canEdit && row.status === "paused" && (
            <button type="button" role="menuitem" onClick={onResume}
                    className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--text-default)" }}>
              Resume
            </button>
          )}
          {canEdit && row.status === "canceled" && (
            <button type="button" role="menuitem" onClick={onReactivate}
                    className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--text-default)" }}>
              Reactivate
            </button>
          )}
          {canEdit && row.status !== "canceled" && (
            <>
              <button type="button" role="menuitem" onClick={() => onCancel("period_end")}
                      className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                      style={{ color: "var(--rose-700)" }}>
                Cancel at period end
              </button>
              <button type="button" role="menuitem" onClick={() => onCancel("now")}
                      className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                      style={{ color: "var(--rose-700)" }}>
                Cancel now
              </button>
            </>
          )}
          {row.stripeCustomerId && (
            <a href={`https://dashboard.stripe.com/customers/${row.stripeCustomerId}`}
               target="_blank" rel="noopener noreferrer"
               role="menuitem"
               className="block px-3 py-2 text-[12px] hover:bg-[var(--surface-2)]"
               style={{ color: "var(--text-default)" }}>
              Open in Stripe ↗
            </a>
          )}
        </div>
      )}
    </div>
  );
}
