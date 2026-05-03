// Page 29 — seed one industry template per kind so the new tabs render.
// Idempotent.

import { db } from "@/lib/db";

async function pickAdminId(): Promise<string> {
  const admin = await db.user.findFirst({
    where: { platformRole: { in: ["SUPER_ADMIN", "ADMIN", "SITE_MANAGER", "BILLING_MANAGER"] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("No platform admin user found");
  console.log(`  using admin: ${admin.email}`);
  return admin.id;
}

async function seed(adminId: string) {
  const existing = await db.industryTemplate.count();
  if (existing > 0) {
    console.log(`  Already have ${existing} templates — skipping.`);
    return;
  }
  const day = 86_400_000;

  const seeds = [
    {
      slug: "default-storefront",
      name: "Default Storefront",
      kind: "STOREFRONT" as const,
      description: "A clean hero + services + contact storefront for new tenants.",
      bodyHtml: `
<section style="font-family: system-ui, sans-serif; padding: 32px; max-width: 720px; margin: 0 auto;">
  <header style="border-bottom: 1px solid #e5e7eb; padding-bottom: 16px; margin-bottom: 24px;">
    <img src="{{tenant.logoUrl}}" alt="{{tenant.name}}" style="height: 60px;" />
    <h1 style="margin: 12px 0 4px; font-size: 28px;">{{tenant.name}}</h1>
    <p style="color: #6b7280; margin: 0;">{{tenant.address}} · {{tenant.phone}}</p>
  </header>
  <h2 style="font-size: 20px; margin-top: 24px;">Services we offer</h2>
  <ul style="line-height: 1.7;">
    <li>Wide-format printing</li>
    <li>Vehicle wraps</li>
    <li>ADA + wayfinding signs</li>
  </ul>
  <p style="margin-top: 32px; padding: 16px; background: #f3f4f6; border-radius: 8px;">
    Get in touch: <a href="mailto:{{tenant.email}}">{{tenant.email}}</a>
  </p>
</section>`.trim(),
      variables: ["tenant.name", "tenant.logoUrl", "tenant.address", "tenant.phone", "tenant.email"],
      tags: ["storefront", "marketing", "starter"],
      thumbnailUrl: "https://images.unsplash.com/photo-1556745757-8d76bdb6984b?w=480&h=360&fit=crop",
    },
    {
      slug: "default-quote-pdf",
      name: "Default Quote PDF",
      kind: "QUOTE_PDF" as const,
      description: "Standard quote document with branding header, line items, and totals.",
      bodyHtml: `
<div style="font-family: system-ui, sans-serif; padding: 32px;">
  <header style="display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #111; padding-bottom: 12px;">
    <div>
      <h1 style="margin: 0; font-size: 24px;">QUOTE {{job.number}}</h1>
      <p style="margin: 4px 0; color: #6b7280;">Issued {{date.today}}</p>
    </div>
    <div style="text-align: right;">
      <strong>{{tenant.name}}</strong><br />
      {{tenant.address}}<br />
      {{tenant.phone}}
    </div>
  </header>
  <section style="margin-top: 24px;">
    <h2 style="font-size: 14px; text-transform: uppercase; color: #6b7280;">Bill to</h2>
    <p style="margin: 4px 0;">{{customer.name}}<br />{{customer.contactName}} · {{customer.email}}</p>
  </section>
  <section style="margin-top: 24px;">
    <h2 style="font-size: 14px; text-transform: uppercase; color: #6b7280;">Line items</h2>
    <ul style="line-height: 1.7; margin: 0; padding-left: 16px;">
      {{job.lineItems}}
    </ul>
  </section>
  <table style="margin-top: 24px; width: 100%; max-width: 320px; margin-left: auto; border-top: 1px solid #e5e7eb;">
    <tr><td style="padding: 4px 0; color: #6b7280;">Subtotal</td><td style="text-align: right;">{{job.subtotal}}</td></tr>
    <tr><td style="padding: 4px 0; color: #6b7280;">Tax</td><td style="text-align: right;">{{job.tax}}</td></tr>
    <tr><td style="padding: 8px 0; font-weight: 600; border-top: 1px solid #111;">Total</td><td style="padding: 8px 0; text-align: right; font-weight: 600; border-top: 1px solid #111;">{{job.total}}</td></tr>
  </table>
</div>`.trim(),
      variables: ["job.number", "job.subtotal", "job.tax", "job.total", "job.lineItems", "tenant.name", "tenant.address", "tenant.phone", "customer.name", "customer.contactName", "customer.email"],
      tags: ["quote", "pdf", "branded"],
    },
    {
      slug: "default-work-order",
      name: "Default Work Order",
      kind: "WORK_ORDER" as const,
      description: "Shop-floor production sheet with job details + line items + due date.",
      bodyHtml: `
<div style="font-family: system-ui, sans-serif; padding: 24px; border: 2px solid #111;">
  <h1 style="margin: 0; font-size: 22px;">WORK ORDER {{job.number}}</h1>
  <p style="margin: 4px 0;"><strong>Due:</strong> {{job.dueDate}} · <strong>Status:</strong> {{job.status}}</p>
  <p style="margin: 4px 0;"><strong>Customer:</strong> {{customer.name}}</p>
  <hr style="margin: 16px 0;" />
  <h2 style="font-size: 14px; text-transform: uppercase; color: #6b7280;">Production</h2>
  <ul>{{job.lineItems}}</ul>
  <p style="margin-top: 24px; padding: 12px; background: #fef3c7; border-radius: 6px; font-size: 12px;">
    Print this work order with the customer artwork attached.
  </p>
</div>`.trim(),
      variables: ["job.number", "job.dueDate", "job.status", "job.lineItems", "customer.name"],
      tags: ["work-order", "production"],
    },
    {
      slug: "default-invoice",
      name: "Default Invoice",
      kind: "INVOICE" as const,
      description: "Standard invoice with bill-to + line items + tax + total + payment instructions.",
      bodyHtml: `
<div style="font-family: system-ui, sans-serif; padding: 32px;">
  <header style="display: flex; justify-content: space-between; align-items: start; border-bottom: 2px solid #111; padding-bottom: 12px;">
    <div>
      <h1 style="margin: 0; font-size: 24px;">INVOICE {{job.number}}</h1>
      <p style="margin: 4px 0; color: #6b7280;">Date {{date.today}}</p>
    </div>
    <div style="text-align: right;">
      <strong>{{tenant.name}}</strong><br />{{tenant.address}}
    </div>
  </header>
  <section style="margin-top: 24px;">
    <h2 style="font-size: 14px; text-transform: uppercase; color: #6b7280;">Bill to</h2>
    <p>{{customer.name}}<br />{{customer.email}}</p>
  </section>
  <table style="margin-top: 24px; width: 100%; max-width: 320px; margin-left: auto;">
    <tr><td style="color: #6b7280;">Subtotal</td><td style="text-align: right;">{{job.subtotal}}</td></tr>
    <tr><td style="color: #6b7280;">Tax</td><td style="text-align: right;">{{job.tax}}</td></tr>
    <tr><td style="padding-top: 8px; border-top: 1px solid #111; font-weight: 700;">Total due</td><td style="padding-top: 8px; border-top: 1px solid #111; text-align: right; font-weight: 700;">{{job.total}}</td></tr>
  </table>
  <p style="margin-top: 24px; color: #6b7280; font-size: 12px;">
    Thank you for your business.
  </p>
</div>`.trim(),
      variables: ["job.number", "job.subtotal", "job.tax", "job.total", "tenant.name", "tenant.address", "customer.name", "customer.email", "date.today"],
      tags: ["invoice", "pdf"],
    },
    {
      slug: "default-proof-email",
      name: "Default Proof Approval Email",
      kind: "PROOF_EMAIL" as const,
      description: "Email template for sending artwork proofs with an approve/reject CTA.",
      subject: "Your proof for {{job.title}} is ready",
      bodyHtml: `
<p>Hi {{customer.contactName}},</p>
<p>Your proof for <strong>{{job.title}}</strong> is ready for review. Please approve or request changes by clicking the link below.</p>
<p style="text-align: center; margin: 24px 0;">
  <a href="{{cta.url}}" style="display: inline-block; padding: 10px 18px; background: #111; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">{{cta.label}}</a>
</p>
<p style="color: #6b7280; font-size: 12px;">This proof link expires {{proof.expiresAt}}.</p>
<p>— {{tenant.name}}</p>`.trim(),
      bodyText: `Hi {{customer.contactName}},

Your proof for {{job.title}} is ready: {{cta.url}}

This proof link expires {{proof.expiresAt}}.

— {{tenant.name}}`,
      variables: ["customer.contactName", "job.title", "cta.url", "cta.label", "proof.expiresAt", "tenant.name"],
      tags: ["email", "proof", "transactional"],
    },
    {
      slug: "customer-status-update",
      name: "Customer Status Update",
      kind: "CUSTOMER_EMAIL" as const,
      description: "Generic transactional email for job-status updates (DRAFT — not yet published).",
      subject: "Update on your order {{job.number}}",
      bodyHtml: `
<p>Hi {{customer.contactName}},</p>
<p>Quick update on your order <strong>{{job.title}}</strong> (#{{job.number}}):</p>
<p><strong>Status:</strong> {{job.status}}<br /><strong>Due:</strong> {{job.dueDate}}</p>
<p>Reply to this email if you have any questions.</p>
<p>— {{tenant.name}}</p>`.trim(),
      variables: ["customer.contactName", "job.number", "job.title", "job.status", "job.dueDate", "tenant.name"],
      tags: ["email", "status-update"],
      // DRAFT to demo the pill variation
    },
  ];

  for (const t of seeds) {
    const isDraft = t.slug === "customer-status-update";
    await db.industryTemplate.create({
      data: {
        slug: t.slug,
        name: t.name,
        description: t.description ?? null,
        kind: t.kind,
        subject: "subject" in t ? (t.subject ?? null) : null,
        bodyHtml: t.bodyHtml,
        bodyText: "bodyText" in t ? (t.bodyText ?? null) : null,
        thumbnailUrl: "thumbnailUrl" in t ? (t.thumbnailUrl ?? null) : null,
        variables: t.variables ?? [],
        tags: t.tags ?? [],
        locale: "en",
        status: isDraft ? "DRAFT" : "PUBLISHED",
        publishedAt: isDraft ? null : new Date(Date.now() - 14 * day),
        createdById: adminId,
      },
    });
    console.log(`  ✓ ${t.slug} (${t.kind}, ${isDraft ? "DRAFT" : "PUBLISHED"})`);
  }
}

async function summary() {
  const [templates, versions] = await Promise.all([
    db.industryTemplate.count(),
    db.industryTemplateVersion.count(),
  ]);
  console.log("\n── Summary ──");
  console.log(`  industry templates: ${templates}, versions: ${versions}`);
}

async function main() {
  const adminId = await pickAdminId();
  await seed(adminId);
  await summary();
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
