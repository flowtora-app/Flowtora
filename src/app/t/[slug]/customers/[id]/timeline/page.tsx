import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { memberLookup } from "@/lib/members";
import { formatDateTime, humanize } from "@/lib/format";
import { loadCustomerTimeline, type TimelineEntry, type TimelineScope } from "@/lib/comm-timeline";
import { emailEventLabel } from "@/lib/email-events";

// Phase 14 Slice C — customer communication timeline page.
//
// Renders the blended `TimelineEntry[]` stream (comments + CRM interactions +
// outbound email events) in reverse chronological order. Each kind gets a
// little colored chip so it's scannable. Deleted comments render as a muted
// "(removed)" tombstone — the whole point of this page is auditability.

export default async function CustomerTimelinePage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const ctx = await requirePermission(slug, "customers:view");

  const customer = await db.customer.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    select: { id: true, name: true, locationId: true },
  });
  if (!customer) notFound();
  ctx.assertBranchAccess(customer.locationId);

  const [entries, memberMap] = await Promise.all([
    loadCustomerTimeline(ctx.tenant.id, customer.id, 300),
    memberLookup(ctx.tenant.id),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            <Link href={`/t/${slug}/customers/${customer.id}`} className="underline">
              {customer.name}
            </Link>
            {" / "}Timeline
          </div>
          <h1 className="mt-1 text-2xl font-semibold">Communication timeline</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Everything said to (or about) this customer — internal notes, CRM
            activity, and outbound email — in one feed.
          </p>
        </div>
        <Link
          href={`/t/${slug}/customers/${customer.id}`}
          className="text-xs underline"
          style={{ color: "var(--muted)" }}
        >
          Back to customer
        </Link>
      </div>

      <Card>
        <CardHeader title="All activity" description={`${entries.length} entries`} />
        {entries.length === 0 ? (
          <p className="px-5 py-6 text-sm" style={{ color: "var(--muted)" }}>
            Nothing recorded yet.
          </p>
        ) : (
          <ul>
            {entries.map((e) => (
              <li
                key={`${e.kind}-${e.id}`}
                className="px-5 py-4"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <Entry entry={e} slug={slug} memberMap={memberMap} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Per-entry rendering. Each kind has its own colored chip so the page
// reads at a glance.
// ────────────────────────────────────────────────────────────

function Entry({
  entry,
  slug,
  memberMap,
}: {
  entry: TimelineEntry;
  slug: string;
  memberMap: Map<string, { userId: string; name: string; email: string }>;
}) {
  if (entry.kind === "comment") {
    const author = entry.authorId ? memberMap.get(entry.authorId)?.name : null;
    const scopeLink = scopeHref(slug, entry.scope);
    const scopeLabel = scopeBadgeLabel(entry.scope);
    return (
      <div>
        <Header
          chip={{ label: "Comment", color: "#8b5cf6" }}
          occurredAt={entry.occurredAt}
          who={author ?? "—"}
          right={
            scopeLink ? (
              <Link href={scopeLink} className="text-xs underline" style={{ color: "var(--muted)" }}>
                on {scopeLabel}
              </Link>
            ) : (
              <span className="text-xs" style={{ color: "var(--muted)" }}>on {scopeLabel}</span>
            )
          }
        />
        {entry.deleted ? (
          <p className="mt-2 text-sm italic" style={{ color: "var(--muted)" }}>
            (removed)
          </p>
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-sm">{entry.body}</p>
        )}
      </div>
    );
  }

  if (entry.kind === "interaction") {
    const author = entry.authorId ? memberMap.get(entry.authorId)?.name : null;
    return (
      <div>
        <Header
          chip={{ label: humanize(entry.subKind), color: "#14b8a6" }}
          occurredAt={entry.occurredAt}
          who={author ?? "—"}
        />
        {entry.subject && (
          <p className="mt-2 text-sm font-medium">{entry.subject}</p>
        )}
        {entry.note && (
          <p className="mt-1 whitespace-pre-wrap text-sm">{entry.note}</p>
        )}
      </div>
    );
  }

  // entry.kind === "email"
  const sender = entry.senderUserId ? memberMap.get(entry.senderUserId)?.name : null;
  return (
    <div>
      <Header
        chip={{ label: emailEventLabel(entry.emailKind as Parameters<typeof emailEventLabel>[0]), color: "#3b82f6" }}
        occurredAt={entry.occurredAt}
        who={sender ?? "system"}
        right={
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            → {entry.toAddress}
          </span>
        }
      />
      {entry.subject && (
        <p className="mt-2 text-sm font-medium">{entry.subject}</p>
      )}
      {entry.bodyPreview && (
        <p className="mt-1 whitespace-pre-wrap text-sm" style={{ color: "var(--muted)" }}>
          {entry.bodyPreview}
        </p>
      )}
    </div>
  );
}

function Header({
  chip,
  occurredAt,
  who,
  right,
}: {
  chip: { label: string; color: string };
  occurredAt: Date;
  who: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span
          className="rounded-full px-2 py-0.5 text-xs"
          style={{ background: chip.color, color: "white" }}
        >
          {chip.label}
        </span>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {formatDateTime(occurredAt)} · {who}
        </span>
      </div>
      {right}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Scope helpers — build deep-links back to where a comment lives.
// ────────────────────────────────────────────────────────────

function scopeHref(slug: string, scope: TimelineScope): string | null {
  switch (scope.kind) {
    case "customer": return scope.customerId ? `/t/${slug}/customers/${scope.customerId}` : null;
    case "quote":    return `/t/${slug}/quotes/${scope.quoteId}`;
    case "order":    return `/t/${slug}/orders/${scope.orderId}`;
    case "proof":    return `/t/${slug}/orders/${scope.orderId}/proofs/${scope.proofId}`;
    case "install":  return `/t/${slug}/installs/${scope.installEventId}`;
  }
}

function scopeBadgeLabel(scope: TimelineScope): string {
  switch (scope.kind) {
    case "customer": return "customer";
    case "quote":    return "quote";
    case "order":    return "order";
    case "proof":    return "proof";
    case "install":  return "install";
  }
}
