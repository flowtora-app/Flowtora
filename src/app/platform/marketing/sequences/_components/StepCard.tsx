// Page 40 — flow-canvas step card with edit form, move/delete actions,
// add-child affordances, and per-step counters.

import {
  updateSequenceStep,
  moveSequenceStep,
  deleteSequenceStep,
  addSequenceStep,
} from "@/app/actions/platform-sequences";
import type { SequenceStepKind } from "@prisma/client";
import type { SequenceStepNode } from "@/server/platform/sequences";
import {
  STEP_LABEL,
  branchArmsFor,
  defaultStepConfig,
  summarizeStep,
} from "@/lib/sequence-steps";
import { STEP_KIND_TONE } from "./shared";

const ALL_STEP_KINDS: SequenceStepKind[] = [
  "SEND_EMAIL", "SEND_SMS", "SEND_IN_APP", "NOTIFY_CSM",
  "ADD_TAG", "REMOVE_TAG", "MOVE_TO_PLAN", "APPLY_COUPON",
  "WEBHOOK_OUT", "BRANCH", "WAIT", "SPLIT",
];

export interface StepCardProps {
  step: SequenceStepNode;
  sequenceId: string;
  canWrite: boolean;
  /** Used for "no available branch siblings" hint. */
  parentBranchKey?: string | null;
  events: Record<string, number> | undefined;
  /** Recursively render children. */
  depth?: number;
}

