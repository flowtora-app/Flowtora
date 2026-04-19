import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/Card";
import { Field, SelectField, TextArea, Button } from "@/components/Field";
import { updateMarketingLead } from "@/app/actions/leads";

// Phase 19 — lead triage detail. Platform staff work the lead from here:
// flip status, assign, attach a converted tenant, leave notes. Context
// panel exposes everything the submitter gave us so the rep doesn't have
// to hunt through the database.

const STATUS_OPTIONS = [
  { value: "NEW",          label: "New" },
  { value: "CONTACTED",    label: "Contacted" },
  { value: "QUALIFIED",    label: "Qualified" },
  { value: "CONVERTED",    label: "Converted" },
  { value: "DISQUALIFIED", label: "Disqualified" },
  { value: "SPAM",         label: "Spam" },
];

export default async function PlatformLeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  await requirePlatformStaff();

  const lead = await db.marketingLead.findUnique({ where: { id } });
  if (!lead) notFound();

  const [platformUsers, convertedTenant] = await Promise.all([
    db.user.findMany({
      where:  { platformRole: { not: null } },
      select: { id: true, email: true, name: true, platformRole: true },
    }),
    lead.convertedTenantId
      ? db.tenant.findUnique({
          where:  { id: lead.convertedTenantId },
          select: { id: true, name: true, slug: true },
        })
      : Promise.resolve(null),
  ]);

  const save = updateMarketingLead.bind(null, lead.id);

  const attribution = [
    lead.utmSource   && `source=${lead.utmSource}`,
    lead.utmMedium   && `medium=${lead.utmMedium}`,
    lead.utmCampaign && `campaign=${lead.utmCampaign}`,
    lead.utmTerm     && `term=${lead.utmTerm}`,
    lead.utmContent  && `content=${lead.utmContent}`,
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          <Link href="/platform/leads" className="underline">Leads</Link>
          {" / "}
          {lead.name ?? lead.email}
        </div>
        <h1 className="mt-1 text-2xl font-semibold">{lead.name ?? lead.email}</h1>
        <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          {lead.kind} · status {lead.status.toLowerCase()}
          {lead.company && <> · {lead.company}</>}
          {lead.role && <> · {lead.role}</>}
        </div>
      </div>

      {sp.ok && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{ background: "#15332a", color: "#7dd688", border: "1px solid #205033" }}
        >
          Lead updated.
        </div>
      )}
      {sp.error && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{ background: "#3a1517", color: "#ff8b8b", border: "1px solid #5b2024" }}
        >
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="What they said" />
            <div className="space-y-3 px-5 py-4 text-sm">
              {lead.message ? (
                <div className="whitespace-pre-wrap">{lead.message}</div>
              ) : (
                <p style={{ color: "var(--muted)" }}>No message provided.</p>
              )}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <Meta label="Email"          value={lead.email} />
                <Meta label="Name"           value={lead.name} />
                <Meta label="Company"        value={lead.company} />
                <Meta label="Role"           value={lead.role} />
                <Meta label="Business type"  value={lead.businessType} />
                <Meta label="Team size"      value={lead.teamSize} />
                <Meta label="Preferred time" value={lead.preferredTime} />
                <Meta label="Timezone"       value={lead.timezone} />
              </dl>
            </div>
          </Card>

          <Card>
            <CardHeader title="Triage" />
            <form action={save} className="space-y-3 px-5 py-4">
              <SelectField
                label="Status"
                name="status"
                options={STATUS_OPTIONS}
                defaultValue={lead.status}
              />
              <SelectField
                label="Assigned to"
                name="assignedToUserId"
                options={[
                  { value: "", label: "— unassigned —" },
                  ...platformUsers.map((u) => ({
                    value: u.id,
                    label: `${u.name ?? u.email} (${u.platformRole})`,
                  })),
                ]}
                defaultValue={lead.assignedToUserId ?? ""}
              />
              <Field
                label="Converted tenant id"
                name="convertedTenantId"
                defaultValue={lead.convertedTenantId ?? ""}
                placeholder="tenant id (set when status → CONVERTED)"
                hint="Paste the tenant id from /platform/tenants once the lead signs up."
              />
              <TextArea
                label="Disqualified reason"
                name="disqualifiedReason"
                rows={2}
                maxLength={500}
                defaultValue={lead.disqualifiedReason ?? ""}
              />
              <TextArea
                label="Internal notes"
                name="notes"
                rows={6}
                maxLength={5000}
                defaultValue={lead.notes ?? ""}
              />
              <div className="text-right">
                <Button type="submit">Save triage</Button>
              </div>
            </form>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardHeader title="Timeline" />
            <dl className="space-y-2 px-5 py-4 text-xs">
              <TimelineRow label="Submitted"       date={lead.createdAt} />
              <TimelineRow label="First contacted" date={lead.firstContactedAt} />
              <TimelineRow label="Last contacted"  date={lead.lastContactedAt} />
              <TimelineRow label="Converted"       date={lead.convertedAt} />
            </dl>
          </Card>

          <Card>
            <CardHeader title="Attribution" />
            <dl className="space-y-2 px-5 py-4 text-xs">
              <Meta label="Captured at" value={lead.source} />
              <Meta label="Referrer"    value={lead.referrer} />
              <Meta label="UTM"         value={attribution || null} />
              <Meta label="IP hash"     value={lead.ipHash ? `${lead.ipHash.slice(0, 12)}…` : null} />
            </dl>
          </Card>

          {convertedTenant && (
            <Card>
              <CardHeader title="Converted tenant" />
              <div className="px-5 py-4 text-sm">
                <Link
                  href={`/platform/tenants/${convertedTenant.id}`}
                  className="font-medium underline"
                >
                  {convertedTenant.name}
                </Link>
                <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                  {convertedTenant.slug}
                </div>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="Quick actions" />
            <div className="space-y-2 px-5 py-4 text-xs">
              <a
                href={`mailto:${lead.email}?subject=${encodeURIComponent("Re: your Flowtora inquiry")}`}
                className="block underline"
              >
                Email {lead.email}
              </a>
              <Link
                href={`/platform/tenants?q=${encodeURIComponent(lead.email)}`}
                className="block underline"
                style={{ color: "var(--muted)" }}
              >
                Search tenants by this email
              </Link>
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt style={{ color: "var(--muted)" }}>{label}</dt>
      <dd>{value ? value : <span style={{ color: "var(--muted)" }}>—</span>}</dd>
    </>
  );
}

function TimelineRow({ label, date }: { label: string; date: Date | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span style={{ color: "var(--muted)" }}>{label}</span>
      <span>{date ? date.toISOString().replace("T", " ").slice(0, 16) : <span style={{ color: "var(--muted)" }}>—</span>}</span>
    </div>
  );
}
