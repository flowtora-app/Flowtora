"use client";

import * as React from "react";

// Live filter for the plan features matrix.
//
// Renders a search input and, on every keystroke, hides feature rows
// whose label / key / description don't match. Group cards collapse
// to nothing when none of their rows are visible.
//
// Implementation note: the matrix is server-rendered for SSR speed and
// to keep the form's hidden inputs out of the React state tree. This
// component reaches into the DOM via data attributes:
//
//   <li data-feature-row data-feature-haystack="lower-cased text">
//   <section data-feature-group>...</section>
//
// Walking the DOM is unusual in React, but acceptable here because the
// rows are static SSR content with no React state of their own. It
// also keeps "filter" client-only — no URL roundtrips while typing.

export function PlanFeaturesFilterBar({
  totalCount,
  enabledCount,
}: {
  totalCount: number;
  enabledCount: number;
}) {
  const [q, setQ] = React.useState("");
  const [matchCount, setMatchCount] = React.useState(totalCount);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Apply filter whenever the query changes. Walks the static SSR DOM
  // and toggles `display`. We cap the work at the visible features
  // section, but the page only mounts one of these so it's cheap.
  React.useEffect(() => {
    const queryLower = q.trim().toLowerCase();
    const rows = document.querySelectorAll<HTMLElement>("[data-feature-row]");
    let visible = 0;
    rows.forEach((r) => {
      const haystack = r.dataset.featureHaystack ?? "";
      const matches = !queryLower || haystack.includes(queryLower);
      r.style.display = matches ? "" : "none";
      if (matches) visible++;
    });

    // Hide groups with no visible rows so the "no results" state is
    // tidy. We tag those with a data attribute so we can query later.
    const groups = document.querySelectorAll<HTMLElement>("[data-feature-group]");
    groups.forEach((g) => {
      const visibleRows = g.querySelectorAll<HTMLElement>(
        "[data-feature-row]:not([style*='display: none'])",
      );
      g.style.display = visibleRows.length === 0 ? "none" : "";
    });

    // Toggle "no results" placeholder if present.
    const empty = document.querySelector<HTMLElement>("[data-feature-empty]");
    if (empty) empty.style.display = visible === 0 ? "" : "none";

    setMatchCount(visible);
  }, [q]);

  // Cmd / Ctrl + F focuses the in-page filter instead of triggering the
  // browser's native find. Esc clears.
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

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-md px-4 py-2 text-sm"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <span style={{ color: "var(--text-muted)" }}>Filter</span>
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search features by name, key, or description…"
        className="ts-focus min-w-0 flex-1 rounded-md px-2.5 py-1.5 text-sm outline-none"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          color: "var(--text-default)",
        }}
      />
      <span className="text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
        {q ? (
          <>
            {matchCount} match{matchCount === 1 ? "" : "es"} of {totalCount}
          </>
        ) : (
          <>
            {enabledCount} of {totalCount} enabled
          </>
        )}
      </span>
      <span className="hidden text-[10px] sm:inline" style={{ color: "var(--text-faint)" }}>
        ⌘F · esc to clear
      </span>
    </div>
  );
}
