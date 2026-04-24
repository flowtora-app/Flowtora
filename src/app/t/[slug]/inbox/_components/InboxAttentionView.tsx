import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { Card, CardHeader } from "@/components/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  ATTENTION_WINDOWS,
  loadAttention,
  totalAttentionCount,
  type AttentionItem,
} from "@/lib/attention";
import { listActiveLocations } from "@/lib/locations";

// Attention chip — nine-category triage feed lifted from the old
// /t/[slug]/attention page. Same data engine (loadAttention), same groups,
// same branch + scope semantics. Only change: URL params are chip-scoped
// (chip=attention) so the shell stays stable.

export async function InboxAttentionView({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: Record<string, string | undefined>;
}) {
  const ctx = await requireTenant(slug);

  const canSeeAll = ctx.role === "OWNER" || ctx.role === "ADMIN" || ctx.role === "PRODUCTION_MANAGER";
  const scope = searchParams.scope === "team" && canSeeAll
    ? "team"
    : searchParams.scope === "me"
      ? "me"
      : (canSeeAll ? "team" : "me");

  const branches = await listActiveLocations(ctx.tenant.id);
  const branchChoices =
    ctx.branchScope === null ? branches : branches.filter((b) => ctx.branchScope!.includes(b.id));
  const branchFilter =
    searchParams.branch && branchChoices.some((b) => b.id === searchParams.branch)
      ? searchParams.branch
      : null;
  const effectiveScope: string[] | null = branchFilter ? [branchFilter] : ctx.branchScope;

  const groups = await loadAttention(ctx.tenant.id, {
    userId: scope === "me" ? ctx.userId : undefined,
    branchScope: effectiveScope,
  });
  const total = totalAttentionCount(groups);

  // URL helper that preserves chip=attention and the current scope choices.
  const buildHref = (overrides: Partial<{ scope: string; branch: string | null }>) => {
    const sp = new URLSearchParams();
    sp.set("chip", "attention");
    const nextScope = overrides.scope ?? (scope !== "me" || !canSeeAll ? scope : "me");
    if (nextScope !== "me") sp.set("scope", nextScope);
    const nextBranch = overrides.branch !== undefined ? overrides.branch : branchFilter;
    if (nextBranch) sp.set("branch", nextBranch);
    return `/t/${slug}/inbox?${sp.toString()}`;
  };

  return (
    <div className="space-y-4">
      {/* Sub-filter row (branch + scope) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Things that need a nudge right now. Updated live from quotes, proofs,
          invoices, orders, installs, and tasks.
        </p>
        <div className="flex items-center gap-3">
          {branchChoices.length > 1 && (
            <form className="flex items-center gap-2 text-sm" method="get">
              <input type="hidden" name="chip" value="attention" />
              {scope !== "me" && <input type="hidden" name="scope" value={scope} />}
              <select
                name="branch"
                defaultValue={branchFilter ?? ""}
                className="rounded-md px-2 py-1.5"
                style={{
                  background: "var(--surface-0)",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-default)",
                }}
              >
                <option value="">All branches</option>
                {branchChoices.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-md px-3 py-1.5"
                style={{ border: "1px solid var(--border-default)" }}
              >
                Go
              </button>
            </form>
          )}
          {canSeeAll && (
            <div className="flex gap-1 text-sm">
              <ScopeTab slug={slug} label="My stuff" value="me"   active={scope === "me"}   buildHref={buildHref} />
              <ScopeTab slug={slug} label="Whole team" value="team" active={scope === "team"} buildHref={buildHref} />
            </div>
          )}
        </div>
      </div>

      {total === 0 ? (
        <Card>
          <EmptyState
            title="Inbox zero"
            description="Nothing on fire right now. Check back later, or dig into work from the sidebar."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          <Section slug={slug} title="Quotes past expiration"                    items={groups.quotesOverdue}       />
          <Section slug={slug} title={`Quotes expiring in the next ${ATTENTION_WINDOWS.quoteExpiringDays} day${ATTENTION_WINDOWS.quoteExpiringDays === 1 ? "" : "s"}`} items={groups.quotesExpiring} />
          <Section slug={slug} title={`Sent quotes unread after ${ATTENTION_WINDOWS.quoteStaleDays} days`}           items={groups.quotesStale}         />
          <Section slug={slug} title={`Proofs awaiting response (${ATTENTION_WINDOWS.proofStaleDays}+ days)`}         items={groups.proofsStale}         />
          <Section slug={slug} title="Invoices past due"                          items={groups.invoicesOverdue}     />
          <Section slug={slug} title={`Draft invoices older than ${ATTENTION_WINDOWS.invoiceUnsentDays} days`}       items={groups.invoicesUnsent}      />
          <Section slug={slug} title="Orders past due date"                       items={groups.ordersOverdue}       />
          <Section slug={slug} title={`Installs in next ${ATTENTION_WINDOWS.installConfirmHours}h still unconfirmed`} items={groups.installsUnconfirmed} />
          <Section slug={slug} title="Overdue tasks"                              items={groups.tasksOverdue}        />
        </div>
      )}

      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        Showing {total} item{total === 1 ? "" : "s"}
        {scope === "me" ? " assigned to you" : " across the team"}.
      </div>
    </div>
  );
}

function ScopeTab({
  label, value, active, buildHref,
}: {
  slug: string; label: string; value: string; active: boolean;
  buildHref: (o: Partial<{ scope: string; branch: string | null }>) => string;
}) {
  return (
    <Link
      href={buildHref({ scope: value })}
      className="rounded-md px-3 py-1.5"
      style={{
        background: active ? "var(--surface-2)" : "transparent",
        border: `1px solid ${active ? "var(--border-default)" : "transparent"}`,
        color: active ? "var(--text-default)" : "var(--text-muted)",
      }}
    >
      {label}
    </Link>
  );
}

function Section({
  slug, title, items,
}: {
  slug: string;
  title: string;
  items: AttentionItem[];
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader
        title={title}
        right={<span className="text-xs" style={{ color: "var(--text-muted)" }}>{items.length}</span>}
      />
      <ul>
        {items.map((it) => (
          <li
            key={it.key}
            className="px-5 py-3"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <Link href={`/t/${slug}/${it.href}`} className="text-sm font-medium underline">
              {it.title}
            </Link>
            <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {it.detail}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
