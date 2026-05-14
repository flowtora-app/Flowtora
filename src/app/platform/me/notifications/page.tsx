// Page 73 — My Notifications.
//
// Per-channel preferences matrix for the signed-in admin. Rows are
// event categories, columns are channels, cells are frequency dropdowns
// (Real-time / Hourly / Daily / Weekly / Off). Plus quiet hours,
// Slack binding, SMS verification, email digest schedule, and snooze.

import * as React from "react";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  saveNotificationPref, saveDeliverySetup, snoozeAllNotifications,
} from "@/app/actions/platform-me";
import type {
  AdminNotificationCategory,
  AdminNotificationChannel,
  AdminNotificationFrequency,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const CATEGORIES: AdminNotificationCategory[] = [
  "TENANTS", "BILLING", "SUPPORT", "SECURITY", "SYSTEM", "MARKETING", "PERSONAL",
];
const CATEGORY_LABEL: Record<AdminNotificationCategory, string> = {
  TENANTS:   "Tenants",
  BILLING:   "Billing",
  SUPPORT:   "Support",
  SECURITY:  "Security",
  SYSTEM:    "System",
  MARKETING: "Marketing",
  PERSONAL:  "Personal",
};
const CATEGORY_DESCRIPTION: Record<AdminNotificationCategory, string> = {
  TENANTS:   "Signups, churn, suspensions, upgrades, downgrades, big payments",
  BILLING:   "Failed payments, dunning, refunds, disputes",
  SUPPORT:   "Assigned tickets, mentions, SLA breaches, escalations",
  SECURITY:  "Suspicious logins, MFA disabled, role changes, impersonation",
  SYSTEM:    "Incidents (SEV1/2), deploys, system alerts",
  MARKETING: "Campaign results",
  PERSONAL:  "Digests, weekly summary",
};

const CHANNELS: AdminNotificationChannel[] = ["EMAIL", "IN_APP", "SLACK", "SMS", "PUSH"];
const CHANNEL_LABEL: Record<AdminNotificationChannel, string> = {
  EMAIL:  "Email",
  IN_APP: "In-app",
  SLACK:  "Slack",
  SMS:    "SMS",
  PUSH:   "Push",
};
const CHANNEL_ICON: Record<AdminNotificationChannel, string> = {
  EMAIL: "✉", IN_APP: "🔔", SLACK: "💬", SMS: "📱", PUSH: "📨",
};

const FREQUENCIES: AdminNotificationFrequency[] = [
  "REAL_TIME", "HOURLY_DIGEST", "DAILY_DIGEST", "WEEKLY_DIGEST", "OFF",
];
const FREQUENCY_LABEL: Record<AdminNotificationFrequency, string> = {
  REAL_TIME:      "Real-time",
  HOURLY_DIGEST:  "Hourly digest",
  DAILY_DIGEST:   "Daily digest",
  WEEKLY_DIGEST:  "Weekly digest",
  OFF:            "Off",
};

export default async function MyNotificationsPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);

  const [prefs, delivery] = await Promise.all([
    db.adminNotificationPreference.findMany({ where: { userId: ctx.userId } }),
    db.adminNotificationDeliverySetup.findUnique({ where: { userId: ctx.userId } }),
  ]);

  // Index existing prefs for fast lookup; default to REAL_TIME when not set.
  const lookup = new Map<string, AdminNotificationFrequency>();
  for (const p of prefs) lookup.set(`${p.category}:${p.channel}`, p.frequency);

  const quiet = delivery?.quietHoursJson as { start?: string; end?: string } | null;
  const snoozedUntil = delivery?.snoozeUntil ?? null;
  const snoozedActive = !!snoozedUntil && snoozedUntil.getTime() > Date.now();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
          My notifications
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Choose how each category of platform events reaches you. Default frequency is real-time on email + in-app;
          everything else is off.
        </p>
      </header>

      {ok && <Banner tone="success">{decodeURIComponent(ok)}</Banner>}
      {error && <Banner tone="danger">{decodeURIComponent(error)}</Banner>}
      {snoozedActive && (
        <Banner tone="success">
          All notifications snoozed until {snoozedUntil!.toLocaleString()}. Unsnooze below to receive again.
        </Banner>
      )}

      {/* Matrix */}
      <section
        className="overflow-x-auto rounded-xl"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
      >
        <table className="w-full text-sm">
          <thead style={{ background: "var(--surface-2)" }}>
            <tr>
              <th className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--text-muted)" }}>
                Category
              </th>
              {CHANNELS.map((c) => (
                <th key={c} className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-wide"
                  style={{ color: "var(--text-muted)" }}>
                  {CHANNEL_ICON[c]} {CHANNEL_LABEL[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => (
              <tr key={cat} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <td className="px-3 py-3 align-top">
                  <div className="font-medium" style={{ color: "var(--text-default)" }}>
                    {CATEGORY_LABEL[cat]}
                  </div>
                  <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    {CATEGORY_DESCRIPTION[cat]}
                  </div>
                </td>
                {CHANNELS.map((ch) => {
                  const freq = lookup.get(`${cat}:${ch}`) ?? "OFF";
                  return (
                    <td key={ch} className="px-3 py-3 align-top">
                      <form action={saveNotificationPref}>
                        <input type="hidden" name="category" value={cat} />
                        <input type="hidden" name="channel" value={ch} />
                        <select
                          name="frequency"
                          defaultValue={freq}
                          className="rounded-md px-2 py-1.5 text-xs outline-none"
                          style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
                        >
                          {FREQUENCIES.map((f) => (
                            <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>
                          ))}
                        </select>
                        <button type="submit" className="ml-1 text-[10px]" style={{ color: "var(--accent-primary)" }}>
                          Save
                        </button>
                      </form>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Delivery setup */}
      <Card title="Delivery setup" description="Quiet hours, Slack binding, SMS phone, and the email digest schedule.">
        <form action={saveDeliverySetup} className="space-y-3 px-5 py-5">
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Quiet hours start (24h)" name="quietHoursStart" defaultValue={quiet?.start ?? ""} placeholder="22:00" maxLength={5} />
            <FormField label="Quiet hours end (24h)" name="quietHoursEnd" defaultValue={quiet?.end ?? ""} placeholder="07:00" maxLength={5} />
            <FormField label="Slack workspace" name="slackWorkspace" defaultValue={delivery?.slackWorkspace ?? ""} maxLength={120} placeholder="flowtora" />
            <FormField label="Slack channel" name="slackChannel" defaultValue={delivery?.slackChannel ?? ""} maxLength={120} placeholder="#admin-alerts" />
            <FormField label="SMS phone (verified)" name="smsPhone" defaultValue={delivery?.smsPhone ?? ""} maxLength={40} placeholder="+1 415 555 0123" hint={delivery?.smsVerifiedAt ? "Verified" : "Not yet verified"} />
            <FormField label="Email digest schedule" name="emailDigestSchedule" defaultValue={delivery?.emailDigestSchedule ?? ""} maxLength={80} placeholder="Mon/Wed/Fri 08:00" />
          </div>
          <div className="flex justify-end">
            <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
              Save delivery setup
            </button>
          </div>
        </form>
      </Card>

      {/* Snooze */}
      <Card title="Snooze all notifications" description="Mute every channel for a duration. Useful for focused work or vacation.">
        <div className="grid gap-2 px-5 py-5 sm:grid-cols-5">
          {[
            { label: "1 hour",        minutes: 60 },
            { label: "4 hours",       minutes: 240 },
            { label: "Until tomorrow", minutes: 60 * 24 },
            { label: "1 week",        minutes: 60 * 24 * 7 },
            { label: "Unsnooze",      minutes: 0 },
          ].map((opt) => (
            <form key={opt.minutes} action={snoozeAllNotifications}>
              <input type="hidden" name="minutes" value={opt.minutes} />
              <button
                type="submit"
                className="w-full rounded-md px-3 py-2 text-xs font-medium"
                style={{
                  background: opt.minutes === 0 ? "var(--surface-2)" : "var(--surface-1)",
                  color: opt.minutes === 0 ? "var(--text-muted)" : "var(--text-default)",
                  border: "1px solid var(--border-default)",
                }}
              >
                {opt.label}
              </button>
            </form>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ── UI helpers ───────────────────────────────────────────── */

function Card({ title, description, children }: { title?: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}>
      {title && (
        <header className="px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{description}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

function FormField({ label, name, defaultValue, placeholder, maxLength, hint }: {
  label: string; name: string; defaultValue?: string; placeholder?: string; maxLength?: number; hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}</span>
      <input type="text" name={name} defaultValue={defaultValue} placeholder={placeholder} maxLength={maxLength}
        className="w-full rounded-md px-3 py-2 text-sm outline-none"
        style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }} />
      {hint && <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );
}

function Banner({ tone, children }: { tone: "success" | "danger"; children: React.ReactNode }) {
  const palette = tone === "success"
    ? { bg: "var(--emerald-100)", fg: "var(--emerald-700)", border: "var(--emerald-300)" }
    : { bg: "var(--rose-100)", fg: "var(--rose-700)", border: "var(--rose-300)" };
  return (
    <div className="rounded-md px-4 py-3 text-sm"
      style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}` }}>
      {children}
    </div>
  );
}
