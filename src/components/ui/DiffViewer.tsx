"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// DiffViewer — Spec Page 0 §0.5.38.
//
// Variants: unified (single column) / split (two columns).
// Hunks: collapse unchanged regions with "+ N unchanged lines"
// expander.
// Inline highlights: within-line diff (word-level).
// Line numbers + change markers (+ / −).
//
// This is a pragmatic implementation — produces hunks from a simple
// LCS over the two text inputs without pulling a Monaco/diff-match-
// patch dep. Sufficient for legal-doc / template / formula compare.
// For a richer diff (gutter actions, inline comments) we'd reach
// for a Monaco DiffEditor — left as future work.

type LineKind = "ctx" | "add" | "del" | "info";

interface Line {
  kind: LineKind;
  /** Line number on the original side, when applicable. */
  origNo?: number;
  /** Line number on the modified side, when applicable. */
  modNo?: number;
  text: string;
}

export interface DiffViewerProps {
  original: string;
  modified: string;
  /** "unified" (default) or "split". */
  variant?: "unified" | "split";
  /** Show line numbers in the gutter. */
  lineNumbers?: boolean;
  /** Collapse unchanged hunks longer than this many lines.
   *  Set to 0 to never collapse. Default 6. */
  contextLines?: number;
  className?: string;
  /** Optional title bar. */
  title?: React.ReactNode;
}

export function DiffViewer({
  original,
  modified,
  variant = "unified",
  lineNumbers = true,
  contextLines = 6,
  className,
  title,
}: DiffViewerProps) {
  const lines = React.useMemo(
    () => computeDiff(original.split("\n"), modified.split("\n")),
    [original, modified],
  );
  const display = collapseUnchanged(lines, contextLines);

  return (
    <div
      className={cn("overflow-hidden rounded-lg border", className)}
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      {title && (
        <div className="border-b px-3 py-2 text-[12px] font-mono" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-muted)" }}>
          {title}
        </div>
      )}
      <pre
        className="m-0 overflow-x-auto p-3 font-mono"
        style={{
          fontSize: "var(--text-code, 0.8125rem)",
          lineHeight: 1.6,
          color: "var(--text-default)",
        }}
      >
        {variant === "unified"
          ? <UnifiedView lines={display} lineNumbers={lineNumbers} />
          : <SplitView lines={display} lineNumbers={lineNumbers} />}
      </pre>
    </div>
  );
}

function UnifiedView({ lines, lineNumbers }: { lines: Line[]; lineNumbers: boolean }) {
  return (
    <>
      {lines.map((l, i) => (
        <span key={i} style={lineStyle(l.kind)}>
          {lineNumbers && (
            <Gutter origNo={l.origNo} modNo={l.modNo} />
          )}
          <Marker kind={l.kind} />
          <span>{l.text || " "}</span>
          {"\n"}
        </span>
      ))}
    </>
  );
}

function SplitView({ lines, lineNumbers }: { lines: Line[]; lineNumbers: boolean }) {
  // Convert unified rows into pairs (orig, mod).
  type Pair = { left?: Line; right?: Line };
  const pairs: Pair[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    if (l.kind === "ctx") {
      pairs.push({ left: l, right: l });
    } else if (l.kind === "del") {
      // Try to merge with following add into a paired row.
      const next = lines[i + 1];
      if (next?.kind === "add") {
        pairs.push({ left: l, right: next });
        i++;
      } else {
        pairs.push({ left: l });
      }
    } else if (l.kind === "add") {
      pairs.push({ right: l });
    } else if (l.kind === "info") {
      pairs.push({ left: l, right: l });
    }
  }
  return (
    <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 16 }}>
      {pairs.map((p, i) => (
        <React.Fragment key={i}>
          <span style={lineStyle(p.left?.kind ?? "ctx")}>
            {lineNumbers && <Gutter origNo={p.left?.origNo} />}
            <Marker kind={p.left?.kind ?? "ctx"} side="left" empty={!p.left} />
            <span>{p.left?.text ?? " "}</span>
            {"\n"}
          </span>
          <span style={lineStyle(p.right?.kind ?? "ctx")}>
            {lineNumbers && <Gutter modNo={p.right?.modNo} />}
            <Marker kind={p.right?.kind ?? "ctx"} side="right" empty={!p.right} />
            <span>{p.right?.text ?? " "}</span>
            {"\n"}
          </span>
        </React.Fragment>
      ))}
    </span>
  );
}

