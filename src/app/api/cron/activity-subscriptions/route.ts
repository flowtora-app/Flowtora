// /api/cron/activity-subscriptions — delivers activity-feed digests.
//
// Runs every 5 minutes (configured in vercel.json). For each
// subscription that's not paused and is due (next-fire deadline
// passed), runs the saved filter against the AuditLog and sends an
// HTML digest email of every event since the last delivery.
//
// LIVE   = every poll tick (5min) — only fires when there's anything
//          new since lastDeliveredAt
// HOURLY = at most one delivery per hour
// DAILY  = at most one delivery per 24h
//
// Idempotent — `lastDeliveredAt` is bumped only AFTER the email
// returns OK, and we use `gt: lastDeliveredAt` to scope the events
// so a re-run sends nothing if the previous run already delivered
// every matching row.
//
// Auth follows the dunning + reminders pattern: `Authorization:
// Bearer <CRON_SECRET>` or `?key=<CRON_SECRET>`. Fails closed when
// CRON_SECRET is unset.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import {
  loadActivityPage,
  parseActivityFilters,
} from "@/server/platform/activity-feed";
import type { ActivityRow } from "@/server/platform/activity-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOUR = 3_600_000;
const DAY  = 24 * HOUR;
const DEFAULT_LOOKBACK = 30 * 60_000; // 30 minutes — for first delivery

const FREQUENCY_INTERVAL_MS: Record<"LIVE" | "HOURLY" | "DAILY", number> = {
  LIVE:    0,           // Every tick (subject to "anything new" gate).
  HOURLY:  60 * 60_000,
  DAILY:   24 * 60 * 60_000,
};

