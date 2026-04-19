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
} from "@/app/actions/proofs";
import { issueProofShareToken, revokeShareToken } from "@/app/actions/share-tokens";
import { ShareLinkPanel } from "@/components/share/ShareLinkPanel";

// Action buttons on the state-transition bar. DRAFT→SENT is the big
// CTA; everything else the designer-side path is a "record what the
// customer told us over the phone" button. The copy is deliberately
// neutral — we never want a designer to accidentally mark a customer
// as approving something the customer didn't actually approve.
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
      order: { select: { id: true, number: true, customer: { select: { id: true, name: true } } } },
      files: { orderBy: { createdAt: "asc" } },
      comments: { orderBy: { createdAt: "asc" }, take: 200 },
      decisions: { orderBy: { createdAt: "asc" }, take: 200 },
      // Phase 15 — share tokens for this proof (for staff management + audit).
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

  // Phase 11 — the full revision chain for this order. The designer card
  // needs to render "v1 → v2 → v3 (current)" so it's obvious which version
  // supersedes which. We pull everything on the order and let the UI pick.
  const siblings = await db.proof.findMany({
    where:   { tenantId: ctx.tenant.id, orderId },
    orderBy: { version: "asc" },
    select:  {
      id: true, version: true, status: true, supersededAt: true,
      lockedAt: true, revisionRound: true,
    },
  });

  const memberMap = await memberLookup(ctx.tenant.id);

  // Lock is the big flag. Anything that mutates proof state needs to respect
  // this; the page renders it as a banner so the designer sees it before
  // trying to click a disabled form.
  const locked = Boolean(proof.lockedAt);

  // A proof is "editable" when it hasn't been approved/rejected/locked and
  // isn't superseded by a newer version. We still SHOW superseded proofs
  // (history matters) but disable all mutation forms.
  const superseded = Boolean(proof.supersededAt);
  const editable = !locked && !superseded && (proof.status === "DRAFT" || proof.status === "CHANGES_REQUESTED");
  const transitions = locked || superseded ? [] : PROOF_TRANSITIONS[proof.status];

  const saveMeta     = updateProofMeta.bind(null, slug, proof.id);
  const saveSettings = updateProofSettings.bind(null, slug, proof.id);
  const revise       = startProofRevision.bind(null, slug, proof.id);
  const del          = deleteProof.bind(null, slug, proof.id);
  const issueShare   = issueProofShareToken.bind(null, slug, orderId, proof.id);
  const revokeShare  = revokeShareToken.bind(null, slug);

  // Due date urgency for header chip.
  const dueUrgency = (() => {
    if (!proof.dueAt) return null;
    const diff = proof.dueAt.getTime() - Date.now();
    if (diff < 0) return "overdue";
    if (diff < 24 * 3600_000) return "today";
    if (diff < 3 * 24 * 3600_000) return "soon";
    return "later";
  })();
  const dueColor =
    dueUrgency === "overdue" ? "#ef4444" :
    dueUrgency === "today"   ? "#f59e0b" :
    dueUrgency === "soon"    ? "#f59e0b" :
    "var(--muted)";

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href={`/t/${slug}/orders/${orderId}`} className="underline" style={{ color: "var(--muted)" }}>
          ← Order {proof.order.number}
        </Link>
      </div>

      {sp.error && (
        <div className="rounded-md px-3 py-2 text-sm" style={{ background: "#3a1517", color: "#ff8b8b", border: "1px solid #5b2024" }}>
          {sp.error}
        </div>
      )}

      {/* Locked banner — always first so nobody misses it. */}
      {locked && (
        <div className="rounded-md px-4 py-3 text-sm" style={{ background: "#0f2e1f", color: "#6ee7b7", border: "1px solid #1f5b3c" }}>
          <div className="font-semibold">🔒 This proof is locked.</div>
          <div className="mt-1" style={{ color: "#a7e8c9" }}>
            Approved {proof.lockedAt && `on ${formatDateTime(proof.lockedAt)}`}
            {proof.lockedBy && ` by ${proof.lockedBy.startsWith("customer:") ? "customer" : (memberMap.get(proof.lockedBy)?.name ?? "staff")}`}.
            {" "}Files and status can no longer be changed. Start a new revision if further work is needed.
          </div>
        </div>
      )}

      {/* Superseded banner — informational, not blocking. */}
      {superseded && !locked && (
        <div className="rounded-md px-4 py-3 text-sm" style={{ background: "#1e1b2e", color: "#c4b5fd", border: "1px solid #4c3a7a" }}>
          <div className="font-semibold">⇄ This version has been superseded.</div>
          <div className="mt-1" style={{ color: "#b8a8ea" }}>
            A newer version exists for this order. This record is kept for history.
            {proof.supersededByProofId && (
              <>
                {" "}
                <Link href={`/t/${slug}/orders/${orderId}/proofs/${proof.supersededByProofId}`} className="underline">
                  Jump to current version →
                </Link>
              </>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">Proof v{proof.version}</h1>
            <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: proofStatusColor(proof.status), color: "white" }}>
              {proofStatusLabel(proof.status)}
            </span>
            {proof.revisionRound > 1 && (
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--muted)" }}
                title="Times this version has been re-sent after a change request"
              >
                round {proof.revisionRound}
              </span>
            )}
            {proof.dueAt && (
              <span
                className="rounded-full px-2 py-0.5 text-xs"
                style={{ background: "var(--panel)", border: `1px solid ${dueColor}`, color: dueColor }}
                title={`Due ${formatDateTime(proof.dueAt)}`}
              >
                {dueUrgency === "overdue" ? "⚠ overdue" : `due ${formatDate(proof.dueAt)}`}
              </span>
            )}
          </div>
          <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            For <Link href={`/t/${slug}/customers/${proof.order.customer.id}`} className="underline">{proof.order.customer.name}</Link>
            {" · "}Created by {memberMap.get(proof.createdBy)?.name ?? "—"}
            {" · "}{formatDateTime(proof.createdAt)}
          </div>
        </div>

        {/* Action buttons cluster */}
        <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
          {canManage && !locked && !superseded && proof.status !== "APPROVED" && (
            <form action={revise}>
              <Button type="submit" variant="secondary" title="Spin off a new version (v+1) cloning this one's content. The current version will be marked superseded.">
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
      </div>

      {/* Revision chain — only show if there's more than one version. */}
      {siblings.length > 1 && (
        <Card>
          <CardHeader
            title="Revision history"
            description="Each version is a separate customer-facing record. Rounds count re-sends of the same version."
          />
          <ol className="flex flex-wrap gap-2 px-5 py-4 text-sm">
            {siblings.map((s) => {
              const isCurrent = s.id === proof.id;
              const dimmed = s.supersededAt && !isCurrent;
              return (
                <li key={s.id}>
                  <Link
                    href={`/t/${slug}/orders/${orderId}/proofs/${s.id}`}
                    className="inline-flex items-center gap-2 rounded-md px-3 py-1.5"
                    style={{
                      background: isCurrent ? "var(--accent)" : "var(--panel)",
                      border:     `1px solid ${isCurrent ? "var(--accent)" : "var(--border)"}`,
                      color:      isCurrent ? "white" : (dimmed ? "var(--muted)" : "var(--text)"),
                      opacity:    dimmed ? 0.7 : 1,
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
                    {s.supersededAt && !isCurrent && <span style={{ fontSize: 10 }}>superseded</span>}
                  </Link>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {/* Status transition bar */}
      {canManage && transitions.length > 0 && (
        <Card>
          <CardHeader
            title="Record a state change"
            description="Use these when the customer responded over email/phone. Portal approvals record themselves automatically."
          />
          <div className="flex flex-wrap items-center gap-2 px-5 py-3">
            {transitions.map((to) => {
              const action = changeProofStatus.bind(null, slug, proof.id);
              const isDanger = to === "REJECTED";
              const needsResponse = to === "APPROVED" || to === "CHANGES_REQUESTED" || to === "REJECTED";
              return (
                <form key={to} action={action} className="flex items-center gap-2">
                  <input type="hidden" name="status" value={to} />
                  {needsResponse && (
                    <input
                      name="customerResponse"
                      placeholder={to === "APPROVED" ? "Approval note (optional)" : "Customer feedback"}
                      className="rounded-md px-3 py-1.5 text-sm outline-none"
                      style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)", minWidth: 280 }}
                    />
                  )}
                  <Button type="submit" variant={isDanger ? "danger" : (to === "DRAFT" ? "secondary" : "primary")}>
                    {TRANSITION_LABELS[to] ?? proofStatusLabel(to)}
                  </Button>
                </form>
              );
            })}
          </div>
          {(proof.status === "SENT" || proof.status === "CHANGES_REQUESTED") && (
            <div className="px-5 pb-3 text-xs" style={{ color: "var(--muted)" }}>
              Re-sending this version (SENT → CHANGES_REQUESTED → SENT) bumps the round counter. Create a new version via “Start revision” only when the artwork itself changes materially.
            </div>
          )}
        </Card>
      )}

      {/* Title / description — customer-visible copy */}
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
              label="Description (customer sees this)"
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
              {proof.description && <div className="whitespace-pre-wrap" style={{ color: "var(--muted)" }}>{proof.description}</div>}
            </div>
          </Card>
        )
      )}

      {/* Designer settings — internal notes, due date, watermark. Hidden from
          customer. Editable any time the proof isn't locked. */}
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
              placeholder="Stock, bleed, RIP settings, gotchas for the next designer to pick this up."
            />
            <Field
              label="Due date"
              name="dueAt"
              type="date"
              defaultValue={proof.dueAt ? proof.dueAt.toISOString().slice(0, 10) : ""}
              hint="Used by reminders and the overdue chip. Clear to unset."
            />
            <Checkbox
              label="Apply visible watermark on customer portal"
              name="watermarkEnabled"
              defaultChecked={proof.watermarkEnabled}
            />
            <Button type="submit" variant="secondary">Save settings</Button>
          </form>
        </Card>
      )}

      {/* Customer response (if any) */}
      {proof.respondedAt && (
        <Card>
          <CardHeader
            title="Customer response"
            description={`Recorded ${formatDateTime(proof.respondedAt)}`}
          />
          <div className="space-y-2 px-5 py-4 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: proofStatusColor(proof.status), color: "white" }}>
                {proofStatusLabel(proof.status)}
              </span>
            </div>
            {proof.customerResponse ? (
              <p className="whitespace-pre-wrap">{proof.customerResponse}</p>
            ) : (
              <p style={{ color: "var(--muted)" }}>No additional feedback provided.</p>
            )}
          </div>
        </Card>
      )}

      {/* Files */}
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
      />

      {/* Decision timeline — the ledger. This is the designer's single view
          of the truth: every meaningful event, in order, with who did it. */}
      <Card>
        <CardHeader
          title="Decision timeline"
          description="Every status change, revision, and file update on this proof."
        />
        {proof.decisions.length === 0 ? (
          <div className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
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
                <li key={d.id} className="flex gap-3 py-2" style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}>
                  <div
                    className="flex-shrink-0 text-center"
                    style={{ width: 28, height: 28, borderRadius: 14, background: proofDecisionColor(d.decision), color: "white", lineHeight: "28px", fontSize: 14 }}
                    aria-hidden
                  >
                    {meta?.icon ?? "•"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">
                      <span className="font-medium">{proofDecisionLabel(d.decision)}</span>
                      <span style={{ color: "var(--muted)" }}> · {actor}</span>
                      {d.round > 0 && (
                        <span style={{ color: "var(--muted)" }}> · round {d.round}</span>
                      )}
                    </div>
                    {d.notes && (
                      <div className="mt-0.5 text-sm whitespace-pre-wrap" style={{ color: "var(--text)" }}>{d.notes}</div>
                    )}
                    <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                      {formatDateTime(d.createdAt)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>

      {canManage && (
        <ShareLinkPanel
          tokens={proof.shareTokens}
          createAction={issueShare}
          revokeAction={revokeShare}
          kind="PROOF"
        />
      )}

      {/* Phase 14 — proof-level internal thread. */}
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
  );
}
