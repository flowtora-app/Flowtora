import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Field, SelectField, Button } from "@/components/Field";
import { createQuote } from "@/app/actions/quotes";
import { createQuoteFromTemplate } from "@/app/actions/quote-templates";
import { listActiveMembers } from "@/lib/members";

export default async function NewQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; customerId?: string; templateId?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "quotes:manage");

  const [customers, members, templates] = await Promise.all([
    db.customer.findMany({
      where: { tenantId: ctx.tenant.id, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    listActiveMembers(ctx.tenant.id),
    // Phase 9 Slice D — active templates only. Archived ones stay around
    // for reference but shouldn't appear in the new-quote picker.
    db.quoteTemplate.findMany({
      where:   { tenantId: ctx.tenant.id, active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        _count: { select: { items: true } },
      },
    }),
  ]);

  const action = createQuote.bind(null, slug);
  const fromTemplateAction = createQuoteFromTemplate.bind(null, slug);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="text-sm">
        <Link href={`/t/${slug}/quotes`} className="underline" style={{ color: "var(--muted)" }}>
          ← Quotes
        </Link>
      </div>

      {sp.error && (
        <div className="rounded-md px-3 py-2 text-sm" style={{ background: "#3a1517", color: "#ff8b8b", border: "1px solid #5b2024" }}>
          {sp.error}
        </div>
      )}

      {/* Phase 9 Slice D — From-template shortcut. Only rendered when at
          least one active template exists, so newcomer shops aren't shown
          an empty picker they can't use yet. */}
      {templates.length > 0 && (
        <Card>
          <CardHeader
            title="Start from a template"
            description="Prefills sections, line items, discount, deposit, and customer-facing copy. You can still edit everything afterwards."
          />
          <form action={fromTemplateAction} className="space-y-4 px-5 py-5">
            <SelectField
              label="Template"
              name="templateId"
              required
              defaultValue={sp.templateId ?? ""}
              options={[
                { value: "", label: "— Choose a template —" },
                ...templates.map((t) => ({
                  value: t.id,
                  label: `${t.name} (${t._count.items} line${t._count.items === 1 ? "" : "s"})`,
                })),
              ]}
            />
            <SelectField
              label="Customer"
              name="customerId"
              required
              defaultValue={sp.customerId ?? ""}
              options={[
                { value: "", label: "— Choose a customer —" },
                ...customers.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <Field
              label="Expires in (days)"
              name="expiresInDays"
              type="number"
              min="0"
              defaultValue="30"
              hint="Leave blank for no expiration."
            />
            <Button type="submit">Create from template</Button>
          </form>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Blank quote"
          description="Start from scratch — pick a customer and the quote opens in draft so you can add line items."
        />
        <form action={action} className="space-y-4 px-5 py-5">
          <SelectField
            label="Customer"
            name="customerId"
            required
            defaultValue={sp.customerId ?? ""}
            options={[
              { value: "", label: "— Choose a customer —" },
              ...customers.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Sales rep"
              name="salesRepId"
              defaultValue={ctx.userId}
              options={[
                { value: "", label: "Unassigned" },
                ...members.map((m) => ({ value: m.userId, label: m.name })),
              ]}
            />
            <Field
              label="Expires in (days)"
              name="expiresInDays"
              type="number"
              min="0"
              defaultValue="30"
              hint="Leave blank for no expiration."
            />
          </div>
          <Button type="submit">Create draft</Button>
        </form>
      </Card>

      <div className="text-xs" style={{ color: "var(--muted)" }}>
        Want to manage templates?{" "}
        <Link href={`/t/${slug}/quotes/templates`} className="underline">
          Go to templates →
        </Link>
      </div>
    </div>
  );
}
