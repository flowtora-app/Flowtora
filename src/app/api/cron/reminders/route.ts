import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadAttention, type AttentionGroups, type AttentionItem, type AttentionKind } from "@/lib/attention";
import {
  notifyOnce,
  notificationLabel,
  sendNotification,
  type NotificationType,
} from "@/lib/notifications";
import { logAudit } from "@/lib/audit";
import { resolveEffectivePref, resolvePrefs } from "@/lib/notif-prefs";
import { appOrigin } from "@/lib/share";

// Phase 13 — reminder cron.
//
// Runs on an external schedule (Vercel Cron, external cron-job.org, whatever).
// Auth: `Authorization: Bearer <CRON_SECRET>` or `?key=<CRON_SECRET>` so the
// same endpoint works from platforms that can't set headers.
//
// For each non-canceled tenant we compute the same attention groups the UI
// shows, then fan out *dedup'd* notifications (one per (userId, type,
// entityId) inside a 24h window) so repeated runs don't spam users.
//
// The fan-out uses `notifyOnce`, which is the whole point: the cron can safely
// run every hour and only the first run that sees a given stale quote for a
// given owner will actually create a notification — the rest no-op.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep the suppression window slightly longer than a typical daily cadence so
// a schedule hiccup (running twice in a day) doesn't cause a double-notify.
const SUPPRESS_HOURS = 24;

// Map AttentionKind → NotificationType. Kept as a plain record so a missed
// mapping is a TypeScript error rather than a silent fallback at runtime.
const KIND_TO_NOTIFICATION: Record<AttentionKind, NotificationType> = {
  "quote.overdue":       "reminder.quote_overdue",
  "quote.expiring":      "reminder.quote_expiring",
  "quote.stale":         "reminder.quote_stale",
  "proof.stale":         "reminder.proof_stale",
  "invoice.overdue":     "reminder.invoice_overdue",
  "invoice.unsent":      "reminder.invoice_unsent",
  "order.overdue":       "reminder.order_overdue",
  "install.unconfirmed": "reminder.install_unconfirmed",
  "task.overdue":        "reminder.task_overdue",
};

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Fail closed: without a configured secret we refuse to run rather than
    // leave the endpoint open to anyone who discovers the URL.
    return false;
  }
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(req.url);
  if (url.searchParams.get("key") === secret) return true;
  return false;
}

function allItems(g: AttentionGroups): AttentionItem[] {
  return [
    ...g.quotesOverdue,
    ...g.quotesExpiring,
    ...g.quotesStale,
    ...g.proofsStale,
    ...g.invoicesOverdue,
    ...g.invoicesUnsent,
    ...g.ordersOverdue,
    ...g.installsUnconfirmed,
    ...g.tasksOverdue,
  ];
}

async function runReminders() {
  // Skip canceled/suspended tenants — no point pinging owners there.
  const tenants = await db.tenant.findMany({
    where: { status: { in: ["TRIAL", "ACTIVE", "PAST_DUE"] } },
    select: { id: true, slug: true, name: true },
  });

  let tenantsProcessed = 0;
  let itemsSeen = 0;
  let notificationsCreated = 0;
  let notificationsSuppressed = 0;
  let notificationsSkipped = 0; // no owner to notify
  let emailsSent = 0;
  let emailsFailed = 0;

  const origin = appOrigin();

  for (const tenant of tenants) {
    tenantsProcessed += 1;
    let groups: AttentionGroups;
    try {
      groups = await loadAttention(tenant.id);
    } catch {
      // If one tenant blows up, keep going — we don't want a single bad row
      // to stall reminders for the rest of the fleet.
      continue;
    }

    const items = allItems(groups);
    itemsSeen += items.length;
    if (items.length === 0) continue;

    // Preload per-tenant state once so the inner loop can resolve prefs and
    // email addresses without N extra queries per reminder item.
    const tenantFull = await db.tenant.findUnique({
      where:  { id: tenant.id },
      select: { defaultNotifPrefs: true },
    });
    const tenantDefaults = resolvePrefs(tenantFull?.defaultNotifPrefs);

    const memberships = await db.membership.findMany({
      where:  { tenantId: tenant.id, status: "ACTIVE" },
      select: {
        userId:     true,
        notifPrefs: true,
        user:       { select: { email: true } },
      },
    });
    const memberMap = new Map<string, { email: string | null; prefs: ReturnType<typeof resolvePrefs> }>();
    for (const m of memberships) {
      memberMap.set(m.userId, {
        email: m.user?.email ?? null,
        prefs: resolvePrefs(m.notifPrefs),
      });
    }

    for (const item of items) {
      if (!item.ownerUserId) {
        notificationsSkipped += 1;
        continue;
      }
      const type = KIND_TO_NOTIFICATION[item.kind];
      const link = `/t/${tenant.slug}/${item.href}`;
      const created = await notifyOnce(
        {
          tenantId:   tenant.id,
          userId:     item.ownerUserId,
          type,
          title:      item.title,
          body:       item.detail,
          entityType: item.entityType,
          entityId:   item.entityId,
          link,
        },
        SUPPRESS_HOURS,
      );
      if (created) notificationsCreated += 1;
      else         { notificationsSuppressed += 1; continue; }

      // Only send email when the in-app notification actually fired (so the
      // email respects the same 24h dedup window) and the user opted in via
      // personal prefs or tenant defaults.
      const member = memberMap.get(item.ownerUserId);
      if (!member || !member.email) continue;
      const pref = resolveEffectivePref(member.prefs, tenantDefaults, type);
      if (!pref.email) continue;

      // Dispatch through the templated notification pipeline so admins can
      // retune the copy from /platform/notifications without a deploy. The
      // dispatcher swallows provider errors into a DispatchResult — we count
      // sent vs failed for the cron summary rather than letting the cron
      // abort on a single bad address.
      const res = await sendNotification({
        kind: "activity.reminder_digest",
        to: member.email,
        tenantId: tenant.id,
        userId: item.ownerUserId,
        tokens: {
          reminder_title:  item.title,
          reminder_detail: item.detail,
          reminder_kind:   notificationLabel(type),
          reminder_url:    `${origin}${link}`,
          workspace_name:  tenant.name,
        },
      });
      if (res.sent) emailsSent += 1;
      else          emailsFailed += 1;
    }

    // Audit trail per tenant so owners can see the cron did run. Tiny writes
    // but useful for debugging "why didn't I get a reminder" questions.
    await logAudit({
      tenantId: tenant.id,
      action:   "cron.reminders.run",
      metadata: {
        itemsSeen: items.length,
      },
    });
  }

  return {
    tenantsProcessed,
    itemsSeen,
    notificationsCreated,
    notificationsSuppressed,
    notificationsSkipped,
    emailsSent,
    emailsFailed,
  };
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runReminders();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}

// Some cron providers only POST — accept both verbs.
export async function POST(req: Request) {
  return GET(req);
}
