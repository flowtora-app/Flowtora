"use client";

import * as React from "react";
import { addTag, removeTag } from "@/app/actions/customers";

// Phase 7 — inline tag editor.
//
// Renders the current tag chips with per-chip remove buttons, plus
// an "add tag" input with autocomplete against the tenant-wide tag
// list. Both mutations round-trip through server actions so no
// client-side state divergence is possible — the page re-renders
// from the DB after each change.
//
// Autocomplete behaviour:
//   • Typing filters the suggestion list client-side (case-insensitive).
//   • Hitting Enter with a matching suggestion picks it.
//   • Hitting Enter with no match adds the typed label as a new tag.
//   • Clicking a suggestion adds it.
//
// Deliberately no drag-reorder, no color picker, no categories — tags
// are a flat label set and staying simple is how they stay useful.

type Props = {
  slug: string;
  customerId: string;
  tags: string[];
  /** Tenant-wide tag catalogue with counts. Used for autocomplete. */
  suggestions: { tag: string; count: number }[];
  canEdit: boolean;
};

export function TagEditor({ slug: _slug, customerId, tags, suggestions, canEdit }: Props) {
  const [draft, setDraft] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const normalized = new Set(tags.map((t) => t.trim().toLowerCase()));

  // Filter suggestions: not already applied, matches draft, up to 8.
  const draftLower = draft.trim().toLowerCase();
  const filteredSuggestions = suggestions
    .filter((s) => !normalized.has(s.tag) && (!draftLower || s.tag.includes(draftLower)))
    .slice(0, 8);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            No tags yet.
          </span>
        )}
        {tags.map((tag) => (
          <TagChip
            key={tag}
            slug={_slug}
            customerId={customerId}
            tag={tag}
            canEdit={canEdit}
          />
        ))}
      </div>

      {canEdit && (
        <form
          ref={formRef}
          action={addTag.bind(null, _slug)}
          className="relative"
          onSubmit={() => {
            // Reset the draft after the server action resolves — the
            // page re-renders with the new tag applied and re-creates
            // this component, but we still want to wipe state in case
            // the browser keeps the input mounted.
            setTimeout(() => setDraft(""), 0);
          }}
        >
          <input type="hidden" name="customerId" value={customerId} />
          <input
            ref={inputRef}
            type="text"
            name="tag"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Add a tag…"
            maxLength={40}
            autoComplete="off"
            className="w-full rounded-md px-2.5 py-1.5 text-xs outline-none"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-default)",
            }}
          />
          {focused && filteredSuggestions.length > 0 && (
            <ul
              className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-md py-1 text-xs shadow-lg"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {filteredSuggestions.map((s) => (
                <li key={s.tag}>
                  {/* onMouseDown fires before onBlur so the click lands. */}
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setDraft(s.tag);
                      // Defer submit until the input value syncs.
                      requestAnimationFrame(() => {
                        if (inputRef.current) inputRef.current.value = s.tag;
                        formRef.current?.requestSubmit();
                      });
                    }}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:brightness-125"
                    style={{ color: "var(--text-default)" }}
                  >
                    <span>{s.tag}</span>
                    <span style={{ color: "var(--text-faint)" }}>
                      ×{s.count}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
      )}
    </div>
  );
}

function TagChip({
  slug,
  customerId,
  tag,
  canEdit,
}: {
  slug: string;
  customerId: string;
  tag: string;
  canEdit: boolean;
}) {
  const remove = removeTag.bind(null, slug);
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
      style={{
        background: "var(--accent-surface)",
        color: "var(--accent-primary)",
      }}
    >
      {tag}
      {canEdit && (
        <form action={remove} className="inline">
          <input type="hidden" name="customerId" value={customerId} />
          <input type="hidden" name="tag" value={tag} />
          <button
            type="submit"
            aria-label={`Remove tag ${tag}`}
            className="-mr-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full hover:brightness-125"
            style={{ color: "var(--accent-primary)", opacity: 0.7 }}
          >
            ×
          </button>
        </form>
      )}
    </span>
  );
}
