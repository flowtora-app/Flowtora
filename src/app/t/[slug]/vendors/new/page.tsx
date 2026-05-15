import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { Card, CardHeader } from "@/components/Card";
import { Field, TextArea, Button } from "@/components/Field";
import { createVendor } from "@/app/actions/vendors";

export default async function NewVendorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  await requirePermission(slug, "vendors:manage");

  const action = createVendor.bind(null, slug);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div style={{ fontSize: 12 }}>
        <Link
          href={`/t/${slug}/vendors`}
          className="ts-focus inline-flex items-center gap-1 transition-colors hover:text-[var(--text-default)]"
          style={{ color: "var(--text-muted)" }}
        >
          ← Vendors
        </Link>
      </div>

      <header
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "18px 22px",
          background:
            "radial-gradient(720px circle at -8% -40%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 10,
              background:
                "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
              color: "var(--accent-primary)",
              border:
                "1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)",
              flexShrink: 0,
              boxShadow:
                "inset 0 1px 0 0 color-mix(in oklab, white 6%, transparent)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 21V8l9-5 9 5v13" />
              <path d="M9 22V12h6v10" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h1
              className="font-semibold"
              style={{
                color: "var(--text-default)",
                fontSize: 22,
                letterSpacing: "-0.018em",
                lineHeight: 1.2,
              }}
            >
              New vendor
            </h1>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              Suppliers, subcontractors, utilities — anyone you pay.
            </p>
          </div>
        </div>
      </header>

      <Card>
        <form action={action} className="space-y-4 px-5 py-5">
          {sp.error && (
            <div
              className="rounded-lg px-3.5 py-2.5"
              style={{
                background: "color-mix(in oklab, var(--rose-500) 14%, transparent)",
                color: "var(--danger-fg, var(--rose-500))",
                border:
                  "1px solid color-mix(in oklab, var(--rose-500) 30%, transparent)",
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
              {sp.error}
            </div>
          )}
          <Field label="Name" name="name" required placeholder="Acme Signs Supply" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Category" name="category" placeholder="Vinyl supplier" />
            <Field label="Primary contact" name="contact" placeholder="Pat Rivera" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email" name="email" type="email" />
            <Field label="Phone" name="phone" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Website" name="website" placeholder="https://…" />
            <Field label="Account # with vendor" name="accountNumber" />
          </div>
          <Field label="Address line 1" name="addressLine1" />
          <Field label="Address line 2" name="addressLine2" />
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="City" name="city" />
            <Field label="Region / state" name="region" />
            <Field label="Postal code" name="postalCode" />
          </div>
          <Field label="Country" name="country" />
          <TextArea label="Notes" name="notes" rows={3} placeholder="Net 30, delivery windows, etc." />
          <div className="flex items-center gap-2">
            <Button type="submit">Create vendor</Button>
            <Link href={`/t/${slug}/vendors`} className="text-sm" style={{ color: "var(--muted)" }}>
              Cancel
            </Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
