import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { Card, CardHeader } from "@/components/Card";
import {
  ATTENTION_WINDOWS,
  loadAttention,
  totalAttentionCount,
  type AttentionItem,
} from "@/lib/attention";
import { listActiveLocations } from "@/lib/locations";

export default async function AttentionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ scope?: string; branch?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant(slug);

  // OWNER/ADMIN/PRODUCTION_MANAGER default to "team" view (all items),
  // everyone else defaults to "me" — can be flipped via ?scope= param.
  const canSeeAll = ctx.role === "OWNER" || ctx.role === "ADMIN" || ctx.role === "PRODUCTION_MANAGER";
  const scope = sp.scope === "team" && canSeeAll
    ? "team"
    : sp.scope === "me"
      ? "me"
      : (canSeeAll ? "team" : "me");

  // Phase 15 — narrow further by an explicit ?branch= param within the
  // member's allowed scope. Falls back to the membership-wide branchScope.
  const branches = await listActiveLocations(ctx.tenant.id);
  const branchChoices =
    ctx.branchScope === null ? branches : branches.filter((b) => ctx.branchScope!.includes(b.id));
  const branchFilter = sp.branch && branchChoices.some((b) => b.id === sp.branch) ? sp.branch : null;
  const effectiveScope: string[] | null = branchFilter
    ? [branchFilter]
    : ctx.branchScope;

  const groups = await loadAttention(ctx.tenant.id, {
    userId: scope === "me" ? ctx.userId : undefined,
    branchScope: effectiveScope,
  });
  const total = totalAttentionCount(groups);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Needs attention</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            Things that need a nudge right now. Updated live from quotes, proofs, invoices, orders, installs, and tasks.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {branchChoices.length > 1 && (
            <form className="flex items-center gap-2 text-sm" method="get">
              {sp.scope && <input type="hidden" name="scope" value={sp.scope} />}
              <select name="branch" defaultValue={branchFilter ?? ""} className="rounded-md px-2 py-1.5"
                style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}>
                <option value="">All branches</option>
                {branchChoices.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <button type="submit" className="rounded-md px-3 py-1.5"
                style={{ border: "1px solid var(--border)" }}>Go</button>
            </form>
          )}
          {canSeeAll && (
            <div className="flex gap-1 text-sm">
              <ScopeTab slug={slug} label="My stuff" value="me" active={scope === "me"} />
              <ScopeTab slug={slug} label="Whole team" value="team" active={scope === "team"} />
            </div>
          )}
        </div>
      </div>

      {total === 0 ? (
        <Card>
          <div className="px-5 py-10 text-center text-sm" style={{ color: "var(--muted)" }}>
            Inbox zero. Nothing on fire right now.
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          <Section
            slug={slug}
            title="Quotes past expiration"
            items={groups.quotesOverdue}
            emptyLabel={null}
          />
          <Section
            slug={slug}
            title={`Quotes expiring in the next ${ATTENTION_WINDOWS.quoteExpiringDays} day${ATTENTION_WINDOWS.quoteExpiringDays === 1 ? "" : "s"}`}
            items={groups.quotesExpiring}
            emptyLabel={null}
          />
          <Section
            slug={slug}
            title={`Sent quotes unread after ${ATTENTION_WINDOWS.quoteStaleDays} days`}
            items={groups.quotesStale}
            emptyLabel={null}
          />
          <Section
            slug={slug}
            title={`Proofs awaiting response (${ATTENTION_WINDOWS.proofStaleDays}+ days)`}
            items={groups.proofsStale}
            emptyLabel={null}
          />
          <Section
            slug={slug}
            title="Invoices past due"
            items={groups.invoicesOverdue}
            emptyLabel={null}
          />
          <Section
            slug={slug}
            title={`Draft invoices older than ${ATTENTION_WINDOWS.invoiceUnsentDays} days`}
            items={groups.invoicesUnsent}
            emptyLabel={null}
          />
          <Section
            slug={slug}
            title="Orders past due date"
            items={groups.ordersOverdue}
            emptyLabel={null}
          />
          <Section
            slug={slug}
            title={`Installs in next ${ATTENTION_WINDOWS.installConfirmHours}h still unconfirmed`}
            items={groups.installsUnconfirmed}
            emptyLabel={null}
          />
          <Section
            slug={slug}
            title="Overdue tasks"
            items={groups.tasksOverdue}
            emptyLabel={null}
          />
        </div>
      )}

      <div className="text-xs" style={{ color: "var(--muted)" }}>
        Showing {total} item{total === 1 ? "" : "s"}
        {scope === "me" ? " assigned to you" : " across the team"}.
      </div>
    </div>
  );
}

function ScopeTab({
  slug, label, value, active,
}: { slug: string; label: string; value: string; active: boolean }) {
  return (
    <Link
      href={`/t/${slug}/attention?scope=${value}`}
      className="rounded-md px-3 py-1.5"
      style={{
        background: active ? "var(--panel)" : "transparent",
        border: `1px solid ${active ? "var(--border)" : "transparent"}`,
        color: active ? "var(--text)" : "var(--muted)",
      }}
    >
      {label}
    </Link>
  );
}

function Section({
  slug, title, items, emptyLabel,
}: {
  slug: string;
  title: string;
  items: AttentionItem[];
  emptyLabel: string | null;
}) {
  if (items.length === 0 && !emptyLabel) return null;
  return (
    <Card>
      <CardHeader
        title={title}
        right={<span className="text-xs" style={{ color: "var(--muted)" }}>{items.length}</span>}
      />
      {items.length === 0 ? (
        <p className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>{emptyLabel}</p>
      ) : (
        <ul>
          {items.map((it) => (
            <li
              key={it.key}
              className="px-5 py-3"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <Link href={`/t/${slug}/${it.href}`} className="text-sm font-medium underline">
                {it.title}
              </Link>
              <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                {it.detail}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
