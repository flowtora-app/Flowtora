"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface SplitShellProps {
  list: React.ReactNode;
  panel: React.ReactNode;
  /** All entity IDs in current list, in render order — used for keyboard nav. */
  entityIds: string[];
  selectedId: string | null;
}

/**
 * Reusable two-pane split view with keyboard nav. Row components on the left
 * must emit `data-entity-id={id}` so the shell can scroll the selected row
 * into view. Selection state lives in `?selected=<id>`. Used by Orders,
 * Quotes, and Invoices list pages.
 *
 * Keyboard: ↑/↓/j/k move selection, `/` focuses search, Esc clears selection
 * (or blurs an input first).
 */
export function SplitShell({ list, panel, entityIds, selectedId }: SplitShellProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const panelScrollRef = React.useRef<HTMLDivElement>(null);

  const selectedIndex = selectedId ? entityIds.indexOf(selectedId) : -1;

  React.useEffect(() => {
    if (!selectedId) return;
    const row = document.querySelector<HTMLButtonElement>(`[data-entity-id="${selectedId}"]`);
    row?.scrollIntoView({ block: "nearest" });
    panelScrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [selectedId]);

  const moveSelection = React.useCallback(
    (delta: number) => {
      if (entityIds.length === 0) return;
      const nextIndex =
        selectedIndex < 0
          ? 0
          : Math.max(0, Math.min(entityIds.length - 1, selectedIndex + delta));
      const nextId = entityIds[nextIndex];
      if (!nextId || nextId === selectedId) return;
      const params = new URLSearchParams(sp.toString());
      params.set("selected", nextId);
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [entityIds, selectedIndex, selectedId, router, sp],
  );

  const clearSelection = React.useCallback(() => {
    const params = new URLSearchParams(sp.toString());
    params.delete("selected");
    const qs = params.toString();
    router.push(qs ? `?${qs}` : "?", { scroll: false });
  }, [router, sp]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable;
      if (typing) {
        if (e.key === "Escape" && tag === "INPUT") {
          (target as HTMLInputElement).blur();
        }
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        const el = document.querySelector<HTMLInputElement>("input[name='q']");
        el?.focus();
        el?.select();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        moveSelection(1);
        return;
      }
      if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        moveSelection(-1);
        return;
      }
      if (e.key === "Escape" && selectedId) {
        e.preventDefault();
        clearSelection();
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveSelection, clearSelection, selectedId]);

  const mobilePanelOpen = !!selectedId;

  return (
    <div
      className="grid min-h-[calc(100vh-120px)] gap-0 lg:grid-cols-[360px_minmax(0,1fr)]"
      style={{ border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden" }}
    >
      <div
        className="flex min-h-0 flex-col lg:border-r"
        style={{ borderColor: "var(--border-subtle)", background: "var(--surface-0)" }}
      >
        {list}
      </div>

      <div
        ref={panelScrollRef}
        className={[
          "min-h-0 overflow-y-auto",
          "lg:static lg:inset-auto lg:z-auto lg:block",
          mobilePanelOpen ? "fixed inset-0 z-40 block" : "hidden",
        ].join(" ")}
        style={{ background: "var(--surface-0)" }}
      >
        {mobilePanelOpen && (
          <div
            className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 lg:hidden"
            style={{
              background: "var(--surface-0)",
              borderBottom: "1px solid var(--border-subtle)",
            }}
          >
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-md px-2 py-1 text-sm"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
              }}
            >
              ← Back to list
            </button>
          </div>
        )}
        {panel}
      </div>
    </div>
  );
}
