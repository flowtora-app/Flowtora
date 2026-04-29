"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// MarkdownPreview — Spec Page 0 §0.5.57.
//
// Rendered with prose-style typography, brand link color, code blocks
// in our monospace font. We deliberately do not pull a markdown
// library — a small in-house parser handles the subset we use in
// admin (headings, paragraphs, lists, code, links, quotes, images,
// horizontal rule, inline code/bold/italic). For richer needs we'd
// add `remark` + `react-markdown` as a follow-up.
//
// Side-by-side variant with editor pane is a wrapper concern; this
// component renders just the preview.

export interface MarkdownPreviewProps {
  source: string;
  className?: string;
}

export function MarkdownPreview({ source, className }: MarkdownPreviewProps) {
  const blocks = React.useMemo(() => parseMarkdown(source), [source]);
  return (
    <div
      className={cn("prose-flowtora", className)}
      style={{
        color: "var(--text-default)",
        fontSize: "var(--text-body-m, 0.875rem)",
        lineHeight: 1.65,
      }}
    >
      {blocks.map((b, i) => (
        <Block key={i} block={b} />
      ))}
      <style>{`
        .prose-flowtora h1, .prose-flowtora h2, .prose-flowtora h3,
        .prose-flowtora h4 { color: var(--text-default); font-weight: 700; line-height: 1.25; margin: 1.25em 0 .5em; }
        .prose-flowtora h1 { font-size: var(--text-h2, 1.5rem); }
        .prose-flowtora h2 { font-size: var(--text-h3, 1.25rem); }
        .prose-flowtora h3 { font-size: var(--text-h4, 1.125rem); }
        .prose-flowtora p { margin: .75em 0; }
        .prose-flowtora ul, .prose-flowtora ol { padding-inline-start: 1.25em; margin: .5em 0; }
        .prose-flowtora li { margin: .25em 0; }
        .prose-flowtora a { color: var(--brand-700, var(--accent-primary)); text-decoration: underline; }
        .prose-flowtora a:hover { color: var(--brand-800, var(--accent-primary)); }
        .prose-flowtora code { font-family: var(--font-mono); font-size: .9em; background: var(--surface-2); padding: 1px 5px; border-radius: 4px; }
        .prose-flowtora pre { background: var(--surface-2); padding: 12px; border-radius: 8px; overflow-x: auto; font-family: var(--font-mono); }
        .prose-flowtora pre code { background: transparent; padding: 0; }
        .prose-flowtora blockquote { margin: .75em 0; padding-inline-start: 12px; border-inline-start: 3px solid var(--brand-200, var(--accent-primary)); color: var(--text-muted); }
        .prose-flowtora hr { border: 0; border-top: 1px solid var(--border-subtle); margin: 1.5em 0; }
        .prose-flowtora img { max-width: 100%; border-radius: 8px; }
      `}</style>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */
/* Tiny markdown parser                                          */
/* ────────────────────────────────────────────────────────────── */

type Block =
  | { kind: "h"; level: 1 | 2 | 3; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "code"; lang?: string; body: string }
  | { kind: "quote"; text: string }
  | { kind: "hr" }
  | { kind: "img"; alt: string; src: string };

function parseMarkdown(source: string): Block[] {
  const lines = source.split("\n");
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;

    // Code block
    const fence = /^```(\w+)?$/.exec(line.trim());
    if (fence) {
      const lang = fence[1];
      i++;
      const body: string[] = [];
      while (i < lines.length && lines[i]!.trim() !== "```") {
        body.push(lines[i]!);
        i++;
      }
      i++;
      out.push({ kind: "code", lang, body: body.join("\n") });
      continue;
    }

    // Heading
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      out.push({ kind: "h", level: h[1]!.length as 1 | 2 | 3, text: h[2]!.trim() });
      i++;
      continue;
    }

    // HR
    if (/^([-*_])\1\1\s*$/.test(line.trim())) {
      out.push({ kind: "hr" });
      i++;
      continue;
    }

    // Image alone on a line
    const img = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(line.trim());
    if (img) {
      out.push({ kind: "img", alt: img[1]!, src: img[2]! });
      i++;
      continue;
    }

    // Quote
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("> ")) {
        buf.push(lines[i]!.slice(2));
        i++;
      }
      out.push({ kind: "quote", text: buf.join(" ") });
      continue;
    }

    // List
    const ulMatch = /^[-*]\s+(.+)$/.exec(line);
    const olMatch = /^\d+\.\s+(.+)$/.exec(line);
    if (ulMatch || olMatch) {
      const isOrdered = !!olMatch;
      const items: string[] = [];
      while (i < lines.length) {
        const L = lines[i]!;
        const m = isOrdered ? /^\d+\.\s+(.+)$/.exec(L) : /^[-*]\s+(.+)$/.exec(L);
        if (!m) break;
        items.push(m[1]!);
        i++;
      }
      out.push({ kind: isOrdered ? "ol" : "ul", items });
      continue;
    }

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph (concat consecutive non-empty lines)
    const buf: string[] = [];
    while (i < lines.length && lines[i]!.trim() !== "" && !/^(#{1,3}\s|>\s|```|[-*_]{3}|!\[)/.test(lines[i]!) && !/^[-*]\s/.test(lines[i]!) && !/^\d+\.\s/.test(lines[i]!)) {
      buf.push(lines[i]!);
      i++;
    }
    if (buf.length > 0) {
      out.push({ kind: "p", text: buf.join(" ") });
    }
  }
  return out;
}

function inline(text: string): React.ReactNode {
  // Order matters: code before bold/italic so the inner text is preserved.
  const parts: React.ReactNode[] = [];
  let i = 0;
  let buf = "";
  const flush = () => { if (buf) { parts.push(buf); buf = ""; } };

  while (i < text.length) {
    const ch = text[i]!;
    // Inline code
    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        flush();
        parts.push(<code key={parts.length}>{text.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    }
    // Link [text](href)
    if (ch === "[") {
      const m = /^\[([^\]]+)\]\(([^)]+)\)/.exec(text.slice(i));
      if (m) {
        flush();
        parts.push(<a key={parts.length} href={m[2]} target="_blank" rel="noreferrer">{inline(m[1]!)}</a>);
        i += m[0].length;
        continue;
      }
    }
    // Bold ** **
    if (ch === "*" && text[i + 1] === "*") {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        flush();
        parts.push(<strong key={parts.length}>{inline(text.slice(i + 2, end))}</strong>);
        i = end + 2;
        continue;
      }
    }
    // Italic *text* / _text_
    if ((ch === "*" || ch === "_") && text[i + 1] !== ch) {
      const end = text.indexOf(ch, i + 1);
      if (end > i + 1) {
        flush();
        parts.push(<em key={parts.length}>{inline(text.slice(i + 1, end))}</em>);
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return parts;
}

function Block({ block }: { block: Block }) {
  if (block.kind === "h") {
    if (block.level === 1) return <h1>{inline(block.text)}</h1>;
    if (block.level === 2) return <h2>{inline(block.text)}</h2>;
    return <h3>{inline(block.text)}</h3>;
  }
  if (block.kind === "p") return <p>{inline(block.text)}</p>;
  if (block.kind === "ul") return (
    <ul>{block.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</ul>
  );
  if (block.kind === "ol") return (
    <ol>{block.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</ol>
  );
  if (block.kind === "code") return (
    <pre><code>{block.body}</code></pre>
  );
  if (block.kind === "quote") return <blockquote>{inline(block.text)}</blockquote>;
  if (block.kind === "hr") return <hr />;
  if (block.kind === "img") return (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={block.alt} src={block.src} />
  );
  return null;
}
