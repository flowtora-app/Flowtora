import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button, Checkbox, Field, TextArea } from "@/components/Field";
import { FilesCard } from "@/components/FilesCard";
import { CommentThread } from "@/components/CommentThread";
import {
  PROOF_TRANSITIONS,
  proofStatusColor,
  proofStatusLabel,
  PROOF_DECISION_META,
  proofDecisionLabel,
  proofDecisionColor,
} from "@/lib/proofs";
import { formatDate, formatDateTime } from "@/lib/format";
import { memberLookup } from "@/lib/members";
import {
  updateProofMeta,
  updateProofSettings,
  changeProofStatus,
  startProofRevision,
  deleteProof,
  attachProofFiles,
} from "@/app/actions/proofs";
import { issueProofShareToken, revokeShareToken } from "@/app/actions/share-tokens";
import { ShareLinkPanel } from "@/components/share/ShareLinkPanel";
import { AttachProofFilesForm } from "@/components/proofs/AttachProofFilesForm";

const TRANSITION_LABELS: Partial<Record<string, string>> = {
  SENT:              "Send to customer",
  APPROVED:          "Record approval",
  CHANGES_REQUESTED: "Record change request",
  REJECTED:          "Record rejection",
  DRAFT:             "Back to draft",
};

export default async function ProofDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string; proofId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, id: orderId, proofId } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "proofs:view");
  const canManage = ctx.can("proofs:manage");

  const proof = await db.proof.findFirst({
    where: { id: proofId, tenantId: ctx.tenant.id, orderId },
    include: {
      order: { select: { id: true, number: true, customer: { select: { id: true, name: true, email: true } } } },
      files: { orderBy: { createdAt: "asc" } },
      comments: { orderBy: { createdAt: "asc" }, take: 200 },
      decisions: { orderBy: { createdAt: "asc" }, take: 200 },
      shareTokens: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true, token: true, label: true, expiresAt: true, revokedAt: true,
          lastUsedAt: true, viewCount: true, createdAt: true,
        },
      },
    },
  });
  if (!proof) notFound();

  const siblings = await db.proof.findMany({
    where:   { tenantId: ctx.tenant.id, orderId },
    orderBy: { version: "asc" },
    select:  {
      id: true, version: true, status: true, supersededAt: true,
      lockedAt: true, revisionRound: true,
    },
  });

  const memberMap = await memberLookup(ctx.tenant.id);

  const locked = Boolean(proof.lockedAt);
  const superseded = Boolean(proof.supersededAt);
  const editable = !locked && !superseded && (proof.status === "DRAFT" || proof.status === "CHANGES_REQUESTED");
  const transitions = locked || superseded ? [] : PROOF_TRANSITIONS[proof.status];

  const saveMeta     = updateProofMeta.bind(null, slug, proof.id);
  const saveSettings = updateProofSettings.bind(null, slug, proof.id);
  const revise       = startProofRevision.bind(null, slug, proof.id);
  const del          = deleteProof.bind(null, slug, proof.id);
  const issueShare   = issueProofShareToken.bind(null, slug, orderId, proof.id);
  const revokeShare  = revokeShareToken.bind(null, slug);
  const attach       = attachProofFiles.bind(null, slug, proof.id);

  const dueUrgency = (() => {
    if (!proof.dueAt) return null;
    const diff = proof.dueAt.getTime() - Date.now();
    if (diff < 0) return "overdue";
    if (diff < 24 * 3600_000) return "today";
    if (diff < 3 * 24 * 3600_000) return "soon";
    return "later";
  })();
  const dueColor =
    dueUrgency === "overdue" ? "var(--danger-fg)" :
    dueUrgency === "today"   ? "rgb(245 158 11)" :
    dueUrgency === "soon"    ? "rgb(245 158 11)" :
    "var(--text-muted)";

  const hasFiles = proof.files.some((f) => !f.archivedAt);
  const canSendDraft = canManage && !locked && !superseded && proof.status === "DRAFT" && hasFiles;

  // Primary CTA — the single most important action for this status.
  let primaryCta: React.ReactNode = null;
  if (canSendDraft) {
    const sendAction = changeProofStatus.bind(null, slug, proof.id);
    primaryCta = (
      <form action={sendAction}>
        <input type="hidden" name="status" value="SENT" />
        <Button type="submit">Send to customer</Button>
      </form>
    );
  } else if (canManage && !locked && !superseded && proof.status === "CHANGES_REQUESTED") {
    primaryCta = (
      <form action={revise}>
        <Button type="submit">Start revision →</Button>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-sm">
        <Link
          href={`/t/${slug}/orders/${orderId}?tab=proofs`}
          className="underline"
          style={{ color: "var(--text-muted)" }}
        >
          ← Order {proof.order.number}
        </Link>
      </div>

      {sp.error && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          {sp.error}
        </div>
      )}

      {/* Lock / superseded banners — above the sticky header so they scroll away. */}
      {locked && (
        <div
          className="flex items-start gap-3 rounded-lg px-4 py-3"
          style={{
            background: "rgb(16 185 129 / 0.1)",
            border: "1px solid rgb(16 185 129 / 0.3)",
            color: "rgb(6 95 70)",
          }}
        >
          <span aria-hidden className="text-lg leading-none">🔒</span>
          <div className="min-w-0 text-sm">
            <div className="font-semibold">Proof locked after approval</div>
            <div className="mt-0.5 text-xs">
              Approved {proof.lockedAt && `on ${formatDateTime(proof.lockedAt)}`}
              {proof.lockedBy && ` by ${proof.lockedBy.startsWith("customer:") ? "customer" : (memberMap.get(proof.lockedBy)?.name ?? "staff")}`}.
              Files and status can't change. Start a new revision if further work is needed.
            </div>
          </div>
        </div>
      )}
      {superseded && !locked && (
        <div
          className="flex items-start gap-3 rounded-lg px-4 py-3"
          style={{
            background: "rgb(139 92 246 / 0.1)",
            border: "1px solid rgb(139 92 246 / 0.3)",
            color: "rgb(91 33 182)",
          }}
        >
          <span aria-hidden className="text-lg leading-none">⇄</span>
          <div className="min-w-0 text-sm">
            <div className="font-semibold">Superseded by a newer version</div>
            <div className="mt-0.5 text-xs">
              This record is kept for history.
              {proof.supersededByProofId && (
                <>
                  {" "}
                  <Link
                    href={`/t/${slug}/orders/${orderId}/proofs/${proof.supersededByProofId}`}
                    className="underline"
                  >
                    Jump to current version →
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* STICKY HEADER — version, status, customer, primary CTA. */}
      <header
        className="sticky top-0 z-10 rounded-lg"
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 1px 2px rgb(0 0 0 / 0.04)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold" style={{ color: "var(--text-default)" }}>
                Proof version {proof.version}
              </h1>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ background: proofStatusColor(proof.status), color: "white" }}
              >
                {proofStatusLabel(proof.status)}
              </span>
              {proof.revisionRound > 1 && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px]"
                  style={{
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-muted)",
                  }}
                  title="Times this version has been re-sent after a change request"
                >
                  Round {proof.revisionRound}
                </span>
              )}
              {proof.dueAt && (
                <span
                  className="rounded-full px-2 py-0.5 text-[11px]"
                  style={{
                    background: "var(--surface-1)",
                    border: `1px solid ${dueColor}`,
                    color: dueColor,
                  }}
                  title={`Due ${formatDateTime(proof.dueAt)}`}
                >
                  {dueUrgency === "overdue" ? "⚠ Overdue" : `Due ${formatDate(proof.dueAt)}`}
                </span>
              )}
            </div>
            <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              For{" "}
              <Link
                href={`/t/${slug}/customers/${proof.order.customer.id}`}
                className="underline"
                style={{ color: "var(--text-default)" }}
              >
                {proof.order.customer.name}
              </Link>
              {" · "}Order{" "}
              <Link
                href={`/t/${slug}/orders/${proof.order.id}`}
                className="underline"
                style={{ color: "var(--text-default)" }}
              >
                {proof.order.number}
              </Link>
              {" · "}Created {formatDateTime(proof.createdAt)}
              {` by ${memberMap.get(proof.createdBy)?.name ?? "—"}`}
            </div>
            {proof.title && (
              <div className="mt-1.5 text-sm font-medium" style={{ color: "var(--text-default)" }}>
                {proof.title}
              </div>
            )}
          </div>
          {primaryCta && (
            <div className="flex items-center gap-2 shrink-0">{primaryCta}</div>
          )}
        </div>
      </header>

      {/* Revision chain — tab-style strip for quick v-hopping. */}
      {siblings.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Versions:
          </span>
          {siblings.map((s) => {
            const isCurrent = s.id === proof.id;
            const dimmed = s.supersededAt && !isCurrent;
            return (
              <Link
                key={s.id}
                href={`/t/${slug}/orders/${orderId}/proofs/${s.id}`}
                className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors"
                style={{
                  background: isCurrent ? "var(--accent-primary)" : "var(--surface-1)",
                  border: `1px solid ${isCurrent ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                  color: isCurrent ? "white" : dimmed ? "var(--text-faint)" : "var(--text-default)",
                  opacity: dimmed ? 0.8 : 1,
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
                {s.lockedAt && <span title="Locked">🔒</span>}
              </Link>
            );
          })}
        </div>
      )}

      {/* Secondary actions row. */}
      {canManage && (!locked || superseded || transitions.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {canManage && !locked && !superseded && proof.status !== "APPROVED" && proof.status !== "CHANGES_REQUESTED" && (
            <form action={revise}>
              <Button
                type="submit"
                variant="secondary"
                title="Spin off a new version (v+1) cloning this one. Current version will be marked superseded."
              >
                Start revision →
              </Button>
            </form>
          )}
          {canManage && proof.status === "DRAFT" && !superseded && (
            <form action={del}>
              <Button type="submit" variant="danger">Delete draft</Button>
            </form>
          )}
        </div>
      )}

      {/* MAIN WORKSPACE — files preview + sidebar. */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {/* Rich uploader — drag & drop, image previews, type chips.
              Only mounted when the version is editable and the viewer can
              upload. A locked or superseded version skips the uploader
              entirely (FilesCard below still renders the frozen list). */}
          {canManage && editable && (
            <AttachProofFilesForm
              action={attach}
              existingFileCount={proof.files.filter((f) => !f.archivedAt).length}
            />
          )}

          {/* Files list — archived + active artwork for this version. The
              paste-a-URL form is suppressed; the dropzone above covers new
              uploads, and archive/restore/remove controls stay on each row. */}
          <FilesCard
            slug={slug}
            files={proof.files}
            parent={{ kind: "proof", id: proof.id }}
            canUpload={canManage && editable}
            locked={locked}
            memberMap={memberMap}
            backUrl={`/t/${slug}/orders/${orderId}/proofs/${proof.id}`}
            title="Proof files"
            defaultKind="PROOF"
            suppressUploadForm
          />

          {/* Customer-visible copy. */}
          {editable && canManage ? (
            <Card>
              <CardHeader
                title="Customer-visible details"
                description="Title and description appear on the customer portal. Keep them short and client-friendly."
              />
              <form action={saveMeta} className="space-y-3 px-5 py-4">
                <Field
                  label="Title"
                  name="title"
                  defaultValue={proof.title ?? ""}
                  placeholder="e.g. Storefront channel letters — v2"
                />
                <TextArea
                  label="What changed in this version?"
                  name="description"
                  rows={3}
                  defaultValue={proof.description ?? ""}
                  placeholder="A one-paragraph summary of what's changed from last version, or what to look at."
                />
                <Button type="submit" variant="secondary">Save details</Button>
              </form>
            </Card>
          ) : (
            (proof.title || proof.description) && (
              <Card>
                <CardHeader title="Customer-visible details" />
                <div className="space-y-2 px-5 py-4 text-sm">
                  {proof.title && <div className="font-medium">{proof.title}</div>}
                  {proof.description && (
                    <div className="whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>
                      {proof.description}
                    </div>
                  )}
                </div>
              </Card>
            )
          )}

          {/* Customer response — pin-pointed feedback from the portal. */}
          {proof.respondedAt && (
            <Card>
              <CardHeader
                title="Customer response"
                description={`Recorded ${formatDateTime(proof.respondedAt)}`}
              />
              <div className="space-y-2 px-5 py-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-xs"
                    style={{ background: proofStatusColor(proof.status), color: "white" }}
                  >
                    {proofStatusLabel(proof.status)}
                  </span>
                </div>
                {proof.customerResponse ? (
                  <p className="whitespace-pre-wrap">{proof.customerResponse}</p>
                ) : (
                  <p style={{ color: "var(--text-muted)" }}>No additional feedback provided.</p>
                )}
              </div>
            </Card>
          )}

          {/* Decision timeline — chronological ledger. */}
          <Card>
            <CardHeader
              title="Version timeline"
              description="Every status change, revision, and file update on this version."
            />
            {proof.decisions.length === 0 ? (
              <div className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                No events yet.
              </div>
            ) : (
              <ol className="px-5 py-4">
                {proof.decisions.map((d, i) => {
                  const actor =
                    d.decidedByUserId
                      ? (memberMap.get(d.decidedByUserId)?.name ?? "staff")
                      : d.decidedByCustomerId
                      ? "customer"
                      : "system";
                  const meta = PROOF_DECISION_META[d.decision];
                  return (
                    <li
                      key={d.id}
                      className="flex gap-3 py-2"
                      style={{ borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)" }}
                    >
                      <div
                        className="shrink-0 text-center"
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 14,
                          background: proofDecisionColor(d.decision),
                          color: "white",
                          lineHeight: "28px",
                          fontSize: 14,
                        }}
                        aria-hidden
                      >
                        {meta?.icon ?? "•"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm">
                          <span className="font-medium">{proofDecisionLabel(d.decision)}</span>
                          <span style={{ color: "var(--text-muted)" }}> · {actor}</span>
                          {d.round > 0 && (
                            <span style={{ color: "var(--text-muted)" }}> · round {d.round}</span>
                          )}
                        </div>
                        {d.notes && (
                          <div
                            className="mt-0.5 whitespace-pre-wrap text-sm"
                            style={{ color: "var(--text-default)" }}
                          >
                            {d.notes}
                          </div>
                        )}
                        <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                          {formatDateTime(d.createdAt)}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          {/* Internal thread — staff comments on this version. */}
          <CommentThread
            slug={slug}
            parentKind="proof"
            parentId={proof.id}
            comments={proof.comments}
            currentUserId={ctx.userId}
            memberMap={memberMap}
            canModerate={ctx.can("staff:manage")}
          />
        </div>

        {/* Sidebar: record-state + designer settings + share links. */}
        <aside className="space-y-5">
          {/* Record what the customer said (phone/email). */}
          {canManage && transitions.length > 0 && (
            <Card>
              <CardHeader
                title="Record customer decision"
                description="Use these when the customer responded over email or phone. Portal approvals record themselves."
              />
              <div className="space-y-2 px-5 py-4">
                {transitions.map((to) => {
                  const action = changeProofStatus.bind(null, slug, proof.id);
                  const isDanger = to === "REJECTED";
                  const needsResponse = to === "APPROVED" || to === "CHANGES_REQUESTED" || to === "REJECTED";
                  return (
                    <form key={to} action={action} className="space-y-2">
                      <input type="hidden" name="status" value={to} />
                      {needsResponse && (
                        <input
                          name="customerResponse"
                          placeholder={to === "APPROVED" ? "Approval note (optional)" : "Customer feedback"}
                          className="w-full rounded-md px-3 py-1.5 text-sm outline-none"
                          style={{
                            background: "var(--input-bg, var(--surface-1))",
                            border: "1px solid var(--border-default, var(--border-subtle))",
                            color: "var(--text-default)",
                          }}
                        />
                      )}
                      <Button
                        type="submit"
                        variant={isDanger ? "danger" : (to === "DRAFT" || to === "SENT" ? "secondary" : "primary")}
                      >
                        {TRANSITION_LABELS[to] ?? proofStatusLabel(to)}
                      </Button>
                    </form>
                  );
                })}
                {(proof.status === "SENT" || proof.status === "CHANGES_REQUESTED") && (
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    Re-sending bumps the round counter. Use <em>Start revision</em> when the artwork changes materially.
                  </p>
                )}
              </div>
            </Card>
          )}

          {/* Designer-only settings — internal notes, due date, watermark. */}
          {canManage && !locked && (
            <Card>
              <CardHeader
                title="Designer settings"
                description="Internal-only. Not shared with the customer."
              />
              <form action={saveSettings} className="space-y-3 px-5 py-4">
                <TextArea
                  label="Internal notes"
                  name="internalNotes"
                  rows={3}
                  defaultValue={proof.internalNotes ?? ""}
                  placeholder="Stock, bleed, RIP settings, gotchas for the next designer."
                />
                <Field
                  label="Due date"
                  name="dueAt"
                  type="date"
                  defaultValue={proof.dueAt ? proof.dueAt.toISOString().slice(0, 10) : ""}
                  hint="Used by reminders and the overdue chip."
                />
                <Checkbox
                  label="Watermark on customer portal"
                  name="watermarkEnabled"
                  defaultChecked={proof.watermarkEnabled}
                />
                <Button type="submit" variant="secondary">Save settings</Button>
              </form>
            </Card>
          )}

          {/* Share links — public portal access without login. */}
          {canManage && (
            <ShareLinkPanel
              tokens={proof.shareTokens}
              createAction={issueShare}
              revokeAction={revokeShare}
              kind="PROOF"
            />
          )}
        </aside>
      </div>
    </div>
  );
}
