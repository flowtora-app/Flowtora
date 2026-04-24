import Link from "next/link";
import type { ProofStatus } from "@prisma/client";
import { Button } from "@/components/Field";
import { proofStatusColor, proofStatusLabel, isImage } from "@/lib/proofs";
import { formatDate } from "@/lib/format";
import { changeProofStatus, startProofRevision } from "@/app/actions/proofs";

type ThumbFile = {
  id: string;
  storageUrl: string;
  thumbnailUrl: string | null;
  mimeType: string | null;
  filename: string;
};

export type ProofVersionCardProof = {
  id: string;
  version: number;
  status: ProofStatus;
  title: string | null;
  description: string | null;
  revisionRound: number;
  lockedAt: Date | null;
  supersededAt: Date | null;
  sentAt: Date | null;
  respondedAt: Date | null;
  dueAt: Date | null;
  createdAt: Date;
  createdBy: string;
  _count: { files: number };
  files: ThumbFile[];
};

export function ProofVersionCard({
  slug,
  orderId,
  proof,
  isLatest,
  isCurrent,
  canManage,
  uploaderName,
  customerEmail,
}: {
  slug: string;
  orderId: string;
  proof: ProofVersionCardProof;
  isLatest: boolean;
  isCurrent: boolean;
  canManage: boolean;
  uploaderName: string | null;
  customerEmail: string | null;
}) {
  const href = `/t/${slug}/orders/${orderId}/proofs/${proof.id}`;
  const locked = Boolean(proof.lockedAt);
  const superseded = Boolean(proof.supersededAt);
  const thumb = proof.files[0];
  const hasThumb = thumb && isImage({ mimeType: thumb.mimeType, storageUrl: thumb.storageUrl });

  // Active = this version can still change (isn't superseded or locked).
  const canTransition = canManage && !locked && !superseded;
  const canSend = canTransition && proof.status === "DRAFT" && proof.files.length > 0;
  const canDraftSend = canTransition && proof.status === "DRAFT" && proof.files.length === 0;
  const canReSend = canTransition && proof.status === "CHANGES_REQUESTED";
  const canRevise = canTransition && proof.status !== "APPROVED";

  return (
    <article
      className="overflow-hidden rounded-lg"
      style={{
        background: "var(--surface-0)",
        border: isCurrent ? "1px solid var(--accent-primary)" : "1px solid var(--border-subtle)",
        boxShadow: isCurrent ? "0 0 0 3px var(--accent-surface)" : "none",
        opacity: superseded && !isCurrent ? 0.75 : 1,
      }}
    >
      <div className="flex gap-4 p-4">
        {/* Thumbnail */}
        <Link
          href={href}
          aria-label={`Open proof v${proof.version}`}
          className="group relative block shrink-0 overflow-hidden rounded-md"
          style={{
            width: 96,
            height: 96,
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {hasThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumb.thumbnailUrl ?? thumb.storageUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div
              className="flex h-full w-full flex-col items-center justify-center gap-1 text-center"
              style={{ color: "var(--text-faint)" }}
            >
              <span className="text-2xl leading-none">📄</span>
              <span className="text-[10px] font-medium uppercase tracking-wider">
                {proof._count.files > 0
                  ? `${proof._count.files} ${proof._count.files === 1 ? "file" : "files"}`
                  : "No files"}
              </span>
            </div>
          )}
          {locked && (
            <span
              className="absolute right-1 top-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white"
              style={{ background: "rgb(16 185 129 / 0.9)" }}
              title="Locked after approval"
            >
              🔒
            </span>
          )}
        </Link>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={href}
              className="text-sm font-semibold hover:underline"
              style={{ color: "var(--text-default)" }}
            >
              Version {proof.version}
            </Link>
            {isLatest && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
              >
                Latest
              </span>
            )}
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
            {superseded && !locked && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-muted)",
                }}
              >
                Superseded
              </span>
            )}
          </div>

          {proof.title && (
            <div className="mt-1 truncate text-sm" style={{ color: "var(--text-default)" }}>
              {proof.title}
            </div>
          )}

          <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {proof._count.files} {proof._count.files === 1 ? "file" : "files"}
            {" · "}Created {formatDate(proof.createdAt)}
            {uploaderName && ` by ${uploaderName}`}
            {proof.sentAt && <> · Sent {formatDate(proof.sentAt)}</>}
            {proof.respondedAt && <> · Responded {formatDate(proof.respondedAt)}</>}
            {proof.dueAt && !locked && <> · Due {formatDate(proof.dueAt)}</>}
          </div>

          {proof.description && (
            <p
              className="mt-2 line-clamp-2 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              {proof.description}
            </p>
          )}
        </div>
      </div>

      {/* Actions footer — only when there's something to do on this version. */}
      {(canSend || canDraftSend || canReSend || canRevise || !locked) && (
        <div
          className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
          style={{
            background: "var(--surface-1)",
            borderTop: "1px solid var(--border-subtle)",
          }}
        >
          <div className="flex items-center gap-2">
            <Link href={href}>
              <Button type="button" variant="secondary">Open</Button>
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canSend && (
              <form
                action={changeProofStatus.bind(null, slug, proof.id)}
                title={customerEmail ? `Email ${customerEmail}` : "No email on file"}
              >
                <input type="hidden" name="status" value="SENT" />
                <Button type="submit">Send to customer</Button>
              </form>
            )}
            {canDraftSend && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Upload a proof file to enable sending.
              </span>
            )}
            {canReSend && (
              <form
                action={changeProofStatus.bind(null, slug, proof.id)}
                title="Resend this version after making minor tweaks"
              >
                <input type="hidden" name="status" value="SENT" />
                <Button type="submit" variant="secondary">Re-send</Button>
              </form>
            )}
            {canRevise && proof.status !== "DRAFT" && (
              <form
                action={startProofRevision.bind(null, slug, proof.id)}
                title="Spin off a new version (v+1) cloning this one"
              >
                <Button type="submit" variant="secondary">Start revision →</Button>
              </form>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
