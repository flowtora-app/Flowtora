"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Avatar, Drawer, useToast } from "@/components/ui";
import type { AuditDetail } from "@/server/platform/audit-log";

export function AuditDetailDrawer({ detail }: { detail: AuditDetail }) {
  const router = useRouter();
  const sp = useSearchParams();
  const toast = useToast();

  const close = () => {
    const u = new URLSearchParams(sp.toString());
    u.delete("detail");
    const q = u.toString();
    router.replace(q ? `/platform/access/audit?${q}` : "/platform/access/audit");
  };

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  const before = detail.metadata && typeof detail.metadata === "object" && "before" in detail.metadata
    ? (detail.metadata as { before?: unknown }).before : undefined;
  const after = detail.metadata && typeof detail.metadata === "object" && "after" in detail.metadata
    ? (detail.metadata as { after?: unknown }).after : undefined;

  return (
    <Drawer open onOpenChange={(o) => { if (!o) close(); }} side="right" size="lg"
            title={
              <span className="flex items-center gap-2">
                <span className="font-mono text-[14px]">{detail.action}</span>
                <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{
                        background: detail.success ? "var(--emerald-50)" : "var(--rose-50)",
                        color: detail.success ? "var(--emerald-700)" : "var(--rose-700)",
                      }}>
                  {detail.success ? "success" : "failure"}
                </span>
              </span>
            }
            description={`${detail.severity.toLowerCase()} · ${detail.source.toLowerCase()} · ${detail.createdAt.toLocaleString()}`}>
      <div className="flex flex-col gap-5">
        {/* Metadata */}
        <Section title="Metadata">
          <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-[12px]">
            <Row label="Event ID" value={
              <button type="button" onClick={() => copy("Event ID", detail.id)}
                      className="font-mono hover:underline" style={{ color: "var(--text-default)" }}>
                {detail.id}
              </button>
            } />
            {detail.correlationId && (
              <Row label="Correlation ID" value={
                <button type="button" onClick={() => copy("Correlation ID", detail.correlationId!)}
                        className="font-mono hover:underline" style={{ color: "var(--text-default)" }}>
                  {detail.correlationId}
                </button>
              } />
            )}
            {detail.requestId && (
              <Row label="Request ID" value={<span className="font-mono">{detail.requestId}</span>} />
            )}
            {detail.sessionId && (
              <Row label="Session" value={<span className="font-mono">{detail.sessionId}</span>} />
            )}
            <Row label="Source" value={detail.source.toLowerCase()} />
            <Row label="Severity" value={detail.severity.toLowerCase()} />
            <Row label="Status" value={detail.success ? "success" : "failure"} />
            {detail.actor && (
              <Row label="Actor" value={
                <Link href={`/platform/users/${detail.actor.id}`} className="flex items-center gap-1.5 hover:underline"
                      style={{ color: "var(--text-default)" }}>
                  <Avatar size="xs" name={detail.actor.name ?? detail.actor.email} src={detail.actor.image ?? undefined} />
                  {detail.actor.name?.trim() || detail.actor.email}
                </Link>
              } />
            )}
            {detail.tenant && (
              <Row label="Tenant" value={
                <Link href={`/platform/tenants/${detail.tenant.id}`} className="hover:underline"
                      style={{ color: "var(--text-default)" }}>
                  {detail.tenant.name}
                </Link>
              } />
            )}
            {detail.entityType && (
              <Row label="Resource" value={
                <span className="font-mono">{detail.entityType}{detail.entityId ? `:${detail.entityId}` : ""}</span>
              } />
            )}
            {detail.ipAddress && (
              <Row label="IP" value={<span className="font-mono">{detail.ipAddress}</span>} />
            )}
            <Row label="MFA used" value={detail.mfaUsed == null ? "—" : detail.mfaUsed ? "yes" : "no"} />
            {detail.impersonationSessionId && (
              <Row label="Impersonation" value={
                <Link href={`/platform/tenants/impersonation?tab=history&detail=${detail.impersonationSessionId}`}
                      className="font-mono hover:underline" style={{ color: "var(--accent-primary)" }}>
                  {detail.impersonationSessionId}
                </Link>
              } />
            )}
          </dl>
          {detail.userAgent && (
            <p className="mt-2 break-all text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>
              {detail.userAgent}
            </p>
          )}
        </Section>

        {/* JSON diff */}
        {(before !== undefined || after !== undefined) ? (
          <Section title="Before / after">
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
              <Pre label="Before" value={before} />
              <Pre label="After"  value={after} />
            </div>
          </Section>
        ) : detail.metadata ? (
          <Section title="Metadata payload">
            <Pre label="metadata" value={detail.metadata} />
          </Section>
        ) : null}

        {/* Permission trail */}
        <Section title="Permission trail">
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            This action ran under the actor&apos;s{" "}
            <span className="font-medium" style={{ color: "var(--text-default)" }}>
              {detail.actor?.platformRole ? detail.actor.platformRole.toLowerCase().replaceAll("_", " ") : "anonymous"}
            </span>{" "}
            role{detail.mfaUsed ? " with MFA verified" : ""}.
          </p>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-faint)" }}>
            Per-permission check trail is honestly deferred — when the action layer attaches a
            <span className="font-mono"> permission</span> field to its audit metadata, this section will surface
            the resolved permission key alongside any custom-role overrides.
          </p>
        </Section>

        {/* Webhook deliveries */}
        {detail.deliveries.length > 0 && (
          <Section title={`Webhook deliveries (${detail.deliveries.length})`}>
            <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
              {detail.deliveries.map((d) => (
                <li key={d.id} className="flex items-center gap-2 py-1.5 text-[12px]">
                  <span aria-label={d.succeeded ? "success" : "failure"}
                        className="h-2 w-2 rounded-full"
                        style={{ background: d.succeeded ? "var(--emerald-500)" : "var(--rose-500)" }} />
                  <span className="font-medium" style={{ color: "var(--text-default)" }}>{d.subscriptionName}</span>
                  <span className="ml-auto tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {d.responseStatus ?? "—"}
                  </span>
                  <span className="ml-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                    {d.attemptedAt.toLocaleTimeString()} · attempt {d.attempt}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Related events */}
        {detail.related.length > 0 && (
          <Section title={`Related events (${detail.related.length})`}>
            <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
              {detail.related.map((r) => (
                <li key={r.id} className="flex items-center gap-2 py-1.5 text-[12px]">
                  <button type="button"
                          onClick={() => {
                            const u = new URLSearchParams(sp.toString());
                            u.set("detail", r.id);
                            router.replace(`/platform/access/audit?${u.toString()}`);
                          }}
                          className="font-mono hover:underline"
                          style={{ color: "var(--text-default)" }}>
                    {r.action}
                  </button>
                  <span className="ml-auto tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {r.createdAt.toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Hash chain */}
        <Section title="Tamper evidence">
          <div className="rounded-md border p-3 text-[11px]"
               style={{
                 borderColor: detail.chainIntact ? "var(--emerald-200)" : "var(--rose-200)",
                 background: detail.chainIntact ? "var(--emerald-50)" : "var(--rose-50)",
                 color: detail.chainIntact ? "var(--emerald-700)" : "var(--rose-700)",
               }}>
            {detail.chainIntact
              ? "Hash chain intact at this row."
              : "Hash chain mismatch detected — investigate."}
          </div>
          {detail.hash && (
            <div className="mt-1.5 break-all font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
              hash: {detail.hash}
            </div>
          )}
          {detail.prevHash && (
            <div className="break-all font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
              prev: {detail.prevHash}
            </div>
          )}
        </Section>

        {/* Replay */}
        <Section title="Replay">
          <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
            Replay is reserved for engineer roles and idempotent reads only. The action surface for it lives
            here once the runtime adds an idempotency-aware re-execute hook. (Deferred — needs a request-level
            replay primitive that doesn&apos;t mutate state.)
          </p>
        </Section>
      </div>
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd style={{ color: "var(--text-default)" }}>{value}</dd>
    </>
  );
}

function Pre({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-md border p-2"
         style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
      <div className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        {label}
      </div>
      <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-all text-[10px] font-mono"
           style={{ color: "var(--text-default)" }}>
        {JSON.stringify(value ?? null, null, 2)}
      </pre>
    </div>
  );
}
