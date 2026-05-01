"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  useToast,
} from "@/components/ui";
import { enrolInNudgeSequence } from "@/app/actions/onboarding-pipeline";

// SendNudgeCampaignButton — bulk-enrolls every currently-stuck tenant
// into the onboarding nudge drip. The cron worker (registered in
// vercel.json) will then send a nudge every `nudgeCadenceDays` to each
// enrolled tenant until they advance or the admin removes them.

export function SendNudgeCampaignButton({
  stuckTenantIds,
  stuckCount,
}: {
  stuckTenantIds: string[];
  stuckCount: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const toast = useToast();

  const onConfirm = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("tenantIds", stuckTenantIds.join(","));
      const res = await enrolInNudgeSequence(fd);
      if (res.ok) {
        toast.success(`Enrolled ${res.count} tenant${res.count === 1 ? "" : "s"}`);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn't enrol");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't enrol");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Send nudge campaign
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm">
        <DialogHeader
          title="Send nudge campaign"
          description={`Enrol ${stuckCount} stuck tenant${stuckCount === 1 ? "" : "s"} in the onboarding drip.`}
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Each tenant&apos;s OWNER receives the nudge email immediately, and the daily
            cron continues to send a follow-up every <span className="font-semibold">N days</span> until
            they advance to the next stage or you remove them.
          </p>
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-faint)" }}>
            Already-enrolled tenants are kept enrolled (no double-emailing — the cron de-dupes
            by stamping <code className="font-mono">lastOnboardingNudgeAt</code> after each send).
          </p>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={onConfirm} disabled={pending}>
            {pending ? "Enrolling…" : `Enrol ${stuckCount}`}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
