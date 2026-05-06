// Page 45 — Add new integration form (/new).

import Link from "next/link";
import { requirePlatformPermission } from "@/lib/platform";
import { saveIntegration } from "@/app/actions/platform-integrations-catalog";
import { CATEGORY_LABELS } from "@/server/platform/integrations-catalog";

export const dynamic = "force-dynamic";

export default async function NewIntegrationPage() {
  await requirePlatformPermission("integrations.manage");

  return (
    <div className="space-y-5">
      <nav className="text-[11px]" aria-label="Breadcrumbs">
        <Link href="/platform/integrations" className="ts-focus underline" style={{ color: "var(--text-muted)" }}>
          Integrations Catalog
        </Link>
        <span className="mx-1.5" style={{ color: "var(--text-faint)" }}>/</span>
        <span style={{ color: "var(--text-default)" }}>New integration</span>
      </nav>

      <div>
        <h1 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
          Add integration
        </h1>
        <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
          Create a new catalog entry. After saving you can fill in OAuth scopes, capabilities,
          field mappings, and webhook events from the detail page.
        </p>
      </div>

      <form action={saveIntegration}
            className="rounded-lg border p-4 space-y-3"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Field label="Slug (URL key)">
            <input type="text" name="slug" required pattern="[a-z0-9-]+" maxLength={80}
                   placeholder="quickbooks-online"
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Display name">
            <input type="text" name="name" required maxLength={120}
                   placeholder="QuickBooks Online"
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Category">
            <select name="category" required defaultValue="OTHER"
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              {(Object.keys(CATEGORY_LABELS) as Array<keyof typeof CATEGORY_LABELS>).map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" defaultValue="COMING_SOON"
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              <option value="ACTIVE">Active</option>
              <option value="BETA">Beta</option>
              <option value="COMING_SOON">Coming soon</option>
              <option value="INTERNAL_ONLY">Internal only</option>
            </select>
          </Field>
          <Field label="Auth type">
            <select name="authType" defaultValue="OAUTH2"
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              <option value="OAUTH2">OAuth 2.0</option>
              <option value="API_KEY">API key</option>
              <option value="BASIC_AUTH">Basic auth</option>
              <option value="SAML">SAML</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </Field>
          <Field label="Default version">
            <input type="text" name="defaultVersion" defaultValue="1.0.0" maxLength={50}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Logo URL">
            <input type="url" name="logoUrl" maxLength={500}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Vendor URL">
            <input type="url" name="vendorUrl" maxLength={500}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Regions (comma-separated)">
            <input type="text" name="regions" defaultValue="GLOBAL" maxLength={200}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Available plans (comma-separated)">
            <input type="text" name="availablePlans" maxLength={500}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
        </div>

        <Field label="Short description (one line, max 140 chars)" full>
          <input type="text" name="shortDescription" required maxLength={140}
                 className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                 style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>
        <Field label="Long description (markdown)" full>
          <textarea name="description" required rows={5} maxLength={20_000}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
        </Field>

        <div className="flex items-center justify-between">
          <Link href="/platform/integrations"
                className="text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>
            Cancel
          </Link>
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Create integration
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? "md:col-span-2" : ""}`}>
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}
