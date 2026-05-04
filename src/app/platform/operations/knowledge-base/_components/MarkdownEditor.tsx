"use client";

// Page 34 — Markdown editor with side-by-side preview, toolbar
// (slash-menu surrogate), and live SEO score.
//
// The toolbar inserts text snippets at the caret; the preview pane
// re-renders on every keystroke; the SEO card consumes
// computeSeoScore() against the current draft.

import * as React from "react";
import { renderMarkdown } from "@/lib/md-to-html";
import { computeSeoScore, type SeoReport, type SeoInputs } from "@/lib/kb-seo-score";

interface InitialFormValues {
  id: string;
  slug: string;
  locale: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string;
  ogImageUrl: string;
}

export function MarkdownEditor({
  initial,
  bodyName = "bodyMarkdown",
  titleName = "title",
  summaryName = "summary",
  metaTitleName = "metaTitle",
  metaDescName = "metaDescription",
  canonicalName = "canonicalUrl",
  ogName = "ogImageUrl",
}: {
  initial: InitialFormValues;
  bodyName?: string;
  titleName?: string;
  summaryName?: string;
  metaTitleName?: string;
  metaDescName?: string;
  canonicalName?: string;
  ogName?: string;
}) {
  const [body, setBody] = React.useState(initial.bodyMarkdown);
  const [title, setTitle] = React.useState(initial.title);
  const [summary, setSummary] = React.useState(initial.summary);
  const [metaTitle] = React.useState(initial.metaTitle);
  const [metaDesc] = React.useState(initial.metaDescription);
  const [canonical] = React.useState(initial.canonicalUrl);
  const [og] = React.useState(initial.ogImageUrl);
  const [showPreview, setShowPreview] = React.useState(true);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  // Re-read live values from form fields on every keystroke so the SEO
  // card reacts to title / summary / SEO inputs that live elsewhere on
  // the form.
  const seoInputs: SeoInputs = React.useMemo(() => ({
    title: title || initial.title,
    metaTitle: metaTitle || initial.metaTitle,
    metaDescription: metaDesc || initial.metaDescription,
    summary: summary || initial.summary,
    bodyMarkdown: body,
    slug: initial.slug,
    canonicalUrl: canonical || initial.canonicalUrl,
    ogImageUrl: og || initial.ogImageUrl,
  }), [title, metaTitle, metaDesc, summary, body, canonical, og, initial]);

  const seo = React.useMemo(() => computeSeoScore(seoInputs), [seoInputs]);
  const html = React.useMemo(() => renderMarkdown(body), [body]);

  const insertSnippet = (snippet: string, selectionOffset?: number) => {
    const ta = textareaRef.current;
    if (!ta) {
      setBody((prev) => prev + (prev.endsWith("\n") ? "" : "\n") + snippet);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = body.slice(0, start);
    const middle = body.slice(start, end);
    const after = body.slice(end);
    let inserted = snippet;
    let cursorAt = start + snippet.length;
    if (snippet.includes("__SEL__")) {
      inserted = snippet.replace("__SEL__", middle);
      cursorAt = start + snippet.indexOf("__SEL__") + middle.length;
    }
    const next = before + inserted + after;
    setBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(
        selectionOffset != null ? start + selectionOffset : cursorAt,
        selectionOffset != null ? start + selectionOffset : cursorAt,
      );
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Hidden mirror inputs so the form submits live values. We listen
          for input on the visible inputs and forward into hidden mirrors. */}
      <input type="hidden" name={titleName} value={title} />
      <input type="hidden" name={summaryName} value={summary} />
      <input type="hidden" name={bodyName} value={body} />

      {/* Title + summary (these are the canonical inputs on the form) */}
      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Title
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="ts-focus w-full rounded-md px-3 py-2 text-[14px] font-semibold outline-none"
          style={inputStyle()}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Summary
        </span>
        <input
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          maxLength={400}
          className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
          style={inputStyle()}
        />
      </label>

      {/* Toolbar */}
      <Toolbar onInsert={insertSnippet} />

      {/* Editor + preview side-by-side */}
      <div className={`grid gap-3 ${showPreview ? "lg:grid-cols-2" : ""}`}>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Body (Markdown)
            </span>
            <div className="flex items-center gap-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
              <span className="tabular-nums">{wordCount(body)} words · {body.length} chars</span>
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className="ts-focus rounded-sm px-1.5 py-0.5"
                style={{
                  background: showPreview ? "var(--accent-primary)" : "var(--surface-1)",
                  color: showPreview ? "var(--accent-fg)" : "var(--text-default)",
                  border: `1px solid ${showPreview ? "var(--accent-primary)" : "var(--border-default)"}`,
                }}
              >
                {showPreview ? "Hide preview" : "Show preview"}
              </button>
            </div>
          </div>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={24}
            className="ts-focus w-full rounded-md px-3 py-2 font-mono text-[12px] outline-none"
            style={{ ...inputStyle(), lineHeight: 1.5, minHeight: 480 }}
            spellCheck
          />
        </div>

        {showPreview && (
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Live preview
            </span>
            <div
              className="md-preview overflow-auto rounded-md border px-4 py-3 text-[12px] leading-relaxed"
              style={{
                background: "var(--surface-1)",
                borderColor: "var(--border-subtle)",
                color: "var(--text-default)",
                minHeight: 480,
              }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        )}
      </div>

      <SeoScoreCard report={seo} />
    </div>
  );
}

function Toolbar({ onInsert }: { onInsert: (snippet: string, offset?: number) => void }) {
  const items: { label: string; tip: string; snippet: string; offset?: number }[] = [
    { label: "B", tip: "Bold (** **)",       snippet: "**__SEL__**" },
    { label: "I", tip: "Italic (* *)",       snippet: "*__SEL__*" },
    { label: "Code", tip: "Inline code",     snippet: "`__SEL__`" },
    { label: "H2", tip: "Heading 2",         snippet: "\n## __SEL__\n" },
    { label: "H3", tip: "Heading 3",         snippet: "\n### __SEL__\n" },
    { label: "•",  tip: "Bullet list",       snippet: "\n- Item 1\n- Item 2\n- Item 3\n" },
    { label: "1.", tip: "Numbered list",     snippet: "\n1. Step one\n2. Step two\n3. Step three\n" },
    { label: "Link", tip: "Link",            snippet: "[text](https://example.com)", offset: 1 },
    { label: "Image", tip: "Image",          snippet: "![alt text](https://...)" },
    { label: "Code block", tip: "Fenced code", snippet: "\n```\ncode here\n```\n" },
    { label: "Table", tip: "Markdown table", snippet: "\n| Column A | Column B |\n| --- | --- |\n| Value 1 | Value 2 |\n" },
    { label: "Callout", tip: "Info callout", snippet: "\n:::info\nTip: __SEL__\n:::\n" },
    { label: "⚠ Callout", tip: "Warning callout", snippet: "\n:::warning\nHeads up: __SEL__\n:::\n" },
    { label: "Embed", tip: "Embed iframe (escaped — staff-edit only)",
      snippet: "\n<iframe src=\"https://...\" width=\"100%\" height=\"400\"></iframe>\n" },
    { label: "Accordion", tip: "Collapsible details", snippet: "\n:::details Click to expand\nHidden content\n:::\n" },
    { label: "Button", tip: "Markdown link styled as a button (rendered as link in the preview)",
      snippet: "[Open the dashboard →](/dashboard)" },
    { label: "—", tip: "Horizontal rule",    snippet: "\n\n---\n\n" },
  ];
  return (
    <div className="flex flex-wrap gap-1 rounded-md border p-1.5"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          onClick={() => onInsert(it.snippet, it.offset)}
          title={it.tip}
          className="ts-focus rounded-sm px-2 py-1 text-[11px] font-medium"
          style={{
            background: "var(--surface-1)",
            color: "var(--text-default)",
            border: "1px solid var(--border-default)",
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function SeoScoreCard({ report }: { report: SeoReport }) {
  const tone =
    report.band === "excellent" ? { fg: "var(--success-fg)", bg: "var(--success-surface)", border: "var(--emerald-200, var(--border-default))" } :
    report.band === "good"      ? { fg: "var(--accent-primary)", bg: "var(--accent-surface)", border: "var(--accent-primary)" } :
    report.band === "warn"      ? { fg: "var(--warning-fg)", bg: "var(--warning-surface)", border: "var(--amber-200, var(--border-default))" } :
                                   { fg: "var(--danger-fg)", bg: "var(--rose-50, var(--surface-2))", border: "var(--rose-200, var(--border-default))" };
  return (
    <div
      className="flex flex-col gap-2 rounded-md border p-3"
      style={{ background: "var(--surface-1)", borderColor: tone.border }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Live SEO score
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-[26px] font-semibold tabular-nums" style={{ color: tone.fg }}>
              {report.score}
            </span>
            <span className="text-[11px] uppercase tracking-wide" style={{ color: tone.fg }}>
              {report.band === "excellent" ? "Excellent" :
               report.band === "good" ? "Good" :
               report.band === "warn" ? "Needs work" : "Poor"}
            </span>
          </div>
        </div>
        <div className="h-1 w-40 overflow-hidden rounded-full"
             style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}>
          <div className="h-full" style={{
            width: `${report.score}%`,
            background: tone.fg,
          }} />
        </div>
      </div>

      <ul className="flex flex-col gap-1">
        {report.checks.map((c) => (
          <li key={c.id} className="flex items-baseline gap-2 text-[11px]">
            <span aria-hidden style={{
              color: c.status === "pass" ? "var(--success-fg)" : c.status === "warn" ? "var(--warning-fg)" : "var(--danger-fg)",
            }}>
              {c.status === "pass" ? "✓" : c.status === "warn" ? "•" : "✗"}
            </span>
            <span style={{ color: "var(--text-default)" }}>{c.label}</span>
            {c.detail && <span style={{ color: "var(--text-muted)" }}>· {c.detail}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function wordCount(s: string): number {
  return (s.match(/\b[a-z0-9]+\b/gi) ?? []).length;
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-default)",
  };
}
