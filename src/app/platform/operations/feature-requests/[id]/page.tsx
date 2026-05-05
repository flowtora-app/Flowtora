// Page 36 §Request detail.
//
// Full editor with ICE scoring, voting, comments, related requests
// (auto-suggested by tag overlap), linked tickets, status timeline,
// merge dialog, and convert-to-bug action.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadFeatureRequestDetail,
  loadUserVote,
  loadFeatureRequestList,
  loadFeatureRequestFilterOptions,
} from "@/server/platform/feature-requests";
import {
  updateFeatureRequest,
  transitionFeatureRequest,
  voteOnFeatureRequest,
  postFeatureRequestComment,
  mergeFeatureRequests,
  convertFeatureRequestToBug,
} from "@/app/actions/platform-feature-requests";
import { renderMarkdown } from "@/lib/md-to-html";
import type {
  FeatureRequestStatus,
  EngineeringEffort,
  VoteDirection,
} from "@prisma/client";
import {
  EFFORT_LABEL,
  EffortChip,
  IceChip,
  STATUS_LABEL,
  STATUS_TONE,
  StatusPill,
  FormError,
  FormOk,
  relativeFromNow,
} from "../_components/shared";

export const dynamic = "force-dynamic";

const STATUSES: FeatureRequestStatus[] = [
  "SUBMITTED", "BACKLOG", "UNDER_REVIEW", "PLANNED", "IN_PROGRESS", "BETA", "SHIPPED", "WONT_DO",
];
const EFFORTS: EngineeringEffort[] = ["XS", "S", "M", "L", "XL"];

