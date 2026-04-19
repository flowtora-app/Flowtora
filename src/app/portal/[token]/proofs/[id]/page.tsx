import Link from "next/link";
import { requirePortalToken, portalPath } from "@/lib/portal";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { TextArea } from "@/components/Field";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  proofStatusColor,
  proofStatusLabel,
  isImage,
  formatSize,
  fileKindLabel,
  CUSTOMER_VISIBLE_FILE_KINDS,
} from "@/lib/proofs";
import { respondToProofPortal } from "@/app/actions/portal-public";
import { notFound } from "next/navigation";

export default async function PortalProofDetail({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePortalToken(token);

  // Proofs belong to orders; scope via the order's customerId to this portal.
  const proof = await db.proof.findFirst({
    where: {
      id,
      tenantId: ctx.tenant.id,
      order:    { customerId: ctx.customer.id },
    },
    include: {
      files: {
        // Phase 11 — customers only ever see PROOF and REFERENCE files. We
        // filter in the query so the number + list agree. Archived files
        // are hidden too (archivedAt is non-null for those).
        where:   { kind: { in: CUSTOMER_VISIBLE_FILE_KINDS }, archivedAt: null },
        orderBy: { createdAt: "asc" },
      },
      order: { select: { id: true, number: true } },
    },
  });
  if (!proof) notFound();
  if (proof.status === "DRAFT") {
    // Not visible to the customer yet.
    return (
      <div className="text-sm" style={{ color: "var(--text-muted)" }}>
        Proof not available.
      </div>
    );
  }

  // Phase 11 — version chain. Only surface the sibling versions that have
  // themselves been sent to the customer (no DRAFTs). Gives the customer
  // a breadcrumb so when they're reviewing v3 they can still peek at v1
  // and remember what they originally asked for.
  const siblings = await db.proof.findMany({
    where: {
      tenantId: ctx.tenant.id,
      orderId:  proof.orderId,
      status:   { not: "DRAFT" },
    },
    orderBy: { version: "asc" },
    select:  { id: true, version: true, status: true },
  });

  // Phase 15 Slice C — approval history. Show only the customer-visible
  // subset (SENT / APPROVED / CHANGES_REQUESTED / REJECTED). Internal
  // staff actions like REVISED / LOCKED / SUPERSEDED stay out of the
  // portal surface.
  const decisions = await db.proofDecision.findMany({
    where: {
      tenantId: ctx.tenant.id,
      proofId:  proof.id,
      decision: { in: ["SENT", "APPROVED", "CHANGES_REQUESTED", "REJECTED"] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id:        true,
      decision:  true,
      round:     true,
      notes:     true,
      createdAt: true,
    },
  });

  const locked = Boolean(proof.lockedAt);
  const decidable = proof.status === "SENT" && !locked;
  const respond = respondToProofPortal.bind(null, token, proof.id);

  // Due date — when set, we show a prominent "Please respond by…" hint.
  const dueUrgency = (() => {
    if (!proof.dueAt || !decidable) return null;
    const diff = proof.dueAt.getTime() - Date.now();
    if (diff < 0) return "overdue";
    if (diff < 24 * 3600_000) return "today";
    if (diff < 3 * 24 * 3600_000) return "soon";
    return "later";
  })();

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href={portalPath(token, "proofs")} className="underline" style={{ color: "var(--text-muted)" }}>
          ← Proofs
        </Link>
      </div>

      {sp.error && (
        <div className="rounded-md px-3 py-2 text-sm" style={{ background: "var(--danger-surface)", color: "var(--danger-fg)", border: "1px solid var(--danger-fg)" }}>
          {sp.error}
        </div>
      )}

      {/* Locked banner — when a customer has approved, we freeze the record
          so "who approved what" stays clean. We still let them view the
          page (there's no reason to hide it). */}
      {locked && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{ background: "var(--success-surface)", color: "var(--success-fg)", border: "1px solid var(--success-fg)" }}
        >
          <div className="font-semibold">✓ Approved and locked</div>
          <div className="mt-1">
            This proof was approved {proof.lockedAt && `on ${formatDate(proof.lockedAt, ctx.tenant.dateFormat)}`}. Production can now begin.
            If something needs to change, please get in touch and we&apos;ll prepare a new version.
          </div>
        </div>
      )}

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">
            {proof.title ?? `Proof v${proof.version}`}
          </h1>
          <span
            className="rounded-full px-2 py-0.5 text-xs"
            style={{ background: proofStatusColor(proof.status), color: "white" }}
          >
            {proofStatusLabel(proof.status)}
          </span>
          {proof.revisionRound > 1 && (
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
              title="Number of times this version has been re-sent"
            >
              round {proof.revisionRound}
            </span>
          )}
        </div>
        <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          From {ctx.tenant.name}
          {" · "}
          <Link href={portalPath(token, `orders/${proof.order.id}`)} className="underline">
            Order {proof.order.number}
          </Link>
          {" · "}Version {proof.version}
          {proof.sentAt && <> · Sent {formatDate(proof.sentAt, ctx.tenant.dateFormat)}</>}
          {proof.respondedAt && <> · You responded {formatDate(proof.respondedAt, ctx.tenant.dateFormat)}</>}
        </div>
      </div>

      {/* Version chain breadcrumb — renders only if there's history. */}
      {siblings.length > 1 && (
        <Card>
          <CardHeader
            title="Version history"
            description="Earlier versions of this design."
          />
          <ol className="flex flex-wrap gap-2 px-5 py-4 text-sm">
            {siblings.map((s) => {
              const isCurrent = s.id === proof.id;
              return (
                <li key={s.id}>
                  {isCurrent ? (
                    <span
                      className="inline-flex items-center gap-2 rounded-md px-3 py-1.5"
                      style={{
                        background: "var(--accent-primary)",
                        color: "var(--surface-0)",
                      }}
                    >
                      <span className="font-semibold">v{s.version}</span>
                      <span style={{ fontSize: 10 }}>current</span>
                    </span>
                  ) : (
                    <Link
                      href={portalPath(token, `proofs/${s.id}`)}
                      className="inline-flex items-center gap-2 rounded-md px-3 py-1.5"
                      style={{
                        background: "var(--surface-2)",
                        border: "1px solid var(--border-subtle)",
                        color: "var(--text-default)",
                        textDecoration: "none",
                      }}
                    >
                      <span className="font-semibold">v{s.version}</span>
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px]"
                        style={{ background: proofStatusColor(s.status), color: "white" }}
                      >
                        {proofStatusLabel(s.status)}
                      </span>
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {/* Due date call-out — only meaningful when they still need to decide. */}
      {decidable && proof.dueAt && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: dueUrgency === "overdue" ? "var(--danger-surface)"
                      : dueUrgency === "today"    ? "var(--warning-surface)"
                      : "var(--surface-1)",
            color: dueUrgency === "overdue" ? "var(--danger-fg)"
                 : dueUrgency === "today"    ? "var(--warning-fg)"
                 : "var(--text-default)",
            border: `1px solid ${
              dueUrgency === "overdue" ? "var(--danger-fg)"
            : dueUrgency === "today"    ? "var(--warning-fg)"
            : "var(--border-subtle)"
            }`,
          }}
        >
          <div className="font-semibold">
            {dueUrgency === "overdue" ? "⚠ Response is overdue" : "Please respond by"}
            {" "}
            {formatDateTime(proof.dueAt)}
          </div>
          <div className="mt-0.5 text-xs" style={{ opacity: 0.9 }}>
            We hold production until we have your sign-off. Getting back on or before this date keeps the project on schedule.
          </div>
        </div>
      )}

      {proof.description && (
        <Card>
          <CardHeader title="Description" />
          <div className="whitespace-pre-wrap px-5 py-4 text-sm">{proof.description}</div>
        </Card>
      )}

      {/* Files — watermark overlay applied to images when watermarkEnabled. */}
      <Card>
        <CardHeader title="Files" description={`${proof.files.length} attached`} />
        {proof.files.length === 0 ? (
          <div className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
            No files attached yet.
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-2">
            {proof.files.map((f) => (
              <li
                key={f.id}
                className="flex gap-3 rounded-md p-3"
                style={{
                  background: "var(--surface-0)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                {isImage(f) ? (
                  <div className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded" style={{ background: "var(--surface-2)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={f.thumbnailUrl ?? f.storageUrl}
                      alt={f.filename}
                      className="h-full w-full object-cover"
                    />
                    {proof.watermarkEnabled && !locked && (
                      <div
                        className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] font-bold uppercase tracking-widest"
                        style={{
                          color: "rgba(255,255,255,0.85)",
                          textShadow: "0 0 3px rgba(0,0,0,0.7)",
                          background:
                            "repeating-linear-gradient(135deg, rgba(0,0,0,0) 0px, rgba(0,0,0,0) 14px, rgba(0,0,0,0.18) 14px, rgba(0,0,0,0.18) 16px)",
                        }}
                        aria-hidden
                      >
                        PROOF
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="flex h-20 w-20 flex-shrink-0 flex-col items-center justify-center gap-1 rounded text-[10px] font-semibold uppercase tracking-wider"
                    style={{
                      background: "var(--surface-2)",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border-subtle)",
                    }}
                  >
                    <span aria-hidden className="text-lg">📄</span>
                    {fileKindLabel(f.kind)}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <a
                    href={f.storageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block truncate text-sm font-medium underline"
                    style={{ color: "var(--accent-primary)" }}
                  >
                    {f.filename}
                  </a>
                  <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    {fileKindLabel(f.kind)} · {formatSize(f.sizeBytes)}
                    {f.assetVersion && <> · iteration {f.assetVersion}</>}
                  </div>
                  {f.notes && (
                    <div className="mt-1 whitespace-pre-wrap text-xs" style={{ color: "var(--text-muted)" }}>
                      {f.notes}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {proof.customerResponse && (
        <Card>
          <CardHeader title="Your prior response" />
          <div className="whitespace-pre-wrap px-5 py-4 text-sm">{proof.customerResponse}</div>
        </Card>
      )}

      {/* Phase 15 Slice C — approval history. Only render when there is
          more than the implicit "we sent it" event so we don't crowd a
          fresh proof with an obvious note. */}
      {decisions.length > 1 && (
        <Card>
          <CardHeader
            title="Approval history"
            description="Every time we handed this proof off and every response you sent back."
          />
          <ol className="px-5 py-4">
            {decisions.map((d, i) => {
              const meta = decisionMeta(d.decision);
              return (
                <li
                  key={d.id}
                  className={i > 0 ? "pt-3" : undefined}
                  style={{
                    borderTop: i > 0 ? "1px solid var(--border-subtle)" : undefined,
                    paddingBottom: i < decisions.length - 1 ? "0.75rem" : 0,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="mt-1 h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ background: meta.dot }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span
                          className="text-[10px] font-semibold uppercase tracking-wider"
                          style={{ color: meta.dot }}
                        >
                          {meta.label}
                        </span>
                        <span className="font-medium">
                          Round {d.round}
                        </span>
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {formatDateTime(d.createdAt)}
                        </span>
                      </div>
                      {d.notes && (
                        <div
                          className="mt-0.5 whitespace-pre-wrap text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {d.notes}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {decidable ? (
        <Card>
          <CardHeader
            title="Your response"
            description="Once you approve, this version is locked and production begins."
          />
          <form action={respond} className="space-y-3 px-5 py-4">
            <TextArea
              label="Feedback (optional when approving, helpful when requesting changes)"
              name="note"
              rows={4}
              placeholder="What would you like changed?"
            />
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
                Approve proof
              </button>
              <button
                type="submit"
                name="decision"
                value="CHANGES"
                className="rounded-md px-4 py-2 text-sm font-semibold transition-colors hover:brightness-110"
                style={{
                  background: "transparent",
                  color: "var(--text-default)",
                  border: "1px solid var(--border-default)",
                }}
              >
                Request changes
              </button>
            </div>
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              By approving, you confirm the artwork shown matches what you want produced. Colors, copy, sizing — all as shown.
            </div>
          </form>
        </Card>
      ) : (
        !locked && (
          <Card>
            <div className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
              {proof.status === "CHANGES_REQUESTED" && <>You&apos;ve requested changes — we&apos;ll send a new version shortly.</>}
              {proof.status === "REJECTED" && <>This proof was rejected.</>}
              {proof.status === "APPROVED" && <>Thanks — this proof was approved.</>}
            </div>
          </Card>
        )
      )}
    </div>
  );
}

// Phase 15 Slice C — colored dot + label for each customer-visible
// decision kind. Shares the palette with the activity timeline so the
// two surfaces stay visually coherent. We accept the full enum even
// though the query is filtered — keeps TS happy without ceremony.
function decisionMeta(kind: string): { dot: string; label: string } {
  switch (kind) {
    case "SENT":              return { dot: "#3b82f6", label: "Sent to you"       };
    case "APPROVED":          return { dot: "#10b981", label: "You approved"      };
    case "CHANGES_REQUESTED": return { dot: "#f59e0b", label: "Changes requested" };
    case "REJECTED":          return { dot: "#ef4444", label: "Rejected"          };
    default:                  return { dot: "#6b7280", label: kind                };
  }
}
