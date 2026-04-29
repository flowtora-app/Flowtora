"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// RichTextToolbar — Spec Page 0 §0.5.56.
//
// Groups: text style (B/I/U/S), heading (H1-H3), lists (ul/ol/check),
// link, code (inline/block), quote, image, table, divider, mention,
// emoji.
// Floating toolbar on selection. Slash menu at line start. Markdown
// shortcuts.
//
// This is a presentation-only toolbar — caller wires the actual editor
// (textarea / contenteditable / tiptap). Each button fires
// `onCommand("<id>", payload?)` and the caller applies the formatting.
// A real WYSIWYG editor is deferred (would warrant tiptap or lexical).

export type RtCommand =
  | "bold" | "italic" | "underline" | "strike"
  | "h1" | "h2" | "h3"
  | "ul" | "ol" | "check"
  | "link" | "code-inline" | "code-block" | "quote"
  | "image" | "table" | "divider"
  | "mention" | "emoji";

export interface RichTextToolbarProps {
  onCommand: (cmd: RtCommand) => void;
  /** Active formatting flags (caller-driven from the editor's selection). */
  active?: Partial<Record<RtCommand, boolean>>;
  /** Hide groups not relevant to a given context. */
  hide?: RtCommand[];
  className?: string;
  size?: "sm" | "md";
}

interface BtnDef {
  id: RtCommand;
  label: string;
  glyph: React.ReactNode;
  group: "style" | "heading" | "list" | "block" | "insert";
}

const BUTTONS: BtnDef[] = [
  { id: "bold",        label: "Bold",         glyph: <strong>B</strong>,         group: "style" },
  { id: "italic",      label: "Italic",       glyph: <em>I</em>,                 group: "style" },
  { id: "underline",   label: "Underline",    glyph: <span style={{ textDecoration: "underline" }}>U</span>, group: "style" },
  { id: "strike",      label: "Strikethrough", glyph: <span style={{ textDecoration: "line-through" }}>S</span>, group: "style" },

  { id: "h1",          label: "Heading 1",    glyph: <span>H1</span>,            group: "heading" },
  { id: "h2",          label: "Heading 2",    glyph: <span>H2</span>,            group: "heading" },
  { id: "h3",          label: "Heading 3",    glyph: <span>H3</span>,            group: "heading" },

  { id: "ul",          label: "Bulleted list", glyph: <span>•</span>,            group: "list" },
  { id: "ol",          label: "Numbered list", glyph: <span>1.</span>,           group: "list" },
  { id: "check",       label: "Checklist",    glyph: <span>☐</span>,             group: "list" },

  { id: "quote",       label: "Quote",        glyph: <span>&quot;</span>,        group: "block" },
  { id: "code-inline", label: "Inline code",  glyph: <span>{"<>"}</span>,        group: "block" },
  { id: "code-block",  label: "Code block",   glyph: <span>{"{ }"}</span>,       group: "block" },
  { id: "link",        label: "Link",         glyph: <span>↗</span>,             group: "block" },
  { id: "divider",     label: "Divider",      glyph: <span>—</span>,             group: "block" },

  { id: "image",       label: "Image",        glyph: <span>🖼</span>,             group: "insert" },
  { id: "table",       label: "Table",        glyph: <span>▦</span>,             group: "insert" },
  { id: "mention",     label: "Mention",      glyph: <span>@</span>,             group: "insert" },
  { id: "emoji",       label: "Emoji",        glyph: <span>☺</span>,             group: "insert" },
];

const GROUP_ORDER: BtnDef["group"][] = ["style", "heading", "list", "block", "insert"];

export function RichTextToolbar({
  onCommand,
  active = {},
  hide,
  className,
  size = "md",
}: RichTextToolbarProps) {
  const hideSet = new Set(hide ?? []);
  const grouped = new Map<BtnDef["group"], BtnDef[]>();
  for (const b of BUTTONS) {
    if (hideSet.has(b.id)) continue;
    const arr = grouped.get(b.group) ?? [];
    arr.push(b);
    grouped.set(b.group, arr);
  }
  const btnPx = size === "sm" ? 24 : 28;

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className={cn("inline-flex items-center gap-1 rounded-md border px-1 py-1", className)}
      style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}
    >
      {GROUP_ORDER.map((g, i) => {
        const items = grouped.get(g);
        if (!items?.length) return null;
        return (
          <React.Fragment key={g}>
            {i > 0 && <span aria-hidden style={{ width: 1, height: btnPx, background: "var(--border-subtle)" }} />}
            <div className="flex items-center gap-0.5">
              {items.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => onCommand(b.id)}
                  aria-label={b.label}
                  aria-pressed={!!active[b.id]}
                  title={b.label}
                  className="ts-focus inline-flex items-center justify-center rounded text-[12px] font-medium transition-colors"
                  style={{
                    width: btnPx, height: btnPx,
                    background: active[b.id] ? "var(--surface-3)" : "transparent",
                    color: active[b.id] ? "var(--text-default)" : "var(--text-muted)",
                  }}
                >
                  {b.glyph}
                </button>
              ))}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
