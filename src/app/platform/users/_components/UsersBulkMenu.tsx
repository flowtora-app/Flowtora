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
import { bulkEnforceMfa } from "@/app/actions/platform-users";

// UsersBulkMenu — header-level bulk action: "Bulk MFA enforce".
// The spec also lists a 3-dot menu (force-password-reset, reset MFA,
// sign-out-all) but those are inherently per-user; we surface them
// inline on the row 3-dot. The bulk MFA flips Tenant.mfaEnforced for
// every (or selected) tenant, which forces every member into the
// 2FA setup flow on next sign-in.

export function UsersBulkMenu({
  tenantOptions,
}: {
  tenantOptions: { id: string; label: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const toast = useToast();

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const onSubmit = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      if (selected.size > 0) fd.set("tenantIds", Array.from(selected).join(","));
      const res = await bulkEnforceMfa(fd);
      if (res.ok) {
        toast.success(`MFA enforced on ${res.count} tenant${res.count === 1 ? "" : "s"}`);
        setOpen(false);
        setSelected(new Set());
        router.refresh();
      } else toast.error(res.error ?? "Couldn't enforce");
    } finally { setPending(false); }
  };

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Bulk MFA enforce
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader
          title="Enforce MFA"
          description="Flips Tenant.mfaEnforced. Members are required to complete the 2FA setup flow on next sign-in."
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <p className="mb-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
            Leave empty to enforce for <strong>every</strong> tenant. Pick specific tenants to scope the change.
          </p>
          <div className="max-h-[40vh] overflow-y-auto rounded-md border"
               style={{ borderColor: "var(--border-subtle)" }}>
            {tenantOptions.length === 0 ? (
              <div className="p-4 text-center text-[12px]" style={{ color: "var(--text-faint)" }}>
                No tenants.
              </div>
            ) : tenantOptions.map((t) => (
              <label key={t.id} className="flex items-center gap-2 border-b px-3 py-2 text-[12px] last:border-0 hover:bg-[var(--surface-2)]"
                     style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                {t.label}
              </label>
            ))}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={onSubmit} disabled={pending}>
            {pending ? "Saving…"
              : selected.size === 0 ? "Enforce on every tenant"
              : `Enforce on ${selected.size} tenant${selected.size === 1 ? "" : "s"}`}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
