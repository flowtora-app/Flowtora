import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button, Field, SelectField, TextArea } from "@/components/Field";
import { submitFeedback } from "@/app/actions/feedback";
import { memberLookup } from "@/lib/members";
import { formatDateTime } from "@/lib/format";

// Phase 18 Slice H — beta feedback surface.
//
// Two audiences in one page, deliberately:
//   1. Every member can file a note (any of IDEA / BUG / PRAISE / OTHER).
//   2. Managers+ see the tenant-scoped inbox underneath the form.
//
// Keeping both on one route is intentional for beta — a separate admin
// panel would add navigation weight for a low-traffic feature. When we
// outgrow it, the inbox moves to Settings → Feedback.

const KIND_LABEL: Record<string, string> = {
  IDEA:   "Feature idea",
  BUG:    "Bug report",
  PRAISE: "Praise",
  OTHER:  "Other",
};

const KIND_ACCENT: Record<string, string> = {
  IDEA:   "var(--accent-surface)",
  BUG:    "var(--danger-surface)",
  PRAISE: "var(--success-surface)",
  OTHER:  "var(--surface-2)",
};
const KIND_FG: Record<string, string> = {
  IDEA:   "var(--accent-primary)",
  BUG:    "var(--danger-fg)",
  PRAISE: "var(--success-fg)",
  OTHER:  "var(--text-default)",
};

export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ from?: string; sent?: string; error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "customers:view");
  const canReview = ctx.can("staff:manage");

  const send = submitFeedback.bind(null, slug);

  const recent = canReview
    ? await db.feedback.findMany({
        where: { tenantId: ctx.tenant.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    : [];
  const members = canReview ? await memberLookup(ctx.tenant.id) : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Feedback</h1>
          <span
            className="rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide"
            style={{
              background: "var(--accent-surface)",
              color: "var(--accent-primary)",
            }}
          >
            Beta
          </span>
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Tell us what&apos;s working, what&apos;s broken, or what you wish Flowtora did differently.
          Every note goes to the team building the product.
        </p>
      </div>

      {sp.sent === "1" && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--success-surface)",
            color: "var(--success-fg)",
            border: "1px solid var(--success-fg)",
          }}
        >
          Thanks — your note is in. We read every one.
        </div>
      )}
      {sp.error && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          {sp.error}
        </div>
      )}

      <Card>
        <CardHeader title="Send a note" description="Under a minute. Detail optional." />
        <form action={send} className="space-y-4 px-5 py-4">
          {sp.from && <input type="hidden" name="context" value={sp.from} />}
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Kind"
              name="kind"
              defaultValue="IDEA"
              options={[
                { value: "IDEA",   label: "Feature idea" },
                { value: "BUG",    label: "Bug report" },
                { value: "PRAISE", label: "Praise / what's working" },
                { value: "OTHER",  label: "Other" },
              ]}
            />
            <SelectField
              label="Overall rating (optional)"
              name="rating"
              defaultValue=""
              options={[
                { value: "",  label: "— skip —" },
                { value: "5", label: "5 — great" },
                { value: "4", label: "4 — good" },
                { value: "3", label: "3 — fine" },
                { value: "2", label: "2 — frustrating" },
                { value: "1", label: "1 — blocking me" },
              ]}
            />
          </div>
          <Field
            label="Summary"
            name="summary"
            required
            maxLength={200}
            placeholder="One-line headline…"
          />
          <TextArea
            label="Details (optional)"
            name="body"
            rows={5}
            placeholder="What were you trying to do? What happened? What would you change?"
          />
          {sp.from && (
            <div className="text-xs" style={{ color: "var(--text-muted)" }}>
              Sent from <span style={{ color: "var(--text-default)" }}>{sp.from}</span>
            </div>
          )}
          <Button type="submit">Send feedback</Button>
        </form>
      </Card>

      {canReview && (
        <Card>
          <CardHeader
            title="Recent feedback"
            description={
              recent.length === 0
                ? "Nothing submitted yet — be the first."
                : `${recent.length} note${recent.length === 1 ? "" : "s"} in the last run`
            }
          />
          <ul>
            {recent.map((f) => {
              const from = members?.get(f.userId)?.name ?? "Someone on your team";
              return (
                <li
                  key={f.id}
                  className="px-5 py-4"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                          style={{
                            background: KIND_ACCENT[f.kind] ?? "var(--surface-2)",
                            color:      KIND_FG[f.kind]     ?? "var(--text-default)",
                          }}
                        >
                          {KIND_LABEL[f.kind] ?? f.kind}
                        </span>
                        {f.rating != null && (
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            Rating: {f.rating}/5
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 text-sm font-medium">{f.summary}</div>
                      {f.body && (
                        <div
                          className="mt-1 whitespace-pre-wrap text-sm"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {f.body}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-xs" style={{ color: "var(--text-muted)" }}>
                      <div>{from}</div>
                      <div>{formatDateTime(f.createdAt)}</div>
                      {f.context && (
                        <Link
                          href={f.context}
                          className="mt-0.5 inline-block underline"
                        >
                          View page
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
            {recent.length === 0 && (
              <li
                className="px-5 py-6 text-center text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                No feedback yet.
              </li>
            )}
          </ul>
        </Card>
      )}
    </div>
  );
}
