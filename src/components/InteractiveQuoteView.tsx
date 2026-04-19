"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";

// Mirrors the shape we serialize on the server. Every Decimal is pre-
// stringified / pre-numberified before crossing the boundary — Next.js 15
// won't accept Decimal class instances in a server→client handoff.
export type InteractiveQuoteItem = {
  id: string;
  name: string;
  description: string | null;
  subtotal: number;
  taxable: boolean;
  isOptional: boolean;
  sectionId: string | null;
  // Pre-formatted for display — parseSelectedOptions runs on the server.
  optionSummary: string | null;
};

export type InteractiveQuoteSection = {
  id: string;
  title: string;
  description: string | null;
};

export type InteractiveQuoteProps = {
  currency: string;
  // Totals config — we recompute the total client-side whenever the
  // customer toggles optional lines. Uses the exact same rules as
  // computeQuoteTotals on the server so the preview matches the real total.
  discountType: "NONE" | "FIXED" | "PERCENT";
  discountValue: number;
  taxRate: number; // 0.0875 etc
  depositType: "NONE" | "FIXED" | "PERCENT";
  depositValue: number;
  // Data
  items: InteractiveQuoteItem[];
  sections: InteractiveQuoteSection[];
  // Submission — the form action is bound on the server. We render two
  // submit buttons (Approve / Decline) and include hidden inputs naming
  // each accepted optional line id. The server action flips those rows
  // to required, recomputes totals, then transitions the quote status.
  formAction: (formData: FormData) => void | Promise<void>;
  // When false, we're showing the customer a read-only view (e.g. the
  // quote is already APPROVED/DECLINED/EXPIRED).
  decidable: boolean;
  // Optional rich text blocks to include in the UI
  customerNote: string | null;
  terms: string | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Client-side mirror of `computeQuoteTotals` so the customer sees live
// numbers as they toggle add-ons. Must stay in sync with the server helper.
function previewTotals(
  items: InteractiveQuoteItem[],
  accepted: Set<string>,
  opts: {
    discountType: InteractiveQuoteProps["discountType"];
    discountValue: number;
    taxRate: number;
    depositType: InteractiveQuoteProps["depositType"];
    depositValue: number;
  },
) {
  // An item is "in" the total if it's required OR it was accepted here.
  const included = items.filter((it) => !it.isOptional || accepted.has(it.id));
  const subtotal = included.reduce((s, it) => s + it.subtotal, 0);

  let discountAmount = 0;
  if (opts.discountType === "FIXED") {
    discountAmount = Math.min(Math.max(0, opts.discountValue), subtotal);
  } else if (opts.discountType === "PERCENT") {
    const pct = Math.min(100, Math.max(0, opts.discountValue));
    discountAmount = subtotal * (pct / 100);
  }

  const taxableSubtotal = included
    .filter((it) => it.taxable)
    .reduce((s, it) => s + it.subtotal, 0);
  const taxableBase = subtotal > 0
    ? Math.max(0, taxableSubtotal - discountAmount * (taxableSubtotal / subtotal))
    : 0;
  const taxAmount = taxableBase * Math.max(0, opts.taxRate);
  const total = Math.max(0, subtotal - discountAmount + taxAmount);

  let depositAmount = 0;
  if (opts.depositType === "FIXED") {
    depositAmount = Math.min(Math.max(0, opts.depositValue), total);
  } else if (opts.depositType === "PERCENT") {
    const pct = Math.min(100, Math.max(0, opts.depositValue));
    depositAmount = total * (pct / 100);
  }

  return {
    subtotal: round2(subtotal),
    discountAmount: round2(discountAmount),
    taxAmount: round2(taxAmount),
    total: round2(total),
    depositAmount: round2(depositAmount),
  };
}

export function InteractiveQuoteView(props: InteractiveQuoteProps) {
  const {
    currency,
    items,
    sections,
    formAction,
    decidable,
    customerNote,
    terms,
    discountType,
    discountValue,
    taxRate,
    depositType,
    depositValue,
  } = props;

  // Initially nothing is accepted — the customer opts in.
  const [accepted, setAccepted] = useState<Set<string>>(new Set());

  const totals = useMemo(
    () => previewTotals(items, accepted, {
      discountType, discountValue, taxRate, depositType, depositValue,
    }),
    [items, accepted, discountType, discountValue, taxRate, depositType, depositValue],
  );

  function toggle(id: string) {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Group items by section; un-grouped bucket is rendered first.
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const ungrouped = items.filter((it) => !it.sectionId || !sectionById.has(it.sectionId));
  const bySection = new Map<string, InteractiveQuoteItem[]>();
  for (const s of sections) bySection.set(s.id, []);
  for (const it of items) {
    if (it.sectionId && sectionById.has(it.sectionId)) bySection.get(it.sectionId)!.push(it);
  }

  return (
    <div className="space-y-6">
      {/* Customer note */}
      {customerNote && (
        <div
          className="rounded-lg px-5 py-4 text-sm whitespace-pre-wrap"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
            Note from us
          </div>
          {customerNote}
        </div>
      )}

      {/* Line items */}
      <div
        className="rounded-lg"
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="px-5 py-3 text-sm font-semibold" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          Line items
        </div>

        {ungrouped.length > 0 && (
          <ItemBlock
            items={ungrouped}
            accepted={accepted}
            toggle={toggle}
            decidable={decidable}
            currency={currency}
          />
        )}

        {sections.map((s) => {
          const secItems = bySection.get(s.id) ?? [];
          return (
            <div key={s.id}>
              <div
                className="px-5 py-3"
                style={{
                  background: "var(--surface-1)",
                  borderTop: "1px solid var(--border-subtle)",
                }}
              >
                <div className="text-sm font-semibold">{s.title}</div>
                {s.description && (
                  <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    {s.description}
                  </div>
                )}
              </div>
              {secItems.length > 0 ? (
                <ItemBlock
                  items={secItems}
                  accepted={accepted}
                  toggle={toggle}
                  decidable={decidable}
                  currency={currency}
                />
              ) : (
                <div className="px-5 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  Empty section.
                </div>
              )}
            </div>
          );
        })}

        {items.length === 0 && (
          <div className="px-5 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
            No line items.
          </div>
        )}

        {/* Totals */}
        <div className="px-5 py-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <TotalsRow label="Subtotal" value={formatMoney(totals.subtotal, currency)} />
          {totals.discountAmount > 0 && (
            <TotalsRow
              label="Discount"
              value={`− ${formatMoney(totals.discountAmount, currency)}`}
              muted
            />
          )}
          {totals.taxAmount > 0 && (
            <TotalsRow
              label="Tax"
              value={formatMoney(totals.taxAmount, currency)}
              muted
            />
          )}
          <div className="mt-2 pt-2" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <TotalsRow label="Total" value={formatMoney(totals.total, currency)} bold />
          </div>
          {depositType !== "NONE" && totals.depositAmount > 0 && (
            <div className="mt-2">
              <TotalsRow
                label={
                  depositType === "PERCENT"
                    ? `Deposit due up-front (${depositValue}% of total)`
                    : "Deposit due up-front"
                }
                value={formatMoney(totals.depositAmount, currency)}
                muted
              />
            </div>
          )}
          {accepted.size > 0 && (
            <div
              className="mt-3 rounded-md px-3 py-2 text-xs"
              style={{
                background: "var(--accent-surface)",
                color: "var(--accent-primary)",
              }}
            >
              {accepted.size} optional {accepted.size === 1 ? "add-on" : "add-ons"} added to your total.
            </div>
          )}
        </div>
      </div>

      {/* Terms */}
      {terms && (
        <div
          className="rounded-lg px-5 py-4 text-sm whitespace-pre-wrap"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "var(--text-muted)" }}>
            Terms
          </div>
          {terms}
        </div>
      )}

      {/* Approve / decline */}
      {decidable && (
        <form
          action={formAction}
          className="rounded-lg p-5 space-y-3"
          style={{
            background: "var(--surface-0)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div className="text-sm font-semibold">Your response</div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            {items.some((it) => it.isOptional)
              ? "Check any optional add-ons you want included. They'll be locked in with your approval."
              : "Approve to lock in the quote, or decline to let us know."}
          </div>

          {/* Hidden inputs carry the accepted optional IDs to the server. */}
          {Array.from(accepted).map((id) => (
            <input key={id} type="hidden" name="acceptOptional" value={id} />
          ))}

          <label className="block">
            <span className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>
              Optional note to the team
            </span>
            <textarea
              name="note"
              rows={3}
              className="w-full rounded-md px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
              placeholder="Anything you'd like us to know about your decision?"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              name="decision"
              value="APPROVE"
              className="rounded-md px-4 py-2 text-sm font-semibold transition-colors hover:brightness-110"
              style={{
                background: "var(--success-fg)",
                color: "var(--surface-0)",
              }}
            >
              Approve quote
            </button>
            <button
              type="submit"
              name="decision"
              value="DECLINE"
              className="rounded-md px-4 py-2 text-sm font-semibold transition-colors hover:brightness-110"
              style={{
                background: "transparent",
                color: "var(--danger-fg)",
                border: "1px solid var(--danger-fg)",
              }}
            >
              Decline quote
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function ItemBlock({
  items,
  accepted,
  toggle,
  decidable,
  currency,
}: {
  items: InteractiveQuoteItem[];
  accepted: Set<string>;
  toggle: (id: string) => void;
  decidable: boolean;
  currency: string;
}) {
  return (
    <ul>
      {items.map((item) => {
        const isAccepted = accepted.has(item.id);
        const dimmed = item.isOptional && !isAccepted;
        return (
          <li
            key={item.id}
            className="px-5 py-4 flex items-start gap-3"
            style={{
              borderTop: "1px solid var(--border-subtle)",
              opacity: dimmed ? 0.85 : 1,
            }}
          >
            {item.isOptional && decidable && (
              <label className="mt-1 shrink-0 flex items-center">
                <input
                  type="checkbox"
                  checked={isAccepted}
                  onChange={() => toggle(item.id)}
                  aria-label={`Add ${item.name}`}
                />
              </label>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                {item.name}
                {item.isOptional && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px]"
                    style={{
                      background: isAccepted ? "var(--success-surface)" : "var(--accent-surface)",
                      color: isAccepted ? "var(--success-fg)" : "var(--accent-primary)",
                    }}
                  >
                    {isAccepted ? "Added" : "Optional"}
                  </span>
                )}
              </div>
              {item.description && (
                <div className="mt-1 whitespace-pre-wrap text-xs" style={{ color: "var(--text-muted)" }}>
                  {item.description}
                </div>
              )}
              {item.optionSummary && (
                <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                  {item.optionSummary}
                </div>
              )}
            </div>
            <div
              className="text-right text-sm font-semibold"
              style={{ color: dimmed ? "var(--text-muted)" : "var(--text-default)" }}
            >
              {formatMoney(item.subtotal, currency)}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function TotalsRow({
  label,
  value,
  muted,
  bold,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between ${bold ? "text-base" : "text-sm"}`}>
      <span style={{ color: muted ? "var(--text-muted)" : "var(--text-default)" }}>{label}</span>
      <span className={bold ? "font-semibold" : ""}>{value}</span>
    </div>
  );
}
