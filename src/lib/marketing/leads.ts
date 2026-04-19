import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { MarketingLeadKind, BusinessType, Prisma } from "@prisma/client";

// Phase 5 — lead capture helper.
//
// Every public form (contact, book-demo, newsletter, etc.) goes through
// `recordLead()`. The helper owns:
//
//   • Dedup — same email + same kind inside 24h silently updates the
//     existing row instead of creating a duplicate. Spammers who mash
//     submit and genuine users who double-click both get one lead, not
//     two. Cross-kind submissions (someone contacts us, then books a
//     demo) are kept separate on purpose — that's useful signal.
//
//   • Rate limit — per IP-hash, per kind, rolling 1-hour window. If a
//     single source fires >10 leads of the same kind in an hour, we
//     mark subsequent ones SPAM (still persisted for forensics) and
//     return a "rate-limited" flag. The UI still shows success so
//     bots don't retry against a visible error.
//
//   • PII minimization — we only ever store a SHA-256 hash of the
//     client IP. The raw IP never touches our DB.
//
// After the lead lands, forwarding to SendGrid/Slack/HubSpot is a
// no-op for now (stub). The forward contract lives here so we can swap
// in the real integration without touching any action call-site.

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;       // 1h
const RATE_LIMIT_MAX_PER_WINDOW = 10;              // per ipHash, per kind
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000;       // 24h

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  // Salt is NOT a secret — the point is just to make rainbow lookups
  // harder and to key the hash to the tracksign install. If leaked,
  // the worst case is that an attacker could confirm whether a given
  // IP submitted a lead, which is already visible in their own server
  // logs. A rotating salt in env would be better; punt to ops.
  return createHash("sha256").update("tracksign-lead:" + ip).digest("hex").slice(0, 32);
}

export interface RecordLeadInput {
  kind: MarketingLeadKind;
  email: string;
  name?: string | null;
  company?: string | null;
  role?: string | null;
  teamSize?: string | null;
  message?: string | null;
  preferredTime?: string | null;
  timezone?: string | null;
  businessType?: BusinessType | null;
  source?: string | null;        // path of capture point
  referrer?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmTerm?: string | null;
  utmContent?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
}

export interface RecordLeadResult {
  ok: boolean;
  leadId?: string;
  deduped?: boolean;       // merged into an existing row
  rateLimited?: boolean;   // marked SPAM; UI should still show success
}

export async function recordLead(input: RecordLeadInput): Promise<RecordLeadResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { ok: false };

  // ── Rate-limit check. Per-IP only; email-based rate-limiting would
  //    be a griefing vector (an attacker spamming email=ceo@competitor
  //    would block that company from ever contacting us).
  let rateLimited = false;
  if (input.ipHash) {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const recent = await db.marketingLead.count({
      where: { kind: input.kind, ipHash: input.ipHash, createdAt: { gte: since } },
    });
    if (recent >= RATE_LIMIT_MAX_PER_WINDOW) rateLimited = true;
  }

  // ── Dedup check. Same email + same kind inside 24h → update in
  //    place. We merge the incoming fields on top; newer submissions
  //    win for anything non-null.
  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_MS);
  const existing = await db.marketingLead.findFirst({
    where: { email, kind: input.kind, createdAt: { gte: dedupSince } },
    orderBy: { createdAt: "desc" },
  });

  const data = buildData(input, email, rateLimited);

  if (existing) {
    const lead = await db.marketingLead.update({
      where: { id: existing.id },
      // updatedAt fires automatically; don't bump createdAt — keeps the
      // "first touched us at" signal intact for attribution.
      data: pruneNulls(data),
    });
    await forwardToSink(lead).catch(() => {});
    return { ok: true, leadId: lead.id, deduped: true, rateLimited };
  }

  const lead = await db.marketingLead.create({ data });
  await forwardToSink(lead).catch(() => {});
  return { ok: true, leadId: lead.id, rateLimited };
}

function buildData(
  i: RecordLeadInput,
  email: string,
  rateLimited: boolean,
): Prisma.MarketingLeadCreateInput {
  return {
    kind: i.kind,
    email,
    name: i.name ?? null,
    company: i.company ?? null,
    role: i.role ?? null,
    teamSize: i.teamSize ?? null,
    message: i.message ?? null,
    preferredTime: i.preferredTime ?? null,
    timezone: i.timezone ?? null,
    businessType: i.businessType ?? null,
    source: i.source ?? null,
    referrer: i.referrer ?? null,
    utmSource: i.utmSource ?? null,
    utmMedium: i.utmMedium ?? null,
    utmCampaign: i.utmCampaign ?? null,
    utmTerm: i.utmTerm ?? null,
    utmContent: i.utmContent ?? null,
    ipHash: i.ipHash ?? null,
    userAgent: i.userAgent ?? null,
    status: rateLimited ? "SPAM" : "NEW",
  };
}

/** Strip nulls so an update doesn't wipe out a previously-filled field. */
function pruneNulls(data: Prisma.MarketingLeadCreateInput): Prisma.MarketingLeadUpdateInput {
  const out: Prisma.MarketingLeadUpdateInput = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== null && v !== undefined) {
      (out as Record<string, unknown>)[k] = v;
    }
  }
  return out;
}

/**
 * Forward a captured lead to the real destination (email, Slack, CRM).
 * Currently a no-op stub — console.log in dev so you can see it work,
 * and a hook to swap in the real integration later.
 */
async function forwardToSink(lead: { id: string; kind: string; email: string; status: string }) {
  if (lead.status === "SPAM") return; // don't forward junk
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log("[marketing.lead] captured", {
      leadId: lead.id,
      kind: lead.kind,
      email: lead.email,
    });
  }
  // TODO(ops): wire one of —
  //   - Postmark/SendGrid to sales@tracksign.com
  //   - Slack webhook → #sales
  //   - HubSpot/Pipedrive API create
}

/**
 * Read UTM + referrer from a FormData that the marketing forms submit
 * alongside their real fields. Keeps UTM plumbing DRY across actions.
 */
export function extractAttribution(fd: FormData, fallbackSource: string): {
  source: string;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
} {
  const str = (k: string) => {
    const v = fd.get(k);
    return typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, 240) : null;
  };
  return {
    source: str("_source") ?? fallbackSource,
    referrer: str("_referrer"),
    utmSource: str("utm_source"),
    utmMedium: str("utm_medium"),
    utmCampaign: str("utm_campaign"),
    utmTerm: str("utm_term"),
    utmContent: str("utm_content"),
  };
}
