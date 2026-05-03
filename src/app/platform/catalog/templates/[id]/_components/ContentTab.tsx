import { upsertIndustryTemplate } from "@/app/actions/platform-industry-templates";
import type { TemplateDetail } from "@/server/platform/industry-templates";
import { KIND_LABEL, DeferredNote } from "../../_components/shared";
import type { IndustryTemplateKind } from "@prisma/client";
import { SAMPLE_DATA } from "@/lib/industry-template-render";

const KINDS = Object.keys(KIND_LABEL) as IndustryTemplateKind[];

const COMMON_VARS = [
  "tenant.name", "tenant.address", "tenant.phone", "tenant.email", "tenant.website", "tenant.logoUrl",
  "customer.name", "customer.contactName", "customer.email", "customer.phone", "customer.address",
  "job.number", "job.title", "job.status", "job.dueDate",
  "job.subtotal", "job.tax", "job.total", "job.lineItems",
  "proof.url", "proof.expiresAt",
  "cta.label", "cta.url",
  "date.today", "date.year",
];

export function ContentTab({
  detail, canManage,
}: {
  detail: TemplateDetail;
  canManage: boolean;
}) {
  const isEmail = detail.kind === "PROOF_EMAIL" || detail.kind === "CUSTOMER_EMAIL";
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
      <form action={upsertIndustryTemplate} className="space-y-4">
        <input type="hidden" name="id" value={detail.id} />

        <Section title="Identity">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Slug *" name="slug" defaultValue={detail.slug} maxLength={80} disabled={!canManage} />
            <Field label="Name *" name="name" defaultValue={detail.name} maxLength={120} disabled={!canManage} />
            <Select label="Kind *" name="kind" defaultValue={detail.kind} disabled={!canManage}
                    options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
            <Select label="Status" name="status" defaultValue={detail.status} disabled={!canManage}
                    options={[
                      { value: "DRAFT", label: "Draft" },
                      { value: "PUBLISHED", label: "Published" },
                      { value: "ARCHIVED", label: "Archived" },
                    ]} />
            <Field label="Locale" name="locale" defaultValue={detail.locale} maxLength={10} disabled={!canManage}
                   hint="ISO locale — multi-language UI is deferred." />
            <Field label="Thumbnail URL" name="thumbnailUrl" defaultValue={detail.thumbnailUrl ?? ""}
                   maxLength={500} disabled={!canManage}
                   hint="Image surfaced on the list card." />
            <Field label="Tags (comma-separated)" name="tags" defaultValue={detail.tags.join(", ")}
                   maxLength={500} disabled={!canManage} wide />
            <TextArea label="Description" name="description" rows={2}
                      defaultValue={detail.description ?? ""} maxLength={2000} disabled={!canManage} />
          </div>
        </Section>

        {isEmail && (
          <Section title="Email subject">
            <Field label="Subject" name="subject" defaultValue={detail.subject ?? ""}
                   maxLength={200} disabled={!canManage}
                   hint="Supports the same {{variable}} placeholders." wide />
          </Section>
        )}
        {!isEmail && <input type="hidden" name="subject" value={detail.subject ?? ""} />}

        <Section title="Body (HTML)" description="The primary content. Variables fill at render time.">
          <TextArea label="HTML body *" name="bodyHtml" rows={18}
                    defaultValue={detail.bodyHtml} disabled={!canManage} mono />
        </Section>

        <Section title="Plain-text fallback" description="Used by email clients that don't render HTML.">
          <TextArea label="Plain text body" name="bodyText" rows={6}
                    defaultValue={detail.bodyText ?? ""} disabled={!canManage} mono />
        </Section>

        <Section title="Variables hint" description="Comma-separated list of variables used by this template (for editor reference).">
          <Field label="Declared variables" name="variables"
                 defaultValue={detail.variables.join(", ")}
                 maxLength={1000} disabled={!canManage} wide
                 hint="e.g. tenant.name, customer.email, job.lineItems" />
        </Section>

        <Section title="Internal">
          <TextArea label="Internal notes" name="internalNotes"
                    defaultValue={detail.internalNotes ?? ""} rows={3} maxLength={2000} disabled={!canManage}
                    hint="Never customer-facing." />
        </Section>

        {canManage && (
          <div className="flex items-end justify-end">
            <button type="submit"
                    className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
              Save content
            </button>
          </div>
        )}

        <DeferredNote>
          <strong>WYSIWYG editor + multi-language variants are deferred.</strong> The textarea
          here authors raw HTML — preview tab renders it against sample data so you can see the
          output. The Monaco-style HTML editor + locale-variant pairing ships with the next
          catalog pass.
        </DeferredNote>
      </form>

      <aside className="space-y-4">
        <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <h2 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
              Variable browser
            </h2>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Reference list of common placeholders. Click to copy.
            </p>
          </div>
          <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {COMMON_VARS.map((v) => (
              <li key={v} className="flex items-baseline justify-between gap-3 px-4 py-2">
                <code className="font-mono text-[11px]" style={{ color: "var(--text-default)" }}>
                  {`{{${v}}}`}
                </code>
                <span className="font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                  {previewSample(v)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}

function previewSample(path: string): string {
  const parts = path.split(".");
  let cur: unknown = SAMPLE_DATA;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return "";
    cur = (cur as Record<string, unknown>)[p];
  }
  if (cur == null) return "";
  if (Array.isArray(cur)) return `${cur.length} item${cur.length === 1 ? "" : "s"}`;
  const s = String(cur);
  return s.length > 28 ? `${s.slice(0, 28)}…` : s;
}

function Section({
  title, description, children,
}: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>{title}</h2>
        {description && (
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({
  label, name, defaultValue, maxLength, disabled, hint, wide,
}: {
  label: string; name: string; defaultValue?: string;
  maxLength?: number; disabled?: boolean; hint?: string; wide?: boolean;
}) {
  return (
    <label className={"block " + (wide ? "md:col-span-2" : "")}>
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input type="text" name={name} defaultValue={defaultValue}
             maxLength={maxLength} disabled={disabled}
             className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      {hint && <span className="mt-1 block text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );
}

function TextArea({
  label, name, defaultValue, rows = 3, maxLength, disabled, hint, mono,
}: {
  label: string; name: string; defaultValue?: string; rows?: number;
  maxLength?: number; disabled?: boolean; hint?: string; mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <textarea name={name} defaultValue={defaultValue} rows={rows} maxLength={maxLength} disabled={disabled}
                className={"ts-focus mt-1 w-full rounded-md border px-3 py-2 " + (mono ? "font-mono text-[12px]" : "text-[13px]")}
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
      {hint && <span className="mt-1 block text-[11px]" style={{ color: "var(--text-muted)" }}>{hint}</span>}
    </label>
  );
}

function Select({
  label, name, defaultValue, disabled, options,
}: {
  label: string; name: string; defaultValue?: string; disabled?: boolean;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <select name={name} defaultValue={defaultValue} disabled={disabled}
              className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