const MAX_EVENTS_PER_DIGEST = 200;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("key") === secret) return true;
  return false;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const subs = await db.activitySubscription.findMany({
    where: { pausedAt: null },
    select: {
      id: true, name: true, email: true, frequency: true, filters: true,
      lastDeliveredAt: true, createdAt: true,
    },
  });

  let delivered = 0;
  let skippedNotDue = 0;
  let skippedNoEvents = 0;
  const errors: { id: string; error: string }[] = [];

  for (const sub of subs) {
    const interval = FREQUENCY_INTERVAL_MS[sub.frequency];
    const lastSent = sub.lastDeliveredAt?.getTime() ?? sub.createdAt.getTime();
    const dueAt = lastSent + interval;
    if (now.getTime() < dueAt) {
      skippedNotDue += 1;
      continue;
    }
    // Window for events: since last delivery (or 30min back on first
    // delivery) → now.
    const since = sub.lastDeliveredAt
      ? sub.lastDeliveredAt
      : new Date(now.getTime() - DEFAULT_LOOKBACK);

    try {
      const filters = parseActivityFilters(new URLSearchParams(sub.filters));
      const rows = await loadActivityPage({
        filters,
        take: MAX_EVENTS_PER_DIGEST,
        after: since,
      });
      if (rows.length === 0) {
        skippedNoEvents += 1;
        // Still bump lastDeliveredAt for hourly/daily so we don't
        // hot-loop empty checks. Live frequency leaves it alone so
        // the next tick checks again.
        if (sub.frequency !== "LIVE") {
          await db.activitySubscription.update({
            where: { id: sub.id },
            data: { lastDeliveredAt: now },
          });
        }
        continue;
      }

      const html = renderDigestHtml({
        subName: sub.name,
        rows,
        sinceIso: since.toISOString(),
        nowIso: now.toISOString(),
        filterQs: sub.filters,
      });

      await sendEmail({
        to: sub.email,
        subject: `Flowtora activity · ${rows.length} ${rows.length === 1 ? "event" : "events"} · ${sub.name}`,
        html,
        text: renderDigestText({ subName: sub.name, rows, sinceIso: since.toISOString() }),
      });

      await db.activitySubscription.update({
        where: { id: sub.id },
        data: { lastDeliveredAt: now },
      });
      delivered += 1;
    } catch (err) {
      errors.push({ id: sub.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    ok: true,
    summary: {
      total: subs.length,
      delivered,
      skippedNotDue,
      skippedNoEvents,
      errors: errors.length,
    },
    errors: errors.slice(0, 10),
  });
}

/* ── Templates ───────────────────────────────────────────── */

function renderDigestHtml(args: {
  subName: string;
  rows: ActivityRow[];
  sinceIso: string;
  nowIso: string;
  filterQs: string;
}): string {
  const { subName, rows, sinceIso, nowIso, filterQs } = args;
  const baseUrl = process.env.APP_URL ?? "https://flowtora.com";
  const feedUrl = `${baseUrl}/platform/activity?${filterQs}`;
  return `
<!doctype html>
<html><body style="margin:0;padding:24px;font-family:Inter,system-ui,sans-serif;background:#F8FAFC;color:#0F172A;">
  <div style="max-width:640px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
    <div style="padding:20px 24px;border-bottom:1px solid #E2E8F0;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#7C3AED;">Flowtora · Activity digest</div>
      <h1 style="margin:6px 0 0;font-size:18px;font-weight:700;">${escapeHtml(subName)}</h1>
      <div style="margin-top:4px;font-size:12px;color:#64748B;">
        ${rows.length} new ${rows.length === 1 ? "event" : "events"} · since ${escapeHtml(sinceIso.slice(0, 19).replace("T", " "))} UTC
      </div>
    </div>
    <ul style="list-style:none;margin:0;padding:0;">
      ${rows.map((r) => `
        <li style="padding:12px 24px;border-bottom:1px solid #F1F5F9;">
          <div style="font-size:13px;color:#0F172A;">
            <strong>${escapeHtml(r.actor?.name ?? r.actor?.email ?? "System")}</strong>
            <span style="color:#64748B;">${escapeHtml(verbFor(r))}</span>
            ${r.tenant ? `<strong>${escapeHtml(r.tenant.name)}</strong>` : ""}
          </div>
          <div style="margin-top:2px;font-size:11px;color:#94A3B8;font-family:ui-monospace,Menlo,Monaco,monospace;">
            ${escapeHtml(r.action)} · ${escapeHtml(r.severity)} · ${escapeHtml(r.source)} · ${escapeHtml(r.createdAtIso.slice(0, 19).replace("T", " "))}
          </div>
        </li>
      `).join("")}
    </ul>
    <div style="padding:16px 24px;background:#F8FAFC;text-align:center;">
      <a href="${escapeHtml(feedUrl)}" style="display:inline-block;background:#7C3AED;color:#FFFFFF;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;">
        Open in Flowtora
      </a>
    </div>
    <div style="padding:12px 24px;font-size:10px;color:#94A3B8;text-align:center;border-top:1px solid #E2E8F0;">
      Generated ${escapeHtml(nowIso.slice(0, 19).replace("T", " "))} UTC ·
      <a href="${escapeHtml(baseUrl)}/platform/activity" style="color:#7C3AED;">manage subscriptions</a>
    </div>
  </div>
</body></html>
  `.trim();
}

function renderDigestText(args: { subName: string; rows: ActivityRow[]; sinceIso: string }): string {
  const lines: string[] = [];
  lines.push(`Flowtora · Activity digest — ${args.subName}`);
  lines.push(`${args.rows.length} new ${args.rows.length === 1 ? "event" : "events"} since ${args.sinceIso}`);
  lines.push("");
  for (const r of args.rows) {
    const who = r.actor?.name ?? r.actor?.email ?? "System";
    const target = r.tenant ? ` ${r.tenant.name}` : "";
    lines.push(`• ${who} ${verbFor(r)}${target}`);
    lines.push(`  ${r.action} · ${r.severity} · ${r.source} · ${r.createdAtIso}`);
  }
  return lines.join("\n");
}

function verbFor(row: ActivityRow): string {
  const parts = row.action.split(".");
  const verb = parts.slice(1).join(" ").replace(/_/g, " ");
  return verb || row.action;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}

// Surface unused constants for future use (lint-quiet).
void HOUR; void DAY;
