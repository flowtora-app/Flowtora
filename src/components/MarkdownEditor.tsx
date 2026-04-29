"use client";

import * as React from "react";
import { renderMarkdownLite } from "@/lib/notifications/markdown";

// Lightweight markdown editor with toolbar + live preview pane.
//
// No external deps — the toolbar injects markdown syntax around the
// current textarea selection, and the preview re-runs renderMarkdownLite
// (a pure HTML-escaping renderer that's already used for transactional
// emails) on every keystroke. Keyboard shortcuts:
//
//   Cmd/Ctrl + B  → **bold**
//   Cmd/Ctrl + I  → *italic*
//   Cmd/Ctrl + K  → [text](url)  — prompts for url if no selection
//
// The textarea is named so the wrapping <form> can submit the markdown
// source directly to the existing server action — the preview is for
// the author's eye only, not a separate field.

interface MarkdownEditorProps {
  name: string;
  defaultValue?: string;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
  /** When true, render a live preview alongside the textarea. */
  showPreview?: boolean;
}

export function MarkdownEditor({
  name,
  defaultValue = "",
  rows = 8,
  maxLength,
  placeholder,
  disabled,
  showPreview = true,
}: MarkdownEditorProps) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = React.useState(defaultValue);
  const [tab, setTab] = React.useState<"edit" | "preview">("edit");

  const wrapSelection = (
    before: string,
    after: string = before,
    placeholderText: string = "text",
  ) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || placeholderText;
    const next = `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    setValue(next);
    // Restore cursor inside the wrapped text on the next tick so the
    // browser's selection model has caught up to the rerender.
    requestAnimationFrame(() => {
      ta.focus();
      const cursorStart = start + before.length;
      const cursorEnd = cursorStart + selected.length;
      ta.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  const insertLine = (prefix: string) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const next = `${value.slice(0, lineStart)}${prefix}${value.slice(lineStart)}`;
    setValue(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length);
    });
  };

  const insertLink = () => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end) || "link text";
    // Prompt is the simplest way to ask for a URL without a modal lib.
    // For admin tooling this is fine.
    const url = typeof window !== "undefined"
      ? window.prompt("URL (https://…)", "https://")
      : null;
    if (!url) return;
    const next = `${value.slice(0, start)}[${selected}](${url})${value.slice(end)}`;
    setValue(next);
    requestAnimationFrame(() => {
      ta.focus();
      const cursorStart = start + 1;
      const cursorEnd = cursorStart + selected.length;
      ta.setSelectionRange(cursorStart, cursorEnd);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const key = e.key.toLowerCase();
    if (key === "b") {
      e.preventDefault();
      wrapSelection("**", "**", "bold text");
    } else if (key === "i") {
      e.preventDefault();
      wrapSelection("*", "*", "italic text");
    } else if (key === "k") {
      e.preventDefault();
      insertLink();
    }
  };

  // Pre-render the preview HTML once per value so we don't re-run the
  // markdown parser inside the JSX. It's a tiny pure function so this
  // is mostly cosmetic — keeps the render function readable.
  const previewHtml = React.useMemo(
    () => (value.trim() ? renderMarkdownLite(value) : ""),
    [value],
  );

  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap items-center gap-1 rounded-md p-1.5"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
        }}
        role="toolbar"
        aria-label="Formatting"
      >
        <ToolButton onClick={() => wrapSelection("**", "**", "bold text")} title="Bold (⌘B)" disabled={disabled || tab === "preview"}>
          <span className="font-bold">B</span>
        </ToolButton>
        <ToolButton onClick={() => wrapSelection("*", "*", "italic text")} title="Italic (⌘I)" disabled={disabled || tab === "preview"}>
          <span className="italic">I</span>
        </ToolButton>
        <ToolButton onClick={() => wrapSelection("`", "`", "code")} title="Inline code" disabled={disabled || tab === "preview"}>
          <span className="font-mono">{"</>"}</span>
        </ToolButton>
        <Divider />
        <ToolButton onClick={insertLink} title="Link (⌘K)" disabled={disabled || tab === "preview"}>
          🔗
        </ToolButton>
        <Divider />
        <ToolButton onClick={() => insertLine("- ")} title="Bulleted list" disabled={disabled || tab === "preview"}>
          •
        </ToolButton>
        <ToolButton onClick={() => insertLine("1. ")} title="Numbered list" disabled={disabled || tab === "preview"}>
          1.
        </ToolButton>

        {showPreview && (
          <>
            <Divider />
            <TabButton active={tab === "edit"} onClick={() => setTab("edit")}>
              Edit
            </TabButton>
            <TabButton active={tab === "preview"} onClick={() => setTab("preview")}>
              Preview
            </TabButton>
          </>
        )}

        <span
          className="ml-auto px-2 text-[10px]"
          style={{ color: "var(--text-muted)" }}
        >
          Markdown · ⌘B / ⌘I / ⌘K
        </span>
      </div>

      {tab === "edit" || !showPreview ? (
        <textarea
          ref={ref}
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            color: "var(--text-default)",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: "13px",
            lineHeight: 1.6,
          }}
        />
      ) : (
        <>
          {/* Hidden textarea preserves the form-submit value while the
              author looks at the preview pane. */}
          <input type="hidden" name={name} value={value} />
          <div
            className="prose-preview rounded-md px-4 py-3 text-sm"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
              minHeight: `${rows * 1.6}em`,
            }}
            dangerouslySetInnerHTML={{
              __html: previewHtml || `<em style="color: var(--text-faint)">Nothing to preview yet.</em>`,
            }}
          />
        </>
      )}

      {maxLength && (
        <div className="flex justify-end text-xs" style={{ color: "var(--text-faint)" }}>
          {value.length} / {maxLength}
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ts-focus rounded px-2 py-0.5 text-xs font-medium transition-colors"
      style={{
        background: active ? "var(--surface-1)" : "transparent",
        color: active ? "var(--text-default)" : "var(--text-muted)",
        border: `1px solid ${active ? "var(--border-default)" : "transparent"}`,
      }}
    >
      {children}
    </button>
  );
}

function ToolButton({
  onClick,
  title,
  children,
  disabled,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="ts-focus inline-flex h-7 w-7 items-center justify-center rounded text-xs transition-colors hover:bg-[var(--surface-3)] disabled:opacity-50"
      style={{ color: "var(--text-default)" }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <span
      aria-hidden
      className="mx-1 h-5 w-px"
      style={{ background: "var(--border-subtle)" }}
    />
  );
}
