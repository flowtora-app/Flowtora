"use client";

// Page 34 — multi-select autocomplete for related-article ids.
//
// Type to filter, click to add. Renders the picked articles as
// removable chips. The hidden input emits a comma-separated id list
// for the form action to read.

import * as React from "react";

export interface RelatedOption {
  id: string;
  title: string;
  status: string;
  locale: string;
  slug: string;
}

export function RelatedArticlesPicker({
  options,
  initialIds,
  name,
  disabled,
}: {
  options: RelatedOption[];
  initialIds: string[];
  name: string;
  disabled?: boolean;
}) {
  const [picked, setPicked] = React.useState<string[]>(initialIds);
  const [query, setQuery] = React.useState("");

  const remaining = React.useMemo(
    () => options.filter((o) => !picked.includes(o.id)),
    [options, picked],
  );
  const filtered = React.useMemo(() => {
    if (!query.trim()) return remaining.slice(0, 6);
    const q = query.toLowerCase();
    return remaining
      .filter((o) =>
        o.title.toLowerCase().includes(q) ||
        o.slug.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [remaining, query]);
  const pickedDetail = picked
    .map((id) => options.find((o) => o.id === id))
    .filter((o): o is RelatedOption => Boolean(o));

  const add = (id: string) => {
    setPicked((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setQuery("");
  };
  const remove = (id: string) => {
    setPicked((prev) => prev.filter((p) => p !== id));
  };

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={picked.join(", ")} />

      {pickedDetail.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {pickedDetail.map((o) => (
            <li
              key={o.id}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px]"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-default)",
                border: "1px solid var(--border-default)",
              }}
            >
              <span className="truncate max-w-[200px]" title={o.title}>{o.title}</span>
              <span style={{ color: "var(--text-faint)" }}>· {o.locale}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(o.id)}
                  className="text-[12px]"
                  style={{ color: "var(--text-muted)" }}
                  aria-label="Remove"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles to link…"
            className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
            style={inputStyle()}
          />
          {(query.trim() || filtered.length > 0) && (
            <ul
              className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}
            >
              {filtered.length === 0 ? (
                <li
                  className="px-3 py-2 text-[11px]"
                  style={{ color: "var(--text-muted)" }}
                >
                  No matches.
                </li>
              ) : (
                filtered.map((o) => (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => add(o.id)}
                      className="ts-focus w-full px-3 py-2 text-left text-[12px]"
                      style={{ color: "var(--text-default)" }}
                    >
                      <div className="truncate font-medium">{o.title}</div>
                      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        /{o.slug} · {o.locale} · {o.status}
                      </div>
                    </button>
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

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-default)",
  };
}
