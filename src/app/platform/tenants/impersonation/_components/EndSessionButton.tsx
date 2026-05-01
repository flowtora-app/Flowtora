"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Textarea,
  useToast,
} from "@/components/ui";
import { forceEndImpersonationSession } from "@/app/actions/impersonation-admin";

// EndSessionButton — confirms before force-ending an active session.
// Reason is optional but appended to the session's notes for the
// audit trail.

export function EndSessionButton({
  sessionId,
  tenantName,
  isOwn,
}: {
  sessionId: string;
  tenantName: string;
  /** True when the current admin is ending their own session — UI
   *  copy softens since it's not a force-end then. */
  isOwn: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const toast = useToast();

  const onSubmit = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("sessionId", sessionId);
      if (reason.trim()) fd.set("reason", reason.trim());
      const res = await forceEndImpersonationSession(fd);
      if (res.ok) {
        toast.success(isOwn ? "Session ended" : "Session force-ended");
        setOpen(false);
        router.refresh();
      } else toast.error(res.error ?? "Couldn't end session");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't end session");
    } finally { setPending(false); }
  };

  return (
    <>
      <Button size="xs" variant="destructive" onClick={() => setOpen(true)}>
        End now
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm">
        <DialogHeader
          title={isOwn ? "End your session" : `Force-end session for ${tenantName}`}
          description={isOwn
            ? "Closes the impersonation cookie for this browser only — already-logged actions stay in the audit trail."
            : "Logs the impersonator out and stamps endedReason=FORCE_ENDED. Use when a session has overshot or shouldn't continue."}
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <Textarea
            label="Reason (optional, appended to session notes)"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder={isOwn ? "" : "e.g. session has been idle for 45 minutes"}
          />
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button size="sm" variant="destructive" onClick={onSubmit} disabled={pending}>
            {pending ? "Ending…" : "End session"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
