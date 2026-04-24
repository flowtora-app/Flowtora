import { headers } from "next/headers";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { statusColor, statusLabel, parseSelectedOptions } from "@/lib/quotes";
import { respondToQuoteShare } from "@/app/actions/portal-public";
import { checkPublicTokenRate, readClientIp } from "@/lib/public-rate-limit";
import {
  InteractiveQuoteView,
  type InteractiveQuoteItem,
  type InteractiveQuoteSection,
} from "@/components/InteractiveQuoteView";

// Phase 9 — public quote view. Anyone with the share token can view and
// respond to the quote without logging in. We don't expose internal-only
// fields (notes, costs, margins). On first GET, we also stamp the quote's
// `viewedAt` if it's still in SENT — mirrors the portal's auto-view.

export default async function PublicQuoteSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  // Phase 1 — public-token rate limit. Rate-limited callers see the
  // same "link is no longer valid" screen as an invalid token, so we
  // don't leak token-existence information. See
  // src/lib/public-rate-limit.ts.
  const rate = checkPublicTokenRate({
    ip: readClientIp(await headers()),
    kind: "quote",
  });

  const quote = rate.ok
    ? await db.quote.findUnique({
        where: { shareToken: token },
        include: {
          items: { orderBy: { sortOrder: "asc" } },
          sections: { orderBy: { sortOrder: "asc" } },
          tenant:   { select: { name: true, currency: true } },
          customer: { select: { name: true } },
        },
      })
    : null;

  if (!quote) {
    return (
      <div
        className="rounded-lg px-5 py-8 text-center text-sm"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        This quote link is no longer valid.
      </div>
    );
  }

  // DRAFT quotes aren't customer-ready. Show a holding screen.
  if (quote.status === "DRAFT") {
    return (
      <div
        className="rounded-lg px-5 py-8 text-center text-sm"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        This quote isn&apos;t ready for review yet. Please check back once your
        rep sends it over.
      </div>
    );
  }

  // Auto-stamp first view so the staff side sees engagement. Only fire on
  // the SENT→VIEWED edge — don't thrash already-VIEWED/APPROVED rows.
  if (quote.status === "SENT") {
    await db.quote.update({
      where: { id: quote.id },
      data:  { status: "VIEWED", viewedAt: new Date() },
    });
  }

  const decidable = quote.status === "SENT" || quote.status === "VIEWED";
  const currency = quote.tenant.currency;

  // Serialize items for the client component. Every Decimal column is
  // coerced to a JS number; Next.js 15 won't transfer Decimal class
  // instances across the server→client boundary.
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

  const formAction = respondToQuoteShare.bind(null, token);

  return (
    <div className="space-y-6">
      {/* Branding strip */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Quote from
          </div>
          <div className="text-xl font-semibold">{quote.tenant.name}</div>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 justify-end">
            <h1 className="text-2xl font-semibold">{quote.number}</h1>
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{ background: statusColor(quote.status), color: "white" }}
            >
              {statusLabel(quote.status)}
            </span>
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            For {quote.customer.name}
            {quote.expiresAt && <> · Expires {formatDate(quote.expiresAt)}</>}
          </div>
        </div>
      </div>

      {sp.done === "1" && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--success-surface)",
            color: "var(--success-fg)",
            border: "1px solid var(--success-fg)",
          }}
        >
          Thanks — your response has been recorded. Your rep will follow up shortly.
        </div>
      )}

      {sp.error && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          {sp.error}
        </div>
      )}

      <InteractiveQuoteView
        currency={currency}
        discountType={quote.discountType}
        discountValue={Number(quote.discountValue)}
        taxRate={Number(quote.taxRate)}
        depositType={quote.depositType}
        depositValue={Number(quote.depositValue)}
        items={items}
        sections={sections}
        formAction={formAction}
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
            <>Approved{quote.approvedAt ? ` on ${formatDate(quote.approvedAt)}` : ""}.</>
          )}
          {quote.status === "DECLINED" && (
            <>Declined{quote.declinedAt ? ` on ${formatDate(quote.declinedAt)}` : ""}.</>
          )}
          {quote.status === "EXPIRED" && <>This quote has expired.</>}
        </div>
      )}
    </div>
  );
}
