"use client";

import * as React from "react";

// Live filter for /platform/notifications. Search + category chips +
// status chips + a "critical only" toggle. The page is server-
// rendered grouped by category; this component walks the DOM and
// toggles `display`. Categories whose rows all become hidden also
// hide themselves so the empty-state stays tidy.

export type StatusFilter = "all" | "DEFAULT" | "DRAFT" | "PUBLISHED" | "DISABLED";

export function NotificationsFilterBar({ totalKinds }: { totalKinds: number }) {
  const [q, setQ] = React.useState("");
  const [category, setCategory] = React.useState<string>("all");
  const [status, setStatus] = React.useState<StatusFilter>("all");
  const [criticalOnly, setCriticalOnly] = React.useState(false);
  const [matchCount, setMatchCount] = React.useState(totalKinds);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    const queryLower = q.trim().toLowerCase();
    const rows = document.querySelectorAll<HTMLElement>("[data-notif-row]");
    let visible = 0;
    rows.forEach((r) => {
      const haystack = r.dataset.notifHaystack ?? "";
      const rowCat = r.dataset.notifCategory ?? "";
      const rowStatus = (r.dataset.notifStatus ?? "DEFAULT").toUpperCase();
      const rowCritical = r.dataset.notifCritical === "1";
      const matchesQ = !queryLower || haystack.includes(queryLower);
      const matchesCat = category === "all" || rowCat === category;
      const matchesStatus = status === "all" || rowStatus === status;
      const matchesCritical = !criticalOnly || rowCritical;
      const ok = matchesQ && matchesCat && matchesStatus && matchesCritical;
      r.style.display = ok ? "" : "none";
      if (ok) visible++;
    });

    // Hide groups whose rows are all hidden.
    const groups = document.querySelectorAll<HTMLElement>("[data-notif-group]");
    groups.forEach((g) => {
      const visibleRows = g.querySelectorAll<HTMLElement>(
        "[data-notif-row]:not([style*='display: none'])",
      );
      g.style.display = visibleRows.length === 0 ? "none" : "";
    });

    setMatchCount(visible);
    const empty = document.querySelector<HTMLElement>("[data-notif-empty]");
    if (empty) empty.style.display = visible === 0 ? "" : "none";
  }, [q, category, status, criticalOnly]);

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

  const filtered = q || category !== "all" || status !== "all" || criticalOnly;

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
          placeholder="Search by label, key, or description…"
          className="ts-focus min-w-0 flex-1 rounded-md px-3 py-1.5 text-sm outline-none"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            color: "var(--text-default)",
          }}
        />
        <span className="whitespace-nowrap text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
          {filtered ? `${matchCount} of ${totalKinds}` : `${totalKinds} kinds`}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span style={{ color: "var(--text-muted)" }}>Category:</span>
        <Chip label="All"      active={category === "all"}      onClick={() => setCategory("all")} />
        <Chip label="Auth"     active={category === "auth"}     onClick={() => setCategory("auth")} />
        <Chip label="Team"     active={category === "team"}     onClick={() => setCategory("team")} />
        <Chip label="Billing"  active={category === "billing"}  onClick={() => setCategory("billing")} />
        <Chip label="Support"  active={category === "support"}  onClick={() => setCategory("support")} />
        <Chip label="Activity" active={category === "activity"} onClick={() => setCategory("activity")} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span style={{ color: "var(--text-muted)" }}>Status:</span>
        <Chip label="All"        active={status === "all"}        onClick={() => setStatus("all")} />
        <Chip label="Default"    active={status === "DEFAULT"}    onClick={() => setStatus("DEFAULT")} />
        <Chip label="Draft"      active={status === "DRAFT"}      onClick={() => setStatus("DRAFT")} tone="warning" />
        <Chip label="Published"  active={status === "PUBLISHED"}  onClick={() => setStatus("PUBLISHED")} tone="success" />
        <Chip label="Disabled"   active={status === "DISABLED"}   onClick={() => setStatus("DISABLED")} tone="danger" />

        <span className="ml-3" style={{ color: "var(--text-muted)" }}>·</span>
        <Chip
          label={criticalOnly ? "✓ Critical only" : "Critical only"}
          active={criticalOnly}
          onClick={() => setCriticalOnly((v) => !v)}
          tone="accent"
        />

        {filtered && (
          <button
            type="button"
            onClick={() => { setQ(""); setCategory("all"); setStatus("all"); setCriticalOnly(false); }}
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

function Chip({
  label,
  active,
  onClick,
  tone = "default",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone?: "default" | "accent" | "success" | "warning" | "danger";
}) {
  const palette =
    tone === "accent"  ? { activeBg: "var(--accent-primary)", activeFg: "var(--accent-fg)",    idleFg: "var(--accent-primary)" } :
    tone === "success" ? { activeBg: "var(--success-fg)",     activeFg: "var(--text-inverse)", idleFg: "var(--success-fg)" } :
    tone === "warning" ? { activeBg: "var(--warning-fg)",     activeFg: "var(--text-inverse)", idleFg: "var(--warning-fg)" } :
    tone === "danger"  ? { activeBg: "var(--danger-fg)",      activeFg: "var(--text-inverse)", idleFg: "var(--danger-fg)" } :
                          { activeBg: "var(--accent-primary)", activeFg: "var(--accent-fg)",    idleFg: "var(--text-default)" };
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