export function StepCard({ step, sequenceId, canWrite, events, depth = 0 }: StepCardProps) {
  const tone = STEP_KIND_TONE[step.kind];
  const arms = branchArmsFor(step.kind, step.config);
  const summary = summarizeStep(step.kind, step.config);

  // Group children by branchKey for BRANCH/SPLIT, otherwise linear.
  const childrenByArm = new Map<string, SequenceStepNode[]>();
  for (const c of step.children) {
    const key = c.branchKey ?? "__linear__";
    const list = childrenByArm.get(key) ?? [];
    list.push(c);
    childrenByArm.set(key, list);
  }

  const linearChildren = childrenByArm.get("__linear__") ?? [];
  const enteredCount = step.enteredCount;
  const exitedCount = step.exitedCount;
  const eventTotal = events ? Object.values(events).reduce((s, n) => s + n, 0) : 0;

  return (
    <div id={`step-${step.id.slice(0, 8)}`} className="flex flex-col gap-2">
      <div
        className="rounded-lg border"
        style={{
          background: "var(--surface-1)",
          borderColor: "var(--border-subtle)",
          marginLeft: depth * 16,
        }}
      >
        <div className="flex items-start gap-2 border-b px-3 py-2"
             style={{ borderColor: "var(--border-subtle)" }}>
          <span aria-hidden className="rounded-md px-1.5 py-1 text-[12px]"
                style={{ background: tone.bg, color: tone.fg }}>
            {tone.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--text-muted)" }}>
                Step {step.position + 1}
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: tone.fg }}>
                {STEP_LABEL[step.kind]}
              </span>
              {step.branchKey && (
                <span className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                      style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                  branch · {step.branchKey}
                </span>
              )}
            </div>
            <div className="mt-0.5 text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
              {step.title ?? STEP_LABEL[step.kind]}
            </div>
            <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
              {summary}
            </div>
          </div>
          {canWrite && (
            <div className="flex items-center gap-1">
              <MoveButton sequenceId={sequenceId} stepId={step.id} direction="up" />
              <MoveButton sequenceId={sequenceId} stepId={step.id} direction="down" />
              <form action={deleteSequenceStep}>
                <input type="hidden" name="stepId" value={step.id} />
                <input type="hidden" name="sequenceId" value={sequenceId} />
                <button type="submit"
                        className="ts-focus rounded-sm px-1.5 py-1 text-[11px]"
                        style={{ background: "var(--surface-1)", color: "var(--danger-fg)", border: "1px solid var(--rose-200, var(--border-default))" }}>
                  ×
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Counters */}
        <div className="grid grid-cols-3 border-b text-[11px]"
             style={{ borderColor: "var(--border-subtle)" }}>
          <Stat label="Entered"   value={enteredCount} />
          <Stat label="Exited"    value={exitedCount} accent="warn" />
          <Stat label="Converted" value={step.convertedCount} accent="good" />
        </div>

        {/* Edit form */}
        <details className="px-3 py-2">
          <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider"
                   style={{ color: "var(--text-muted)" }}>
            Edit step config
          </summary>
          <form action={updateSequenceStep} className="mt-2 grid gap-2">
            <input type="hidden" name="stepId" value={step.id} />
            <input type="hidden" name="sequenceId" value={sequenceId} />
            <Field label="Title">
              <input name="title" defaultValue={step.title ?? ""} maxLength={120}
                     disabled={!canWrite}
                     className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
                     style={inputStyle()} />
            </Field>
            <Field label="Config (JSON)" help={describeConfig(step.kind)}>
              <textarea name="configJson" rows={6}
                        defaultValue={JSON.stringify(step.config, null, 2)}
                        disabled={!canWrite}
                        className="ts-focus w-full rounded-md px-3 py-2 font-mono text-[11px] outline-none"
                        style={{ ...inputStyle(), lineHeight: 1.5 }} />
            </Field>
            {canWrite && (
              <div className="flex items-center justify-end">
                <button type="submit"
                        className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-semibold"
                        style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                  Save step
                </button>
              </div>
            )}
          </form>
        </details>

        {events && Object.keys(events).length > 0 && (
          <details className="border-t px-3 py-2"
                   style={{ borderColor: "var(--border-subtle)" }}>
            <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider"
                     style={{ color: "var(--text-muted)" }}>
              Per-event counts ({eventTotal})
            </summary>
            <ul className="mt-1 flex flex-col gap-0.5 text-[11px]">
              {Object.entries(events).sort((a, b) => b[1] - a[1]).map(([evt, n]) => (
                <li key={evt} className="flex items-baseline justify-between">
                  <code style={{ color: "var(--text-default)" }}>{evt}</code>
                  <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>{n}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Children — branch arms or linear next-step */}
      {(arms.length === 0)
        ? <ChildList children={linearChildren} sequenceId={sequenceId} canWrite={canWrite} events={events} parentId={step.id} parentBranchKey={null} addChildLabel="↓ Add next step" depth={depth + 1} />
        : (
          <div className="ml-4 flex flex-col gap-2 border-l pl-3"
               style={{ borderColor: "var(--border-default)" }}>
            {arms.map((arm) => (
              <div key={arm}>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider"
                     style={{ color: "var(--text-muted)" }}>
                  Branch · {arm}
                </div>
                <ChildList
                  children={childrenByArm.get(arm) ?? []}
                  sequenceId={sequenceId}
                  canWrite={canWrite}
                  events={events}
                  parentId={step.id}
                  parentBranchKey={arm}
                  addChildLabel={`+ Add to "${arm}" branch`}
                  depth={depth + 1}
                />
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function ChildList({
  children, sequenceId, canWrite, events, parentId, parentBranchKey, addChildLabel, depth,
}: {
  children: SequenceStepNode[];
  sequenceId: string;
  canWrite: boolean;
  events: Record<string, number> | undefined;
  parentId: string;
  parentBranchKey: string | null;
  addChildLabel: string;
  depth: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      {children.map((c) => (
        <StepCard key={c.id} step={c} sequenceId={sequenceId} canWrite={canWrite}
                  events={events} parentBranchKey={parentBranchKey} depth={depth} />
      ))}
      {canWrite && <AddStepButton sequenceId={sequenceId} parentId={parentId} branchKey={parentBranchKey} label={addChildLabel} />}
    </div>
  );
}

function AddStepButton({
  sequenceId, parentId, branchKey, label,
}: {
  sequenceId: string;
  parentId: string;
  branchKey: string | null;
  label: string;
}) {
  return (
    <details className="rounded-md border border-dashed px-3 py-1.5 text-[11px]"
             style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}>
      <summary className="cursor-pointer">{label}</summary>
      <form action={addSequenceStep} className="mt-2 flex flex-wrap items-center gap-2">
        <input type="hidden" name="sequenceId" value={sequenceId} />
        <input type="hidden" name="parentStepId" value={parentId} />
        {branchKey != null && <input type="hidden" name="branchKey" value={branchKey} />}
        <select name="kind" defaultValue="SEND_EMAIL"
                className="ts-focus rounded-md px-2 py-1 text-[11px] outline-none"
                style={inputStyle()}>
          {ALL_STEP_KINDS.map((k) => <option key={k} value={k}>{STEP_LABEL[k]}</option>)}
        </select>
        <button type="submit"
                className="ts-focus rounded-md px-2 py-1 text-[11px] font-semibold"
                style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
          Add
        </button>
      </form>
    </details>
  );
}

function MoveButton({
  sequenceId, stepId, direction,
}: {
  sequenceId: string;
  stepId: string;
  direction: "up" | "down";
}) {
  return (
    <form action={moveSequenceStep}>
      <input type="hidden" name="sequenceId" value={sequenceId} />
      <input type="hidden" name="stepId" value={stepId} />
      <input type="hidden" name="direction" value={direction} />
      <button type="submit"
              className="ts-focus rounded-sm px-1.5 py-1 text-[11px]"
              style={{ background: "var(--surface-1)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}
              title={`Move ${direction}`}>
        {direction === "up" ? "↑" : "↓"}
      </button>
    </form>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: "good" | "warn" }) {
  const colour =
    accent === "good" ? "var(--success-fg)" :
    accent === "warn" ? "var(--warning-fg)" :
                         "var(--text-default)";
  return (
    <div className="px-3 py-1.5 text-center"
         style={{ borderRight: "1px solid var(--border-subtle)" }}>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="text-[14px] font-semibold tabular-nums" style={{ color: colour }}>{value.toLocaleString()}</div>
    </div>
  );
}

function describeConfig(kind: SequenceStepKind): string {
  switch (kind) {
    case "SEND_EMAIL":   return JSON.stringify(defaultStepConfig("SEND_EMAIL"));
    case "WAIT":         return "{ \"durationMinutes\": 1440 } or { \"untilEvent\": \"…\", \"maxDurationMinutes\": …}";
    case "BRANCH":       return "{ \"condition\": \"...\", \"yesLabel\": \"yes\", \"noLabel\": \"no\" }";
    case "SPLIT":        return "{ \"branches\": [{ \"key\": \"A\", \"weight\": 50 }, { \"key\": \"B\", \"weight\": 50 }] }";
    default:             return JSON.stringify(defaultStepConfig(kind));
  }
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
      {help && <span className="text-[10px] font-mono" style={{ color: "var(--text-faint)" }}>{help}</span>}
    </label>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-default)",
  };
}
