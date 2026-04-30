"use client";

import * as React from "react";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, Textarea, useToast } from "@/components/ui";
import { startImpersonation } from "@/app/actions/platform";

// Impersonate-with-reason modal trigger. The server action is
// `startImpersonation(tenantId, formData)` — gated by
// requirePlatformAdmin, so SUPPORT_AGENT / READ_ONLY_VIEWER won't
// see this button (the parent's `canImpersonate` flag controls
// rendering). Successful impersonation redirects to the tenant's
// dashboard inside the impersonation session.

export interface TenantImpersonateButtonProps {
  tenantId: string;
  tenantName: string;
  /** Visual size — matches design-system Button sizes. */
  size?: "xs" | "sm" | "md";
  /** When false the trigger renders a disabled button with a
   *  tooltip explaining why. */
  enabled?: boolean;
  variant?: "primary" | "secondary" | "ghost";
}

export function TenantImpersonateButton({
  tenantId,
  tenantName,
  size = "sm",
  enabled = true,
  variant = "primary",
}: TenantImpersonateButtonProps) {
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);

  if (!enabled) {
    return (
      <Button size={size} variant={variant} disabled title="Your role doesn't have impersonation permission.">
        Impersonate
      </Button>
    );
  }

  const onSubmit = async () => {
    if (pending) return;
    setPending(true);
    const fd = new FormData();
    if (reason.trim()) fd.set("reason", reason.trim());
    try {
      await startImpersonation(tenantId, fd);
      // startImpersonation throws a redirect on success; control
      // never returns here on the happy path.
    } catch (err) {
      const isRedirect = err instanceof Error && err.message === "NEXT_REDIRECT";
      if (isRedirect) return; // expected — Next handles it
      setPending(false);
      toast.error(err instanceof Error ? err.message : "Couldn't start impersonation");
    }
  };

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        Impersonate
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm">
        <DialogHeader
          title={`Impersonate ${tenantName}`}
          description="You'll be signed into the tenant's app as a synthetic OWNER. Every action you take is recorded in the audit log under your platform account."
        />
        <DialogBody>
          <Textarea
            label="Reason (optional but encouraged)"
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            rows={3}
            placeholder="e.g. Reproducing a customer-reported bug on quote #42 · ticket SUP-123"
            autoFocus
          />
          <div className="mt-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
            Tip — pasting the support ticket id makes the audit trail cross-reference cleanly later.
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={pending} onClick={onSubmit}>Sign in as tenant</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
