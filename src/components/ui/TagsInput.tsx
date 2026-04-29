"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// TagsInput — Spec Page 0 §0.5.11.
//
// Anatomy: Comma/Enter to commit; existing chips with X; paste-multiple
// supported (comma/newline split).
// Sizes: sm chip 20px, md 24px (default).
// Validation: per-chip validator (e.g. email format) with red ring +
// tooltip on invalid.
// Suggestions: dropdown of existing options as you type.

export interface TagsInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  /** Suggested values; show as a dropdown when query matches. */
  suggestions?: string[];
  placeholder?: string;
  /** Optional per-tag validator. Return null when valid; an error string
   *  for an invalid tag (renders red ring + tooltip). */
  validate?: (tag: string) => string | null;
  /** Allow only suggestions; unrecognized values are rejected. */
  strict?: boolean;
  size?: "sm" | "md";
  label?: string;
  hint?: string;
  error?: string;
  className?: string;
  disabled?: boolean;
}

export function TagsInput({
  value,
  onChange,
  suggestions,
  placeholder = "Add and press Enter…",
  validate,
  strict,
  size = "md",
  label,
  hint,
  error,
  className,
  disabled,
}: TagsInputProps) {
  const [query, setQuery] = React.useState("");
  const [suggestOpen, setSuggestOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const errors = React.useMemo(() => {
    const m = new Map<number, string>();
    if (validate) {
      value.forEach((v, i) => {
        const e = validate(v);
        if (e) m.set(i, e);
      });
    }
    return m;
  }, [value, validate]);

  const commit = (raw: string) => {
    const parts = raw
      .split(/[,\n]/)
      .map((p) => p.trim())
      .filter(Boolean);
    const accepted: string[] = [];
    for (const p of parts) {
      if (value.includes(p)) continue;
      if (strict && suggestions && !suggestions.includes(p)) continue;
      accepted.push(p);
    }
    if (accepted.length > 0) onChange([...value, ...accepted]);
    setQuery("");
    setSuggestOpen(false);
  };

  const remove = (i: number) => {
    onChange(value.filter((_, idx) => idx !== i));
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      if (query.trim()) commit(query);
    } else if (e.key === "Backspace" && !query && value.length > 0) {
      remove(value.length - 1);
    } else if (e.key === "Escape") {
      setSuggestOpen(false);
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (text.includes(",") || text.includes("\n")) {
      e.preventDefault();
      commit(text);
    }
  };

  React.useEffect(() => {
    if (!suggestOpen) return;
    function onDoc(ev: MouseEvent) {
      if (!containerRef.current?.contains(ev.target as Node)) setSuggestOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [suggestOpen]);

  const filteredSuggestions = (suggestions ?? []).filter(
    (s) => s.toLowerCase().includes(query.toLowerCase()) && !value.includes(s),
  );

  const chipHeight = size === "sm" ? 20 : 24;

  return (
    <div ref={containerRef} className={cn("flex flex-col gap-1", className)}>
      {label && (
        <label className="text-[13px] font-medium" style={{ color: "var(--text-default)" }}>{label}</label>
      )}
      <div className="relative">
        <div
          className={cn(
            "ts-focus flex flex-wrap items-center gap-1 rounded-md border px-2 py-1.5",
            "focus-within:shadow-[var(--shadow-focus)]",
          )}
          style={{
            background: "var(--surface-1)",
            borderColor: error ? "var(--danger-border, var(--rose-500))" : "var(--border-default)",
            color: "var(--text-default)",
            minHeight: 36,
            opacity: disabled ? 0.5 : 1,
            pointerEvents: disabled ? "none" : undefined,
          }}
          onClick={() => inputRef.current?.focus()}
        >
          {value.map((tag, i) => {
            const tagError = errors.get(i);
            return (
              <span
                key={`${tag}-${i}`}
                title={tagError ?? undefined}
                className="inline-flex items-center gap-1 rounded-md px-1.5 text-[11px]"
                style={{
                  height: chipHeight,
                  background: tagError ? "var(--rose-50, var(--danger-surface))" : "var(--brand-50, var(--accent-surface))",
                  color: tagError ? "var(--rose-700, var(--danger-fg))" : "var(--brand-700, var(--accent-primary))",
                  border: tagError ? "1px solid var(--rose-300, var(--danger))" : "1px solid var(--brand-200, var(--accent-primary))",
                }}
              >
                {tag}
                <button type="button" aria-label={`Remove ${tag}`} onClick={() => remove(i)}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2.5" y1="2.5" x2="7.5" y2="7.5" /><line x1="7.5" y1="2.5" x2="2.5" y2="7.5" /></svg>
                </button>
              </span>
            );
          })}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSuggestOpen(true); }}
            onKeyDown={onKey}
            onPaste={onPaste}
            onFocus={() => setSuggestOpen(true)}
            placeholder={value.length === 0 ? placeholder : ""}
            disabled={disabled}
            className="min-w-[80px] flex-1 bg-transparent text-[13px] outline-none"
          />
        </div>
        {suggestOpen && filteredSuggestions.length > 0 && (
          <div
            className="absolute left-0 right-0 top-full z-[var(--z-dropdown,100)] mt-1 max-h-60 overflow-y-auto rounded-lg border"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-lg)" }}
          >
            {filteredSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => commit(s)}
                className="ts-focus block w-full px-3 py-1.5 text-left text-[13px] hover:bg-[var(--surface-3)]"
                style={{ color: "var(--text-default)" }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      {(error || hint) && (
        <span className="text-[12px]" style={{ color: error ? "var(--danger-fg)" : "var(--text-faint)" }}>{error ?? hint}</span>
      )}
    </div>
  );
}
