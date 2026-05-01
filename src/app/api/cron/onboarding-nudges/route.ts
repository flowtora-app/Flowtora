// Onboarding nudge drip — daily cron.
//
// For every tenant with `onboardingNudgeEnrolledAt` set who is not yet
// activated and whose last nudge is older than the configured cadence,
// send the configured nudge email to the OWNER and stamp
// `lastOnboardingNudgeAt`. Tenants that have advanced to "activated"
// are auto-removed from the drip (we clear `onboardingNudgeEnrolledAt`).
//
// Auth: same `Bearer ${CRON_SECRET}` (or `?key=`) as the other crons.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import {
  loadFunnelSettings,
  loadPipelineRows,
} from "@/server/platform/onboarding-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOUR = 3_600_000;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("key") === secret) return true;
  return false;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}

async function runOnboardingNudges() {
  const settings = await loadFunnelSettings();
  const rows = await loadPipelineRows();

  const cadenceMs = settings.nudgeCadenceDays * 24 * HOUR;
  const now = Date.now();

  let enrolledSeen = 0;
  let dripSent = 0;
  let dripFailed = 0;
  let autoUnenrolled = 0;
  let skippedNoOwner = 0;
  let skippedTooSoon = 0;

  for (const row of rows) {
    if (!row.onboardingNudgeEnrolledAt) continue;
    enrolledSeen += 1;

    // Auto-remove tenants that reached the activated stage.
    if (row.stage.id === "activated") {
      await db.tenant.update({
        where: { id: row.id },
        data: { onboardingNudgeEnrolledAt: null },
      });
      autoUnenrolled += 1;
      continue;
    }

    if (!row.ownerEmail) {
      skippedNoOwner += 1;
      continue;
    }

    const lastSent = row.lastOnboardingNudgeAt?.getTime() ?? 0;
    const since = now - lastSent;
    if (lastSent > 0 && since < cadenceMs) {
      skippedTooSoon += 1;
      continue;
    }

    try {
      await sendEmail({
        to: row.ownerEmail,
        subject: settings.nudgeSubject,
        text: settings.nudgeBody,
        html: `<pre style="font-family:Inter,sans-serif;white-space:pre-wrap;">${escapeHtml(settings.nudgeBody)}</pre>`,
      });
      await db.tenant.update({
        where: { id: row.id },
        data: { lastOnboardingNudgeAt: new Date() },
      });
      dripSent += 1;
    } catch (err) {
      dripFailed += 1;
      void err;
    }
  }

  // No platform-audit row: cron jobs aren't owned by any individual
  // staff member, and the per-tenant `lastOnboardingNudgeAt` stamp is
  // sufficient for traceability ("when did this tenant last get
  // nudged?"). The summary is returned in the response and the cron
  // provider's run-history captures it.
  return { enrolledSeen, dripSent, dripFailed, autoUnenrolled, skippedNoOwner, skippedTooSoon };
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runOnboardingNudges();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  return GET(req);
}
