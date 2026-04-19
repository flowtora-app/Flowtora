// Notification preference helpers.
//
// Preferences are stored as a JSON blob on Membership.notifPrefs so we
// don't need a separate table. Shape:
//   { [NotificationType]: { inApp: boolean; email: boolean } }
//
// Absent keys mean "use default" — in-app on, email off.

import type { NotificationType } from "@/lib/notifications";

export type NotifPref = { inApp: boolean; email: boolean };
export type NotifPrefs = Partial<Record<NotificationType, NotifPref>>;

const DEFAULT: NotifPref = { inApp: true, email: false };

export function resolvePrefs(raw: unknown): NotifPrefs {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as NotifPrefs;
}

export function getPref(prefs: NotifPrefs, type: NotificationType): NotifPref {
  return prefs[type] ?? DEFAULT;
}

// Phase 21 Slice C — three-level resolution: personal pref > tenant
// default > built-in DEFAULT. Kept separate from getPref so the settings
// UI (which needs to show personal-vs-default distinct) still works with
// the simpler helper.
export function resolveEffectivePref(
  personal: NotifPrefs,
  tenantDefaults: NotifPrefs,
  type: NotificationType,
): NotifPref {
  return personal[type] ?? tenantDefaults[type] ?? DEFAULT;
}

// Grouped categories for the settings UI.
export type PrefGroup = {
  label: string;
  items: { type: NotificationType; label: string }[];
};

export const PREF_GROUPS: PrefGroup[] = [
  {
    label: "Customer portal activity",
    items: [
      { type: "portal.quote_approved",          label: "Quote approved by customer" },
      { type: "portal.quote_declined",          label: "Quote declined by customer" },
      { type: "portal.proof_approved",          label: "Proof approved by customer" },
      { type: "portal.proof_changes_requested", label: "Proof revision requested" },
      { type: "portal.file_uploaded",           label: "Customer uploaded a file" },
      { type: "portal.message_received",        label: "Customer sent a message" },
    ],
  },
  {
    label: "Share link activity",
    items: [
      { type: "share.quote_approved",           label: "Quote approved via share link" },
      { type: "share.quote_declined",           label: "Quote declined via share link" },
      { type: "share.proof_approved",           label: "Proof approved via share link" },
      { type: "share.proof_changes_requested",  label: "Proof revision via share link" },
    ],
  },
  {
    label: "Proofs",
    items: [
      { type: "proof.sent",   label: "Proof sent to customer" },
      { type: "proof.locked", label: "Proof locked (approved for production)" },
    ],
  },
  {
    label: "Production",
    items: [
      { type: "stage.assigned", label: "Production stage assigned to you" },
      { type: "stage.blocked",  label: "Production stage blocked" },
      { type: "stage.ready",    label: "Production stage ready" },
      { type: "defect.reported", label: "Defect / rework reported" },
    ],
  },
  {
    label: "Tasks & installs",
    items: [
      { type: "task.assigned",    label: "Task assigned to you" },
      { type: "install.assigned", label: "Install assigned to you" },
      { type: "install.issue",    label: "Install issue reported" },
      { type: "install.blocker",  label: "Install blocker (urgent)" },
    ],
  },
  {
    label: "Team",
    items: [
      { type: "comment.mention", label: "You are @mentioned in a comment" },
    ],
  },
  {
    label: "Financial",
    items: [
      { type: "payment.recorded",          label: "Payment received" },
      { type: "payment.failed",            label: "Payment failed" },
      { type: "expense.created",           label: "Expense submitted" },
      { type: "reminder.invoice_overdue",  label: "Invoice overdue reminder" },
    ],
  },
  {
    label: "Reminders",
    items: [
      { type: "reminder.quote_expiring",       label: "Quote expiring soon" },
      { type: "reminder.quote_stale",          label: "Quote has gone stale (no reply)" },
      { type: "reminder.proof_stale",          label: "Proof awaiting customer response" },
      { type: "reminder.order_overdue",        label: "Order past due date" },
      { type: "reminder.install_unconfirmed",  label: "Install not confirmed" },
      { type: "reminder.task_overdue",         label: "Task past due date" },
    ],
  },
  {
    label: "Support",
    items: [
      { type: "support.staff_replied", label: "Platform staff replied to your ticket" },
    ],
  },
];