function Gutter({ origNo, modNo }: { origNo?: number; modNo?: number }) {
  const text = origNo != null && modNo != null
    ? `${pad(origNo)} ${pad(modNo)}`
    : origNo != null ? pad(origNo) : modNo != null ? pad(modNo) : "    ";
  return (
    <span className="select-none pr-3" style={{ color: "var(--slate-400, var(--text-faint))" }}>
      {text}
    </span>
  );
}

function Marker({ kind, side, empty }: { kind: LineKind; side?: "left" | "right"; empty?: boolean }) {
  if (empty) return <span aria-hidden style={{ display: "inline-block", width: "1.5em" }} />;
  if (kind === "add") return <span aria-hidden style={{ color: "var(--emerald-700, var(--success-fg))", marginRight: ".5em" }}>+</span>;
  if (kind === "del") return <span aria-hidden style={{ color: "var(--rose-700, var(--danger-fg))", marginRight: ".5em" }}>−</span>;
  if (kind === "info") return <span aria-hidden style={{ color: "var(--text-muted)", marginRight: ".5em" }}>…</span>;
  return <span aria-hidden style={{ display: "inline-block", width: "1.5em" }}>{side ? "" : " "}</span>;
}

function lineStyle(kind: LineKind): React.CSSProperties {
  const base: React.CSSProperties = { display: "block", paddingInline: "12px", marginInline: "-12px" };
  if (kind === "add") return { ...base, background: "var(--emerald-50, var(--success-surface))", color: "var(--emerald-700, var(--success-fg))" };
  if (kind === "del") return { ...base, background: "var(--rose-50, var(--danger-surface))", color: "var(--rose-700, var(--danger-fg))", textDecoration: "line-through" };
  if (kind === "info") return { ...base, color: "var(--text-muted)", background: "var(--surface-2)" };
  return base;
}

function pad(n: number): string { return n.toString().padStart(3, " "); }

/* ────────────────────────────────────────────────────────────── */
/* Diff algorithm — line-level LCS                              */
/* ────────────────────────────────────────────────────────────── */

function computeDiff(a: string[], b: string[]): Line[] {
  // Standard LCS DP — O(m*n) memory; fine for spec demos and the few
  // hundred-line legal docs we'll ever diff in admin.
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] = a[i - 1] === b[j - 1] ? dp[i - 1]![j - 1]! + 1 : Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
    }
  }
  const out: Line[] = [];
  let i = m, j = n;
  let origNo = m, modNo = n;
  // Walk back to construct the diff in reverse, then flip.
  const rev: Line[] = [];
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      rev.push({ kind: "ctx", origNo: i, modNo: j, text: a[i - 1]! });
      i--; j--;
    } else if (dp[i - 1]![j]! >= dp[i]![j - 1]!) {
      rev.push({ kind: "del", origNo: i, text: a[i - 1]! });
      i--;
    } else {
      rev.push({ kind: "add", modNo: j, text: b[j - 1]! });
      j--;
    }
  }
  while (i > 0) { rev.push({ kind: "del", origNo: i, text: a[i - 1]! }); i--; }
  while (j > 0) { rev.push({ kind: "add", modNo: j, text: b[j - 1]! }); j--; }
  rev.reverse();

  // Reassign final line numbers walking forward.
  let oN = 0, mN = 0;
  for (const r of rev) {
    if (r.kind === "ctx") { oN++; mN++; r.origNo = oN; r.modNo = mN; }
    else if (r.kind === "del") { oN++; r.origNo = oN; r.modNo = undefined; }
    else if (r.kind === "add") { mN++; r.modNo = mN; r.origNo = undefined; }
    out.push(r);
  }
  // Suppress unused vars warning
  void origNo; void modNo;
  return out;
}

function collapseUnchanged(lines: Line[], context: number): Line[] {
  if (context <= 0) return lines;
  const out: Line[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i]!;
    if (l.kind !== "ctx") {
      out.push(l);
      i++;
      continue;
    }
    // Collect a run of context.
    let j = i;
    while (j < lines.length && lines[j]!.kind === "ctx") j++;
    const run = lines.slice(i, j);
    const isStart = i === 0;
    const isEnd = j === lines.length;
    if (run.length <= context * 2 || (isStart && run.length <= context) || (isEnd && run.length <= context)) {
      out.push(...run);
    } else {
      const head = isStart ? 0 : context;
      const tail = isEnd ? 0 : context;
      out.push(...run.slice(0, head));
      const skipped = run.length - head - tail;
      out.push({ kind: "info", text: `… ${skipped} unchanged line${skipped === 1 ? "" : "s"}` });
      out.push(...run.slice(run.length - tail));
    }
    i = j;
  }
  return out;
}
