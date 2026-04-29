"use client";

import * as React from "react";

// Live filter for the feature-flags page. Search + state filter chips.
// The page is server-rendered with one row per feature key; this
// client component reads a search input and walks the DOM toggling
// `display` to filter without a server roundtrip.

export type StateFilter = "all" | "GATED" | "OVERRIDDEN" | "EXPIRING";

export function FeatureFlagsFilterBar({
  totalFeatures,
}: {
  totalFeatures: number;
}) {
  const [q, setQ] = React.useState("");
  const [state, setState] = React.useState<StateFilter>("all");
  const [matchCount, setMatchCount] = React.useState(totalFeatures);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const queryLower = q.trim().toLowerCase();
    const rows = document.querySelectorAll<HTMLElement>("[data-flag-row]");
    let visible = 0;
    rows.forEach((r) => {
      const haystack = r.dataset.flagHaystack ?? "";
      const flagState = (r.dataset.flagState ?? "").toUpperCase();
      const matchesQ = !queryLower || haystack.includes(queryLower);
      const matchesState = state === "all" || flagState.includes(state);
      const ok = matchesQ && matchesState;
      r.style.display = ok ? "" : "none";
      if (ok) visible++;
    });
    setMatchCount(visible);

    // Toggle the empty-state placeholder when no rows match.
    const empty = document.querySelector<HTMLElement>("[data-flag-empty]");
    if (empty) empty.style.display = visible === 0 ? "" : "none";
  }, [q, state]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "Escape" && document.activeElement === inputRef.current) setQ("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const filtered = q || state !== "all";

  return (
    <div
      className="rounded-md p-3"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by key, label, group, or description…"
          className="ts-focus min-w-0 flex-1 rounded-md px-3 py-1.5 text-sm outline-none"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            color: "var(--text-default)",
          }}
        />
        <span className="whitespace-nowrap text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
          {filtered ? `${matchCount} of ${totalFeatures}` : `${totalFeatures} features`}
        </span>
        <span className="hidden text-[10px] sm:inline" style={{ color: "var(--text-faint)" }}>
          ⌘F · esc
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span style={{ color: "var(--text-muted)" }}>State:</span>
        <FilterChip
          label="All"
          active={state === "all"}
          onClick={() => setState("all")}
        />
        <FilterChip
          label="Has overrides"
          active={state === "OVERRIDDEN"}
          onClick={() => setState("OVERRIDDEN")}
          tone="accent"
        />
        <FilterChip
          label="Gated (high impact)"
          active={state === "GATED"}
          onClick={() => setState("GATED")}
          tone="warning"
        />
        <FilterChip
          label="Expiring soon"
          active={state === "EXPIRING"}
          onClick={() => setState("EXPIRING")}
          tone="warning"
        />
        {filtered && (
          <button
            type="button"
            onClick={() => { setQ(""); setState("all"); }}
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

function FilterChip({
  label,
  active,
  onClick,
  tone = "default",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: "default" | "accent" | "warning";
}) {
  const palette =
    tone === "accent"  ? { activeBg: "var(--accent-primary)", activeFg: "var(--accent-fg)",  idleFg: "var(--accent-primary)" } :
    tone === "warning" ? { activeBg: "var(--warning-fg)",     activeFg: "var(--text-inverse)", idleFg: "var(--warning-fg)" } :
                          { activeBg: "var(--accent-primary)", activeFg: "var(--accent-fg)",  idleFg: "var(--text-default)"  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="ts-focus rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors"
      style={{
        background: active ? palette.activeBg : "transparent",
        color:      active ? palette.activeFg : palette.idleFg,
        border: `1px solid ${active ? palette.activeBg : "var(--border-default)"}`,
      }}
    >
      {label}
    </button>
  );
}
