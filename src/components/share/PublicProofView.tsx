import { notFound } from "next/navigation";
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
import { respondToProofShare } from "@/app/actions/portal-public";
import type { ShareContext } from "@/lib/share";

// Phase 15 Slice A — public proof share view.
//
// Mirrors the portal proof page but without any navigation / sibling
// version breadcrumb. A forwarded approver shouldn't need the whole
// order history — just the proof they're being asked to decide on.

export async function PublicProofView({
  shareCtx,
  proofId,
  shareTokenId,
  flashError,
  flashDone,
}: {
  shareCtx: ShareContext;
  proofId: string;
  shareTokenId: string;
  flashError?: string;
  flashDone: boolean;
}) {
  const proof = await db.proof.findFirst({
    where: { id: proofId, tenantId: shareCtx.tenant.id },
    include: {
      files: {
        where:   { kind: { in: CUSTOMER_VISIBLE_FILE_KINDS }, archivedAt: null },
        orderBy: { createdAt: "asc" },
      },
      order: { select: { number: true } },
    },
  });
  if (!proof) notFound();
  if (proof.status === "DRAFT") {
    return (
      <div
        className="rounded-lg px-5 py-8 text-center text-sm"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        This proof isn&apos;t ready yet.
      </div>
    );
  }

  const locked = Boolean(proof.lockedAt);
  const decidable = proof.status === "SENT" && !locked;
  const respond = respondToProofShare.bind(null, shareTokenId);

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
      {/* Branding */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {shareCtx.tenant.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shareCtx.tenant.logoUrl}
              alt={shareCtx.tenant.name}
              className="mb-2 h-10 w-auto"
            />
          )}
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Proof from
          </div>
          <div className="text-lg font-semibold">{shareCtx.tenant.name}</div>
        </div>
      </div>

      {flashDone && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--success-surface)",
            color: "var(--success-fg)",
            border: "1px solid var(--success-fg)",
          }}
        >
          Thanks — your response has been recorded.
        </div>
      )}

      {flashError && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          {flashError}
        </div>
      )}

      {locked && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--success-surface)",
            color: "var(--success-fg)",
            border: "1px solid var(--success-fg)",
          }}
        >
          <div className="font-semibold">✓ Approved and locked</div>
          <div className="mt-1">
            This proof was approved {proof.lockedAt && `on ${formatDate(proof.lockedAt)}`}. Production can now begin.
          </div>
        </div>
      )}

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
              style={{
                background: "var(--surface-2)",
                color: "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
              }}
              title="Number of times this version has been re-sent"
            >
              round {proof.revisionRound}
            </span>
          )}
        </div>
        <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Order {proof.order.number} · Version {proof.version}
          {proof.sentAt && <> · Sent {formatDate(proof.sentAt)}</>}
          {proof.respondedAt && <> · Responded {formatDate(proof.respondedAt)}</>}
        </div>
      </div>

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
        </div>
      )}

      {proof.description && (
        <Card>
          <CardHeader title="Description" />
          <div className="whitespace-pre-wrap px-5 py-4 text-sm">{proof.description}</div>
        </Card>
      )}

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
                  <div
                    className="relative h-20 w-20 flex-shrink-0 overflow-hidden rounded"
                    style={{ background: "var(--surface-2)" }}
                  >
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
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {proof.customerResponse && (
        <Card>
          <CardHeader title="Previous response" />
          <div className="whitespace-pre-wrap px-5 py-4 text-sm">{proof.customerResponse}</div>
        </Card>
      )}

      {decidable && (
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
              By approving, you confirm the artwork shown matches what you want produced.
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
