"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/shell/icons";
import { searchAdmin, type AdminSearchResults, type AdminSearchRow, type EntityKind } from "@/app/actions/admin-search";

// ─────────────────────────────────────────────────────────────────────
// Premium-feel admin search.
//
// Single-page experience modeled after Linear / Stripe / Notion:
//   - Instant search (200ms debounce) via the searchAdmin server action
//   - Per-entity filter chips with live counts
//   - Keyboard navigation: ↑/↓ between rows, Enter to open, Esc to clear
//   - ⌘K / Ctrl+K from anywhere on the page focuses the input
//   - Match-text highlighting in primary + secondary
//   - Recent searches persisted in localStorage (last 8)
//   - Suggested quick-jump links when the input is empty
//   - Race-condition-safe — stale results from earlier keystrokes
//     never overwrite a newer state
//   - Loading skeleton during in-flight queries
//
// All visual styling reads from the existing CSS variable token
// system so dark/light theme handling is automatic.
// ─────────────────────────────────────────────────────────────────────

type FilterKey = "all" | EntityKind;

type RecentEntry = { query: string; at: number };
const RECENTS_STORAGE_KEY = "ts.adminSearch.recents";
const MAX_RECENTS = 8;
const DEBOUNCE_MS = 200;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",      label: "All"       },
  { key: "tenant",   label: "Tenants"   },
  { key: "customer", label: "Customers" },
  { key: "ticket",   label: "Tickets"   },
  { key: "lead",     label: "Leads"     },
  { key: "user",     label: "Users"     },
];

const KIND_META: Record<EntityKind, { label: string; iconKey: keyof typeof Icon; tone: string }> = {
  tenant:   { label: "Tenants",        iconKey: "Building",      tone: "var(--accent-primary)" },
  user:     { label: "Users",          iconKey: "User",          tone: "var(--accent-primary)" },
  customer: { label: "Customers",      iconKey: "Customers",     tone: "var(--success-fg)"      },
  ticket:   { label: "Support tickets",iconKey: "Support",       tone: "var(--warning-fg)"      },
  lead:     { label: "Marketing leads",iconKey: "Target",        tone: "var(--accent-primary)" },
};

// ─────────────────────────────────────────────────────────────────────
// Quick-link suggestions for the empty state — frequently-needed
// admin views, surfaced before the user has even typed.
// ─────────────────────────────────────────────────────────────────────
const QUICK_LINKS: { label: string; href: string; iconKey: keyof typeof Icon; description: string }[] = [
  { label: "Tenants",          href: "/platform/tenants",   iconKey: "Building", description: "All accounts, sortable by health and activity." },
  { label: "Open support",     href: "/platform/support",   iconKey: "Support",  description: "Tickets needing a response right now." },
  { label: "New leads",        href: "/platform/leads",     iconKey: "Target",   description: "Inbound from the marketing site." },
  { label: "Health",           href: "/platform/health",    iconKey: "Heartbeat",description: "Platform-wide reliability dashboard." },
];

