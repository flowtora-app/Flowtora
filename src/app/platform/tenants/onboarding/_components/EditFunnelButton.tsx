"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Input,
  Textarea,
  useToast,
} from "@/components/ui";
import { updateFunnelConfig } from "@/app/actions/onboarding-pipeline";
import type { FunnelSettings, StageDef, StageId } from "@/server/platform/onboarding-pipeline";

// EditFunnelButton — opens a modal where staff can adjust:
//   • Stuck threshold + critical days
//   • Nudge cadence
//   • Nudge subject + body (markdown-ish — escaped + rendered as <pre>)
//   • Per-stage WIP limit
// Submits via the updateFunnelConfig server action.

export function EditFunnelButton({
  settings,
  stages,
}: {
  settings: FunnelSettings;
  stages: StageDef[];
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);

  const [stuckThresholdDays, setStuck] = React.useState(settings.stuckThresholdDays);
  const [stuckCriticalDays, setCritical] = React.useState(settings.stuckCriticalDays);
  const [nudgeCadenceDays, setCadence] = React.useState(settings.nudgeCadenceDays);
  const [nudgeSubject, setSubject] = React.useState(settings.nudgeSubject);
  const [nudgeBody, setBody] = React.useState(settings.nudgeBody);
  const [wipLimits, setWipLimits] = React.useState<Partial<Record<StageId, number | null>>>(
    settings.wipLimits as Partial<Record<StageId, number | null>>,
  );

  const reset = () => {
    setStuck(settings.stuckThresholdDays);
    setCritical(settings.stuckCriticalDays);
    setCadence(settings.nudgeCadenceDays);
    setSubject(settings.nudgeSubject);
    setBody(settings.nudgeBody);
    setWipLimits(settings.wipLimits as Partial<Record<StageId, number | null>>);
  };

  const onOpen = () => { reset(); setOpen(true); };

  const onSubmit = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("stuckThresholdDays", String(stuckThresholdDays));
      fd.set("stuckCriticalDays", String(stuckCriticalDays));
      fd.set("nudgeCadenceDays", String(nudgeCadenceDays));
      fd.set("nudgeSubject", nudgeSubject);
      fd.set("nudgeBody", nudgeBody);
      // WIP limits — strip null/undefined/empty, keep numbers.
      const cleaned: Record<string, number> = {};
      for (const [k, v] of Object.entries(wipLimits)) {
        if (typeof v === "number" && !Number.isNaN(v) && v > 0) cleaned[k] = v;
      }
      fd.set("wipLimitsJson", JSON.stringify(cleaned));
      const res = await updateFunnelConfig(fd);
      if (res.ok) {
        toast.success("Funnel updated");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn't save");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={onOpen}>Edit funnel definition</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="lg">
        <DialogHeader title="Edit funnel definition"
                      description="Tune drop-off thresholds, nudge cadence, and WIP limits per stage."
                      onClose={() => setOpen(false)} />
        <DialogBody>
          <div className="flex flex-col gap-5">
            <section>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                Thresholds
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Input
                  label="Stuck threshold (days)"
                  type="number"
                  min={1}
                  max={365}
                  value={stuckThresholdDays}
                  onChange={(e) => setStuck(Number(e.target.value) || 1)}
                  hint="Days at one stage before yellow warning."
                />
                <Input
                  label="Critical (days)"
                  type="number"
                  min={1}
                  max={365}
                  value={stuckCriticalDays}
                  onChange={(e) => setCritical(Number(e.target.value) || 1)}
                  hint="Days before red — escalates to CSM."
                />
                <Input
                  label="Nudge cadence (days)"
                  type="number"
                  min={1}
                  max={60}
                  value={nudgeCadenceDays}
                  onChange={(e) => setCadence(Number(e.target.value) || 1)}
                  hint="Min days between drip emails."
                />
              </div>
            </section>

            <section>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                Nudge email copy
              </h3>
              <div className="flex flex-col gap-2">
                <Input
                  label="Subject line"
                  value={nudgeSubject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                />
                <Textarea
                  label="Body"
                  rows={8}
                  value={nudgeBody}
                  onChange={(e) => setBody(e.target.value)}
                  maxLength={8000}
                  hint="Plain text. Will be escaped and rendered in a <pre> block."
                />
              </div>
            </section>

            <section>
              <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                WIP limits per stage
              </h3>
              <p className="mb-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
                Optional max tenants per Kanban column. Leave blank for unlimited.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {stages.map((s) => (
                  <Input
                    key={s.id}
                    label={`${s.icon} ${s.label}`}
                    type="number"
                    min={1}
                    max={9999}
                    placeholder="∞"
                    value={wipLimits[s.id] ?? ""}
                    onChange={(e) => {
                      const v = e.target.value === "" ? null : Number(e.target.value);
                      setWipLimits((prev) => ({ ...prev, [s.id]: v }));
                    }}
                  />
                ))}
              </div>
            </section>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={onSubmit} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
