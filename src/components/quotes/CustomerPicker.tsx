"use client";

import * as React from "react";
import { Icon } from "@/components/shell/icons";

// CustomerPicker — searchable typeahead for the new-quote form.
//
// Why not a generic Combobox primitive: the only consumer right now is
// the new-quote screen. The interaction is narrow (pick one, write id
// into a hidden field) and the list is already loaded by the server
// component — no async fetch to coordinate. When a second caller shows
// up with the same needs, promote this to `components/ui/Combobox.tsx`.
//
// Why filter client-side: shops with very large customer lists would
// need a server-side search, but the current list page + template
// picker both rely on the full list being hydrated, so the cost is
// already paid upstream. Doing the filter in-browser keeps the picker
// snappy without a new endpoint.

export interface CustomerOption {
  id: string;
  name: string;
  email: string | null;
}

interface CustomerPickerProps {
  name: string;
  customers: CustomerOption[];
  defaultCustomerId?: string;
  required?: boolean;
}

export function CustomerPicker({
  name,
  customers,
  defaultCustomerId,
  required,
}: CustomerPickerProps) {
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(
    defaultCustomerId ?? null,
  );
  const [open, setOpen] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const selected = customers.find((c) => c.id === selectedId) ?? null;

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers.slice(0, 12);
    return customers
      .filter((c) => {
        return (
          c.name.toLowerCase().includes(q) ||
          (c.email?.toLowerCase().includes(q) ?? false)
        );
      })
      .slice(0, 20);
  }, [query, customers]);

  // Reset highlight whenever the filtered set changes so it lines up
  // with the newly-visible first row.
  React.useEffect(() => {
    setHighlight(0);
  }, [query]);

  function commitSelection(customer: CustomerOption) {
    setSelectedId(customer.id);
    setQuery("");
    setOpen(false);
    // Drop focus after picking so the outer form keyboard flow can
    // advance to the next field.
    inputRef.current?.blur();
  }

  function clearSelection() {
    setSelectedId(null);
    setQuery("");
    setOpen(true);
    inputRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      if (filtered[highlight]) {
        e.preventDefault();
        commitSelection(filtered[highlight]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <input
        type="hidden"
        name={name}
        value={selectedId ?? ""}
        required={required}
      />

      {selected ? (
        <SelectedCustomerCard customer={selected} onClear={clearSelection} />
      ) : (
        <div className="relative">
          <div
            className="flex items-center gap-2 rounded-md px-3"
            style={{
              background: "var(--surface-0)",
              border: "1px solid var(--border-default)",
            }}
          >
            <Icon.Search size={14} />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-autocomplete="list"
              autoComplete="off"
              placeholder="Search customers by name, company, or email"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => {
                // Delay so a click on a result registers before the list
                // unmounts.
                window.setTimeout(() => setOpen(false), 120);
              }}
              onKeyDown={onKeyDown}
              className="h-10 flex-1 bg-transparent text-sm outline-none"
              style={{ color: "var(--text-default)" }}
            />
          </div>

          {open && (
            <ul
              ref={listRef}
              role="listbox"
              className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-y-auto rounded-md text-sm"
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border-default)",
                boxShadow: "var(--shadow-md)",
              }}
            >
              {filtered.length === 0 ? (
                <li
                  className="px-3 py-3 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  No matches. Try a different spelling, or create a new
                  customer first.
                </li>
              ) : (
                filtered.map((c, idx) => (
                  <li
                    key={c.id}
                    role="option"
                    aria-selected={idx === highlight}
                    onMouseEnter={() => setHighlight(idx)}
                    onMouseDown={(e) => {
                      // Prevent blur from firing before click registers.
                      e.preventDefault();
                      commitSelection(c);
                    }}
                    className="cursor-pointer px-3 py-2"
                    style={{
                      background:
                        idx === highlight ? "var(--surface-3)" : "transparent",
                    }}
                  >
                    <div
                      className="font-medium"
                      style={{ color: "var(--text-default)" }}
                    >
                      {c.name}
                    </div>
                    {c.email && (
                      <div
                        className="truncate text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {c.email}
                      </div>
                    )}
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function SelectedCustomerCard({
  customer,
  onClear,
}: {
  customer: CustomerOption;
  onClear: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-md px-3 py-2.5"
      style={{
        background: "var(--accent-surface)",
        border: "1px solid var(--accent-primary)",
      }}
    >
      <div
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
        style={{
          background: "var(--accent-primary)",
          color: "var(--accent-fg)",
        }}
      >
        {customer.name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="truncate text-sm font-medium"
          style={{ color: "var(--text-default)" }}
        >
          {customer.name}
        </div>
        {customer.email && (
          <div
            className="truncate text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            {customer.email}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="ts-focus text-xs underline"
        style={{ color: "var(--text-muted)" }}
      >
        Change
      </button>
    </div>
  );
}
