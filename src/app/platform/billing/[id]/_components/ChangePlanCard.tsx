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
import { changeSubscriptionPlan } from "@/app/actions/platform-subscriptions";
import type { BillingCycle, Plan } from "@prisma/client";

interface PlanOption {
  slug: string;        // upper-cased
  name: string;
  priceMonthly: number;
  priceAnnual: number;
}

export function ChangePlanCard({
  tenantId,
  currentPlan,
  currentCycle,
  plans,
}: {
  tenantId: string;
  currentPlan: Plan;
  currentCycle: BillingCycle;
  plans: PlanOption[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [toPlan, setToPlan] = React.useState<string>(currentPlan);
  const [cycle, setCycle] = React.useState<BillingCycle>(currentCycle);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const fromPlan = plans.find((p) => p.slug === currentPlan);
  const toPlanRow = plans.find((p) => p.slug === toPlan);
  const fromMonthly = fromPlan ? (currentCycle === "ANNUAL" ? fromPlan.priceAnnual / 12 : fromPlan.priceMonthly) : 0;
  const toMonthly = toPlanRow ? (cycle === "ANNUAL" ? toPlanRow.priceAnnual / 12 : toPlanRow.priceMonthly) : 0;
  const delta = Math.round(toMonthly - fromMonthly);

  const onSubmit = async () => {
    if (toPlan === currentPlan && cycle === currentCycle) {
      toast.error("No change");
      return;
    }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("tenantId", tenantId);
      fd.set("toPlan", toPlan);
      fd.set("cycle", cycle);
      if (reason.trim()) fd.set("reason", reason.trim());
      const res = await changeSubscriptionPlan(fd);
      if (res.ok) { toast.success("Plan changed"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't change plan");
    } finally { setPending(false); }
  };

  return (
    <Card id="change-plan">
      <CardHeader title="Change plan"
                  description="Records a SubscriptionEvent + audit row. Stripe-side change isn't wired today." />
      <CardBody>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Select label="New plan" value={toPlan} onChange={(e) => setToPlan(e.target.value)}>
              {plans.map((p) => (
                <option key={p.slug} value={p.slug}>{p.name}</option>
              ))}
            </Select>
            <Select label="Cycle" value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)}>
              <option value="MONTHLY">Monthly</option>
              <option value="ANNUAL">Annual</option>
            </Select>
          </div>
          <div className="rounded-md border p-3 text-[12px]"
               style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
            <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
              Proration preview (rough)
            </div>
            <div className="mt-1 grid grid-cols-2 gap-2 text-[12px]">
              <div>
                <div style={{ color: "var(--text-muted)" }}>From</div>
                <div className="tabular-nums" style={{ color: "var(--text-default)" }}>
                  {fromPlan?.name} · ${Math.round(fromMonthly)}/mo
                </div>
              </div>
              <div>
                <div style={{ color: "var(--text-muted)" }}>To</div>
                <div className="tabular-nums" style={{ color: "var(--text-default)" }}>
                  {toPlanRow?.name} · ${Math.round(toMonthly)}/mo
                </div>
              </div>
              <div className="col-span-2 mt-1 flex justify-between">
                <span style={{ color: "var(--text-muted)" }}>MRR delta</span>
                <span className="tabular-nums font-semibold"
                      style={{ color: delta > 0 ? "var(--emerald-700)" : delta < 0 ? "var(--rose-700)" : "var(--text-default)" }}>
                  {delta > 0 ? "+" : ""}${delta}/mo
                </span>
              </div>
            </div>
          </div>
          <Textarea label="Reason (optional)" rows={2} value={reason}
                    onChange={(e) => setReason(e.target.value)} maxLength={500} />
          <div className="flex justify-end">
            <Button size="sm" onClick={onSubmit} disabled={pending || (toPlan === currentPlan && cycle === currentCycle)}>
              {pending ? "Saving…" : "Change plan"}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
