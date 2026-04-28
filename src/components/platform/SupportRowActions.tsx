"use client";

import * as React from "react";
import Link from "next/link";
import { updateSupportTicketAsStaff } from "@/app/actions/platform";

// Per-row "⋯" menu for the support queue.
//
//   ┌──────────────────────────────────────┐
//   │ Open detail                           │
//   │ ──────────────────────────────────── │
//   │ Assign to me                          │
//   │ ──────────────────────────────────── │
//   │ Mark in progress                      │
//   │ Mark waiting on customer              │
//   │ Mark resolved                         │
//   │ ──────────────────────────────────── │
//   │ Set priority — High                   │
//   │ Set priority — Urgent                 │
//   └──────────────────────────────────────┘
//
// All mutating items submit a tiny <form action={updateSupportTicketAsStaff}>
// with the relevant hidden fields (status / priority / assignedTo). The
// underlying server action requires platformAdmin; non-admin staff see the
// menu disabled.

type StatusValue = "OPEN" | "IN_PROGRESS" | "WAITING_CUSTOMER" | "RESOLVED" | "CLOSED";
type PriorityValue = "LOW" | "NORMAL" | "HIGH" | "URGENT";

interface SupportRowActionsProps {
  ticketId: string;
  currentStatus: StatusValue;
  currentPriority: PriorityValue;
  /** True when this ticket is already assigned to the current viewer. */
  alreadyMine: boolean;
  /** True when the viewer is a platformAdmin (can mutate). */
  canMutate: boolean;
  /** Current user's id — set as the assignedTo target on "Assign to me". */
  currentUserId: string;
}

const STATUS_TRANSITIONS: { value: StatusValue; label: string; tone?: "warning" | "success" }[] = [
  { value: "IN_PROGRESS",      label: "Mark in progress" },
  { value: "WAITING_CUSTOMER", label: "Mark waiting on customer" },
  { value: "RESOLVED",         label: "Mark resolved", tone: "success" },
];

const PRIORITY_BUMPS: { value: PriorityValue; label: string; tone: "warning" | "danger" }[] = [
  { value: "HIGH",   label: "Set priority — High",   tone: "warning" },
  { value: "URGENT", label: "Set priority — Urgent", tone: "danger"  },
];

export function SupportRowActions({
  ticketId,
  currentStatus,
  currentPriority,
  alreadyMine,
  canMutate,
  currentUserId,
}: SupportRowActionsProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const action = updateSupportTicketAsStaff.bind(null, ticketId);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      ref={ref}
      className="relative inline-block"
      // Block the surrounding row link from grabbing clicks meant for the menu.
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        aria-label="Ticket actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="ts-focus inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors"
        style={{
          background: open ? "var(--surface-2)" : "transparent",
          color: "var(--text-muted)",
          border: `1px solid ${open ? "var(--border-default)" : "transparent"}`,
        }}
      >
        <svg width={14} height={14} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-md py-1 text-sm"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <Link
            href={`/platform/support/${ticketId}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 transition-colors hover:opacity-80"
            style={{ color: "var(--text-default)" }}
          >
            Open detail
          </Link>

          <Divider />

          <form action={action}>
            <input type="hidden" name="assignedTo" value={currentUserId} />
            <button
              type="submit"
              role="menuitem"
              disabled={alreadyMine || !canMutate}
              onClick={() => setOpen(false)}
              className="block w-full px-3 py-2 text-left transition-colors hover:opacity-80 disabled:opacity-50"
              style={{ color: "var(--text-default)" }}
              title={!canMutate ? "Requires admin role" : alreadyMine ? "Already assigned to you" : ""}
            >
              {alreadyMine ? "Assigned to you" : "Assign to me"}
            </button>
          </form>

          <Divider />

          {STATUS_TRANSITIONS.map((opt) => {
            const isCurrent = opt.value === currentStatus;
            const color =
              opt.tone === "success" ? "var(--success-fg)" :
              opt.tone === "warning" ? "var(--warning-fg)" :
                                        "var(--text-default)";
            return (
              <form key={opt.value} action={action}>
                <input type="hidden" name="status" value={opt.value} />
                <button
                  type="submit"
                  role="menuitem"
                  disabled={isCurrent || !canMutate}
                  onClick={() => setOpen(false)}
                  className="block w-full px-3 py-2 text-left transition-colors hover:opacity-80 disabled:opacity-50"
                  style={{ color }}
                  title={!canMutate ? "Requires admin role" : ""}
                >
                  {opt.label}
                </button>
              </form>
            );
          })}

          <Divider />

          {PRIORITY_BUMPS.map((opt) => {
            const isCurrent = opt.value === currentPriority;
            const color = opt.tone === "danger" ? "var(--danger-fg)" : "var(--warning-fg)";
            return (
              <form key={opt.value} action={action}>
                <input type="hidden" name="priority" value={opt.value} />
                <button
                  type="submit"
                  role="menuitem"
                  disabled={isCurrent || !canMutate}
                  onClick={() => setOpen(false)}
                  className="block w-full px-3 py-2 text-left transition-colors hover:opacity-80 disabled:opacity-50"
                  style={{ color }}
                  title={!canMutate ? "Requires admin role" : ""}
                >
                  {opt.label}
                </button>
              </form>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Divider() {
  return (
    <div
      aria-hidden
      className="my-1 h-px"
      style={{ background: "var(--border-subtle)" }}
    />
  );
}
