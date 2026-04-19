import * as React from "react";
import { createTask, addInteraction } from "@/app/actions/customers";
import type { NextAction } from "@/lib/next-action";

// Phase 7 — "Next action" card.
//
// Prominent card at the top of the customer detail page. Shows the
// recommended next action (computed by next-action.ts) and gives the
// rep two one-click outs:
//
//   1. "Do it now" — log an interaction of the recommended type
//      (call / email / note) with the suggested title pre-filled.
//   2. "Schedule it" — create a task with the suggested title, due
//      tomorrow by default.
//
// We render both as plain `<form action={serverAction}>` so no
// client JS is required. The page passes `slug` + `customerId` through
// as hidden fields.

const URGENCY_STYLES = {
  high:   { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",  dot: "var(--danger-fg)" },
  medium: { bg: "var(--accent-surface)",  fg: "var(--accent-primary)", dot: "var(--accent-primary)" },
  low:    { bg: "var(--surface-2)",        fg: "var(--text-muted)",     dot: "var(--text-faint)" },
} as const;

const URGENCY_LABEL = {
  high: "Do today",
  medium: "This week",
  low: "When you get to it",
} as const;

export function NextActionPanel({
  slug,
  customerId,
  action,
  canEdit,
}: {
  slug: string;
  customerId: string;
  action: NextAction;
  canEdit: boolean;
}) {
  const style = URGENCY_STYLES[action.urgency];

  // Due-tomorrow default for the "schedule task" form.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = tomorrow.toISOString().slice(0, 10);

  return (
    <section
      className="rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <header
        className="flex items-start justify-between gap-4 px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{ background: style.bg, color: style.fg }}
            >
              <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: style.dot }} />
              {URGENCY_LABEL[action.urgency]}
            </span>
            <span
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-faint)" }}
            >
              Next action
            </span>
          </div>
          <h2
            className="mt-2 text-base font-semibold"
            style={{ color: "var(--text-default)" }}
          >
            {action.title}
          </h2>
          <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            {action.reason}
          </p>
        </div>
      </header>

      {canEdit && (
        <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-2">
          {/* Log now */}
          <form
            action={addInteraction.bind(null, slug)}
            className="flex flex-col gap-2 rounded-lg p-4"
            style={{ background: "var(--surface-0)", border: "1px solid var(--border-subtle)" }}
          >
            <input type="hidden" name="customerId" value={customerId} />
            <input type="hidden" name="type" value={action.interactionType ?? "NOTE"} />
            <input type="hidden" name="subject" value={action.title} />
            <label
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-faint)" }}
            >
              Log it now
            </label>
            <textarea
              name="body"
              rows={2}
              placeholder={`Outcome of your ${interactionLabel(action.interactionType)}…`}
              className="rounded-md px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
                color: "var(--text-default)",
              }}
            />
            <button
              type="submit"
              className="mt-1 inline-flex h-8 items-center justify-center self-start rounded-md px-3 text-xs font-medium"
              style={{
                background: "var(--accent-primary)",
                color: "var(--accent-fg)",
              }}
            >
              Log {interactionLabel(action.interactionType)}
            </button>
          </form>

          {/* Schedule it */}
          <form
            action={createTask.bind(null, slug)}
            className="flex flex-col gap-2 rounded-lg p-4"
            style={{ background: "var(--surface-0)", border: "1px solid var(--border-subtle)" }}
          >
            <input type="hidden" name="customerId" value={customerId} />
            <input type="hidden" name="title" value={action.taskTitle} />
            <input type="hidden" name="priority" value="HIGH" />
            <label
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-faint)" }}
            >
              Or schedule a follow-up
            </label>
            <div className="text-sm" style={{ color: "var(--text-default)" }}>
              {action.taskTitle}
            </div>
            <div className="flex items-center gap-2">
              <label
                className="text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                Due
              </label>
              <input
                type="date"
                name="dueDate"
                defaultValue={tomorrowISO}
                className="rounded-md px-2 py-1 text-xs outline-none"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-default)",
                }}
              />
            </div>
            <button
              type="submit"
              className="mt-1 inline-flex h-8 items-center justify-center self-start rounded-md px-3 text-xs font-medium"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-default)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              Create task
            </button>
          </form>
        </div>
      )}
    </section>
  );
}

function interactionLabel(t: NextAction["interactionType"]): string {
  switch (t) {
    case "CALL":    return "call";
    case "EMAIL":   return "email";
    case "MEETING": return "meeting";
    case "TEXT":    return "text";
    case "NOTE":
    default:        return "note";
  }
}
