"use client";

// Page 33 — bulk actions bar.
//
// Renders inline above the ticket list when ≥1 ticket is selected.
// Reads selection state from a shared <SelectionContext> the table
// rows write to.

import * as React from "react";
import { useFormStatus } from "react-dom";
import {
  bulkAssignTickets,
  bulkStatusTickets,
  bulkPriorityTickets,
} from "@/app/actions/platform-support-bulk";

export type SelectionContextValue = {
  selected: Set<string>;
  setSelected: React.Dispatch<React.SetStateAction<Set<string>>>;
  toggle: (id: string) => void;
  clear: () => void;
};

export const SelectionContext = React.createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const toggle = React.useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const clear = React.useCallback(() => setSelected(new Set()), []);
  const value = React.useMemo(() => ({ selected, setSelected, toggle, clear }), [selected, toggle, clear]);
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionContextValue {
  const ctx = React.useContext(SelectionContext);
  if (!ctx) throw new Error("useSelection must be used within SelectionProvider");
  return ctx;
}

export function TicketCheckbox({ id }: { id: string }) {
  const { selected, toggle } = useSelection();
  const checked = selected.has(id);
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => {
        e.stopPropagation();
        toggle(id);
      }}
      onClick={(e) => e.stopPropagation()}
      aria-label={`Select ticket ${id.slice(0, 6)}`}
      className="ts-focus h-3.5 w-3.5 cursor-pointer"
    />
  );
}

export function BulkActionsBar({
  staff,
  returnTo,
}: {
  staff: { id: string; label: string }[];
  /** URL with ? and any active filter, e.g. /platform/operations/tickets?view=open */
  returnTo: string;
}) {
  const { selected, clear } = useSelection();
  if (selected.size === 0) return null;
  const ids = Array.from(selected).join(",");

  return (
    <div
      className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 shadow-md"
      style={{
        background: "var(--surface-1)",
        borderColor: "var(--accent-primary)",
        boxShadow: "var(--shadow-md, 0 4px 12px rgba(0,0,0,0.06))",
      }}
    >
      <span className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        {selected.size} selected
      </span>
      <button
        type="button"
        onClick={clear}
        className="text-[11px] underline"
        style={{ color: "var(--text-muted)" }}
      >
        clear
      </button>

      <span className="mx-1 h-4 w-px" style={{ background: "var(--border-subtle)" }} />

      {/* Assign */}
      <form action={bulkAssignTickets} className="flex items-center gap-1">
        <input type="hidden" name="ticketIds" value={ids} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <select
          name="assignedTo"
          defaultValue=""
          required
          className="ts-focus rounded-md px-2 py-1 text-[11px] outline-none"
          style={inputStyle()}
        >
          <option value="" disabled>Assign to…</option>
          <option value="__unassign__">Unassign</option>
          {staff.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
        </select>
        <SubmitChip>Apply</SubmitChip>
      </form>

      {/* Status */}
      <form action={bulkStatusTickets} className="flex items-center gap-1">
        <input type="hidden" name="ticketIds" value={ids} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <select
          name="status"
          defaultValue=""
          required
          className="ts-focus rounded-md px-2 py-1 text-[11px] outline-none"
          style={inputStyle()}
        >
          <option value="" disabled>Set status…</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="WAITING_CUSTOMER">Waiting customer</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
        <SubmitChip>Apply</SubmitChip>
      </form>

      {/* Priority */}
      <form action={bulkPriorityTickets} className="flex items-center gap-1">
        <input type="hidden" name="ticketIds" value={ids} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <select
          name="priority"
          defaultValue=""
          required
          className="ts-focus rounded-md px-2 py-1 text-[11px] outline-none"
          style={inputStyle()}
        >
          <option value="" disabled>Set priority…</option>
          <option value="URGENT">Urgent</option>
          <option value="HIGH">High</option>
          <option value="NORMAL">Normal</option>
          <option value="LOW">Low</option>
        </select>
        <SubmitChip>Apply</SubmitChip>
      </form>
    </div>
  );
}

function SubmitChip({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="ts-focus rounded-md px-2 py-1 text-[10px] font-semibold"
      style={{
        background: "var(--accent-primary)",
        color: "var(--accent-fg)",
        opacity: pending ? 0.6 : 1,
      }}
    >
      {pending ? "…" : children}
    </button>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-default)",
  };
}
