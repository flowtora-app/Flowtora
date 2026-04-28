"use client";

import * as React from "react";
import Link from "next/link";
import { assignLeadToMe, changeLeadStatus } from "@/app/actions/leads";

// Per-row "⋯" actions menu for the leads inbox.
//
//   ┌──────────────────────────┐
//   │ Open detail              │
//   │ ───────────────────────  │
//   │ Assign to me             │
//   │ ───────────────────────  │
//   │ Mark contacted           │
//   │ Mark qualified           │
//   │ Mark converted           │
//   │ ───────────────────────  │
//   │ Mark spam                │
//   └──────────────────────────┘
//
// Each entry that mutates state submits a tiny form to a server
// action — assignLeadToMe or changeLeadStatus. Closes on outside
// click + Escape.

interface LeadRowActionsProps {
  leadId: string;
  /** Current status — used to dim the no-op options. */
  currentStatus: string;
  /** Whether this lead is already assigned to the current viewer. */
  alreadyMine: boolean;
}

const STATUS_OPTIONS: { value: string; label: string; tone?: "warning" | "danger" }[] = [
  { value: "CONTACTED",    label: "Mark contacted"     },
  { value: "QUALIFIED",    label: "Mark qualified"     },
  { value: "CONVERTED",    label: "Mark converted"     },
  { value: "DISQUALIFIED", label: "Mark disqualified", tone: "warning" },
  { value: "SPAM",         label: "Mark as spam",       tone: "danger" },
];

export function LeadRowActions({
  leadId,
  currentStatus,
  alreadyMine,
}: LeadRowActionsProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

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
      // Stop the surrounding row link from intercepting clicks on the menu.
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          setOpen((o) => !o);
        }}
        aria-label="Lead actions"
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
          className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-md py-1 text-sm"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-default)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <Link
            href={`/platform/leads/${leadId}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 transition-colors hover:opacity-80"
            style={{ color: "var(--text-default)" }}
          >
            Open full detail
          </Link>

          <Divider />

          <form action={() => assignLeadToMe(leadId)}>
            <button
              type="submit"
              role="menuitem"
              disabled={alreadyMine}
              onClick={() => setOpen(false)}
              className="block w-full px-3 py-2 text-left transition-colors hover:opacity-80 disabled:opacity-50"
              style={{ color: "var(--text-default)" }}
            >
              {alreadyMine ? "Assigned to you" : "Assign to me"}
            </button>
          </form>

          <Divider />

          {STATUS_OPTIONS.map((opt) => {
            const isCurrent = opt.value === currentStatus;
            const action = changeLeadStatus.bind(null, leadId);
            const tone = opt.tone === "danger"
              ? "var(--danger-fg)"
              : opt.tone === "warning"
              ? "var(--warning-fg)"
              : "var(--text-default)";
            return (
              <form key={opt.value} action={action}>
                <input type="hidden" name="status" value={opt.value} />
                <button
                  type="submit"
                  role="menuitem"
                  disabled={isCurrent}
                  onClick={() => setOpen(false)}
                  className="block w-full px-3 py-2 text-left transition-colors hover:opacity-80 disabled:opacity-50"
                  style={{ color: tone }}
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
