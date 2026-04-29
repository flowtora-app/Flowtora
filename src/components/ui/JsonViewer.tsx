"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// JsonViewer — Spec Page 0 §0.5.61.
//
// Collapsible nested keys, line numbers, search, copy node, copy path,
// syntax-color (key brand-700, string emerald-700, number amber-700,
// boolean rose-700, null neutral-500).

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export interface JsonViewerProps {
  data: JsonValue;
  /** Initial collapse depth — nodes at depth >= N start collapsed. */
  initialExpandedDepth?: number;
  /** Show line numbers along the left gutter. */
  lineNumbers?: boolean;
  className?: string;
  /** Optional search input shown above the tree. */
  withSearch?: boolean;
}

export function JsonViewer({
  data,
  initialExpandedDepth = 2,
  lineNumbers = false,
  className,
  withSearch = false,
}: JsonViewerProps) {
  const [query, setQuery] = React.useState("");
  return (
    <div
      className={cn("overflow-hidden rounded-lg border", className)}
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      {withSearch && (
        <div className="border-b px-3 py-2" style={{ borderColor: "var(--border-subtle)" }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter keys + values…"
            className="ts-focus h-7 w-full rounded-md border bg-transparent px-2 text-[12px] outline-none"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", color: "var(--text-default)" }}
          />
        </div>
      )}
      <div
        className="overflow-x-auto p-3 font-mono"
        style={{ fontSize: "var(--text-code, 0.8125rem)", color: "var(--text-default)", lineHeight: 1.7 }}
      >
        <Node
          value={data}
          path=""
          depth={0}
          initialExpandedDepth={initialExpandedDepth}
          lineNumber={lineNumbers ? { current: { n: 1 } } : null}
          query={query.trim().toLowerCase()}
        />
      </div>
    </div>
  );
}

interface LineRef { current: { n: number } }

function Node({
  value,
  path,
  depth,
  initialExpandedDepth,
  lineNumber,
  query,
  parentKey,
}: {
  value: JsonValue;
  path: string;
  depth: number;
  initialExpandedDepth: number;
  lineNumber: LineRef | null;
  query: string;
  parentKey?: string;
}) {
  const isObj = value !== null && typeof value === "object" && !Array.isArray(value);
  const isArr = Array.isArray(value);
  const [open, setOpen] = React.useState(depth < initialExpandedDepth);

  if (!isObj && !isArr) {
    return <Leaf value={value} path={path} parentKey={parentKey} lineNumber={lineNumber} query={query} />;
  }

  const keys = isArr ? (value as JsonValue[]).map((_, i) => String(i)) : Object.keys(value as object);
  const matches = !query || matchesNode(value, query);
  if (!matches) return null;

  const lineNo = lineNumber ? lineNumber.current.n++ : null;

  return (
    <div>
      <Line
        lineNo={lineNo}
        depth={depth}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="ts-focus inline-flex items-center"
          aria-expanded={open}
          style={{ color: "var(--text-muted)" }}
        >
          <span className="inline-block w-3 transition-transform" style={{ transform: open ? "rotate(90deg)" : undefined }}>›</span>
        </button>
        {parentKey != null && (
          <>
            <span style={{ color: "var(--brand-700, var(--accent-primary))" }}>&quot;{parentKey}&quot;</span>
            <span style={{ color: "var(--text-muted)" }}>: </span>
          </>
        )}
        <span style={{ color: "var(--text-default)" }}>{isArr ? "[" : "{"}</span>
        {!open && (
          <>
            <span style={{ color: "var(--text-muted)" }}> {keys.length} {isArr ? "items" : "keys"} </span>
            <span style={{ color: "var(--text-default)" }}>{isArr ? "]" : "}"}</span>
          </>
        )}
        <NodeActions path={path} value={value} />
      </Line>
      {open && (
        <>
          {keys.map((k) => {
            const childVal = isArr ? (value as JsonValue[])[Number(k)] : (value as Record<string, JsonValue>)[k];
            return (
              <Node
                key={k}
                value={childVal as JsonValue}
                path={path ? `${path}${isArr ? `[${k}]` : `.${k}`}` : isArr ? `[${k}]` : k}
                depth={depth + 1}
                initialExpandedDepth={initialExpandedDepth}
                lineNumber={lineNumber}
                query={query}
                parentKey={isArr ? undefined : k}
              />
            );
          })}
          <Line lineNo={lineNumber ? lineNumber.current.n++ : null} depth={depth}>
            <span style={{ color: "var(--text-default)" }}>{isArr ? "]" : "}"}</span>
          </Line>
        </>
      )}
    </div>
  );
}

function Leaf({
  value,
  path,
  parentKey,
  lineNumber,
  query,
}: {
  value: JsonValue;
  path: string;
  parentKey?: string;
  lineNumber: LineRef | null;
  query: string;
}) {
  if (query && !matchesPrimitive(value, parentKey, query)) return null;
  const lineNo = lineNumber ? lineNumber.current.n++ : null;
  return (
    <Line lineNo={lineNo} depth={0 /* indent handled by parent */}>
      {parentKey != null && (
        <>
          <span style={{ color: "var(--brand-700, var(--accent-primary))" }}>&quot;{parentKey}&quot;</span>
          <span style={{ color: "var(--text-muted)" }}>: </span>
        </>
      )}
      <span style={{ color: typeColor(value) }}>{formatPrimitive(value)}</span>
      <NodeActions path={path} value={value} />
    </Line>
  );
}

function Line({ lineNo, depth, children }: { lineNo: number | null; depth: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 group" style={{ paddingLeft: depth * 16 }}>
      {lineNo != null && (
        <span className="select-none pr-2 text-right" style={{ color: "var(--slate-400, var(--text-faint))", minWidth: "2em" }}>
          {lineNo}
        </span>
      )}
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

function NodeActions({ path, value }: { path: string; value: JsonValue }) {
  const [copied, setCopied] = React.useState<"path" | "node" | null>(null);
  const copy = async (text: string, kind: "path" | "node") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1200);
    } catch {
      // clipboard unavailable
    }
  };
  return (
    <span className="ml-2 inline-flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <button
        type="button"
        onClick={() => copy(path, "path")}
        className="ts-focus rounded px-1 text-[9px]"
        style={{ color: copied === "path" ? "var(--emerald-700)" : "var(--text-muted)" }}
        title="Copy path"
      >
        {copied === "path" ? "✓ path" : "path"}
      </button>
      <button
        type="button"
        onClick={() => copy(JSON.stringify(value, null, 2), "node")}
        className="ts-focus rounded px-1 text-[9px]"
        style={{ color: copied === "node" ? "var(--emerald-700)" : "var(--text-muted)" }}
        title="Copy value"
      >
        {copied === "node" ? "✓ value" : "copy"}
      </button>
    </span>
  );
}

function typeColor(v: JsonValue): string {
  if (v === null) return "var(--slate-500, var(--text-muted))";
  if (typeof v === "string") return "var(--emerald-700, var(--success-fg))";
  if (typeof v === "number") return "var(--amber-700, var(--warning-fg))";
  if (typeof v === "boolean") return "var(--rose-700, var(--danger-fg))";
  return "var(--text-default)";
}

function formatPrimitive(v: JsonValue): React.ReactNode {
  if (v === null) return "null";
  if (typeof v === "string") return `"${v}"`;
  return String(v);
}

function matchesPrimitive(v: JsonValue, key: string | undefined, q: string): boolean {
  if (key && key.toLowerCase().includes(q)) return true;
  return String(v).toLowerCase().includes(q);
}

function matchesNode(v: JsonValue, q: string): boolean {
  if (v === null || typeof v !== "object") return matchesPrimitive(v, undefined, q);
  if (Array.isArray(v)) return v.some((x) => matchesNode(x, q));
  const obj = v as Record<string, JsonValue>;
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase().includes(q)) return true;
    if (matchesNode(obj[k]!, q)) return true;
  }
  return false;
}
