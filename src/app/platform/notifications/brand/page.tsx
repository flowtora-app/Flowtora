import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/Card";
import { DEFAULT_BRAND, loadBrand, renderTemplate } from "@/lib/notifications";
import { updateBrand } from "@/app/actions/notifications-admin";

// /platform/notifications/brand — singleton brand editor.
//
// Controls the shared chrome every transactional email wears: product
// name, tagline, logo, accent color, button radius, support email,
// footer HTML, and envelope overrides (from-name + reply-to). A single
// Save button persists the row and invalidates the 30-second brand
// cache so live dispatches pick up the change immediately.
//
// A canned sample email is rendered inline as the preview so admins
// can see the accent color + from-name + footer HTML applied to real
// chrome without picking a specific kind.

export const dynamic = "force-dynamic";

type SP = { ok?: string; error?: string };

export default async function NotificationBrandPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;

  const row = await db.notificationBrand.findFirst({
    where: { singleton: true },
  });
  const current = {
    productName:    row?.productName    ?? DEFAULT_BRAND.productName,
    tagline:        row?.tagline        ?? DEFAULT_BRAND.tagline,
    logoUrl:        row?.logoUrl        ?? "",
    accentColor:    row?.accentColor    ?? DEFAULT_BRAND.accentColor,
    buttonRadiusPx: row?.buttonRadiusPx ?? DEFAULT_BRAND.buttonRadiusPx,
    supportEmail:   row?.supportEmail   ?? "",
    footerHtml:     row?.footerHtml     ?? "",
    fromName:       row?.fromName       ?? "",
    replyTo:        row?.replyTo        ?? "",
  };

  // Canned sample — gives the admin a meaningful "what will my emails
  // look like" readout without having to pick an individual kind.
  const brand = await loadBrand();
  const rendered = renderTemplate({
    content: {
      subject:   `A new payment landed at ${brand.productName}`,
      preheader: "This is what your transactional chrome will look like.",
      headline:  "Payment received",
      subheading:"Thanks — we've logged the transaction to your account.",
      body:
        "This preview pulls your current brand settings. Save the form below to see how colour, " +
        "logo, and footer copy render on real emails.\n\n" +
        "You can use `code` spans, **bold**, *italic*, and [links](https://example.com/) in every " +
        "template body.",
      ctaLabel:    "View receipt",
      ctaUrlToken: "https://example.com/receipt",
      footerNote:  "If you have any questions, reply to this email and we'll get back to you.",
    },
    tokens: {
      product_name: brand.productName,
      support_email: brand.supportEmail ?? "",
      current_year: new Date().getFullYear(),
    },
    brand,
  });

  const canWrite = ctx.canWrite;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/platform/notifications"
          className="text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          ← Notifications
        </Link>
        <h1 className="mt-1 text-2xl font-semibold">Brand &amp; envelope</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Shared chrome for every transactional email. Changes apply instantly.
        </p>
      </div>

      {sp.ok && <Banner tone="ok">{sp.ok}</Banner>}
      {sp.error && <Banner tone="error">{sp.error}</Banner>}

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <Card>
          <CardHeader
            title="Brand"
            description="Identity and visual treatment applied to every template."
          />
          <form action={updateBrand} className="space-y-5 px-5 py-5">
            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                label="Product name"
                name="productName"
                defaultValue={current.productName}
                required
                maxLength={80}
                hint="Used in the header, footer, and resolved as {{product_name}}."
                disabled={!canWrite}
              />
              <FormField
                label="From name"
                name="fromName"
                defaultValue={current.fromName}
                maxLength={80}
                hint='Display name on outgoing mail. Blank = "{product name}".'
                disabled={!canWrite}
              />
              <FormField
                label="Tagline"
                name="tagline"
                defaultValue={current.tagline}
                maxLength={200}
                hint="Optional — shown under the logo on a subset of emails."
                disabled={!canWrite}
              />
              <FormField
                label="Logo URL"
                name="logoUrl"
                defaultValue={current.logoUrl}
                maxLength={600}
                hint="Public https:// URL to a PNG or SVG. Served unchanged to email clients."
                disabled={!canWrite}
              />
              <FormField
                label="Accent color"
                name="accentColor"
                defaultValue={current.accentColor}
                required
                maxLength={7}
                hint="6-digit hex, e.g. #4f8cff. Used for buttons and the fallback link."
                disabled={!canWrite}
              />
              <FormField
                label="Button radius (px)"
                name="buttonRadiusPx"
                type="number"
                defaultValue={String(current.buttonRadiusPx)}
                hint="0 for square corners, 24 for full pill. Default 10."
                disabled={!canWrite}
              />
              <FormField
                label="Support email"
                name="supportEmail"
                type="email"
                defaultValue={current.supportEmail}
                maxLength={200}
                hint="Falls through to {{support_email}} and defaults the reply-to header."
                disabled={!canWrite}
              />
              <FormField
                label="Reply-to"
                name="replyTo"
                type="email"
                defaultValue={current.replyTo}
                maxLength={200}
                hint="Override the reply-to header. Blank = support email."
                disabled={!canWrite}
              />
            </div>

            <label className="block">
              <span className="mb-1 block text-sm">Footer HTML</span>
              <textarea
                name="footerHtml"
                defaultValue={current.footerHtml}
                rows={4}
                maxLength={4000}
                disabled={!canWrite}
                className="w-full rounded-md px-3 py-2 text-sm font-mono outline-none"
                style={{
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              />
              <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
                Optional custom block added below the CTA. Inlines safely into the
                email layout — keep it plain (anchors, bold, addresses).
              </span>
            </label>

            {canWrite && (
              <div
                className="flex justify-end pt-2"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <button
                  type="submit"
                  className="mt-4 rounded-md px-4 py-2 text-sm font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
                >
                  Save brand
                </button>
              </div>
            )}
          </form>
        </Card>

        <Card>
          <CardHeader
            title="Preview"
            description="Canned example rendered with the brand settings on record right now."
          />
          <div className="p-5">
            <iframe
              title="Brand preview"
              srcDoc={rendered.html}
              sandbox=""
              style={{
                width: "100%",
                height: 540,
                border: "1px solid var(--border-subtle)",
                borderRadius: 8,
                background: "#ffffff",
              }}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── */

function FormField({
  label,
  hint,
  name,
  defaultValue,
  type = "text",
  required,
  maxLength,
  disabled,
}: {
  label: string;
  hint?: string;
  name: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  maxLength?: number;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        maxLength={maxLength}
        disabled={disabled}
        className="w-full rounded-md px-3 py-2 text-sm outline-none"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          color: "var(--text)",
        }}
      />
      {hint && (
        <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
          {hint}
        </span>
      )}
    </label>
  );
}

function Banner({ tone, children }: { tone: "ok" | "error"; children: React.ReactNode }) {
  const style: React.CSSProperties =
    tone === "ok"
      ? {
          background: "var(--success-surface)",
          color: "var(--success-fg)",
          border: "1px solid var(--success-fg)",
        }
      : {
          background: "var(--danger-surface)",
          color: "var(--danger-fg)",
          border: "1px solid var(--danger-fg)",
        };
  return (
    <div className="rounded-md px-4 py-3 text-sm" style={style}>
      {children}
    </div>
  );
}
