"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  cancelSubscription,
  pauseSubscription,
  reactivateSubscription,
  resumeSubscription,
} from "@/app/actions/platform-subscriptions";
import type { SubscriptionStatus } from "@/server/platform/subscriptions";

export function CancelCard({
  tenantId,
  status,
}: {
  tenantId: string;
  status: SubscriptionStatus;
}) {
  const router = useRouter();
  const toast = useToast();
  const [reason, setReason] = React.useState("");
  const [when, setWhen] = React.useState<"now" | "period_end">("period_end");
  const [pauseDays, setPauseDays] = React.useState(30);
  const [pending, setPending] = React.useState(false);

  const runFd = async (action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>, fd: FormData, msg: string) => {
    setPending(true);
    try {
      const res = await action(fd);
      if (res.ok) { toast.success(msg); router.refresh(); }
      else toast.error(res.error ?? "Couldn't run action");
    } finally { setPending(false); }
  };

  const onCancel = () => {
    if (!window.confirm(`Cancel ${when === "now" ? "immediately" : "at period end"}?`)) return;
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("when", when);
    if (reason.trim()) fd.set("reason", reason.trim());
    return runFd(cancelSubscription, fd, "Cancellation queued");
  };
  const onPause = () => {
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("pausedUntil", new Date(Date.now() + pauseDays * 86_400_000).toISOString());
    if (reason.trim()) fd.set("reason", reason.trim());
    return runFd(pauseSubscription, fd, "Paused");
  };
  const onResume = () => {
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    return runFd(resumeSubscription, fd, "Resumed");
  };
  const onReactivate = () => {
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    return runFd(reactivateSubscription, fd, "Reactivated");
  };

  return (
    <Card style={{ borderColor: "var(--rose-200)" }}>
      <CardHeader title="Lifecycle"
                  description="Cancel + pause + reactivate. All write a SubscriptionEvent + audit row." />
      <CardBody>
        <div className="flex flex-col gap-3">
          {status === "canceled" ? (
            <Button size="sm" onClick={onReactivate} disabled={pending}>
              {pending ? "Reactivating…" : "Reactivate"}
            </Button>
          ) : status === "paused" ? (
            <Button size="sm" variant="secondary" onClick={onResume} disabled={pending}>
              {pending ? "Resuming…" : "Resume"}
            </Button>
          ) : (
            <>
              <Textarea label="Reason (optional)" rows={2} value={reason}
                        onChange={(e) => setReason(e.target.value)} maxLength={500} />

              <div className="rounded-md border p-3" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide"
                     style={{ color: "var(--text-faint)" }}>Pause</div>
                <div className="flex items-end gap-2">
                  <input type="number" min={1} max={365}
                         value={pauseDays}
                         onChange={(e) => setPauseDays(Number(e.target.value) || 30)}
                         className="ts-focus h-8 w-24 rounded-md border px-2 text-[12px]"
                         style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }} />
                  <span className="pb-1 text-[11px]" style={{ color: "var(--text-muted)" }}>days</span>
                  <Button size="sm" variant="secondary" onClick={onPause} disabled={pending} className="ml-auto">
                    Pause
                  </Button>
                </div>
              </div>

              <div className="rounded-md border p-3"
                   style={{ borderColor: "var(--rose-200)", background: "var(--rose-50)" }}>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide"
                     style={{ color: "var(--rose-700)" }}>Cancel</div>
                <div className="flex items-end gap-2">
                  <Select size="sm" value={when}
                          onChange={(e) => setWhen(e.target.value as "now" | "period_end")}
                          containerClassName="flex-1">
                    <option value="period_end">At period end</option>
                    <option value="now">Now (immediate)</option>
                  </Select>
                  <Button size="sm" variant="destructive" onClick={onCancel} disabled={pending}>
                    Cancel subscription
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
