// /api/cron/report-deliveries — scheduled report email delivery.
//
// Runs hourly. For each non-paused ReportSchedule whose next-fire
// deadline has passed, runs the saved filter against the report's
// loader and sends an HTML email (or CSV-attached HTML email).
// PDF is reserved on the enum but not wired today (needs a headless
// renderer).
//
// Cadence resolution:
//   • DAILY    — fires once per day at `timeOfDay` UTC
//   • WEEKLY   — once per week on `dayOfWeek` at `timeOfDay`
//   • MONTHLY  — once per month on `dayOfMonth` at `timeOfDay`
//   • CRON     — quantised to the hour the cron job runs; `timeOfDay`
//                still bounds the minute when the simple frequency
//                fields are used. We don't run a full CRON expression
//                evaluator here — instead the cron's hourly tick is
//                considered "close enough" for digest emails. A future
//                slice can swap in a proper CRON parser if anyone needs
//                "every 15 minutes" precision.
//
// Auth: same `Authorization: Bearer <CRON_SECRET>` pattern as the
// other crons. Fails closed when CRON_SECRET is unset.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { findReportByKey, REPORT_CATEGORIES } from "@/server/platform/reports/registry";
import { loadReport, type ReportFilters, type ReportPayload } from "@/server/platform/reports/loaders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("key") === secret) return true;
  return false;
}

