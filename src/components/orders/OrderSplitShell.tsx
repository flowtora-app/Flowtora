"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface OrderSplitShellProps {
  list: React.ReactNode;
  panel: React.ReactNode;
  /** All order IDs in current list, in render order — used for keyboard nav. */
  orderIds: string[];
  selectedId: string | null;
  /** Slug passed through for any anchor links the panel might use. */
  slug: string;
}

/**
 * Split-view shell for /orders. Two-pane layout on desktop, drawer-style on
 * mobile. Handles keyboard navigation (↑/↓/j/k to move selection, Enter to
 * focus the panel, `/` to focus search, Esc to clear selection) and the
 * mobile open/close of the panel.
 */
export function OrderSplitShell({
  list,
  panel,
  orderIds,
  selectedId,
  slug: _slug,
}: OrderSplitShellProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const panelScrollRef = React.useRef<HTMLDivElement>(null);

  const selectedIndex = selectedId ? orderIds.indexOf(selectedId) : -1;

  // On selection change, scroll the list row into view + scroll panel to top.
  React.useEffect(() => {
    if (!selectedId) return;
    const row = document.querySelector<HTMLButtonElement>(`[data-order-id="${selectedId}"]`);
    row?.scrollIntoView({ block: "nearest" });
    panelScrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [selectedId]);

  const moveSelection = React.useCallback(
    (delta: number) => {
      if (orderIds.length === 0) return;
      const nextIndex =
        selectedIndex < 0
          ? 0
          : Math.max(0, Math.min(orderIds.length - 1, selectedIndex + delta));
      const nextId = orderIds[nextIndex];
      if (!nextId || nextId === selectedId) return;
      const params = new URLSearchParams(sp.toString());
      params.set("selected", nextId);
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [orderIds, selectedIndex, selectedId, router, sp],
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

  // Mobile: when an order is selected, show the panel overlay. List stays
  // mounted underneath so closing the overlay returns instantly.
  const mobilePanelOpen = !!selectedId;

  return (
    <div
      className="grid min-h-[calc(100vh-120px)] gap-0 lg:grid-cols-[360px_minmax(0,1fr)]"
      style={{ border: "1px solid var(--border-subtle)", borderRadius: 12, overflow: "hidden" }}
    >
      {/* LEFT: list */}
      <div
        className="flex min-h-0 flex-col lg:border-r"
        style={{ borderColor: "var(--border-subtle)", background: "var(--surface-0)" }}
      >
        {list}
      </div>

      {/* RIGHT: panel — desktop inline grid cell, mobile fullscreen overlay.
           The `lg:` prefixed utilities reset the mobile-only `fixed inset-0`
           classes on desktop so the panel sits inside the grid column rather
           than overlaying the whole screen. */}
      <div
        ref={panelScrollRef}
        className={[
          "min-h-0 overflow-y-auto",
          "lg:static lg:inset-auto lg:z-auto lg:block",
          mobilePanelOpen ? "fixed inset-0 z-40 block" : "hidden",
        ].join(" ")}
        style={{ background: "var(--surface-0)" }}
      >
        {/* Mobile close bar */}
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
