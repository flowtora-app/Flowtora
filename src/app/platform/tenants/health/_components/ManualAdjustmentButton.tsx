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
import { addManualHealthAdjustment } from "@/app/actions/health-scoring";

// ManualAdjustmentButton — CSM-only "+/- X for a reason" dialog. The
// delta is clamped server-side at +/- 50; UI clamps to the same range
// for snappy feedback.

export function ManualAdjustmentButton({
  tenantId,
  tenantName,
  currentScore,
  currentAdjustment,
}: {
  tenantId: string;
  tenantName: string;
  currentScore: number;
  currentAdjustment: number;
}) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const toast = useToast();
  const [delta, setDelta] = React.useState<number>(0);
  const [reason, setReason] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const reset = () => {
    setDelta(0);
    setReason("");
    setExpiresAt("");
  };

  const onOpen = () => { reset(); setOpen(true); };

  const onSubmit = async () => {
    if (delta === 0) { toast.error("Delta must be non-zero"); return; }
    if (reason.trim().length < 3) { toast.error("Reason is required"); return; }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("tenantId", tenantId);
      fd.set("delta", String(delta));
      fd.set("reason", reason.trim());
      if (expiresAt) fd.set("expiresAt", expiresAt);
      const res = await addManualHealthAdjustment(fd);
      if (res.ok) {
        toast.success("Adjustment applied");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn't apply");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't apply");
    } finally {
      setPending(false);
    }
  };

  const projected = Math.max(0, Math.min(100, currentScore + delta));

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="ts-focus inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-medium hover:bg-[var(--surface-2)]"
        style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}
      >
        Adjust
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm">
        <DialogHeader
          title={`Adjust ${tenantName}`}
          description={`Current score ${currentScore}${currentAdjustment !== 0 ? ` (incl. ${currentAdjustment > 0 ? "+" : ""}${currentAdjustment} adjustment)` : ""}.`}
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <div className="flex flex-col gap-3">
            <Input
              label="Delta (+/-)"
              type="number"
              min={-50}
              max={50}
              value={delta || ""}
              onChange={(e) => setDelta(Number(e.target.value) || 0)}
              hint={`Projected score: ${projected}. Clamped at +/- 50.`}
            />
            <Textarea
              label="Reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              hint="Required — visible in audit log and the tenant's health history."
              maxLength={500}
            />
            <Input
              label="Expires (optional)"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              hint="Leave blank to keep until manually cleared."
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={onSubmit} disabled={pending}>
            {pending ? "Applying…" : "Apply adjustment"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
