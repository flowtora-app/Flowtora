import Link from "next/link";
import { requirePortalToken, portalPath, assertBelongsToPortal } from "@/lib/portal";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { statusColor, statusLabel, parseSelectedOptions } from "@/lib/quotes";
import { respondToQuotePortal } from "@/app/actions/portal-public";
import {
  InteractiveQuoteView,
  type InteractiveQuoteItem,
  type InteractiveQuoteSection,
} from "@/components/InteractiveQuoteView";

export default async function PortalQuoteDetail({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePortalToken(token);

  const quote = await db.quote.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      items:    { orderBy: { sortOrder: "asc" } },
      // Phase 9 — sections group quote lines under headings on the
      // customer-facing view, matching the internal builder.
      sections: { orderBy: { sortOrder: "asc" } },
    },
  });
  assertBelongsToPortal(ctx, quote);
  // Hide DRAFT quotes — they shouldn't be visible to the customer yet.
  if (!quote || quote.status === "DRAFT") {
    return (
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>
        Quote not available.
      </div>
    );
  }

  const currency = ctx.tenant.currency;
  const decidable = quote.status === "SENT" || quote.status === "VIEWED";
  const respond = respondToQuotePortal.bind(null, token, quote.id);

  // Serialize for the client component — Decimal columns become plain numbers.
  const items: InteractiveQuoteItem[] = quote.items.map((it) => {
    const opts = parseSelectedOptions(it.selectedOptions as unknown);
    return {
      id:            it.id,
      name:          it.name,
      description:   it.description,
      subtotal:      Number(it.subtotal),
      taxable:       it.taxable,
      isOptional:    it.isOptional,
      sectionId:     it.sectionId,
      optionSummary: opts.length > 0
        ? opts.map((o) => `${o.groupName}: ${o.label}`).join(" · ")
        : null,
    };
  });

  const sections: InteractiveQuoteSection[] = quote.sections.map((s) => ({
    id:          s.id,
    title:       s.title,
    description: s.description,
  }));

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href={portalPath(token, "quotes")} className="underline" style={{ color: "var(--text-muted)" }}>
          ← Quotes
        </Link>
      </div>

      {sp.error && (
        <div className="rounded-md px-3 py-2 text-sm" style={{ background: "var(--danger-surface)", color: "var(--danger-fg)", border: "1px solid var(--danger-fg)" }}>
          {sp.error}
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{quote.number}</h1>
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{ background: statusColor(quote.status), color: "white" }}
            >
              {statusLabel(quote.status)}
            </span>
          </div>
          <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            From {ctx.tenant.name}
            {quote.issuedAt && <> · Issued {formatDate(quote.issuedAt, ctx.tenant.dateFormat)}</>}
            {quote.expiresAt && <> · Expires {formatDate(quote.expiresAt, ctx.tenant.dateFormat)}</>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Total</div>
          <div className="text-2xl font-semibold">
            {/* Live total is rendered inside InteractiveQuoteView; this is the
                stored headline total so the badge isn't blank. */}
            {new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(quote.total))}
          </div>
        </div>
      </div>

      <InteractiveQuoteView
        currency={currency}
        discountType={quote.discountType}
        discountValue={Number(quote.discountValue)}
        taxRate={Number(quote.taxRate)}
        depositType={quote.depositType}
        depositValue={Number(quote.depositValue)}
        items={items}
        sections={sections}
        formAction={respond}
        decidable={decidable}
        customerNote={quote.customerNote}
        terms={quote.terms}
      />

      {!decidable && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          {quote.status === "APPROVED" && (
            <>Thanks — this quote was approved{quote.approvedAt ? ` on ${formatDate(quote.approvedAt, ctx.tenant.dateFormat)}` : ""}.</>
          )}
          {quote.status === "DECLINED" && (
            <>This quote was declined{quote.declinedAt ? ` on ${formatDate(quote.declinedAt, ctx.tenant.dateFormat)}` : ""}.</>
          )}
          {quote.status === "EXPIRED" && <>This quote has expired.</>}
        </div>
      )}

      {/* Phase 21 Slice B — per-tenant quote footer. */}
      {ctx.tenant.quoteFooterText && (
        <div
          className="whitespace-pre-wrap rounded-md px-5 py-4 text-sm"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
        >
          {ctx.tenant.quoteFooterText}
        </div>
      )}
    </div>
  );
}
