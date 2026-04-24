import * as React from "react";
import Link from "next/link";
import type { AttentionGroups, AttentionItem, AttentionKind } from "@/lib/attention";

// Phase 6 — "Needs your attention" panel.
//
// Surfaces the output of `loadAttention()` inline on the dashboard so
// members see overdue quotes, stale proofs, unconfirmed installs,
// overdue invoices, and overdue tasks without a separate page hop.
//
// Each persona picks which attention kinds to show — a designer cares
// about stale proofs, not overdue invoices; finance cares about overdue
// invoices and nothing else. The `kinds` prop filters the feed.
//
// Urgency tone per kind is baked in here so every page renders them the
// same (red for overdue/expired, amber for aging, neutral for info).

type Props = {
  slug: string;
  groups: AttentionGroups;
  /** Which attention kinds this persona cares about, in display order. */
  kinds: AttentionKind[];
  /** Cap per-kind so the panel doesn't blow up on a busy day. */
  perKindLimit?: number;
  /** Optional title override; defaults to "Needs your attention". */
  title?: string;
  /** Copy shown when the filtered feed is empty. */
  emptyLabel?: string;
};

const KIND_LABEL: Record<AttentionKind, string> = {
  "quote.overdue":       "Expired quotes",
  "quote.expiring":      "Quotes expiring soon",
  "quote.stale":         "Quotes awaiting a read",
  "proof.stale":         "Proofs awaiting a response",
  "invoice.overdue":     "Past-due invoices",
  "invoice.unsent":      "Invoices never sent",
  "order.overdue":       "Orders past due",
  "install.unconfirmed": "Installs awaiting confirm",
  "task.overdue":        "Overdue tasks",
};

const KIND_TONE: Record<AttentionKind, "danger" | "warning" | "default"> = {
  "quote.overdue":       "danger",
  "quote.expiring":      "warning",
  "quote.stale":         "warning",
  "proof.stale":         "warning",
  "invoice.overdue":     "danger",
  "invoice.unsent":      "warning",
  "order.overdue":       "danger",
  "install.unconfirmed": "warning",
  "task.overdue":        "warning",
};

const KIND_FIELD: Record<AttentionKind, keyof AttentionGroups> = {
  "quote.overdue":       "quotesOverdue",
  "quote.expiring":      "quotesExpiring",
  "quote.stale":         "quotesStale",
  "proof.stale":         "proofsStale",
  "invoice.overdue":     "invoicesOverdue",
  "invoice.unsent":      "invoicesUnsent",
  "order.overdue":       "ordersOverdue",
  "install.unconfirmed": "installsUnconfirmed",
  "task.overdue":        "tasksOverdue",
};

const TONE_STYLES: Record<"danger" | "warning" | "default", { dot: string; label: string }> = {
  danger:  { dot: "var(--danger-fg)",  label: "var(--danger-fg)" },
  warning: { dot: "var(--warning-fg, var(--accent-primary))", label: "var(--warning-fg, var(--accent-primary))" },
  default: { dot: "var(--text-muted)", label: "var(--text-muted)" },
};

export function AttentionPanel({
  slug,
  groups,
  kinds,
  perKindLimit = 4,
  title = "Needs your attention",
  emptyLabel = "You're all caught up. Nothing aging, nothing overdue.",
}: Props) {
  const sections = kinds
    .map((kind) => {
      const field = KIND_FIELD[kind];
      const items = groups[field] ?? [];
      return { kind, items };
    })
    .filter((s) => s.items.length > 0);

  const total = sections.reduce((sum, s) => sum + s.items.length, 0);

  return (
    <section
      className="rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <header
        className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="flex items-center gap-2">
          <h2
            className="text-sm font-semibold"
            style={{ color: "var(--text-default)" }}
          >
            {title}
          </h2>
          {total > 0 && (
            <span
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold"
              style={{
                background: "var(--danger-surface)",
                color: "var(--danger-fg)",
              }}
            >
              {total}
            </span>
          )}
        </div>
        <Link
          href={`/t/${slug}/inbox?chip=attention`}
          className="text-xs font-medium"
          style={{ color: "var(--accent-primary)" }}
        >
          View all →
        </Link>
      </header>

      {total === 0 ? (
        <EmptyState label={emptyLabel} />
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {sections.map((section) => (
            <KindSection
              key={section.kind}
              slug={slug}
              kind={section.kind}
              items={section.items.slice(0, perKindLimit)}
              overflow={Math.max(0, section.items.length - perKindLimit)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function KindSection({
  slug,
  kind,
  items,
  overflow,
}: {
  slug: string;
  kind: AttentionKind;
  items: AttentionItem[];
  overflow: number;
}) {
  const tone = TONE_STYLES[KIND_TONE[kind]];
  return (
    <div className="px-5 py-4" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: tone.dot }}
        />
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: tone.label }}
        >
          {KIND_LABEL[kind]}
        </span>
        <span
          className="text-[11px]"
          style={{ color: "var(--text-faint)" }}
        >
          · {items.length}
          {overflow > 0 ? ` of ${items.length + overflow}` : ""}
        </span>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              href={`/t/${slug}/${item.href}`}
              className="group flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 -mx-2 transition-colors hover:brightness-110"
              style={{ background: "transparent" }}
            >
              <div className="min-w-0 flex-1">
                <div
                  className="truncate text-sm font-medium"
                  style={{ color: "var(--text-default)" }}
                >
                  {item.title}
                </div>
                <div
                  className="truncate text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {item.detail}
                </div>
              </div>
              <span
                aria-hidden
                className="text-xs opacity-0 transition-opacity group-hover:opacity-100"
                style={{ color: "var(--accent-primary)" }}
              >
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {overflow > 0 && (
        <Link
          href={`/t/${slug}/inbox?chip=attention`}
          className="mt-2 inline-block text-xs"
          style={{ color: "var(--accent-primary)" }}
        >
          + {overflow} more →
        </Link>
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div
      className="flex items-center gap-3 px-5 py-6 text-sm"
      style={{ color: "var(--text-muted)" }}
    >
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px]"
        style={{
          background: "var(--success-surface)",
          color: "var(--success-fg)",
        }}
      >
        ✓
      </span>
      <span>{label}</span>
    </div>
  );
}
