"use client";

import * as React from "react";

// Live filter for the master feature library catalog.
//
// The catalog is server-rendered: every feature row carries
//   data-feature-row data-feature-haystack="..."
// and each group section carries
//   data-feature-group
// This client component reads the search input, walks the DOM, and
// toggles `display`. Group cards collapse to nothing when none of
// their rows match. Filter chips for valueType / enforcement work
// the same way — combined with text search using AND logic.
//
// ⌘F focuses the in-page filter (overrides browser find), Esc clears.

export type ValueTypeFilter = "all" | "BOOLEAN" | "NUMBER" | "TEXT";
export type EnforcementFilter = "all" | "GATE" | "MARKETING_ONLY";

export function FeatureLibraryFilterBar({
  totalCount,
}: {
  totalCount: number;
}) {
  const [q, setQ] = React.useState("");
  const [type, setType] = React.useState<ValueTypeFilter>("all");
  const [enforcement, setEnforcement] = React.useState<EnforcementFilter>("all");
  const [matchCount, setMatchCount] = React.useState(totalCount);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const queryLower = q.trim().toLowerCase();
    const rows = document.querySelectorAll<HTMLElement>("[data-feature-row]");
    let visible = 0;
    rows.forEach((r) => {
      const haystack = r.dataset.featureHaystack ?? "";
      const rowType = r.dataset.featureType ?? "";
      const rowEnforcement = r.dataset.featureEnforcement ?? "";
      const matchesText  = !queryLower || haystack.includes(queryLower);
      const matchesType  = type === "all" || rowType === type;
      const matchesEnfor = enforcement === "all" || rowEnforcement === enforcement;
      const ok = matchesText && matchesType && matchesEnfor;
      r.style.display = ok ? "" : "none";
      if (ok) visible++;
    });

    const groups = document.querySelectorAll<HTMLElement>("[data-feature-group]");
    groups.forEach((g) => {
      const visibleRows = g.querySelectorAll<HTMLElement>(
        "[data-feature-row]:not([style*='display: none'])",
      );
      g.style.display = visibleRows.length === 0 ? "none" : "";
    });

    const empty = document.querySelector<HTMLElement>("[data-feature-empty]");
    if (empty) empty.style.display = visible === 0 ? "" : "none";
    setMatchCount(visible);
  }, [q, type, enforcement]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) {
        setQ("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = q || type !== "all" || enforcement !== "all";

  return (
    <div
      className="rounded-md p-3"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search features by label, key, group, or description…"
          className="ts-focus min-w-0 flex-1 rounded-md px-3 py-1.5 text-sm outline-none"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            color: "var(--text-default)",
          }}
        />
        <span className="whitespace-nowrap text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
          {filtered ? `${matchCount} of ${totalCount}` : `${totalCount} total`}
        </span>
        <span className="hidden text-[10px] sm:inline" style={{ color: "var(--text-faint)" }}>
          ⌘F · esc
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
        <span style={{ color: "var(--text-muted)" }}>Type:</span>
        <FilterChipGroup
          value={type}
          onChange={(v) => setType(v as ValueTypeFilter)}
          options={[
            { value: "all",     label: "All" },
            { value: "BOOLEAN", label: "Boolean" },
            { value: "NUMBER",  label: "Number" },
            { value: "TEXT",    label: "Text" },
          ]}
        />
        <span className="ml-2" style={{ color: "var(--text-muted)" }}>Enforcement:</span>
        <FilterChipGroup
          value={enforcement}
          onChange={(v) => setEnforcement(v as EnforcementFilter)}
          options={[
            { value: "all",            label: "All" },
            { value: "GATE",           label: "Gated" },
            { value: "MARKETING_ONLY", label: "Marketing" },
          ]}
        />
        {filtered && (
          <button
            type="button"
            onClick={() => { setQ(""); setType("all"); setEnforcement("all"); }}
            className="ml-auto text-xs underline"
            style={{ color: "var(--text-muted)" }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

function FilterChipGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className="ts-focus rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors"
            style={{
              background: active ? "var(--accent-primary)" : "transparent",
              color:      active ? "var(--accent-fg)"      : "var(--text-muted)",
              border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-default)"}`,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
