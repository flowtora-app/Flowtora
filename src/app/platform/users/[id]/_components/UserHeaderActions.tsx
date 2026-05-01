"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";
import {
  deactivateUser,
  forcePasswordReset,
  resetUserMfa,
  signOutAllSessions,
} from "@/app/actions/platform-users";

// UserHeaderActions — header-level 3-dot equivalent, exploded into a
// compact row of icon-buttons. Mirrors the row menu's actions but
// stays visible on the detail page so an admin doesn't have to bounce
// back to the list.

export function UserHeaderActions({
  userId,
  userName,
  isDeactivated,
}: {
  userId: string;
  userName: string;
  isDeactivated: boolean;
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
    successMsg: string,
  ) => {
    if (busy) return;
    setBusy(true);
    setOpen(false);
    try {
      const fd = new FormData();
      fd.set("userId", userId);
      const res = await action(fd);
      if (res.ok) { toast.success(successMsg); router.refresh(); }
      else toast.error(res.error ?? "Couldn't run action");
    } finally { setBusy(false); }
  };

  const onDeactivateToggle = async () => {
    setBusy(true);
    setOpen(false);
    try {
      const fd = new FormData();
      fd.set("userId", userId);
      fd.set("toggle", isDeactivated ? "off" : "on");
      if (!isDeactivated) {
        const reason = window.prompt(`Deactivate ${userName}? Reason (optional):`, "");
        if (reason === null) { setBusy(false); return; }
        if (reason.trim()) fd.set("reason", reason.trim());
      }
      const res = await deactivateUser(fd);
      if (res.ok) { toast.success(isDeactivated ? "Reactivated" : "Deactivated"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't update");
    } finally { setBusy(false); }
  };

  return (
    <div ref={ref} className="relative inline-block">
      <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} disabled={busy}>
        Actions ⋯
      </Button>
      {open && (
        <div role="menu"
             className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-md border shadow-lg"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}>
          <button type="button" role="menuitem"
                  onClick={() => runAction(forcePasswordReset, "Reset link minted")}
                  className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--text-default)" }}>
            Force password reset
          </button>
          <button type="button" role="menuitem"
                  onClick={() => runAction(resetUserMfa, "MFA reset")}
                  className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--text-default)" }}>
            Reset MFA
          </button>
          <button type="button" role="menuitem"
                  onClick={() => runAction(signOutAllSessions, "Signed out everywhere")}
                  className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--text-default)" }}>
            Sign out all sessions
          </button>
          <button type="button" role="menuitem"
                  onClick={onDeactivateToggle}
                  className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                  style={{ color: isDeactivated ? "var(--text-default)" : "var(--rose-700)" }}>
            {isDeactivated ? "Reactivate" : "Deactivate"}
          </button>
        </div>
      )}
    </div>
  );
}
