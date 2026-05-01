// Daily win-back campaign cron.
//
// For every ACTIVE WinbackCampaign:
//   1. Refresh the audience (catch tenants who churned since the
//      campaign started + drop tenants that came back).
//   2. For each unenrolled tenant in the audience, create a
//      WinbackEnrollment (DRAFT → enqueued).
//   3. For each enrollment without `emailedAt`, send the email +
//      stamp emailedAt. Increment the campaign's emailsSent counter.
//
// Auth: same `Bearer ${CRON_SECRET}` as the other crons.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import {
  computeWinbackAudience,
} from "@/server/platform/churn";
import type { ArchiveReasonCode } from "@prisma/client";

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

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]!);
}

async function runWinbackCampaigns() {
  const campaigns = await db.winbackCampaign.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true, name: true, audienceFilter: true,
      emailSubject: true, emailBody: true,
      emailsSent: true,
    },
  });

  let totalEnrolled = 0;
  let totalSent = 0;
  let totalFailed = 0;
  const summary: { id: string; name: string; enrolled: number; sent: number; failed: number }[] = [];

  for (const campaign of campaigns) {
    if (!campaign.emailSubject || !campaign.emailBody) continue;

    // Refresh audience.
    const filter = (campaign.audienceFilter as { reasonCodes?: ArchiveReasonCode[]; cancelledSinceDays?: number } | null) ?? null;
    const aud = await computeWinbackAudience(filter);

    // Existing enrolments — skip already-enrolled tenants.
    const existing = await db.winbackEnrollment.findMany({
      where: { campaignId: campaign.id },
      select: { tenantId: true, emailedAt: true },
    });
    const existingTenantIds = new Set(existing.map((e) => e.tenantId));

    let enrolled = 0;
    for (const tenantId of aud.tenantIds) {
      if (existingTenantIds.has(tenantId)) continue;
      try {
        await db.winbackEnrollment.create({
          data: { campaignId: campaign.id, tenantId },
        });
        enrolled += 1;
      } catch (err) {
        // Unique-constraint clash (another worker raced us) — ignore.
        void err;
      }
    }
    if (enrolled > 0) {
      await db.winbackCampaign.update({
        where: { id: campaign.id },
        data: { audienceSize: { increment: enrolled } },
      });
    }
    totalEnrolled += enrolled;

    // Send emails to unsent enrolments.
    const pending = await db.winbackEnrollment.findMany({
      where: { campaignId: campaign.id, emailedAt: null },
      select: {
        id: true, tenantId: true,
        tenant: {
          select: {
            name: true,
            memberships: {
              where: { role: "OWNER" },
              select: { user: { select: { email: true } } },
              take: 1,
            },
          },
        },
      },
      take: 100, // throttle per run so we don't blow Resend quotas
    });

    let sent = 0;
    let failed = 0;
    for (const e of pending) {
      const ownerEmail = e.tenant.memberships[0]?.user?.email ?? null;
      if (!ownerEmail) {
        failed += 1;
        continue;
      }
      try {
        await sendEmail({
          to: ownerEmail,
          subject: campaign.emailSubject,
          text: campaign.emailBody,
          html: `<pre style="font-family:Inter,sans-serif;white-space:pre-wrap;">${escapeHtml(campaign.emailBody)}</pre>`,
        });
        await db.winbackEnrollment.update({
          where: { id: e.id },
          data: { emailedAt: new Date() },
        });
        sent += 1;
      } catch (err) {
        failed += 1;
        void err;
      }
    }
    if (sent > 0) {
      await db.winbackCampaign.update({
        where: { id: campaign.id },
        data: { emailsSent: { increment: sent } },
      });
    }

    totalSent += sent;
    totalFailed += failed;
    summary.push({ id: campaign.id, name: campaign.name, enrolled, sent, failed });
  }

  return { totalEnrolled, totalSent, totalFailed, campaigns: summary };
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runWinbackCampaigns();
    return NextResponse.json({ ok: true, ...result });
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
