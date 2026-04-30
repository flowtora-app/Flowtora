"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { duplicateReport, deleteReport, setReportUserState, setReportShared } from "@/app/actions/reports";
import { useToast } from "@/components/ui";

// 3-dot menu shown on each report card in the library + the detail
// page header. Surfaces:
//   • Open  (link — handled by the parent card click)
//   • Duplicate    — fork prebuilt → custom Report
//   • Schedule     — opens the schedule modal on the detail page
//   • Share        — flips isShared on a custom Report
//   • Delete       — only for custom Reports owned by current user
// Built on a tiny popover with click-outside dismiss.

export interface ReportCardMenuProps {
  /** Either: prebuilt registry key OR custom Report id. */
  reportKey?: string;
  reportId?: string;
  /** When set, Share + Delete are visible. */
  isCustomOwnedByMe?: boolean;
  /** Current isShared flag (custom only). */
  isShared?: boolean;
  /** Optional custom name for menu header. */
  reportName?: string;
  /** When false, render the trigger but disable Schedule (used on
   *  PENDING reports where there's no data to email). */
  scheduleEnabled?: boolean;
}

export function ReportCardMenu({
  reportKey,
  reportId,
  isCustomOwnedByMe,
  isShared,
  reportName,
  scheduleEnabled = true,
}: ReportCardMenuProps) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const onDuplicate = async () => {
    if (!reportKey && !reportId) return;
    const fd = new FormData();
    fd.set("fromKey", reportKey ?? "");
    if (reportName) fd.set("name", `${reportName} (copy)`);
    try {
      await duplicateReport(fd);
      // duplicateReport redirects on success — if we get here it
      // didn't and probably failed. Toast a generic message.
    } catch {
      // Redirect throws by design in Next; swallow it.
    }
  };

  const onToggleShare = async () => {
    if (!reportId) return;
    const fd = new FormData();
    fd.set("reportId", reportId);
    fd.set("isShared", isShared ? "off" : "on");
    const res = await setReportShared(fd);
    if (!res.ok) toast.error(res.error ?? "Couldn't update sharing");
    else { toast.success(isShared ? "Made private" : "Shared with team"); router.refresh(); }
  };

  const onDelete = async () => {
    if (!reportId) return;
    if (!confirm("Delete this report? This can't be undone.")) return;
    const fd = new FormData();
    fd.set("reportId", reportId);
    try {
      await deleteReport(fd);
    } catch {
      // redirect
    }
  };

  const onTogglePin = async () => {
    if (!reportKey) return;
    const fd = new FormData();
    fd.set("reportKey", reportKey);
    fd.set("isPinned", "on"); // Toggle handled in detail header — here we just enable
    const res = await setReportUserState(fd);
    if (!res.ok) toast.error(res.error ?? "Couldn't pin");
    else { toast.success("Pinned"); router.refresh(); }
  };

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); setOpen((o) => !o); }}
        className="ts-focus inline-flex h-7 w-7 items-center justify-center rounded-md border text-[14px] font-bold leading-none"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", color: "var(--text-muted)" }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-44 overflow-hidden rounded-md border shadow-lg"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}
        >
          {reportKey && (
            <MenuButton onClick={onTogglePin}>📌 Pin</MenuButton>
          )}
          {reportKey && (
            <MenuButton
              onClick={onDuplicate}
              hint={!scheduleEnabled ? "Forks the prebuilt — you'll get a custom copy you can edit, schedule, and share." : undefined}
            >
              📄 Duplicate
            </MenuButton>
          )}
          {isCustomOwnedByMe && reportId && (
            <>
              <MenuButton onClick={onToggleShare}>{isShared ? "🔒 Make private" : "🔓 Share with team"}</MenuButton>
              <MenuDivider />
              <MenuButton onClick={onDelete} destructive>🗑 Delete</MenuButton>
            </>
          )}
          {!isCustomOwnedByMe && !reportKey && !reportId && (
            <div className="px-3 py-2 text-[11px]" style={{ color: "var(--text-faint)" }}>No actions</div>
          )}
        </div>
      )}
    </div>
  );
}

function MenuButton({ children, onClick, destructive, hint }: { children: React.ReactNode; onClick: () => void; destructive?: boolean; hint?: string }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      title={hint}
      className="ts-focus block w-full px-3 py-2 text-left text-[13px]"
      style={{
        color: destructive ? "var(--rose-700)" : "var(--text-default)",
        background: "transparent",
      }}
    >
      {children}
    </button>
  );
}

function MenuDivider() {
  return <div style={{ height: 1, background: "var(--border-subtle)" }} />;
}