export default async function FeatureRequestDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();
  const canWrite = ctx.can("features.manage");

  const [fr, userVote, allOpen, options] = await Promise.all([
    loadFeatureRequestDetail(id),
    loadUserVote(id, ctx.userId),
    // Pull a small list of merge-target candidates (excluding self + merged rows).
    loadFeatureRequestList({ filters: {}, page: 1, pageSize: 200 }),
    loadFeatureRequestFilterOptions(),
  ]);
  if (!fr) notFound();

  const tone = STATUS_TONE[fr.status];
  const html = renderMarkdown(fr.description || "*(no description yet)*");
  const mergeCandidates = allOpen.rows.filter((r) => r.id !== fr.id);

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/platform/operations/feature-requests" className="underline" style={{ color: "var(--text-muted)" }}>
          Feature requests
        </Link>
        <span className="mx-1.5">/</span>
        <span style={{ color: "var(--text-default)" }}>{fr.title}</span>
      </div>

      <FormOk msg={sp.ok} />
      <FormError msg={sp.error} />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill status={fr.status} />
            {fr.isPublic && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
              >
                Public
              </span>
            )}
            <IceChip score={fr.iceScore} />
            <EffortChip effort={fr.effort} />
            {fr.plannedRelease && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
              >
                {fr.plannedRelease}
              </span>
            )}
            {fr.swimlane && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ background: "var(--surface-2)", color: "var(--text-default)" }}
              >
                {fr.swimlane}
              </span>
            )}
          </div>
          <h1
            className="mt-1.5 text-[22px] font-semibold leading-tight"
            style={{ color: "var(--text-default)" }}
          >
            {fr.title}
          </h1>
          <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span className="font-mono">#{fr.id.slice(0, 8)}</span>
            {fr.submitterTenantName && ` · from ${fr.submitterTenantName}`}
            {fr.submitterUserName && ` · by ${fr.submitterUserName}`}
            {" · created "}{relativeFromNow(fr.createdAt)}
            {fr.shippedAt && ` · shipped ${relativeFromNow(fr.shippedAt)}`}
          </p>
        </div>
        <VotePanel id={fr.id} userVote={userVote} upvotes={fr.upvoteCount} downvotes={fr.downvoteCount} returnTo={`/platform/operations/feature-requests/${fr.id}`} />
      </div>

      {/* Status transitions */}
      {canWrite && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg border p-2"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <span className="px-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Move to
          </span>
          {STATUSES.filter((s) => s !== fr.status).map((s) => (
            <form key={s} action={transitionFeatureRequest}>
              <input type="hidden" name="id" value={fr.id} />
              <input type="hidden" name="to" value={s} />
              <button
                type="submit"
                className="ts-focus rounded-md px-2 py-1 text-[11px] font-medium"
                style={{
                  background: "var(--surface-1)",
                  color: STATUS_TONE[s].fg,
                  border: `1px solid ${STATUS_TONE[s].fg}`,
                }}
              >
                → {STATUS_LABEL[s]}
              </button>
            </form>
          ))}
        </div>
      )}

      {/* Two-column body */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Left: description + comments + edit form */}
        <div className="flex flex-col gap-4">
          {/* Description rendered + edit form */}
          <section
            className="rounded-lg border p-4"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
          >
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
              Description
            </h2>
            <div
              className="md-preview mt-2 text-[12px] leading-relaxed"
              style={{ color: "var(--text-default)" }}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </section>

          {/* Editor form */}
          <form
            action={updateFeatureRequest}
            className="flex flex-col gap-3 rounded-lg border p-4"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
          >
            <input type="hidden" name="id" value={fr.id} />
            <Field label="Title">
              <input
                name="title"
                required
                defaultValue={fr.title}
                disabled={!canWrite}
                className="ts-focus w-full rounded-md px-3 py-2 text-[14px] font-semibold outline-none"
                style={inputStyle()}
              />
            </Field>
            <Field label="Description (Markdown)">
              <textarea
                name="description"
                defaultValue={fr.description}
                rows={10}
                disabled={!canWrite}
                className="ts-focus w-full rounded-md px-3 py-2 font-mono text-[12px] outline-none"
                style={{ ...inputStyle(), lineHeight: 1.5 }}
              />
            </Field>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="ICE — Impact (1-10)">
                <input
                  type="number" min={1} max={10} step={1}
                  name="iceImpact"
                  defaultValue={fr.iceImpact ?? ""}
                  disabled={!canWrite}
                  className="ts-focus w-full rounded-md px-2 py-1.5 text-[12px] tabular-nums outline-none"
                  style={inputStyle()}
                />
              </Field>
              <Field label="Confidence (1-10)">
                <input
                  type="number" min={1} max={10} step={1}
                  name="iceConfidence"
                  defaultValue={fr.iceConfidence ?? ""}
                  disabled={!canWrite}
                  className="ts-focus w-full rounded-md px-2 py-1.5 text-[12px] tabular-nums outline-none"
                  style={inputStyle()}
                />
              </Field>
              <Field label="Ease (1-10)" help={fr.iceScore != null ? `Score: ${fr.iceScore}` : "Score updates after save"}>
                <input
                  type="number" min={1} max={10} step={1}
                  name="iceEase"
                  defaultValue={fr.iceEase ?? ""}
                  disabled={!canWrite}
                  className="ts-focus w-full rounded-md px-2 py-1.5 text-[12px] tabular-nums outline-none"
                  style={inputStyle()}
                />
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Engineering effort">
                <Select name="effort" defaultValue={fr.effort ?? ""} disabled={!canWrite}>
                  <option value="">— Unsized —</option>
                  {EFFORTS.map((e) => <option key={e} value={e}>{EFFORT_LABEL[e]}</option>)}
                </Select>
              </Field>
              <Field label="Planned release" help="Free-form quarter / version, e.g. 2026Q3">
                <input
                  name="plannedRelease"
                  defaultValue={fr.plannedRelease ?? ""}
                  maxLength={20}
                  disabled={!canWrite}
                  placeholder="2026Q3"
                  list="planned-release-options"
                  className="ts-focus w-full rounded-md px-2 py-1.5 text-[12px] outline-none"
                  style={inputStyle()}
                />
                <datalist id="planned-release-options">
                  {options.releases.map((r) => <option key={r} value={r} />)}
                </datalist>
              </Field>
              <Field label="Swimlane" help="Team or domain">
                <input
                  name="swimlane"
                  defaultValue={fr.swimlane ?? ""}
                  maxLength={40}
                  disabled={!canWrite}
                  list="swimlane-options"
                  className="ts-focus w-full rounded-md px-2 py-1.5 text-[12px] outline-none"
                  style={inputStyle()}
                />
                <datalist id="swimlane-options">
                  {options.swimlanes.map((s) => <option key={s} value={s} />)}
                </datalist>
              </Field>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Tags (comma-separated)">
                <input
                  name="tags"
                  defaultValue={fr.tags.join(", ")}
                  disabled={!canWrite}
                  className="ts-focus w-full rounded-md px-2 py-1.5 text-[12px] outline-none"
                  style={inputStyle()}
                />
              </Field>
              <Field label="Linked support ticket ids" help="Comma-separated. Surfaces in the right-rail.">
                <input
                  name="linkedSupportTicketIds"
                  defaultValue={fr.linkedSupportTicketIds.join(", ")}
                  disabled={!canWrite}
                  className="ts-focus w-full rounded-md px-2 py-1.5 text-[12px] outline-none"
                  style={inputStyle()}
                />
              </Field>
            </div>
            <Field label="Public on roadmap" help="When checked + status ∈ Planned/In progress/Beta/Shipped, surfaces on /roadmap.">
              <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input
                  type="checkbox"
                  name="isPublic"
                  defaultChecked={fr.isPublic}
                  disabled={!canWrite}
                  className="ts-focus h-3.5 w-3.5"
                />
                Show on the public roadmap
              </label>
            </Field>
            {canWrite && (
              <div className="flex items-center justify-end gap-2">
                <button
                  type="submit"
                  className="ts-focus rounded-md px-4 py-2 text-[12px] font-semibold"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
                >
                  Save changes
                </button>
              </div>
            )}
          </form>

          {/* Comments */}
          <section
            id="comments"
            className="rounded-lg border p-4"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
          >
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
              Comments ({fr.comments.length})
            </h2>
            <ul className="mt-2 flex flex-col gap-3">
              {fr.comments.map((c) => (
                <li
                  key={c.id}
                  className="rounded-md border p-3"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
                >
                  <div className="flex items-center justify-between gap-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    <span style={{ color: "var(--text-default)", fontWeight: 600 }}>
                      {c.authorName ?? "(removed user)"}
                    </span>
                    <span>{relativeFromNow(c.createdAt)}</span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-[12px]" style={{ color: "var(--text-default)" }}>
                    {c.body}
                  </p>
                </li>
              ))}
              {fr.comments.length === 0 && (
                <li className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  No comments yet. Open the floor.
                </li>
              )}
            </ul>
            <form action={postFeatureRequestComment} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="id" value={fr.id} />
              <textarea
                name="body"
                required
                rows={3}
                placeholder="Leave a comment…"
                className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
                style={{ ...inputStyle(), lineHeight: 1.5 }}
              />
              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-semibold"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
                >
                  Post comment
                </button>
              </div>
            </form>
          </section>
        </div>

        {/* Right rail */}
        <aside className="flex flex-col gap-3">
          {/* Linked tickets */}
          <SidebarCard title={`Linked support tickets (${fr.linkedTickets.length})`}>
            {fr.linkedTickets.length === 0 ? (
              <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                None — add ids in the editor.
              </span>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {fr.linkedTickets.map((t) => (
                  <li key={t.id} className="text-[12px]">
                    <Link
                      href={`/platform/support/${t.id}`}
                      className="ts-focus underline"
                      style={{ color: "var(--text-default)" }}
                    >
                      {t.subject}
                    </Link>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {t.status.replace(/_/g, " ").toLowerCase()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SidebarCard>

          {/* Linked bug */}
          {fr.linkedBugId && (
            <SidebarCard title="Linked bug">
              <Link
                href={`/platform/operations/bugs/${fr.linkedBugId}`}
                className="ts-focus text-[12px] underline"
                style={{ color: "var(--danger-fg)" }}
              >
                Open bug report →
              </Link>
            </SidebarCard>
          )}

          {/* Related requests */}
          <SidebarCard title="Related (auto-suggested)">
            {fr.relatedRequests.length === 0 ? (
              <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                Nothing related yet — add a tag to surface neighbors.
              </span>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {fr.relatedRequests.map((r) => (
                  <li key={r.id} className="text-[12px]">
                    <Link
                      href={`/platform/operations/feature-requests/${r.id}`}
                      className="ts-focus block"
                      style={{ color: "var(--text-default)" }}
                    >
                      <span className="line-clamp-2">{r.title}</span>
                      <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {STATUS_LABEL[r.status]} · {r.voteCount} votes
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SidebarCard>

          {/* Timeline */}
          <SidebarCard title="Status timeline">
            <ul className="flex flex-col gap-1.5">
              {fr.timeline.map((t, idx) => (
                <li key={`${t.event}-${idx}`} className="flex items-center justify-between text-[11px]">
                  <span style={{ color: "var(--text-default)" }}>{t.event}</span>
                  <span style={{ color: "var(--text-muted)" }}>{relativeFromNow(t.at)}</span>
                </li>
              ))}
            </ul>
          </SidebarCard>

          {/* Merged-in */}
          {fr.mergedIn.length > 0 && (
            <SidebarCard title={`Merged in (${fr.mergedIn.length})`}>
              <ul className="flex flex-col gap-1">
                {fr.mergedIn.map((m) => (
                  <li key={m.id} className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    <span className="line-clamp-2" style={{ color: "var(--text-default)" }}>
                      {m.title}
                    </span>
                    <span>{relativeFromNow(m.mergedAt)}</span>
                  </li>
                ))}
              </ul>
            </SidebarCard>
          )}

          {/* Merge dialog */}
          {canWrite && (
            <SidebarCard title="Merge into…">
              <form action={mergeFeatureRequests} className="flex flex-col gap-2">
                <input type="hidden" name="sourceId" value={fr.id} />
                <select
                  name="targetId"
                  defaultValue=""
                  required
                  className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
                  style={inputStyle()}
                >
                  <option value="" disabled>Pick a survivor request…</option>
                  {mergeCandidates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title.slice(0, 60)}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-semibold"
                  style={{
                    background: "var(--surface-1)",
                    color: "var(--warning-fg)",
                    border: "1px solid var(--amber-200, var(--border-default))",
                  }}
                >
                  Merge this into chosen request
                </button>
                <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                  Repoints votes, comments, tickets, and tags. Source is marked merged and stops accepting changes.
                </p>
              </form>
            </SidebarCard>
          )}

          {/* Convert to bug */}
          {canWrite && !fr.linkedBugId && (
            <SidebarCard title="Convert to bug">
              <form action={convertFeatureRequestToBug}>
                <input type="hidden" name="id" value={fr.id} />
                <button
                  type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-semibold"
                  style={{
                    background: "var(--rose-50, var(--surface-2))",
                    color: "var(--danger-fg)",
                    border: "1px solid var(--rose-200, var(--border-default))",
                  }}
                  disabled={!fr.submitterTenantId}
                >
                  Convert to support bug ticket
                </button>
                {!fr.submitterTenantId && (
                  <p className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                    Need a submitter tenant to convert.
                  </p>
                )}
              </form>
            </SidebarCard>
          )}
        </aside>
      </div>
    </div>
  );
}

function VotePanel({
  id, userVote, upvotes, downvotes, returnTo,
}: {
  id: string;
  userVote: VoteDirection | null;
  upvotes: number;
  downvotes: number;
  returnTo: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border p-2"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <VoteForm id={id} direction="UP" current={userVote} returnTo={returnTo}>
        <span style={{ color: userVote === "UP" ? "var(--accent-primary)" : "var(--text-muted)" }}>▲</span>
        <b className="ml-1 tabular-nums" style={{ color: "var(--text-default)" }}>{upvotes}</b>
      </VoteForm>
      <VoteForm id={id} direction="DOWN" current={userVote} returnTo={returnTo}>
        <span style={{ color: userVote === "DOWN" ? "var(--danger-fg)" : "var(--text-muted)" }}>▼</span>
        <b className="ml-1 tabular-nums" style={{ color: "var(--text-default)" }}>{downvotes}</b>
      </VoteForm>
    </div>
  );
}

function VoteForm({
  id, direction, current, returnTo, children,
}: {
  id: string;
  direction: VoteDirection;
  current: VoteDirection | null;
  returnTo: string;
  children: React.ReactNode;
}) {
  // If clicking the already-active arrow, clear; otherwise switch.
  const next = current === direction ? "CLEAR" : direction;
  return (
    <form action={voteOnFeatureRequest}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="direction" value={next} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        className="ts-focus rounded-md px-3 py-1.5 text-[12px]"
        style={{
          background: current === direction ? "var(--surface-2)" : "transparent",
          border: `1px solid ${current === direction ? "var(--border-default)" : "var(--border-subtle)"}`,
          color: "var(--text-default)",
        }}
      >
        {children}
      </button>
    </form>
  );
}

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      className="rounded-lg border p-3"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label, help, children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
      {help && <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{help}</span>}
    </label>
  );
}

function Select({
  name, defaultValue, disabled, children,
}: {
  name: string;
  defaultValue: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      disabled={disabled}
      className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
      style={inputStyle()}
    >
      {children}
    </select>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-default)",
  };
}
