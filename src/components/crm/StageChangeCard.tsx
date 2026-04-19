"use client";

import * as React from "react";
import { PIPELINE_STAGES, LOST_REASONS } from "@/lib/crm";
import type { PipelineStage } from "@prisma/client";

// Phase 7 — guided stage conversion card.
//
// Replaces the plain "pick a stage + type a reason" form. The form
// shape adapts to the selected stage so reps get the right prompts:
//
//   • LOST — canonical reason dropdown (required) + optional detail.
//   • WON  — shows a warning if no quote exists on file, plus a
//            "how did we close it" note field.
//   • Reactivating from LOST — asks for a short "why re-opening"
//            note, auto-logged as a NOTE interaction on the timeline.
//   • Any other move — optional stage note.
//
// The actual WON-requires-quote enforcement lives server-side in the
// changeStage action. The UI warning is there so reps don't click
// submit and get bounced.

type Props = {
  slug: string;
  customerId: string;
  currentStage: PipelineStage;
  /** Does this customer have at least one quote on file? */
  hasAnyQuote: boolean;
  /** Existing lost reason (if the row is already LOST). */
  existingLostReason: string | null;
  action: (formData: FormData) => Promise<void>;
};

export function StageChangeCard({
  slug: _slug,
  customerId,
  currentStage,
  hasAnyQuote,
  existingLostReason,
  action,
}: Props) {
  const [stage, setStage] = React.useState<PipelineStage>(currentStage);
  const [reasonCode, setReasonCode] = React.useState<string>(() =>
    parseLostReason(existingLostReason).code,
  );
  const [reasonDetail, setReasonDetail] = React.useState<string>(() =>
    parseLostReason(existingLostReason).detail,
  );

  const isLost = stage === "LOST";
  const isWon = stage === "WON";
  const isReactivation = currentStage === "LOST" && !isLost;
  const wonBlocked = isWon && !hasAnyQuote;

  // "No op" — selected stage matches current stage. Don't let the
  // rep submit a meaningless stage move.
  const noop = stage === currentStage && !isLost;

  return (
    <section
      className="rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <header
        className="px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
          Move to next stage
        </h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          Advancing the pipeline is how the team&apos;s numbers come together — be deliberate.
        </p>
      </header>

      <form action={action} className="space-y-4 px-5 py-4">
        <input type="hidden" name="customerId" value={customerId} />

        <div className="flex flex-wrap items-center gap-2">
          {PIPELINE_STAGES.map((s) => {
            const active = stage === s.value;
            return (
              <label
                key={s.value}
                className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-3 py-1 text-xs transition-colors ${
                  active ? "" : "hover:brightness-110"
                }`}
                style={{
                  background: active ? s.color : "var(--surface-2)",
                  color: active ? "white" : "var(--text-default)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                <input
                  type="radio"
                  name="stage"
                  value={s.value}
                  checked={active}
                  onChange={() => setStage(s.value)}
                  className="sr-only"
                />
                {s.label}
              </label>
            );
          })}
        </div>

        {/* LOST — canonical reason picker. */}
        {isLost && (
          <div
            className="space-y-3 rounded-lg p-4"
            style={{
              background: "var(--danger-surface)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div className="text-xs" style={{ color: "var(--danger-fg)" }}>
              <strong>Record why this slipped.</strong> Categorising lost
              deals is how the team learns — price loss is a very
              different problem from &ldquo;customer stopped replying&rdquo;.
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Reason
              </span>
              <select
                name="lostReasonCode"
                required
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
                className="w-full rounded-md px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-default)",
                }}
              >
                <option value="">Pick a reason…</option>
                {LOST_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Detail (optional)
              </span>
              <input
                type="text"
                name="lostReasonDetail"
                value={reasonDetail}
                onChange={(e) => setReasonDetail(e.target.value)}
                placeholder="e.g. $2k gap vs. the competitor's quote"
                maxLength={400}
                className="w-full rounded-md px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-default)",
                }}
              />
            </label>
          </div>
        )}

        {/* WON — quote-required warning + optional post-close note. */}
        {isWon && (
          <div
            className="space-y-3 rounded-lg p-4"
            style={{
              background: wonBlocked ? "var(--danger-surface)" : "var(--success-surface)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {wonBlocked ? (
              <div className="text-xs" style={{ color: "var(--danger-fg)" }}>
                <strong>Can&apos;t mark as won without a quote.</strong> Send or
                record a quote first so the team has the paper trail.
              </div>
            ) : (
              <div className="text-xs" style={{ color: "var(--success-fg)" }}>
                <strong>Nice close.</strong> Jot a line about what tipped
                it — future reps facing the same objection will thank
                you.
              </div>
            )}
            {!wonBlocked && (
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                  Close note (optional)
                </span>
                <textarea
                  name="stageNote"
                  rows={2}
                  placeholder="e.g. Matched the competitor's price, they liked our install turnaround."
                  maxLength={1000}
                  className="w-full rounded-md px-3 py-2 text-sm outline-none"
                  style={{
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-subtle)",
                    color: "var(--text-default)",
                  }}
                />
              </label>
            )}
          </div>
        )}

        {/* Reactivating a lost deal — context prompt. */}
        {isReactivation && (
          <div
            className="space-y-3 rounded-lg p-4"
            style={{
              background: "var(--accent-surface)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div className="text-xs" style={{ color: "var(--accent-primary)" }}>
              <strong>Reactivating.</strong> This was marked lost — tell
              the team what changed so the timeline shows the story.
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Why re-opening?
              </span>
              <textarea
                name="stageNote"
                rows={2}
                required
                placeholder="e.g. Budget unlocked Q2, they reached out again."
                maxLength={1000}
                className="w-full rounded-md px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-default)",
                }}
              />
            </label>
          </div>
        )}

        {/* Active-stage shuffles — simple optional note. */}
        {!isLost && !isWon && !isReactivation && stage !== currentStage && (
          <label className="block space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Note (optional)
            </span>
            <textarea
              name="stageNote"
              rows={2}
              placeholder="What prompted the move?"
              maxLength={1000}
              className="w-full rounded-md px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
              }}
            />
          </label>
        )}

        <div className="flex items-center justify-between">
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            {noop
              ? "Pick a different stage to continue."
              : `Moving ${humanizeStage(currentStage)} → ${humanizeStage(stage)}.`}
          </div>
          <button
            type="submit"
            disabled={noop || wonBlocked}
            className="inline-flex h-9 items-center rounded-md px-4 text-sm font-medium disabled:opacity-50"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-fg)",
            }}
          >
            {isWon ? "Mark as won" : isLost ? "Mark as lost" : isReactivation ? "Reactivate" : "Update stage"}
          </button>
        </div>
      </form>
    </section>
  );
}

function humanizeStage(s: PipelineStage): string {
  return PIPELINE_STAGES.find((x) => x.value === s)?.label ?? s;
}

function parseLostReason(raw: string | null): { code: string; detail: string } {
  if (!raw) return { code: "", detail: "" };
  const [code, ...rest] = raw.split(":");
  const trimmedCode = code.trim();
  const known = LOST_REASONS.some((r) => r.value === trimmedCode);
  if (!known) return { code: "other", detail: raw };
  return { code: trimmedCode, detail: rest.join(":").trim() };
}
