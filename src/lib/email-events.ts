import { db } from "@/lib/db";
import type { EmailEventKind } from "@prisma/client";

// Phase 14 Slice C — EmailEvent recorder.
//
// Every send-site in the app calls `recordEmailEvent` instead of (eventually,
// alongside) the actual email provider call. That gives us a single source of
// truth for the communication timeline regardless of whether mail is actually
// going out yet (Phase 16 ties in the provider).
//
// Swallows errors on purpose — logging must never break the user's flow, same
// as `logAudit` / `notify`.

type RecordArgs = {
  tenantId:     string;
  customerId?:  string | null;
  senderUserId?: string | null;
  kind:         EmailEventKind;
  toAddress:    string;
  fromAddress?: string;
  subject?:     string;
  bodyPreview?: string;
  relatedEntityType?: string;
  relatedEntityId?:   string;
  provider?:    string;
  providerId?:  string; // Resend message ID — enables delivery tracking webhooks
};

export async function recordEmailEvent(args: RecordArgs): Promise<void> {
  try {
    await db.emailEvent.create({
      data: {
        tenantId:          args.tenantId,
        customerId:        args.customerId ?? null,
        senderUserId:      args.senderUserId ?? null,
        kind:              args.kind,
        toAddress:         args.toAddress,
        fromAddress:       args.fromAddress ?? null,
        subject:           args.subject ?? null,
        bodyPreview:       truncate(args.bodyPreview, 500),
        relatedEntityType: args.relatedEntityType ?? null,
        relatedEntityId:   args.relatedEntityId ?? null,
        provider:          args.provider ?? null,
        providerId:        args.providerId ?? null,
      },
    });
  } catch {
    // intentionally swallowed
  }
}

function truncate(s: string | undefined, n: number): string | null {
  if (!s) return null;
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

// Human label for the email kind — used by the timeline renderer.
export function emailEventLabel(kind: EmailEventKind): string {
  switch (kind) {
    case "QUOTE_SENT":      return "Quote sent";
    case "PROOF_SENT":      return "Proof sent";
    case "INVOICE_SENT":    return "Invoice sent";
    case "PAYMENT_RECEIPT": return "Payment receipt sent";
    case "PORTAL_INVITE":   return "Portal invite sent";
    case "UPDATE_MESSAGE":  return "Update sent";
    case "REMINDER":        return "Reminder sent";
    case "GENERIC":         return "Email sent";
  }
}
