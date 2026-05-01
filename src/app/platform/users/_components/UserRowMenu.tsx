"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui";
import {
  deactivateUser,
  forcePasswordReset,
  resetUserMfa,
  signOutAllSessions,
} from "@/app/actions/platform-users";

// UserRowMenu — per-row 3-dot menu. Spec calls for:
// View profile · Impersonate · Reset password · Reset MFA ·
// Sign out all sessions · Deactivate · Send email · Copy ID.
//
// Impersonate is per-tenant, not per-user — the user belongs to one
// or more tenants, and our impersonation is tenant-scoped. We send
// the admin to the user's profile page where they can pick a tenant.

export function UserRowMenu({
  userId,
  userName,
  userEmail,
  canImpersonate,
  canBan,
  isDeactivated,
}: {
  userId: string;
  userName: string;
  userEmail: string;
  canImpersonate: boolean;
  canBan: boolean;
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

  const onCopy = async () => {
    setOpen(false);
    try {
      await navigator.clipboard.writeText(userId);
      toast.success("User ID copied");
    } catch {
      toast.error("Couldn't copy");
    }
  };

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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't run action");
    } finally { setBusy(false); }
  };

  const onDeactivateToggle = async () => {
    if (busy) return;
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
      <button type="button"
              aria-label={`Actions for ${userName}`}
              onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
              className="ts-focus inline-flex h-7 w-7 items-center justify-center rounded-md text-[14px] font-bold leading-none hover:bg-[var(--surface-2)]"
              style={{ color: "var(--text-muted)" }}>⋯</button>
      {open && (
        <div role="menu"
             className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-md border shadow-lg"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}
             onClick={(e) => e.stopPropagation()}>
          <Link href={`/platform/users/${userId}`} role="menuitem"
                className="block px-3 py-2 text-[12px] hover:bg-[var(--surface-2)]"
                style={{ color: "var(--text-default)" }}>
            View profile
          </Link>
          {canImpersonate && (
            <Link href={`/platform/users/${userId}#tenants`} role="menuitem"
                  className="block px-3 py-2 text-[12px] hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--text-default)" }}>
              Impersonate (pick tenant)
            </Link>
          )}
          {canBan && (
            <button type="button" role="menuitem" disabled={busy}
                    onClick={() => runAction(forcePasswordReset, "Reset link minted")}
                    className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--text-default)" }}>
              Force password reset
            </button>
          )}
          {canBan && (
            <button type="button" role="menuitem" disabled={busy}
                    onClick={() => runAction(resetUserMfa, "MFA reset")}
                    className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--text-default)" }}>
              Reset MFA
            </button>
          )}
          {canBan && (
            <button type="button" role="menuitem" disabled={busy}
                    onClick={() => runAction(signOutAllSessions, "Signed out everywhere")}
                    className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                    style={{ color: "var(--text-default)" }}>
              Sign out all sessions
            </button>
          )}
          {canBan && (
            <button type="button" role="menuitem" disabled={busy}
                    onClick={onDeactivateToggle}
                    className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                    style={{ color: isDeactivated ? "var(--text-default)" : "var(--rose-700)" }}>
              {isDeactivated ? "Reactivate" : "Deactivate"}
            </button>
          )}
          <a href={`mailto:${userEmail}`} role="menuitem"
             className="block px-3 py-2 text-[12px] hover:bg-[var(--surface-2)]"
             style={{ color: "var(--text-default)" }}>
            Send email
          </a>
          <button type="button" role="menuitem" onClick={onCopy}
                  className="block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
                  style={{ color: "var(--text-default)" }}>
            Copy user ID
          </button>
        </div>
      )}
    </div>
  );
}
