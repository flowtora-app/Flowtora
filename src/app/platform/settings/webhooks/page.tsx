// Page 69 — Webhooks Catalog.
//
// Public developer-facing catalog of every webhook event Flowtora emits.
// Sidebar tree by category on the left, event detail (or list) on the
// right. Selecting an event from `?event=…` opens its detail pane with
// description, schema, sample payload, code receivers, version history,
// trigger conditions, subscriber count, and test-send form.

import * as React from "react";
import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadCatalogPage,
  loadEventDetail,
  getCodeSamples,
  prettyJson,
  relativeFromNow,
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  STABILITY_TONE,
} from "@/server/platform/webhooks-catalog";
import { sendTestEvent } from "@/app/actions/platform-webhooks-catalog";
import { db } from "@/lib/db";
import type { WebhookEventCategory, WebhookEventStability } from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const LANGS = ["node", "python", "ruby", "php", "go", "curl"] as const;
type Lang = typeof LANGS[number];
const LANG_LABEL: Record<Lang, string> = {
  node: "Node.js", python: "Python", ruby: "Ruby",
  php: "PHP", go: "Go", curl: "Shell / curl",
};

export default async function WebhooksCatalogPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("webhooks.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          You don&apos;t have permission to view the webhooks catalog.
        </p>
      </main>
    );
  }
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const lang = (asString(sp.lang) as Lang | undefined) ?? "node";
  const eventName = asString(sp.event);
  const categoryFilter = asString(sp.category) as WebhookEventCategory | undefined;
  const stabilityFilter = asString(sp.stability) as WebhookEventStability | undefined;
  const search = asString(sp.q);

  const data = await loadCatalogPage({ category: categoryFilter, stability: stabilityFilter, search });
  const { kpis, events, subscribers, lastDelivery } = data;
  const selected = eventName ? await loadEventDetail(eventName) : null;
  const activeEndpoints = selected
    ? await db.webhookEndpoint.findMany({
        where: { status: "ACTIVE" },
        select: { id: true, url: true, description: true, subscribedEvents: true },
        orderBy: { url: "asc" },
        take: 50,
      })
    : [];

  // Group events by category for the sidebar tree.
  const byCategory = new Map<WebhookEventCategory, typeof events>();
  for (const c of CATEGORY_ORDER) byCategory.set(c, []);
  for (const e of events) byCategory.get(e.category)?.push(e);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
            Webhooks catalog
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            Every webhook event Flowtora emits. Schemas, sample payloads, receiver code, and version history.
            Subscribe an endpoint from <Link href="/platform/integrations/api" className="underline">Integrations → API Keys & Webhooks</Link>.
          </p>
        </div>
        <Link
          href="/platform/integrations/api"
          className="rounded-md px-3 py-2 text-xs font-medium"
          style={{ background: "var(--surface-1)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}
        >
          Manage endpoints →
        </Link>
      </header>

      {ok && <Banner tone="success">{decodeURIComponent(ok)}</Banner>}
      {error && <Banner tone="danger">{decodeURIComponent(error)}</Banner>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
        <MiniKpi label="Total events"    value={kpis.totalEvents.toString()} />
        <MiniKpi label="Stable"          value={kpis.stableCount.toString()}    tone="success" />
        <MiniKpi label="Beta"            value={kpis.betaCount.toString()}      tone="warning" />
        <MiniKpi label="Deprecated"      value={kpis.deprecatedCount.toString()} tone={kpis.deprecatedCount > 0 ? "danger" : "default"} />
        <MiniKpi label="Active endpoints" value={kpis.activeEndpoints.toString()} />
        <MiniKpi label="Deliveries 24h"   value={kpis.deliveries24h.toString()} />
        <MiniKpi label="Failures 24h"     value={kpis.failures24h.toString()}    tone={kpis.failures24h > 0 ? "danger" : "default"} />
      </div>

      {/* Filter bar */}
      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>Search</span>
          <input
            type="text"
            name="q"
            defaultValue={search ?? ""}
            placeholder="event.name or fragment"
            className="rounded-md px-3 py-2 text-sm outline-none"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-default)" }}
          />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>Category</span>
          <select
            name="category"
            defaultValue={categoryFilter ?? ""}
            className="rounded-md px-3 py-2 text-sm outline-none"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-default)" }}
          >
            <option value="">All</option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>Stability</span>
          <select
            name="stability"
            defaultValue={stabilityFilter ?? ""}
            className="rounded-md px-3 py-2 text-sm outline-none"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-default)" }}
          >
            <option value="">All</option>
            <option value="STABLE">Stable</option>
            <option value="BETA">Beta</option>
            <option value="DEPRECATED">Deprecated</option>
          </select>
        </label>
        {eventName && <input type="hidden" name="event" value={eventName} />}
        <button
          type="submit"
          className="rounded-md px-3 py-2 text-xs font-medium"
          style={{ background: "var(--surface-1)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}
        >
          Apply filters
        </button>
      </form>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* ── Sidebar tree ────────────────────────────────────── */}
        <aside
          className="overflow-hidden rounded-xl"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
        >
          <header className="px-4 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
            <h2 className="text-sm font-semibold">Events ({events.length})</h2>
          </header>
          <nav>
            {CATEGORY_ORDER.map((cat) => {
              const list = byCategory.get(cat) ?? [];
              if (list.length === 0) return null;
              return (
                <details key={cat} open className="text-sm">
                  <summary
                    className="cursor-pointer list-none px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}
                  >
                    {CATEGORY_LABEL[cat]} <span style={{ color: "var(--text-faint)" }}>· {list.length}</span>
                  </summary>
                  <ul>
                    {list.map((e) => (
                      <li key={e.id}>
                        <Link
                          href={`/platform/settings/webhooks?event=${encodeURIComponent(e.name)}`}
                          className="flex items-center justify-between gap-2 px-4 py-2 text-sm"
                          style={{
                            background: e.name === eventName ? "var(--surface-2)" : "transparent",
                            color: "var(--text-default)",
                            borderTop: "1px solid var(--border-subtle)",
                          }}
                        >
                          <span className="truncate font-mono text-[12px]">{e.name}</span>
                          <StabilityChip stability={e.stability} compact />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
            {events.length === 0 && (
              <div className="px-4 py-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                No events match your filter.
              </div>
            )}
          </nav>
        </aside>

        {/* ── Main: event detail (or empty state) ─────────────── */}
        <main>
          {!selected ? (
            <EmptyState totalEvents={events.length} />
          ) : (
            <EventDetail
              event={selected}
              lang={lang}
              subscribers={subscribers.get(selected.name) ?? 0}
              lastSeen={lastDelivery.get(selected.name) ?? null}
              activeEndpoints={activeEndpoints}
              canManage={ctx.can("webhooks.manage")}
            />
          )}
        </main>
      </div>
    </div>
  );
}

/* ── Detail pane ────────────────────────────────────────────── */

function EventDetail({
  event, lang, subscribers, lastSeen, activeEndpoints, canManage,
}: {
  event: NonNullable<Awaited<ReturnType<typeof loadEventDetail>>>;
  lang: Lang;
  subscribers: number;
  lastSeen: Date | null;
  activeEndpoints: { id: string; url: string; description: string | null; subscribedEvents: string[] }[];
  canManage: boolean;
}) {
  const samples = getCodeSamples(event);
  const subscribedHere = activeEndpoints.filter((e) => e.subscribedEvents.includes(event.name));
  return (
    <div className="space-y-6">
      {/* Header */}
      <section
        className="rounded-xl p-5"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-mono text-lg font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
              {event.name}
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {event.description}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StabilityChip stability={event.stability} />
            <span className="rounded-md px-2 py-0.5 text-[10px]"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
              Since {event.introducedVersion}
            </span>
            <span className="rounded-md px-2 py-0.5 text-[10px]"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}>
              Latest v{event.versions[0]?.version ?? event.introducedVersion}
            </span>
          </div>
        </div>
        {event.stability === "DEPRECATED" && event.deprecationNotice && (
          <div className="mt-4 rounded-md p-3 text-xs"
            style={{ background: "var(--rose-100)", color: "var(--rose-700)", border: "1px solid var(--rose-300)" }}>
            <strong>Deprecation notice:</strong> {event.deprecationNotice}
          </div>
        )}
      </section>

      {/* Schema */}
      <DetailCard title="Schema" description="JSON schema of the event envelope. Use this to validate incoming requests.">
        <pre
          className="overflow-x-auto px-5 py-4 font-mono text-xs"
          style={{ background: "var(--surface-2)", color: "var(--text-default)", whiteSpace: "pre" }}
        >
{`{
  "id":      "string",
  "type":    "${event.name}",
  "created": "iso 8601 datetime",
  "data":    ${prettyJson(event.samplePayload).split("\n").join("\n           ")}
}`}
        </pre>
        {event.schemaUrl && (
          <div className="px-5 py-3 text-xs" style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border-subtle)" }}>
            Full machine-readable schema: <a href={event.schemaUrl} className="underline">{event.schemaUrl}</a>
          </div>
        )}
      </DetailCard>

      {/* Sample payload */}
      <DetailCard title="Sample payload" description="The shape of `event.data` for a real send.">
        <pre
          className="overflow-x-auto px-5 py-4 font-mono text-xs"
          style={{ background: "var(--surface-2)", color: "var(--text-default)" }}
        >
{prettyJson(event.samplePayload)}
        </pre>
      </DetailCard>

      {/* Trigger / delivery semantics */}
      <DetailCard
        title="Trigger conditions"
        description="When this event fires and what guarantees we give about delivery."
      >
        <ul className="space-y-2 px-5 py-4 text-sm" style={{ color: "var(--text-default)" }}>
          <li>• <strong>Fires when</strong> the underlying action commits to the database. Pre-commit failures never emit.</li>
          <li>• <strong>At-least-once delivery</strong> with exponential backoff retries (5 attempts over 24h).</li>
          <li>• <strong>Idempotent.</strong> Each delivery carries a stable {`{id}`} — store it and skip duplicates.</li>
          <li>• <strong>Order is not guaranteed.</strong> Related events can arrive out of order; reconcile by timestamp.</li>
          {event.stability === "BETA" && (
            <li>• <strong>Beta:</strong> schema may change without notice. Pin to a specific version for production.</li>
          )}
        </ul>
      </DetailCard>

      {/* Code samples */}
      <DetailCard
        title="Receiver code"
        description="Drop-in HTTP receivers with signature verification. The signature is HMAC-SHA256 of the raw body using your endpoint secret."
      >
        <div className="flex flex-wrap gap-2 border-b px-5 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          {LANGS.map((l) => (
            <Link
              key={l}
              href={`/platform/settings/webhooks?event=${encodeURIComponent(event.name)}&lang=${l}`}
              className="rounded-md px-2.5 py-1 text-xs"
              style={{
                background: lang === l ? "var(--accent-primary)" : "var(--surface-2)",
                color: lang === l ? "var(--accent-fg)" : "var(--text-default)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {LANG_LABEL[l]}
            </Link>
          ))}
        </div>
        <pre
          className="overflow-x-auto px-5 py-4 font-mono text-xs"
          style={{ background: "var(--surface-2)", color: "var(--text-default)", whiteSpace: "pre" }}
        >
{samples[lang] ?? "// no sample"}
        </pre>
      </DetailCard>

      {/* Subscribers + version history */}
      <div className="grid gap-6 md:grid-cols-2">
        <DetailCard
          title="Subscribers"
          description={`${subscribers} active endpoint${subscribers === 1 ? "" : "s"} listening for this event.`}
        >
          {subscribedHere.length === 0 ? (
            <p className="px-5 py-4 text-xs" style={{ color: "var(--text-muted)" }}>
              No endpoints subscribed yet.
            </p>
          ) : (
            <ul>
              {subscribedHere.slice(0, 10).map((e) => (
                <li
                  key={e.id}
                  className="px-5 py-3 text-sm"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <div className="font-medium">{e.description ?? "(no description)"}</div>
                  <div className="mt-0.5 truncate text-xs font-mono" style={{ color: "var(--text-muted)" }}>{e.url}</div>
                </li>
              ))}
            </ul>
          )}
          <div className="px-5 py-3 text-xs"
            style={{ color: "var(--text-muted)", borderTop: "1px solid var(--border-subtle)" }}
          >
            Last delivered: {relativeFromNow(lastSeen)}
          </div>
        </DetailCard>

        <DetailCard title="Version history" description="Changelog of schema-affecting changes.">
          {event.versions.length === 0 ? (
            <p className="px-5 py-4 text-xs" style={{ color: "var(--text-muted)" }}>
              No versioned changes recorded.
            </p>
          ) : (
            <ol>
              {event.versions.map((v) => (
                <li
                  key={v.id}
                  className="px-5 py-3 text-sm"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs">v{v.version}</span>
                    <div className="flex items-center gap-2">
                      {v.breaking && (
                        <span className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                          style={{ background: "var(--rose-100)", color: "var(--rose-700)" }}>
                          breaking
                        </span>
                      )}
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{relativeFromNow(v.releasedAt)}</span>
                    </div>
                  </div>
                  {v.changes && (
                    <p className="mt-1 whitespace-pre-wrap text-xs" style={{ color: "var(--text-muted)" }}>
                      {v.changes}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </DetailCard>
      </div>

      {/* Test send */}
      {canManage && (
        <DetailCard
          title="Test send"
          description='Fires a sample payload to a chosen endpoint. The envelope is marked `"test": true` so receivers can skip production handlers.'
        >
          <form action={sendTestEvent} className="space-y-3 px-5 py-4">
            <input type="hidden" name="eventName" value={event.name} />
            <label className="block">
              <span className="mb-1 block text-sm">Send to endpoint</span>
              <select
                name="endpointId"
                required
                className="w-full rounded-md px-3 py-2 text-sm outline-none"
                style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
              >
                <option value="">— Pick an endpoint —</option>
                {activeEndpoints.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.description ?? "(no description)"} — {e.url}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
                Picks any active endpoint, even ones not currently subscribed to this event.
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm">Override payload (optional)</span>
              <textarea
                name="overridePayload"
                rows={6}
                placeholder='Leave blank to use the sample payload above. Must be valid JSON.'
                className="w-full rounded-md px-3 py-2 font-mono text-xs outline-none"
                style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
            </label>
            <div className="flex justify-end">
              <button
                type="submit"
                className="rounded-md px-3 py-2 text-xs font-medium"
                style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
              >
                Queue test delivery
              </button>
            </div>
          </form>
        </DetailCard>
      )}
    </div>
  );
}

/* ── UI helpers ─────────────────────────────────────────────── */

function EmptyState({ totalEvents }: { totalEvents: number }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl px-8 py-16 text-center"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
    >
      <div className="text-3xl" aria-hidden>📚</div>
      <h2 className="mt-2 text-base font-semibold">Pick an event</h2>
      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
        {totalEvents} event{totalEvents === 1 ? "" : "s"} in the catalog. Click any name in the sidebar to see its schema, code samples, and version history.
      </p>
    </div>
  );
}

function DetailCard({
  title, description, children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
    >
      <header className="px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{description}</p>
        )}
      </header>
      {children}
    </section>
  );
}

function StabilityChip({
  stability, compact,
}: { stability: WebhookEventStability; compact?: boolean }) {
  const t = STABILITY_TONE[stability];
  return (
    <span
      className={`rounded-full ${compact ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]"} font-medium uppercase tracking-wider`}
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.fg}` }}
      title={t.description}
    >
      {t.label}
    </span>
  );
}

function MiniKpi({
  label, value, tone = "default",
}: { label: string; value: string; tone?: "default" | "success" | "warning" | "danger" }) {
  const palette =
    tone === "success" ? { bg: "var(--emerald-100)", fg: "var(--emerald-700)" } :
    tone === "warning" ? { bg: "var(--amber-100)",   fg: "var(--amber-700)"   } :
    tone === "danger"  ? { bg: "var(--rose-100)",    fg: "var(--rose-700)"    } :
                          { bg: "var(--surface-1)",   fg: "var(--text-default)" };
  return (
    <div
      className="rounded-md px-3 py-2.5"
      style={{ background: palette.bg, border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
    >
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums" style={{ color: palette.fg }}>
        {value}
      </div>
    </div>
  );
}

function Banner({ tone, children }: { tone: "success" | "danger"; children: React.ReactNode }) {
  const palette =
    tone === "success"
      ? { bg: "var(--emerald-100)", fg: "var(--emerald-700)", border: "var(--emerald-300)" }
      : { bg: "var(--rose-100)", fg: "var(--rose-700)", border: "var(--rose-300)" };
  return (
    <div
      className="rounded-md px-4 py-3 text-sm"
      style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}` }}
    >
      {children}
    </div>
  );
}
