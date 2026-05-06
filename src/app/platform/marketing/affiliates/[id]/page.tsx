// Page 42 — Affiliate detail (/[id])
//
// Profile, payout method link, traffic sources, commission history,
// creatives used, and admin↔affiliate communication thread.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadAffiliateDetail,
  loadAffiliateTiers,
  creativeKindLabel,
} from "@/server/platform/affiliates";
import {
  updateAffiliate,
  sendAffiliateMessage,
} from "@/app/actions/platform-affiliates";
import { db } from "@/lib/db";
import { Kpi, StatusPill, FormError, FormOk, dollars, CREATIVE_KIND_ICON } from "../_shared";

export const dynamic = "force-dynamic";

const STATUSES = ["ACTIVE", "PAUSED", "ARCHIVED"] as const;

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

export default async function AffiliateDetailPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const { id } = await params;
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const canWrite = ctx.can("affiliates.manage");

  const [detail, tiers, payoutMethods] = await Promise.all([
    loadAffiliateDetail(id),
    loadAffiliateTiers(),
    db.partnerPayoutMethod.findMany({
      where: { affiliateId: id },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    }),
  ]);
  if (!detail) notFound();

  const a = detail.affiliate;
  const trendMax = Math.max(1, ...detail.trend.map((t) => t.clicks));

  return (
    <div className="space-y-5">
      <Breadcrumbs name={a.name} />

      {ok && <FormOk msg={ok} />}
      {error && <FormError msg={error} />}

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
              {a.name}
            </h1>
            <StatusPill status={a.status} />
            {a.tierName && (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
                {a.tierName} tier
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            {a.email} · {a.code} · joined {a.createdAt.toLocaleDateString()}
          </p>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            Tracking link:{" "}
            <code className="rounded px-1.5 py-0.5"
                  style={{ background: "var(--surface-2)", color: "var(--text-default)" }}>
              {a.trackingLink}
            </code>
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Kpi label="Clicks · all-time" value={a.clicks.toLocaleString()} />
        <Kpi label="Conversions" value={a.conversions.toLocaleString()}
             sub={a.clicks === 0 ? "" : `${(a.conversions / a.clicks * 100).toFixed(1)}% conv rate`} />
        <Kpi label="Earned" value={dollars(a.earnedCents)} tone="good" />
        <Kpi label="Pending payout" value={dollars(a.pendingPayoutCents)}
             tone={a.pendingPayoutCents > 0 ? "warning" : "default"} />
        <Kpi label="Commission rate" value={`${a.commissionPct.toFixed(1)}%`}
             sub={a.tierName ? `from ${a.tierName} tier` : "per-affiliate"} />
        <Kpi label="Cookie window" value={`${a.cookieDays}d`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ProfileCard a={a} canWrite={canWrite} tiers={tiers.map((t) => ({ id: t.id, name: t.name }))} />
        <TrendCard trend={detail.trend} max={trendMax} />
        <PayoutMethodsCard methods={payoutMethods.map((m) => ({
          id: m.id, label: m.label, type: m.type, isPrimary: m.isPrimary,
          status: m.status, accountSnippet: m.accountSnippet,
        }))} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TrafficSourcesCard sources={detail.trafficSources} />
        <CreativesUsedCard items={detail.creativesUsed} />
      </div>

      <CommissionHistoryCard rows={detail.commissions} />

      <CommunicationCard
        affiliateId={a.id}
        messages={detail.messages}
        canWrite={canWrite}
      />
    </div>
  );
}

function Breadcrumbs({ name }: { name: string }) {
  return (
    <nav className="text-[11px]" aria-label="Breadcrumbs">
      <Link href="/platform/marketing/affiliates"
            className="ts-focus underline" style={{ color: "var(--text-muted)" }}>
        Affiliate program
      </Link>
      <span className="mx-1.5" style={{ color: "var(--text-faint)" }}>/</span>
      <span style={{ color: "var(--text-default)" }}>{name}</span>
    </nav>
  );
}

function ProfileCard({
  a, canWrite, tiers,
}: {
  a: { id: string; status: string; tierId: string | null; notes: string | null; websiteUrl: string | null;
       promoChannels: string | null; estimatedAudience: number | null };
  canWrite: boolean;
  tiers: Array<{ id: string; name: string }>;
}) {
  return (
    <form action={updateAffiliate}
          className="rounded-lg border p-3 space-y-2"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Profile</h2>
      <fieldset disabled={!canWrite} className="contents">
        <input type="hidden" name="id" value={a.id} />

        <Row label="Status">
          <select name="status" defaultValue={a.status}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            {STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
          </select>
        </Row>
        <Row label="Tier">
          <select name="tierId" defaultValue={a.tierId ?? ""}
                  className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                  style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
            <option value="">— None —</option>
            {tiers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Row>
        <Row label="Notes (admin only)">
          <textarea name="notes" defaultValue={a.notes ?? ""} rows={3} maxLength={2000}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Row>

        {(a.websiteUrl || a.promoChannels || a.estimatedAudience != null) && (
          <div className="rounded-md border-l-2 px-2 py-1 text-[11px]"
               style={{ borderColor: "var(--accent-primary)", background: "var(--surface-2)" }}>
            <div style={{ color: "var(--text-muted)" }}>From application:</div>
            <ul className="mt-1 space-y-0.5">
              {a.websiteUrl && <li>Website: <a href={a.websiteUrl} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--accent-primary)" }}>{a.websiteUrl}</a></li>}
              {a.promoChannels && <li>Channels: {a.promoChannels}</li>}
              {a.estimatedAudience != null && <li>Audience: {a.estimatedAudience.toLocaleString()}</li>}
            </ul>
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Save profile
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function TrendCard({ trend, max }: { trend: Array<{ date: string; clicks: number; conversions: number }>; max: number }) {
  return (
    <div className="rounded-lg border p-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        30-day clicks (blue) + conversions (green)
      </h2>
      <div className="flex h-24 items-end gap-[2px]">
        {trend.map((d) => (
          <div key={d.date} className="flex flex-1 flex-col-reverse"
               title={`${d.date}: ${d.clicks} clicks · ${d.conversions} conv`}>
            <div className="rounded-t-sm" style={{ background: "var(--accent-primary)", height: `${(d.clicks / max) * 100}%` }} />
            <div style={{ background: "var(--success-fg)", height: `${(d.conversions / max) * 100}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function PayoutMethodsCard({ methods }: {
  methods: Array<{ id: string; label: string; type: string; isPrimary: boolean; status: string | null; accountSnippet: string | null }>;
}) {
  return (
    <div className="rounded-lg border p-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Payout methods</h2>
      {methods.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          Affiliate hasn't configured a payout method yet — they'll set one up from their dashboard before
          their first payout fires.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {methods.map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded-md border px-2 py-1.5 text-[11px]"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
              <div>
                <div className="font-semibold" style={{ color: "var(--text-default)" }}>
                  {m.label}
                  {m.isPrimary && (
                    <span className="ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                          style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>primary</span>
                  )}
                </div>
                <div style={{ color: "var(--text-muted)" }}>
                  {m.type.toLowerCase().replace(/_/g, " ")}
                  {m.accountSnippet ? ` · ${m.accountSnippet}` : ""}
                  {m.status ? ` · ${m.status}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TrafficSourcesCard({ sources }: { sources: Array<{ source: string; clicks: number; conversions: number }> }) {
  const max = Math.max(1, ...sources.map((s) => s.clicks));
  return (
    <div className="rounded-lg border p-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        Traffic sources · last 90 days
      </h2>
      {sources.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>No clicks captured yet.</p>
      ) : (
        <ul className="space-y-1">
          {sources.slice(0, 10).map((s) => {
            const pct = (s.clicks / max) * 100;
            return (
              <li key={s.source} className="text-[11px]">
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--text-default)" }}>{s.source}</span>
                  <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {s.clicks.toLocaleString()} clicks · {s.conversions} conv
                  </span>
                </div>
                <div className="mt-0.5 h-1.5 w-full rounded-full"
                     style={{ background: "var(--surface-2)" }}>
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--accent-primary)" }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CreativesUsedCard({ items }: { items: Array<{ id: string; name: string; kind: string; clicks: number }> }) {
  return (
    <div className="rounded-lg border p-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        Creatives used
      </h2>
      {items.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          No tracked creatives yet — clicks on text-only links won't be attributed to a creative.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((c) => (
            <li key={c.id}
                className="flex items-center justify-between rounded-md border px-2 py-1.5 text-[11px]"
                style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
              <span className="flex items-center gap-2" style={{ color: "var(--text-default)" }}>
                <span title={creativeKindLabel(c.kind as never)}>
                  {CREATIVE_KIND_ICON[c.kind as keyof typeof CREATIVE_KIND_ICON]}
                </span>
                <span>{c.name}</span>
              </span>
              <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                {c.clicks.toLocaleString()} clicks
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CommissionHistoryCard({ rows }: {
  rows: Array<{ id: string; description: string; amountCents: number; earnedAt: Date; period: string; payoutId: string | null; kind: string }>;
}) {
  return (
    <div className="rounded-lg border p-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="mb-2 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        Commission history · last 25
      </h2>
      {rows.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          No commission lines yet.
        </p>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Date</th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Description</th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Period</th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Kind</th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Payout</th>
              <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{c.earnedAt.toLocaleDateString()}</td>
                <td className="px-2 py-1.5" style={{ color: "var(--text-default)" }}>{c.description}</td>
                <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{c.period}</td>
                <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{c.kind.toLowerCase()}</td>
                <td className="px-2 py-1.5" style={{ color: c.payoutId ? "var(--text-muted)" : "var(--warning-fg)" }}>
                  {c.payoutId ? c.payoutId.slice(0, 8) : "pending"}
                </td>
                <td className="px-2 py-1.5 text-right font-semibold tabular-nums"
                    style={{ color: c.kind === "DEDUCTION" ? "var(--danger-fg)" : "var(--success-fg)" }}>
                  {c.kind === "DEDUCTION" ? "−" : "+"}{dollars(c.amountCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function CommunicationCard({
  affiliateId, messages, canWrite,
}: {
  affiliateId: string;
  messages: Array<{ id: string; direction: string; subject: string | null; body: string; createdAt: Date }>;
  canWrite: boolean;
}) {
  return (
    <div className="rounded-lg border p-3 space-y-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Communication</h2>

      {canWrite && (
        <form action={sendAffiliateMessage} className="space-y-2 rounded-md border p-2"
              style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
          <input type="hidden" name="affiliateId" value={affiliateId} />
          <input type="text" name="subject" placeholder="Subject (optional)" maxLength={200}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          <textarea name="body" required rows={3} maxLength={5000} placeholder="Send a note to this affiliate…"
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          <div className="flex justify-end">
            <button type="submit"
                    className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-medium"
                    style={{ background: "var(--accent-primary)", color: "white" }}>
              Send message
            </button>
          </div>
        </form>
      )}

      {messages.length === 0 ? (
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          No messages yet — send the first note above to start the thread.
        </p>
      ) : (
        <ul className="space-y-2">
          {messages.map((m) => (
            <li key={m.id}
                className="rounded-md border p-2 text-[11px]"
                style={{
                  borderColor: "var(--border-subtle)",
                  background: m.direction === "OUT" ? "var(--accent-surface)" : "var(--surface-2)",
                }}>
              <div className="flex items-center justify-between">
                <span className="font-semibold uppercase tracking-wide" style={{
                  color: m.direction === "OUT" ? "var(--accent-primary)" : "var(--text-muted)",
                }}>
                  {m.direction === "OUT" ? "Platform → Affiliate" : "Affiliate → Platform"}
                </span>
                <span style={{ color: "var(--text-muted)" }}>{m.createdAt.toLocaleString()}</span>
              </div>
              {m.subject && (
                <div className="mt-1 font-semibold" style={{ color: "var(--text-default)" }}>{m.subject}</div>
              )}
              <p className="mt-1 whitespace-pre-wrap" style={{ color: "var(--text-default)" }}>{m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
