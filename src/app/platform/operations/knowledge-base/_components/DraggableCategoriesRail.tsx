"use client";

// Page 34 — drag-to-reorder categories rail.
//
// HTML5 drag/drop API (no external dep). Releases call into the
// reorderKbCategories server action with a JSON payload of the new
// (id, sortOrder, parentId) tuples. Hierarchy depth cap is still
// enforced server-side; the client UI just lets you drop on a
// sibling slot.

import * as React from "react";
import Link from "next/link";
import type { CategoryTreeNode } from "@/server/platform/knowledge-base";
import {
  reorderKbCategories,
  createKbCategory,
} from "@/app/actions/platform-knowledge-base";

interface FlatRow {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
  articleCount: number;
}

function flatten(tree: CategoryTreeNode[], parentId: string | null = null, depth = 0): FlatRow[] {
  const out: FlatRow[] = [];
  for (const n of tree) {
    out.push({ id: n.id, name: n.name, parentId, depth, articleCount: n.articleCount });
    out.push(...flatten(n.children, n.id, depth + 1));
  }
  return out;
}

export function DraggableCategoriesRail({
  initial,
  activeCategoryId,
  buildHref,
  canWrite,
}: {
  initial: CategoryTreeNode[];
  activeCategoryId: string | null;
  buildHref: (overrides: Record<string, string | undefined>) => string;
  canWrite: boolean;
}) {
  const [rows, setRows] = React.useState<FlatRow[]>(() => flatten(initial));
  const [dragIndex, setDragIndex] = React.useState<number | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    setRows(flatten(initial));
  }, [initial]);

  const onDragStart = (idx: number) => (e: React.DragEvent<HTMLLIElement>) => {
    if (!canWrite) return;
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", String(idx)); } catch { /* noop */ }
  };
  const onDragOver = (idx: number) => (e: React.DragEvent<HTMLLIElement>) => {
    if (!canWrite || dragIndex == null || dragIndex === idx) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const onDrop = (idx: number) => (e: React.DragEvent<HTMLLIElement>) => {
    if (!canWrite || dragIndex == null) return;
    e.preventDefault();
    setRows((prev) => {
      const copy = [...prev];
      const [moved] = copy.splice(dragIndex, 1);
      if (!moved) return prev;
      const target = copy[idx] ?? copy[copy.length - 1];
      // Adopt the target's parent so dropping into a nested section
      // re-parents (still server-capped at depth 3).
      const next: FlatRow = { ...moved, parentId: target ? target.parentId : null };
      copy.splice(idx, 0, next);
      return copy;
    });
    setDragIndex(null);
  };

  const persist = async () => {
    setSubmitting(true);
    // Sort orders are reset to the index in the array per parent.
    const perParent = new Map<string | null, number>();
    const payload = rows.map((r) => {
      const key = r.parentId;
      const cur = perParent.get(key) ?? 0;
      perParent.set(key, cur + 1);
      return { id: r.id, sortOrder: cur, parentId: r.parentId };
    });
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    await reorderKbCategories(fd);
    // Server action redirects, so this rarely returns; safety setSubmitting(false).
    setSubmitting(false);
  };

  const dirty = React.useMemo(() => {
    const orig = flatten(initial).map((r) => r.id).join("|");
    return rows.map((r) => r.id).join("|") !== orig;
  }, [initial, rows]);

  return (
    <aside
      className="flex flex-col gap-3 rounded-lg border p-3"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className="px-2 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-faint)" }}
        >
          Categories {canWrite && <span style={{ color: "var(--text-faint)" }}>(drag to reorder)</span>}
        </span>
        {dirty && canWrite && (
          <button
            type="button"
            onClick={persist}
            disabled={submitting}
            className="ts-focus rounded-sm px-2 py-0.5 text-[10px] font-semibold"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            {submitting ? "Saving…" : "Save order"}
          </button>
        )}
      </div>

      <ul className="flex flex-col gap-0.5">
        <li>
          <RowLink
            href={buildHref({ category: undefined, page: undefined })}
            label="All articles"
            count={undefined}
            selected={activeCategoryId == null}
          />
        </li>
        <li>
          <RowLink
            href={buildHref({ category: "_uncategorized_", page: undefined })}
            label="Uncategorized"
            count={undefined}
            selected={activeCategoryId === "_uncategorized_"}
          />
        </li>
        {rows.length === 0 && (
          <li className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-faint)" }}>
            No categories yet — add one below.
          </li>
        )}
        {rows.map((r, idx) => (
          <li
            key={r.id}
            draggable={canWrite}
            onDragStart={onDragStart(idx)}
            onDragOver={onDragOver(idx)}
            onDrop={onDrop(idx)}
            style={{ opacity: dragIndex === idx ? 0.4 : 1 }}
          >
            <RowLink
              href={buildHref({ category: r.id, page: undefined })}
              label={`${canWrite ? "⋮⋮ " : ""}${r.name}`}
              count={r.articleCount}
              selected={activeCategoryId === r.id}
              indent={r.depth}
            />
          </li>
        ))}
      </ul>

      {canWrite && (
        <div>
          <div
            className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-faint)" }}
          >
            New category
          </div>
          <form
            action={createKbCategory}
            className="flex flex-col gap-2 rounded-md border px-3 py-2"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Name
              </span>
              <input
                name="name"
                required
                placeholder="e.g. Getting started"
                className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-default)",
                }}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Parent
              </span>
              <select
                name="parentId"
                defaultValue=""
                className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-default)",
                }}
              >
                <option value="">— Top level —</option>
                {rows.map((r) => (
                  <option key={r.id} value={r.id}>
                    {"— ".repeat(r.depth)}{r.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="ts-focus rounded-md px-2 py-1.5 text-[11px] font-semibold"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              Add category
            </button>
          </form>
        </div>
      )}
    </aside>
  );
}

function RowLink({
  href, label, count, selected, indent = 0,
}: {
  href: string;
  label: string;
  count?: number;
  selected: boolean;
  indent?: number;
}) {
  return (
    <Link
      href={href}
      className="ts-focus flex items-center justify-between rounded-md py-1.5 pr-2 text-[12px] transition-colors"
      style={{
        paddingLeft: 8 + indent * 12,
        background: selected ? "var(--surface-2)" : "transparent",
        color: selected ? "var(--text-default)" : "var(--text-muted)",
        fontWeight: selected ? 600 : 500,
      }}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span
          className="ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{
            color: "var(--text-muted)",
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