export function AdminSearch() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [results, setResults] = React.useState<AdminSearchResults | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [highlighted, setHighlighted] = React.useState(0);
  const [recents, setRecents] = React.useState<RecentEntry[]>([]);

  // Race protection — every fetch carries a token; only the latest
  // wins. Prevents older slow responses from overwriting fresher state.
  const reqIdRef = React.useRef(0);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Recents persistence ──────────────────────────────────────────
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENTS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RecentEntry[];
        if (Array.isArray(parsed)) setRecents(parsed.slice(0, MAX_RECENTS));
      }
    } catch {
      /* private mode etc. */
    }
  }, []);

  const persistRecents = React.useCallback((next: RecentEntry[]) => {
    setRecents(next);
    try {
      window.localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
  }, []);

  const recordRecent = React.useCallback((q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    const next: RecentEntry[] = [
      { query: trimmed, at: Date.now() },
      ...recents.filter((r) => r.query.toLowerCase() !== trimmed.toLowerCase()),
    ].slice(0, MAX_RECENTS);
    persistRecents(next);
  }, [recents, persistRecents]);

  const clearRecents = React.useCallback(() => persistRecents([]), [persistRecents]);

  // ── Debounced search ─────────────────────────────────────────────
  React.useEffect(() => {
    const trimmed = query.trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (trimmed.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const token = ++reqIdRef.current;
      setLoading(true);
      try {
        const r = await searchAdmin(trimmed);
        if (token !== reqIdRef.current) return; // stale
        setResults(r);
        setHighlighted(0);
      } catch (err) {
        if (token !== reqIdRef.current) return;
        console.error("[AdminSearch] search failed:", err);
      } finally {
        if (token === reqIdRef.current) setLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // ── ⌘K / Ctrl+K focus shortcut ───────────────────────────────────
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── Build flat list for keyboard nav ─────────────────────────────
  const visibleRows: AdminSearchRow[] = React.useMemo(() => {
    if (!results) return [];
    const groups = results.groups;
    const out: AdminSearchRow[] = [];
    if (filter === "all" || filter === "tenant")   out.push(...groups.tenants);
    if (filter === "all" || filter === "customer") out.push(...groups.customers);
    if (filter === "all" || filter === "ticket")   out.push(...groups.tickets);
    if (filter === "all" || filter === "lead")     out.push(...groups.leads);
    if (filter === "all" || filter === "user")     out.push(...groups.users);
    return out;
  }, [results, filter]);

  // Clamp highlighted index whenever the visible-row set changes.
  React.useEffect(() => {
    if (highlighted >= visibleRows.length) {
      setHighlighted(Math.max(0, visibleRows.length - 1));
    }
  }, [visibleRows.length, highlighted]);

  // ── Keyboard handler on the input ────────────────────────────────
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => Math.min(visibleRows.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      const row = visibleRows[highlighted];
      if (row) {
        recordRecent(query);
        router.push(row.href);
      }
    } else if (e.key === "Escape") {
      if (query) setQuery("");
      else inputRef.current?.blur();
    }
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-default)" }}>
          Search
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Tenants, customers, tickets, marketing leads, users — one query, every surface.
        </p>
      </header>

      <SearchInput
        ref={inputRef}
        value={query}
        onChange={setQuery}
        onKeyDown={onInputKeyDown}
        loading={loading}
      />

      {results && results.totalHits > 0 && (
        <FilterChips
          filter={filter}
          onChange={setFilter}
          counts={results.counts}
        />
      )}

      {/* Empty state — recents + suggested quick links */}
      {!query && !results && (
        <EmptyState
          recents={recents}
          onPickRecent={(q) => setQuery(q)}
          onClearRecents={clearRecents}
        />
      )}

      {/* Pre-2-char "keep typing" hint */}
      {query.length === 1 && !results && (
        <Card>
          <div className="px-5 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
            Keep typing — minimum 2 characters.
          </div>
        </Card>
      )}

      {/* Loading skeleton */}
      {loading && !results && query.length >= 2 && <ResultSkeleton />}

      {/* Results */}
      {results && results.totalHits > 0 && (
        <Results
          results={results}
          filter={filter}
          query={results.query}
          visibleRows={visibleRows}
          highlighted={highlighted}
          setHighlighted={setHighlighted}
          onSelect={() => recordRecent(query)}
        />
      )}

      {/* No results */}
      {results && results.totalHits === 0 && query.length >= 2 && !loading && (
        <Card>
          <div className="px-5 py-8 text-center text-sm" style={{ color: "var(--text-muted)" }}>
            <div className="mb-2 text-base font-medium" style={{ color: "var(--text-default)" }}>
              No results for &ldquo;{results.query}&rdquo;
            </div>
            <p>Try a tenant slug, an email, or part of a ticket subject.</p>
          </div>
        </Card>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Search input — full-width pill with magnifying glass, clear ×,
 * loading spinner on the right, ⌘K hint when the field is empty.
 * ────────────────────────────────────────────────────────────────── */
const SearchInput = React.forwardRef<
  HTMLInputElement,
  {
    value: string;
    onChange: (v: string) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    loading: boolean;
  }
>(function SearchInput({ value, onChange, onKeyDown, loading }, ref) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
        boxShadow: "var(--shadow-sm)",
        height: 56,
      }}
    >
      <Icon.Search size={18} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      <input
        ref={ref}
        type="search"
        value={value}
        autoFocus
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Try a tenant name, an email, or a ticket ID…"
        className="ts-focus flex-1 bg-transparent text-base outline-none"
        style={{ color: "var(--text-default)" }}
        aria-label="Admin search"
      />
      {value.length > 0 && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="ts-focus inline-flex h-6 w-6 items-center justify-center rounded-full transition-colors"
          style={{
            color: "var(--text-muted)",
            background: "var(--surface-2)",
          }}
        >
          <Icon.X size={12} />
        </button>
      )}
      {loading && (
        <Spinner />
      )}
      {!loading && value.length === 0 && (
        <kbd
          className="hidden items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium sm:inline-flex"
          style={{
            background: "var(--surface-2)",
            color: "var(--text-muted)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          ⌘K
        </kbd>
      )}
    </div>
  );
});

function Spinner() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
      style={{ color: "var(--text-muted)" }}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Filter chips — pill-style toggle with live counts. "All" is the
 * default, others enable when their bucket has any hit so we don't
 * show a useless "Tenants 0" chip.
 * ────────────────────────────────────────────────────────────────── */
function FilterChips({
  filter,
  onChange,
  counts,
}: {
  filter: FilterKey;
  onChange: (next: FilterKey) => void;
  counts: AdminSearchResults["counts"];
}) {
  const total = counts.tenants + counts.users + counts.customers + counts.tickets + counts.leads;
  const valueFor = (k: FilterKey): number => {
    if (k === "all") return total;
    if (k === "tenant")   return counts.tenants;
    if (k === "user")     return counts.users;
    if (k === "customer") return counts.customers;
    if (k === "ticket")   return counts.tickets;
    return counts.leads;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {FILTERS.map((f) => {
        const n = valueFor(f.key);
        const active = filter === f.key;
        const dimmed = n === 0;
        return (
          <button
            key={f.key}
            type="button"
            onClick={() => onChange(f.key)}
            disabled={dimmed && f.key !== "all"}
            className="ts-focus inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: active ? "var(--accent-primary)" : "var(--surface-1)",
              color: active ? "var(--accent-fg)" : "var(--text-default)",
              border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-default)"}`,
              opacity: dimmed && f.key !== "all" ? 0.45 : 1,
              cursor: dimmed && f.key !== "all" ? "not-allowed" : "pointer",
            }}
          >
            {f.label}
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] tabular-nums"
              style={{
                background: active ? "rgba(0,0,0,0.18)" : "var(--surface-2)",
                color: active ? "var(--accent-fg)" : "var(--text-muted)",
              }}
            >
              {n}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Results — grouped sections, with a flat keyboard-index from the
 * visibleRows list passed down so ↑/↓ moves across group boundaries.
 * ────────────────────────────────────────────────────────────────── */
function Results({
  results,
  filter,
  query,
  visibleRows,
  highlighted,
  setHighlighted,
  onSelect,
}: {
  results: AdminSearchResults;
  filter: FilterKey;
  query: string;
  visibleRows: AdminSearchRow[];
  highlighted: number;
  setHighlighted: (n: number) => void;
  onSelect: () => void;
}) {
  const showGroup = (k: EntityKind) => filter === "all" || filter === k;
  // Build an index map so each row knows its position in the flat list.
  const indexById = new Map<string, number>();
  visibleRows.forEach((r, i) => indexById.set(`${r.kind}:${r.id}`, i));

  const renderGroup = (kind: EntityKind, rows: AdminSearchRow[]) => {
    if (!showGroup(kind) || rows.length === 0) return null;
    const meta = KIND_META[kind];
    const IconCmp = Icon[meta.iconKey];
    return (
      <Card key={kind}>
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <div className="flex items-center gap-2">
            <span style={{ color: meta.tone }}>
              <IconCmp size={14} />
            </span>
            <span
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: "var(--text-muted)" }}
            >
              {meta.label}
            </span>
          </div>
          <span
            className="rounded-full px-2 py-0.5 text-[11px] tabular-nums"
            style={{
              background: "var(--surface-2)",
              color: "var(--text-muted)",
            }}
          >
            {rows.length}
          </span>
        </div>
        <ul>
          {rows.map((row) => {
            const idx = indexById.get(`${row.kind}:${row.id}`) ?? -1;
            const isHighlighted = idx === highlighted;
            return (
              <ResultRow
                key={`${row.kind}:${row.id}`}
                row={row}
                query={query}
                isHighlighted={isHighlighted}
                onMouseEnter={() => setHighlighted(idx)}
                onClick={onSelect}
              />
            );
          })}
        </ul>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <div
        className="flex items-baseline justify-between text-xs"
        style={{ color: "var(--text-muted)" }}
      >
        <span>
          {results.totalHits} result{results.totalHits === 1 ? "" : "s"}{" "}
          for &ldquo;<span style={{ color: "var(--text-default)" }}>{query}</span>&rdquo;
        </span>
        <span>
          {results.durationMs} ms · ↑↓ to nav · ↵ to open
        </span>
      </div>

      {renderGroup("tenant",   results.groups.tenants)}
      {renderGroup("customer", results.groups.customers)}
      {renderGroup("ticket",   results.groups.tickets)}
      {renderGroup("lead",     results.groups.leads)}
      {renderGroup("user",     results.groups.users)}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Result row — icon chip + primary + secondary + badges + arrow.
 * Hover state and keyboard-highlighted state share the same visual.
 * ────────────────────────────────────────────────────────────────── */
function ResultRow({
  row,
  query,
  isHighlighted,
  onMouseEnter,
  onClick,
}: {
  row: AdminSearchRow;
  query: string;
  isHighlighted: boolean;
  onMouseEnter: () => void;
  onClick: () => void;
}) {
  const meta = KIND_META[row.kind];
  const IconCmp = Icon[meta.iconKey];
  return (
    <li>
      <Link
        href={row.href}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        className="ts-focus flex items-center gap-3 px-5 py-3 transition-colors"
        style={{
          background: isHighlighted ? "var(--accent-surface)" : "transparent",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
          style={{
            background: "var(--surface-2)",
            color: meta.tone,
            border: "1px solid var(--border-subtle)",
          }}
        >
          <IconCmp size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-sm font-medium"
            style={{ color: "var(--text-default)" }}
          >
            <HighlightedText text={row.primary} query={query} />
          </div>
          {row.secondary && (
            <div
              className="truncate text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              <HighlightedText text={row.secondary} query={query} />
            </div>
          )}
        </div>
        {row.badges && row.badges.length > 0 && (
          <div className="flex shrink-0 items-center gap-1.5">
            {row.badges.map((b, i) => (
              <Badge key={i} label={b.label} tone={b.tone ?? "neutral"} />
            ))}
          </div>
        )}
        <Icon.ChevronRight size={14} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
      </Link>
    </li>
  );
}

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "neutral" | "accent" | "success" | "warning" | "danger";
}) {
  const palette: Record<typeof tone, { bg: string; fg: string }> = {
    neutral: { bg: "var(--surface-2)",       fg: "var(--text-muted)"      },
    accent:  { bg: "var(--accent-surface)",  fg: "var(--accent-primary)"  },
    success: { bg: "var(--success-surface)", fg: "var(--success-fg)"      },
    warning: { bg: "var(--warning-surface)", fg: "var(--warning-fg)"      },
    danger:  { bg: "var(--danger-surface)",  fg: "var(--danger-fg)"       },
  };
  const c = palette[tone];
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
      style={{ background: c.bg, color: c.fg }}
    >
      {label}
    </span>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Highlighted text — splits on the first occurrence of `query` and
 * wraps that span with the accent color so the user sees what
 * matched. Case-insensitive; falls back to the original text.
 * ────────────────────────────────────────────────────────────────── */
function HighlightedText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark
        className="rounded-sm px-0.5"
        style={{
          background: "var(--accent-surface)",
          color: "var(--accent-primary)",
          fontWeight: 600,
        }}
      >
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Empty state — recents + suggested quick links. Shown before any
 * search has happened; takes up the empty space gracefully.
 * ────────────────────────────────────────────────────────────────── */
function EmptyState({
  recents,
  onPickRecent,
  onClearRecents,
}: {
  recents: RecentEntry[];
  onPickRecent: (q: string) => void;
  onClearRecents: () => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--text-muted)" }}
          >
            Recent
          </span>
          {recents.length > 0 && (
            <button
              type="button"
              onClick={onClearRecents}
              className="text-xs underline"
              style={{ color: "var(--text-faint)" }}
            >
              Clear
            </button>
          )}
        </div>
        {recents.length === 0 ? (
          <div className="px-5 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
            Your recent searches will show up here.
          </div>
        ) : (
          <ul>
            {recents.map((r) => (
              <li key={r.query}>
                <button
                  type="button"
                  onClick={() => onPickRecent(r.query)}
                  className="ts-focus flex w-full items-center gap-3 px-5 py-2.5 text-left transition-colors"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <Icon.Search size={14} style={{ color: "var(--text-faint)" }} />
                  <span className="flex-1 text-sm" style={{ color: "var(--text-default)" }}>
                    {r.query}
                  </span>
                  <Icon.ArrowRight size={12} style={{ color: "var(--text-faint)" }} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div
          className="flex items-center px-5 py-3"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <span
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: "var(--text-muted)" }}
          >
            Jump to
          </span>
        </div>
        <ul>
          {QUICK_LINKS.map((q) => {
            const IconCmp = Icon[q.iconKey];
            return (
              <li key={q.href}>
                <Link
                  href={q.href}
                  className="ts-focus flex items-center gap-3 px-5 py-3 transition-colors"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
                    style={{
                      background: "var(--accent-surface)",
                      color: "var(--accent-primary)",
                    }}
                  >
                    <IconCmp size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className="text-sm font-medium"
                      style={{ color: "var(--text-default)" }}
                    >
                      {q.label}
                    </div>
                    <div
                      className="truncate text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {q.description}
                    </div>
                  </div>
                  <Icon.ChevronRight size={14} style={{ color: "var(--text-faint)" }} />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Skeleton — three faded rows while a query is in flight on the
 * very first search. Subsequent searches keep the previous results
 * visible while loading so the UI doesn't strobe.
 * ────────────────────────────────────────────────────────────────── */
function ResultSkeleton() {
  return (
    <Card>
      <div className="px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <span
          className="block h-3 w-20 rounded animate-pulse"
          style={{ background: "var(--surface-3)" }}
        />
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 px-5 py-3"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <span
            className="block h-8 w-8 rounded-md animate-pulse"
            style={{ background: "var(--surface-3)" }}
          />
          <div className="flex-1 space-y-2">
            <span
              className="block h-3 w-1/3 rounded animate-pulse"
              style={{ background: "var(--surface-3)" }}
            />
            <span
              className="block h-2.5 w-1/2 rounded animate-pulse"
              style={{ background: "var(--surface-3)", opacity: 0.7 }}
            />
          </div>
        </div>
      ))}
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────
 * Card — local lightweight clone (matches the global Card primitive
 * but inlined here so this component file is fully self-contained
 * and the search page has no external visual dependencies beyond
 * the design tokens).
 * ────────────────────────────────────────────────────────────────── */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {children}
    </div>
  );
}
