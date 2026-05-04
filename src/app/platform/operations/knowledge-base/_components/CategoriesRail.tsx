// Left rail — categories tree + "+ New category" form.
//
// Drag-to-reorder is deferred (the schema has sortOrder; the UI for
// it is just a visual list today). Hierarchy is capped at 3 levels
// per the spec — enforced server-side in createKbCategory.

import Link from "next/link";
import type { CategoryTreeNode } from "@/server/platform/knowledge-base";
import { createKbCategory } from "@/app/actions/platform-knowledge-base";

export function CategoriesRail({
  tree,
  activeCategoryId,
  totalUncategorized,
  buildHref,
  canWrite,
}: {
  tree: CategoryTreeNode[];
  activeCategoryId: string | null;
  totalUncategorized: number;
  buildHref: (overrides: Record<string, string | undefined>) => string;
  canWrite: boolean;
}) {
  const flat = flattenForSelect(tree);
  return (
    <aside
      className="flex flex-col gap-4 rounded-lg border p-3"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      <div>
        <div
          className="mb-2 flex items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-faint)" }}
        >
          <span>Categories</span>
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
              count={totalUncategorized}
              selected={activeCategoryId === "_uncategorized_"}
            />
          </li>
          {tree.length === 0 && (
            <li
              className="px-2 py-1.5 text-[11px]"
              style={{ color: "var(--text-faint)" }}
            >
              No categories yet — add one below.
            </li>
          )}
          {tree.map((node) => (
            <CategoryNode
              key={node.id}
              node={node}
              depth={0}
              activeCategoryId={activeCategoryId}
              buildHref={buildHref}
            />
          ))}
        </ul>
      </div>

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
                {flat.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
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

function CategoryNode({
  node, depth, activeCategoryId, buildHref,
}: {
  node: CategoryTreeNode;
  depth: number;
  activeCategoryId: string | null;
  buildHref: (overrides: Record<string, string | undefined>) => string;
}) {
  return (
    <>
      <li>
        <RowLink
          href={buildHref({ category: node.id, page: undefined })}
          label={node.name}
          count={node.articleCount}
          selected={activeCategoryId === node.id}
          indent={depth}
        />
      </li>
      {node.children.map((c) => (
        <CategoryNode
          key={c.id}
          node={c}
          depth={depth + 1}
          activeCategoryId={activeCategoryId}
          buildHref={buildHref}
        />
      ))}
    </>
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

function flattenForSelect(tree: CategoryTreeNode[]): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const walk = (nodes: CategoryTreeNode[], prefix: string) => {
    for (const n of nodes) {
      out.push({ id: n.id, label: `${prefix}${n.name}` });
      walk(n.children, prefix + "— ");
    }
  };
  walk(tree, "");
  return out;
}