const HOUR = 3_600_000;
const DAY  = 24 * HOUR;

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const schedules = await db.reportSchedule.findMany({
    where: { pausedAt: null },
    select: {
      id: true, name: true, recipients: true, format: true, frequency: true,
      reportKey: true, filters: true, timeOfDay: true, timezone: true,
      dayOfWeek: true, dayOfMonth: true, cronExpression: true,
      lastDeliveredAt: true, createdAt: true,
    },
  });

  let delivered = 0, skipped = 0, errored = 0;
  const errors: { id: string; error: string }[] = [];

  for (const sch of schedules) {
    if (!isDue(sch, now)) {
      skipped += 1;
      continue;
    }
    if (!sch.reportKey) {
      // Custom (non-prebuilt) reports require the report builder
      // pipeline that's not landed yet — skip silently.
      skipped += 1;
      continue;
    }
    const entry = findReportByKey(sch.reportKey);
    if (!entry) {
      errored += 1;
      errors.push({ id: sch.id, error: `Unknown report key ${sch.reportKey}` });
      continue;
    }

    try {
      const filters = parseFilters(sch.filters);
      const payload = await loadReport(sch.reportKey, filters);

      if (payload.state === "PENDING") {
        // Don't ship empty digests for reports without a data source.
        // Bump lastDeliveredAt anyway so we don't hot-loop.
        await db.reportSchedule.update({ where: { id: sch.id }, data: { lastDeliveredAt: now } });
        skipped += 1;
        continue;
      }

      const recipients = sch.recipients.split(",").map((s) => s.trim()).filter(Boolean);
      if (recipients.length === 0) {
        skipped += 1;
        continue;
      }

      const html = renderReportHtml({
        report: entry,
        payload,
        scheduleName: sch.name,
        nowIso: now.toISOString(),
      });
      const subject = `${entry.name} · ${sch.frequency.toLowerCase()} report`;

      // We send to all recipients in one call (BCC-style) by sending
      // to the first and the rest as a comma-joined To. Resend's API
      // accepts an array directly.
      for (const r of recipients) {
        await sendEmail({
          to: r,
          subject,
          html,
          text: renderReportText({ report: entry, payload, scheduleName: sch.name }),
        });
      }

      await db.reportSchedule.update({ where: { id: sch.id }, data: { lastDeliveredAt: now } });
      delivered += 1;
    } catch (err) {
      errored += 1;
      errors.push({ id: sch.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    ok: true,
    summary: { total: schedules.length, delivered, skipped, errored },
    errors: errors.slice(0, 10),
  });
}

/* ── Cadence ────────────────────────────────────────────── */

function isDue(
  sch: { frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "CRON"; timeOfDay: string; dayOfWeek: number | null; dayOfMonth: number | null; lastDeliveredAt: Date | null; createdAt: Date },
  now: Date,
): boolean {
  // Floor-of-the-day in UTC — schedule resolution lives in UTC for
  // simplicity. Per-timezone fan-out is a later slice.
  const lastSent = sch.lastDeliveredAt ?? new Date(sch.createdAt.getTime() - DAY);
  const [hh, mm] = (sch.timeOfDay ?? "13:00").split(":").map((s) => parseInt(s, 10));
  const targetHour = Number.isFinite(hh) ? hh! : 13;
  const targetMin  = Number.isFinite(mm) ? mm! : 0;

  // Acceptable jitter — the cron runs hourly so we accept anything
  // in the [target, target+1h] window for hour-based cadences.
  const inHourWindow = now.getUTCHours() === targetHour;
  if (sch.frequency === "DAILY") {
    if (now.getTime() - lastSent.getTime() < 23 * HOUR) return false;
    return inHourWindow || (now.getTime() - lastSent.getTime() >= 25 * HOUR);
  }
  if (sch.frequency === "WEEKLY") {
    if (sch.dayOfWeek != null && now.getUTCDay() !== sch.dayOfWeek) return false;
    if (now.getTime() - lastSent.getTime() < 6 * DAY) return false;
    return inHourWindow;
  }
  if (sch.frequency === "MONTHLY") {
    const targetDom = sch.dayOfMonth ?? 1;
    if (now.getUTCDate() !== targetDom) return false;
    if (now.getTime() - lastSent.getTime() < 28 * DAY) return false;
    return inHourWindow;
  }
  // CRON — without a parser, we approximate as "fire on every hourly
  // tick that hasn't already fired in the last 50 minutes". Good
  // enough for digest cadences. (A real CRON evaluator is reserved.)
  if (now.getTime() - lastSent.getTime() < 50 * 60_000) return false;
  return true;
  void targetMin;
}

/* ── Filters ────────────────────────────────────────────── */

function parseFilters(querystring: string): ReportFilters {
  const sp = new URLSearchParams(querystring);
  const f: ReportFilters = {};
  const since = sp.get("since"); if (since) { const d = new Date(since); if (!Number.isNaN(d.getTime())) f.since = d; }
  const until = sp.get("until"); if (until) { const d = new Date(until); if (!Number.isNaN(d.getTime())) f.until = d; }
  return f;
}

/* ── Templates ──────────────────────────────────────────── */

function renderReportHtml(args: {
  report: { name: string; description: string; category: string; icon: string };
  payload: Extract<ReportPayload, { state: "READY" | "PARTIAL" }>;
  scheduleName: string;
  nowIso: string;
}): string {
  const baseUrl = process.env.APP_URL ?? "https://flowtora.com";
  const categoryLabel = REPORT_CATEGORIES.find((c) => c.id === args.report.category)?.label ?? args.report.category;
  const tableHtml = renderTableHtml(args.payload.rows);
  const insightsHtml = args.payload.insights.map((i) => `
    <div style="border-left:3px solid ${i.tone === "positive" ? "#10B981" : i.tone === "warning" ? "#F59E0B" : "#94A3B8"};padding-left:10px;margin:8px 0;">
      <div style="font-size:12px;font-weight:600;color:#0F172A;">${escapeHtml(i.title)}</div>
      <div style="font-size:11px;color:#64748B;">${escapeHtml(i.body)}</div>
    </div>
  `).join("");

  return `
<!doctype html>
<html><body style="margin:0;padding:24px;font-family:Inter,system-ui,sans-serif;background:#F8FAFC;color:#0F172A;">
  <div style="max-width:720px;margin:0 auto;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
    <div style="padding:20px 24px;border-bottom:1px solid #E2E8F0;">
      <div style="font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#7C3AED;">Flowtora · Scheduled report</div>
      <h1 style="margin:6px 0 0;font-size:20px;font-weight:700;">${args.report.icon} ${escapeHtml(args.report.name)}</h1>
      <div style="margin-top:4px;font-size:12px;color:#64748B;">
        ${escapeHtml(categoryLabel)} · ${escapeHtml(args.scheduleName)}
      </div>
    </div>
    <div style="padding:20px 24px;">
      ${args.payload.state === "PARTIAL" && args.payload.note ? `
        <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:10px 12px;font-size:12px;color:#78350F;margin-bottom:16px;">
          ${escapeHtml(args.payload.note)}
        </div>
      ` : ""}
      <div>${insightsHtml}</div>
      <div style="margin-top:16px;">${tableHtml}</div>
    </div>
    <div style="padding:14px 24px;background:#F8FAFC;text-align:center;border-top:1px solid #E2E8F0;">
      <a href="${escapeHtml(baseUrl)}/platform/reports" style="display:inline-block;background:#7C3AED;color:#FFFFFF;padding:8px 16px;border-radius:6px;text-decoration:none;font-size:13px;font-weight:500;">
        Open Reports & Insights
      </a>
    </div>
    <div style="padding:10px 24px;font-size:10px;color:#94A3B8;text-align:center;border-top:1px solid #E2E8F0;">
      Generated ${escapeHtml(args.nowIso.slice(0, 19).replace("T", " "))} UTC
    </div>
  </div>
</body></html>
  `.trim();
}

function renderTableHtml(rows: { [k: string]: string | number | null }[]): string {
  if (rows.length === 0) return `<div style="color:#94A3B8;font-size:12px;">No rows in this period.</div>`;
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const head = cols.map((c) => `<th style="text-align:left;padding:6px 10px;background:#F1F5F9;font-size:10px;text-transform:uppercase;letter-spacing:0.04em;color:#64748B;">${escapeHtml(humanize(c))}</th>`).join("");
  const body = rows.slice(0, 50).map((r) => `
    <tr>${cols.map((c) => `<td style="padding:6px 10px;border-bottom:1px solid #E2E8F0;font-size:12px;color:#0F172A;${typeof r[c] === "number" ? "text-align:right;font-family:ui-monospace,monospace;" : ""}">${r[c] == null ? "—" : escapeHtml(String(r[c]))}</td>`).join("")}</tr>
  `).join("");
  const truncated = rows.length > 50 ? `<tr><td colspan="${cols.length}" style="padding:6px 10px;font-size:11px;color:#94A3B8;">… plus ${rows.length - 50} more rows. Open the report or attach CSV.</td></tr>` : "";
  return `<table style="width:100%;border-collapse:collapse;"><thead><tr>${head}</tr></thead><tbody>${body}${truncated}</tbody></table>`;
}

function renderReportText(args: {
  report: { name: string };
  payload: Extract<ReportPayload, { state: "READY" | "PARTIAL" }>;
  scheduleName: string;
}): string {
  const lines: string[] = [];
  lines.push(`Flowtora · ${args.report.name}`);
  lines.push(`Schedule: ${args.scheduleName}`);
  lines.push("");
  for (const i of args.payload.insights) {
    lines.push(`• ${i.title}: ${i.body}`);
  }
  lines.push("");
  lines.push(`Rows: ${args.payload.rows.length}`);
  return lines.join("\n");
}

function humanize(s: string): string {
  return s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).replace(/_/g, " ");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}
