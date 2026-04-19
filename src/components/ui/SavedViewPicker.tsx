"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { DropdownMenu, type DropdownItem } from "@/components/ui/DropdownMenu";
import {
  createSavedView,
  deleteSavedView,
  type SavedViewKind,
  type SavedViewRow,
} from "@/app/actions/saved-views";

// Phase E Slice 2 — SavedViewPicker.
//
// Rendered on list pages (customers / quotes / orders / invoices / …).
// Lists the current user's views plus tenant-shared views for the same
// `entityKind`, and offers "Save current view" which captures the
// current querystring into a new row.

interface SavedViewPickerProps {
  slug: string;
  entityKind: SavedViewKind;
  views: SavedViewRow[];
  canShare: boolean;
}

export function SavedViewPicker({
  slug,
  entityKind,
  views,
  canShare,
}: SavedViewPickerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [shared, setShared] = React.useState(false);

  const applyView = (filters: string) => {
    const q = filters.replace(/^\?/, "");
    router.push(q ? `${pathname}?${q}` : pathname);
  };

  const remove = async (id: string) => {
    await deleteSavedView(slug, id);
    router.refresh();
  };

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return;
    const currentFilters =
      typeof window !== "undefined" ? window.location.search : "";
    const fd = new FormData();
    fd.set("entityKind", entityKind);
    fd.set("name", name.trim());
    fd.set("filters", currentFilters);
    if (shared && canShare) fd.set("isShared", "on");
    await createSavedView(slug, fd);
    setName("");
    setShared(false);
    setSaveOpen(false);
    router.refresh();
  };

  const mineViews = views.filter((v) => v.ownedByMe && !v.isShared);
  const sharedViews = views.filter((v) => v.isShared);

  const items: DropdownItem[] = [];
  if (mineViews.length > 0) {
    items.push({ type: "label", label: "My views" });
    for (const v of mineViews) {
      items.push({
        label: v.name,
        onClick: () => applyView(v.filters),
        rightSlot: (
          <button
            type="button"
            aria-label={`Delete ${v.name}`}
            onClick={(e) => {
              e.stopPropagation();
              void remove(v.id);
            }}
            className="ts-focus rounded px-1 text-xs hover:brightness-110"
            style={{ color: "var(--text-faint)" }}
          >
            ×
          </button>
        ),
      });
    }
  }
  if (sharedViews.length > 0) {
    items.push({ type: "separator" });
    items.push({ type: "label", label: "Shared views" });
    for (const v of sharedViews) {
      const canRemove = v.ownedByMe || canShare;
      items.push({
        label: v.name,
        onClick: () => applyView(v.filters),
        rightSlot: canRemove ? (
          <button
            type="button"
            aria-label={`Delete ${v.name}`}
            onClick={(e) => {
              e.stopPropagation();
              void remove(v.id);
            }}
            className="ts-focus rounded px-1 text-xs hover:brightness-110"
            style={{ color: "var(--text-faint)" }}
          >
            ×
          </button>
        ) : undefined,
      });
    }
  }
  if (items.length > 0) items.push({ type: "separator" });
  items.push({
    label: "Save current view…",
    onClick: () => setSaveOpen(true),
  });

  return (
    <>
      <DropdownMenu
        align="start"
        width={260}
        trigger={
          <button
            type="button"
            className="ts-focus inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:brightness-110"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
            }}
          >
            <span>Views</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              aria-hidden
              style={{ color: "var(--text-muted)" }}
            >
              <path
                d="M3 4.5 L6 7.5 L9 4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        }
        items={items}
      />
      {saveOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Save current view"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.4)" }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSaveOpen(false);
          }}
        >
          <form
            onSubmit={save}
            className="w-full max-w-sm rounded-lg p-5"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            <div
              className="text-sm font-semibold"
              style={{ color: "var(--text-default)" }}
            >
              Save current view
            </div>
            <div
              className="mt-1 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              Captures the current filters so you can return to them
              later with one click.
            </div>
            <div className="mt-4">
              <label
                htmlFor="saved-view-name"
                className="block text-xs font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                Name
              </label>
              <input
                id="saved-view-name"
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My open this week"
                maxLength={80}
                className="ts-focus mt-1 w-full rounded-md px-2.5 py-1.5 text-sm outline-none"
                style={{
                  background: "var(--surface-0)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-default)",
                }}
              />
            </div>
            {canShare && (
              <label className="mt-3 flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={shared}
                  onChange={(e) => setShared(e.target.checked)}
                />
                <span style={{ color: "var(--text-muted)" }}>
                  Share with the rest of the team
                </span>
              </label>
            )}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSaveOpen(false)}
                className="ts-focus rounded-md px-3 py-1.5 text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="ts-focus rounded-md px-3 py-1.5 text-sm font-semibold"
                style={{
                  background: "var(--accent-primary)",
                  color: "var(--accent-fg)",
                  opacity: name.trim() ? 1 : 0.5,
                }}
              >
                Save view
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
