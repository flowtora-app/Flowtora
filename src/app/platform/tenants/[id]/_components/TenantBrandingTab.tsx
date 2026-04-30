import { db } from "@/lib/db";
import { Avatar, Badge, Card, CardBody, CardHeader } from "@/components/ui";

// Tab 10 — Branding. Logo + brand color + custom domain DNS hints.

export interface TenantBrandingTabProps { tenantId: string }

export async function TenantBrandingTab({ tenantId }: TenantBrandingTabProps) {
  const t = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true, logoUrl: true, brandPrimaryColor: true, customDomain: true,
      emailFromName: true, emailReplyTo: true,
      quoteFooterText: true, invoiceFooterText: true, paymentInstructions: true,
    },
  });
  if (!t) return null;

  return (
    <div className="space-y-4">
      <Card padding="md">
        <CardHeader title="Brand assets" />
        <CardBody>
          <div className="flex items-start gap-6">
            <div className="text-center">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Logo</div>
              <Avatar size="3xl" src={t.logoUrl ?? undefined} name={t.name} />
            </div>
            <div className="flex-1 space-y-3 text-[13px]">
              <Field label="Logo URL" value={t.logoUrl ? <code className="font-mono text-[11px]">{t.logoUrl}</code> : null} />
              <Field label="Primary brand color" value={
                t.brandPrimaryColor
                  ? <span className="inline-flex items-center gap-2"><span aria-hidden style={{ width: 16, height: 16, borderRadius: 4, background: t.brandPrimaryColor, border: "1px solid var(--border-subtle)" }} /><code className="font-mono text-[11px]">{t.brandPrimaryColor}</code></span>
                  : null
              } />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card padding="md">
        <CardHeader title="Email sender" />
        <CardBody>
          <dl className="grid grid-cols-1 gap-3 text-[13px] md:grid-cols-2">
            <Field label="From name override" value={t.emailFromName} />
            <Field label="Reply-to" value={t.emailReplyTo} />
          </dl>
          <div className="mt-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
            DKIM / SPF stay on the Flowtora envelope domain. Display name + reply-to
            override what the recipient sees.
          </div>
        </CardBody>
      </Card>

      <Card padding="md">
        <CardHeader title="Custom domain" />
        <CardBody>
          {t.customDomain ? (
            <div>
              <div className="mb-3 flex items-center gap-2 text-[13px]">
                <code className="font-mono">{t.customDomain}</code>
                <Badge size="xs" color="info">Configured</Badge>
              </div>
              <div className="rounded-md border p-3 text-[12px]"
                   style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
                <div className="mb-1 font-semibold uppercase tracking-wide text-[10px]" style={{ color: "var(--text-muted)" }}>DNS</div>
                <div style={{ color: "var(--text-default)" }}>
                  Point <code className="font-mono">{t.customDomain}</code> via CNAME to{" "}
                  <code className="font-mono">cname.flowtora.app</code>. SSL is provisioned automatically once the
                  CNAME resolves.
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              No custom domain configured. The tenant uses the default
              <code className="font-mono"> /t/{`<slug>`}</code> URLs.
            </div>
          )}
        </CardBody>
      </Card>

      <Card padding="md">
        <CardHeader title="Document footers" />
        <CardBody>
          <dl className="grid grid-cols-1 gap-3 text-[13px] md:grid-cols-2">
            <Field label="Quote footer" value={t.quoteFooterText} multiline />
            <Field label="Invoice footer" value={t.invoiceFooterText} multiline />
            <Field label="Payment instructions" value={t.paymentInstructions} multiline />
          </dl>
        </CardBody>
      </Card>
    </div>
  );
}

function Field({ label, value, multiline }: { label: string; value: React.ReactNode | null; multiline?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap" style={{ color: "var(--text-default)" }}>
        {value == null || value === "" ? <span style={{ color: "var(--text-faint)" }}>—</span> : value}
      </dd>
      {void multiline}
    </div>
  );
}
