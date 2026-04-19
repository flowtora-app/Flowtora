// Phase 7 — "Next action" engine.
//
// Surfaces the single most valuable next step for a customer, based on
// stage + activity + linked records. The dashboard & customer detail
// page render this as a prominent card so reps don't have to guess
// what to do next.
//
// The logic is priority-ordered: the first rule that fires wins. We
// return a `NextAction` with a label, a short reason, and an optional
// `formAction` hint (e.g. "log_call", "create_task", "nudge_quote") so
// the UI can render a one-click button that creates the matching
// record.
//
// Deliberately concise — a dashboard with 20 possible "next actions"
// is noise. 4–5 stage-driven suggestions cover the common cases.

import type { HealthReport } from "@/lib/opportunity-health";
import type { PipelineStage, QuoteStatus } from "@prisma/client";

export type NextActionKind =
  | "make_first_contact"
  | "log_contact_outcome"
  | "send_quote"
  | "nudge_quote"
  | "call_about_approval"
  | "schedule_follow_up"
  | "re_engage"
  | "record_lost_reason"
  | "add_first_interaction"
  | "clear_overdue_tasks";

export type NextAction = {
  kind: NextActionKind;
  title: string;              // short imperative — "Nudge the customer about the quote"
  reason: string;             // one-line context — "You sent a quote 6 days ago; no reply"
  // A rough "urgency" signal — surfaces as a colored bar in the UI.
  urgency: "high" | "medium" | "low";
  // Suggested task title if the rep clicks "Create follow-up task".
  taskTitle: string;
  // Default interaction type to pre-fill the "log activity" form.
  interactionType?: "CALL" | "EMAIL" | "MEETING" | "NOTE" | "TEXT";
};

export type NextActionInput = {
  stage: PipelineStage;
  /** Most recent touch — interaction, task, or customer update. */
  lastTouchAt: Date | null;
  /** Best open quote status (APPROVED > VIEWED > SENT > null). */
  openQuoteStatus: QuoteStatus | null;
  /** Quote sent-at (if any) so we can describe "sent 5d ago". */
  latestQuoteSentAt: Date | null;
  overdueTaskCount: number;
  hasAnyInteraction: boolean;
  customerName: string;
  health: HealthReport;
  now?: Date;
};

