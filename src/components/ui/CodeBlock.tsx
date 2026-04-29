"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// CodeBlock — Spec Page 0 §0.5.36.
//
// Anatomy: language tab + filename (optional) + copy button + lines.
// Line numbers (optional, neutral-400).
// Diff highlighting: added (emerald-50 bg + emerald-700 text), removed
// (rose-50 bg + rose-700 text + strikethrough).
// Wrap toggle.
//
// Syntax highlighting via Shiki is deferred — the spec calls for
// github-light / github-dark themes but Shiki is a heavy dep we don't
// need yet. This component renders plain monospace with diff + line
// number support; we can add Shiki as a follow-up by extending
// `renderLine` to accept colored tokens.

type LineKind = "normal" | "added" | "removed";

export interface CodeLine {
  text: string;
  kind?: LineKind;
}

export interface CodeBlockProps {
  /** Either a single string (split on newlines) or pre-split lines
   *  with optional kind for diff rendering. */
  code: string | CodeLine[];
  /** Language label rendered in the top tab. */
  language?: string;
  /** Optional filename, rendered alongside the language. */
  filename?: string;
  /** Show line numbers in a left gutter. */
  lineNumbers?: boolean;
  /** Allow long lines to wrap instead of overflowing horizontally. */
  wrap?: boolean;
  /** Show a wrap toggle button in the header (Spec §0.5.36). */
  wrapToggle?: boolean;
  className?: string;
}

export function CodeBlock({
  code,
  language,
  filename,
  lineNumbers = false,
  wrap: wrapProp = false,
  wrapToggle = false,
  className,
}: CodeBlockProps) {
  const [wrap, setWrap] = React.useState(wrapProp);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    setWrap(wrapProp);
  }, [wrapProp]);

  const lines = React.useMemo<CodeLine[]>(() => {
    if (typeof code === "string") {
      return code.split("\n").map((text) => ({ text, kind: "normal" as const }));
    }
    return code;
  }, [code]);

  const plainText = React.useMemo(
    () => lines.map((l) => (l.kind === "removed" ? `-${l.text}` : l.kind === "added" ? `+${l.text}` : l.text)).join("\n"),
    [lines],
  );

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable — silently fail; user can manually select.
    }
  };

  return (
    <div
      className={cn("overflow-hidden rounded-lg border", className)}
      style={{
        background: "var(--surface-1)",
        borderColor: "var(--border-subtle)",
      }}
    >
      {(language || filename || wrapToggle) && (
        <div
          className="flex items-center justify-between gap-3 px-3 py-2 text-[11px]"
          style={{
            background: "var(--surface-2)",
            borderBottom: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          <div className="flex items-center gap-2 font-mono">
            {language && <span>{language}</span>}
            {language && filename && <span style={{ opacity: 0.4 }}>·</span>}
            {filename && <span style={{ color: "var(--text-default)" }}>{filename}</span>}
          </div>
          <div className="flex items-center gap-2">
            {wrapToggle && (
              <button
                type="button"
                onClick={() => setWrap((w) => !w)}
                className="ts-focus rounded px-2 py-0.5 text-[10px] font-medium"
                style={{
                  background: wrap ? "var(--accent-surface)" : "transparent",
                  color: wrap ? "var(--accent-primary)" : "var(--text-muted)",
                }}
              >
                Wrap {wrap ? "on" : "off"}
              </button>
            )}
            <button
              type="button"
              onClick={onCopy}
              className="ts-focus rounded px-2 py-0.5 text-[10px] font-medium"
              style={{
                color: copied ? "var(--emerald-700, var(--success-fg))" : "var(--text-muted)",
                background: copied ? "var(--emerald-100, var(--success-surface))" : "transparent",
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}
      <pre
        className="overflow-x-auto p-3 font-mono"
        style={{
          fontSize: "var(--text-code, 0.8125rem)",
          lineHeight: 1.6,
          color: "var(--text-default)",
          margin: 0,
          whiteSpace: wrap ? "pre-wrap" : "pre",
          wordBreak: wrap ? "break-word" : undefined,
        }}
      >
        {lines.map((line, i) => {
          const lineStyle: React.CSSProperties =
            line.kind === "added"
              ? {
                  background: "var(--emerald-50, var(--success-surface))",
                  color: "var(--emerald-700, var(--success-fg))",
                  display: "block",
                  marginInline: "-0.75rem",
                  paddingInline: "0.75rem",
                }
              : line.kind === "removed"
              ? {
                  background: "var(--rose-50, var(--danger-surface))",
                  color: "var(--rose-700, var(--danger-fg))",
                  textDecoration: "line-through",
                  display: "block",
                  marginInline: "-0.75rem",
                  paddingInline: "0.75rem",
                }
              : { display: "block" };

          return (
            <span key={i} style={lineStyle}>
              {lineNumbers && (
                <span
                  className="select-none pr-3"
                  style={{
                    color: "var(--slate-400, var(--text-faint))",
                    fontVariantNumeric: "tabular-nums",
                    display: "inline-block",
                    minWidth: "2.5rem",
                    textAlign: "right",
                  }}
                >
                  {i + 1}
                </span>
              )}
              {line.kind === "added" && <span aria-hidden style={{ marginRight: "0.5rem" }}>+</span>}
              {line.kind === "removed" && <span aria-hidden style={{ marginRight: "0.5rem" }}>−</span>}
              {line.text || " "}
            </span>
          );
        })}
      </pre>
    </div>
  );
}
