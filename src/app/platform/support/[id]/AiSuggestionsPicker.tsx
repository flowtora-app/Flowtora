"use client";

// Page 33 §AI suggested replies — UI shim.
//
// Renders 3 ranked candidate replies above the reply textarea. Picking
// one overwrites (or asks before overwriting) the textarea content.
// The suggestions are computed server-side by suggestRepliesForTicket
// in support-tickets.ts — purely rule-based for now (no LLM call), so
// it's deterministic + zero-cost.

import * as React from "react";

type Suggestion = { rank: number; body: string; rationale: string };

export function AiSuggestionsPicker({
  suggestions,
  bodyTextareaName,
}: {
  suggestions: Suggestion[];
  bodyTextareaName: string;
}) {
  const [confirmingRank, setConfirmingRank] = React.useState<number | null>(null);
  const [appliedRank, setAppliedRank] = React.useState<number | null>(null);

  if (suggestions.length === 0) return null;

  const apply = (s: Suggestion, force: boolean) => {
    const textarea = document.querySelector<HTMLTextAreaElement>(
      `textarea[name="${bodyTextareaName}"]`,
    );
    if (!textarea) return;
    if (!force && textarea.value.trim().length > 0) {
      setConfirmingRank(s.rank);
      return;
    }
    textarea.value = s.body;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
    setConfirmingRank(null);
    setAppliedRank(s.rank);
  };

  return (
    <div
      className="rounded-md border p-3"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
        >
          AI suggestions
        </span>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Picked from past resolved tickets in the same category — click to use, edit before sending.
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {suggestions.map((s) => {
          const isApplied = appliedRank === s.rank;
          const isConfirming = confirmingRank === s.rank;
          return (
            <li
              key={s.rank}
              className="rounded-md border p-2"
              style={{
                background: isApplied ? "var(--success-surface)" : "var(--surface-1)",
                borderColor: isApplied ? "var(--emerald-200, var(--border-default))" : "var(--border-subtle)",
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Suggestion #{s.rank}
                </span>
                <div className="flex items-center gap-2 text-[11px]">
                  {isConfirming ? (
                    <>
                      <span style={{ color: "var(--warning-fg)" }}>Replace existing draft?</span>
                      <button
                        type="button"
                        onClick={() => apply(s, true)}
                        className="ts-focus rounded-sm px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
                      >
                        Replace
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingRank(null)}
                        className="text-[10px] underline"
                        style={{ color: "var(--text-muted)" }}
                      >
                        cancel
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => apply(s, false)}
                      className="ts-focus rounded-sm px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: isApplied ? "var(--success-fg)" : "var(--accent-primary)",
                        color: isApplied ? "var(--success-surface)" : "var(--accent-fg)",
                      }}
                    >
                      {isApplied ? "✓ Used" : "Use this"}
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[12px]" style={{ color: "var(--text-default)" }}>
                {s.body}
              </p>
              <p className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                Why: {s.rationale}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