export function computeNextAction(input: NextActionInput): NextAction {
  const now = input.now ?? new Date();
  const daysSinceTouch = input.lastTouchAt
    ? Math.floor((now.getTime() - input.lastTouchAt.getTime()) / 86_400_000)
    : null;

  // Overdue tasks always win — if a rep promised to do something and
  // didn't, that's the #1 next action regardless of stage.
  if (input.overdueTaskCount > 0) {
    return {
      kind: "clear_overdue_tasks",
      title: `Clear ${input.overdueTaskCount} overdue task${input.overdueTaskCount === 1 ? "" : "s"}`,
      reason: "You have follow-ups past their due date on this customer.",
      urgency: "high",
      taskTitle: `Review overdue tasks for ${input.customerName}`,
      interactionType: "NOTE",
    };
  }

  // Stage LOST — the action is to record why, once, so the team learns.
  if (input.stage === "LOST") {
    return {
      kind: "record_lost_reason",
      title: "Record the lost reason",
      reason: "Understanding why deals slip helps sharpen the next quote.",
      urgency: "low",
      taskTitle: "Document lost reason",
    };
  }

  // Stage WON — no "next action" — surface nothing. The caller checks
  // this flag to suppress the panel.
  // (We still return something valid — the UI decides to hide.)
  if (input.stage === "WON") {
    return {
      kind: "schedule_follow_up",
      title: "Schedule a check-in",
      reason: "Keep the relationship warm for repeat business.",
      urgency: "low",
      taskTitle: `Check in with ${input.customerName} in 30 days`,
    };
  }

  // NEW_LEAD without any logged interaction — make first contact.
  if (input.stage === "NEW_LEAD" && !input.hasAnyInteraction) {
    return {
      kind: "make_first_contact",
      title: `Call or email ${input.customerName}`,
      reason: "Leads go cold fast. First contact within 24 hours doubles close rates.",
      urgency: "high",
      taskTitle: `First contact with ${input.customerName}`,
      interactionType: "CALL",
    };
  }

  // CONTACTED but no quote yet — push for a quote.
  if (input.stage === "CONTACTED") {
    return {
      kind: "send_quote",
      title: "Send a quote",
      reason:
        daysSinceTouch != null && daysSinceTouch > 3
          ? `Last touch was ${formatDays(daysSinceTouch)} ago — build a quote while you're top of mind.`
          : "They've been contacted. Build and send the quote.",
      urgency: daysSinceTouch != null && daysSinceTouch > 7 ? "high" : "medium",
      taskTitle: `Send quote to ${input.customerName}`,
      interactionType: "EMAIL",
    };
  }

  // Has quote SENT but not VIEWED in 5+ days — nudge.
  if (
    (input.stage === "QUOTED" || input.stage === "NEGOTIATING") &&
    input.openQuoteStatus === "SENT" &&
    input.latestQuoteSentAt &&
    daysInFuture(input.latestQuoteSentAt, now) >= 5
  ) {
    return {
      kind: "nudge_quote",
      title: "Nudge about the quote",
      reason: `Sent ${formatDays(daysInFuture(input.latestQuoteSentAt, now))} ago and they haven't opened it. A quick call or email usually unsticks this.`,
      urgency: "high",
      taskTitle: `Follow up on quote with ${input.customerName}`,
      interactionType: "CALL",
    };
  }

  // Quote VIEWED or APPROVED — time to talk about close.
  if (input.openQuoteStatus === "VIEWED" || input.openQuoteStatus === "APPROVED") {
    return {
      kind: "call_about_approval",
      title:
        input.openQuoteStatus === "APPROVED"
          ? "Move to order"
          : "Call to close",
      reason:
        input.openQuoteStatus === "APPROVED"
          ? "Quote approved. Convert to an order and kick off production."
          : "They've opened the quote. This is the moment for a close call.",
      urgency: "high",
      taskTitle:
        input.openQuoteStatus === "APPROVED"
          ? `Kick off order for ${input.customerName}`
          : `Close call with ${input.customerName}`,
      interactionType: "CALL",
    };
  }

  // Stale — no touch in 14+ days on an active stage.
  if (input.health.atRisk && daysSinceTouch != null && daysSinceTouch >= 14) {
    return {
      kind: "re_engage",
      title: "Re-engage before this goes cold",
      reason: `No contact in ${formatDays(daysSinceTouch)}. Hot opportunities cool fast — send a value-add note or schedule a call.`,
      urgency: "high",
      taskTitle: `Re-engage ${input.customerName}`,
      interactionType: "EMAIL",
    };
  }

  // Catch-all — we have touches but nothing obvious pending.
  if (!input.hasAnyInteraction) {
    return {
      kind: "add_first_interaction",
      title: "Log the first interaction",
      reason: "Even a short note keeps the team aligned on where this stands.",
      urgency: "medium",
      taskTitle: `Log first interaction with ${input.customerName}`,
      interactionType: "NOTE",
    };
  }

  return {
    kind: "schedule_follow_up",
    title: "Schedule the next follow-up",
    reason:
      daysSinceTouch != null
        ? `Last touch was ${formatDays(daysSinceTouch)} ago. A quick note keeps the conversation alive.`
        : "Keep the conversation moving with a scheduled check-in.",
    urgency: "medium",
    taskTitle: `Follow up with ${input.customerName}`,
    interactionType: "EMAIL",
  };
}

function formatDays(d: number): string {
  if (d === 0) return "today";
  if (d === 1) return "1 day";
  if (d < 7) return `${d} days`;
  if (d < 14) return "a week";
  if (d < 30) return `${Math.floor(d / 7)} weeks`;
  return `${Math.floor(d / 30)} month${d < 60 ? "" : "s"}`;
}

function daysInFuture(pastDate: Date, now: Date): number {
  return Math.floor((now.getTime() - pastDate.getTime()) / 86_400_000);
}
