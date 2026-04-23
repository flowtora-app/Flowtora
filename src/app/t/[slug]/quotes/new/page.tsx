import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Field, SelectField, Button } from "@/components/Field";
import { createQuote } from "@/app/actions/quotes";
import { createQuoteFromTemplate } from "@/app/actions/quote-templates";
import { listActiveMembers } from "@/lib/members";
import {
  CustomerPicker,
  type CustomerOption,
} from "@/components/quotes/CustomerPicker";

// Modes — `fresh` = blank quote, `template` = start from a saved template.
// Carried in the URL so a refresh / deep link keeps the user on the right
// form. Templates are only offered when at least one exists.
type Mode = "fresh" | "template";

export default async function NewQuotePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    error?: string;
    customerId?: string;
    templateId?: string;
    mode?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "quotes:manage");

  const [customers, members, templates] = await Promise.all([
    db.customer.findMany({
      where: { tenantId: ctx.tenant.id, status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true },
    }),
    listActiveMembers(ctx.tenant.id),
    db.quoteTemplate.findMany({
      where: { tenantId: ctx.tenant.id, active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        description: true,
        _count: { select: { items: true } },
      },
    }),
  ]);

  const hasTemplates = templates.length > 0;
  const requestedMode = sp.mode === "template" && hasTemplates ? "template" : "fresh";
  const mode: Mode = requestedMode;

  const action = createQuote.bind(null, slug);
  const fromTemplateAction = createQuoteFromTemplate.bind(null, slug);
  const customerOptions: CustomerOption[] = customers;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <Link
          href={`/t/${slug}/quotes`}
          className="text-sm underline"
          style={{ color: "var(--text-muted)" }}
        >
          ← Back to quotes
        </Link>
        <Link
          href={`/t/${slug}/quotes/templates`}
          className="text-xs underline"
          style={{ color: "var(--text-muted)" }}
        >
          Manage templates →
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">New quote</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Pick a customer to start a draft. You'll add line items, terms, and
          send it for approval from the detail page.
        </p>
      </div>

      {sp.error && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-border)",
          }}
        >
          {sp.error}
        </div>
      )}

      {hasTemplates && <ModeTabs slug={slug} mode={mode} />}

      {mode === "template" ? (
        <Card>
          <CardHeader
            title="From template"
            description="Prefills sections, line items, discount, deposit, and customer copy. Everything is still editable afterwards."
          />
          <form action={fromTemplateAction} className="space-y-5 px-5 py-5">
            <SectionHeader
              step={1}
              title="Pick a template"
              description="The shell of the quote — everything above the customer-specific details."
            />
            <TemplatePicker templates={templates} defaultId={sp.templateId} />

            <SectionHeader
              step={2}
              title="Customer & details"
              description="Who's it for, and when does the offer expire?"
            />
            <CustomerPicker
              name="customerId"
              required
              defaultCustomerId={sp.customerId}
              customers={customerOptions}
            />
            <Field
              label="Expires in (days)"
              name="expiresInDays"
              type="number"
              min="0"
              defaultValue="30"
              hint="Leave blank for no expiration. Most shops set 14-30 days."
            />

            <FormActions slug={slug} submitLabel="Create from template" />
          </form>
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Start fresh"
            description="A blank quote — you'll add line items and terms after."
          />
          <form action={action} className="space-y-5 px-5 py-5">
            <SectionHeader
              step={1}
              title="Customer"
              description="Search by name or email. They have to exist in the CRM first."
            />
            <CustomerPicker
              name="customerId"
              required
              defaultCustomerId={sp.customerId}
              customers={customerOptions}
            />

            <SectionHeader
              step={2}
              title="Quote details"
              description="Defaults you can revise on the quote page."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                hint="Blank = no expiration."
              />
            </div>

            <FormActions slug={slug} submitLabel="Create draft" />
          </form>
        </Card>
      )}
    </div>
  );
}

function ModeTabs({ slug, mode }: { slug: string; mode: Mode }) {
  const tabs: { value: Mode; label: string; hint: string }[] = [
    { value: "fresh", label: "Start fresh", hint: "Blank canvas" },
    { value: "template", label: "From template", hint: "Prefilled starting point" },
  ];
  return (
    <div
      role="tablist"
      className="inline-flex rounded-lg p-1"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {tabs.map((t) => {
        const active = t.value === mode;
        const href =
          t.value === "fresh"
            ? `/t/${slug}/quotes/new`
            : `/t/${slug}/quotes/new?mode=template`;
        return (
          <Link
            key={t.value}
            role="tab"
            aria-selected={active}
            href={href}
            className="ts-focus rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
            style={{
              background: active ? "var(--surface-3)" : "transparent",
              color: active ? "var(--text-default)" : "var(--text-muted)",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

function SectionHeader({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        aria-hidden
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        {step}
      </div>
      <div className="min-w-0">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--text-default)" }}
        >
          {title}
        </h3>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      </div>
    </div>
  );
}

function TemplatePicker({
  templates,
  defaultId,
}: {
  templates: {
    id: string;
    name: string;
    description: string | null;
    _count: { items: number };
  }[];
  defaultId?: string;
}) {
  const initial = defaultId ?? templates[0]?.id ?? "";
  return (
    <div className="space-y-2">
      {templates.map((t) => {
        const id = `tpl-${t.id}`;
        return (
          <label
            key={t.id}
            htmlFor={id}
            className="flex cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 transition-colors"
            style={{
              background: "var(--surface-0)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <input
              id={id}
              type="radio"
              name="templateId"
              value={t.id}
              defaultChecked={t.id === initial}
              required
              className="mt-1"
            />
            <div className="min-w-0 flex-1">
              <div
                className="text-sm font-medium"
                style={{ color: "var(--text-default)" }}
              >
                {t.name}
              </div>
              <div
                className="mt-0.5 text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {t._count.items} line{t._count.items === 1 ? "" : "s"}
                {t.description ? ` · ${t.description}` : ""}
              </div>
            </div>
          </label>
        );
      })}
    </div>
  );
}

function FormActions({
  slug,
  submitLabel,
}: {
  slug: string;
  submitLabel: string;
}) {
  return (
    <div
      className="flex items-center justify-end gap-2 pt-2"
      style={{ borderTop: "1px solid var(--border-subtle)" }}
    >
      <Link
        href={`/t/${slug}/quotes`}
        className="ts-focus rounded-md px-3 py-1.5 text-sm"
        style={{ color: "var(--text-muted)" }}
      >
        Cancel
      </Link>
      <Button type="submit">{submitLabel}</Button>
    </div>
  );
}
