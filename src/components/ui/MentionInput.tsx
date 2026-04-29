"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// MentionInput — Spec Page 0 §0.5.55.
//
// Trigger: typing `@` (or `#` for tags, `/` for commands).
// Popover: searchable list (avatar + name + role); ↵ inserts as a
// chip (the chip is rendered as a styled span; final value is the
// raw text with mention tokens for caller to parse).
//
// Implementation: contenteditable would be ideal but adds complexity;
// we use a plain textarea + an overlay popover. The text value
// remains plain — caller parses `@user-handle` etc. from the string.

export interface MentionItem {
  id: string;
  label: string;
  /** Optional avatar slot. */
  icon?: React.ReactNode;
  /** Optional secondary line. */
  description?: React.ReactNode;
  /** Token inserted on pick — defaults to "@<id>". Override to use
   *  e.g. "@<handle>" for user-friendly tokens. */
  token?: string;
}

export interface MentionTrigger {
  /** The trigger char, e.g. "@", "#", "/". */
  char: string;
  /** Search the user-supplied query. */
  search: (query: string) => MentionItem[] | Promise<MentionItem[]>;
}

export interface MentionInputProps {
  value: string;
  onChange: (next: string) => void;
  triggers: MentionTrigger[];
  placeholder?: string;
  className?: string;
  rows?: number;
  disabled?: boolean;
  label?: string;
  hint?: string;
}

export function MentionInput({
  value,
  onChange,
  triggers,
  placeholder,
  className,
  rows = 4,
  disabled,
  label,
  hint,
}: MentionInputProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [active, setActive] = React.useState<{ trigger: MentionTrigger; from: number; query: string } | null>(null);
  const [items, setItems] = React.useState<MentionItem[]>([]);
  const [activeIndex, setActiveIndex] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    if (!active) {
      setItems([]);
      return;
    }
    Promise.resolve(active.trigger.search(active.query)).then((r) => {
      if (!cancelled) {
        setItems(r);
        setActiveIndex(0);
      }
    });
    return () => { cancelled = true; };
  }, [active]);

  const detectTrigger = (text: string, caret: number): { trigger: MentionTrigger; from: number; query: string } | null => {
    // Walk backwards from the caret to find a trigger char with no
    // intervening whitespace; the substring between is the query.
    for (let i = caret - 1; i >= 0; i--) {
      const ch = text[i]!;
      if (/\s/.test(ch)) return null;
      const trig = triggers.find((t) => t.char === ch);
      if (trig) {
        // Ensure the trigger is at start-of-text or preceded by whitespace.
        if (i > 0 && !/\s/.test(text[i - 1]!)) return null;
        return { trigger: trig, from: i, query: text.slice(i + 1, caret) };
      }
    }
    return null;
  };

  const onChangeText = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    onChange(next);
    const caret = e.target.selectionStart ?? next.length;
    setActive(detectTrigger(next, caret));
  };

  const insert = (item: MentionItem) => {
    if (!active) return;
    const token = item.token ?? `${active.trigger.char}${item.id}`;
    const before = value.slice(0, active.from);
    const after = value.slice((ref.current?.selectionStart ?? value.length));
    const next = `${before}${token} ${after}`;
    onChange(next);
    setActive(null);
    // Restore caret after the inserted token.
    setTimeout(() => {
      const pos = before.length + token.length + 1;
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!active) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") {
      if (items[activeIndex]) {
        e.preventDefault();
        insert(items[activeIndex]!);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setActive(null);
    }
  };

  return (
    <div className={cn("relative flex flex-col gap-1", className)}>
      {label && (
        <label className="text-[13px] font-medium" style={{ color: "var(--text-default)" }}>{label}</label>
      )}
      <textarea
        ref={ref}
        value={value}
        onChange={onChangeText}
        onKeyDown={onKey}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className="ts-focus w-full resize-y rounded-md border bg-transparent px-3 py-2 text-[13px] outline-none"
        style={{
          background: "var(--surface-1)",
          borderColor: "var(--border-default)",
          color: "var(--text-default)",
        }}
      />
      {hint && (
        <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>{hint}</span>
      )}
      {active && items.length > 0 && (
        <div
          className="absolute left-3 top-full z-[var(--z-dropdown,100)] mt-1 max-h-60 w-72 overflow-y-auto rounded-lg border"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-lg)" }}
        >
          {items.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => insert(item)}
              className="ts-focus flex w-full items-start gap-2 px-3 py-2 text-left text-[13px]"
              style={{
                background: i === activeIndex ? "var(--surface-3)" : "transparent",
                color: "var(--text-default)",
              }}
            >
              {item.icon && <span className="inline-flex shrink-0">{item.icon}</span>}
              <span className="min-w-0 flex-1">
                <span className="block">{item.label}</span>
                {item.description && (
                  <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>{item.description}</span>
                )}
              </span>
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>{active.trigger.char}{item.id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
