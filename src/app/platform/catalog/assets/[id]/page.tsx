// Page 30 — Design Asset editor (single-page form).

import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform";
import { Breadcrumb, PageHeader } from "@/components/ui";
import { loadAssetDetail } from "@/server/platform/design-assets";
import {
  archiveDesignAsset,
  duplicateDesignAsset,
  reactivateDesignAsset,
  upsertDesignAsset,
} from "@/app/actions/platform-design-assets";
import {
  DeferredNote,
  KIND_LABEL,
  LICENSE_LABEL,
  StatusPill,
  LicensePill,
} from "../_components/shared";
import type {
  DesignAssetKind,
  DesignAssetLicense,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

const KINDS = Object.keys(KIND_LABEL) as DesignAssetKind[];
const LICENSES = Object.keys(LICENSE_LABEL) as DesignAssetLicense[];

const OK_LABELS: Record<string, string> = {
  saved: "Saved.",
  created: "Asset created.",
  duplicated: "Duplicated.",
  archived: "Archived.",
  reactivated: "Reactivated.",
};

export default async function DesignAssetEditorPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();
  const canManage = ctx.can("plans.manage");

  const detail = await loadAssetDetail(id);
  if (!detail) notFound();

  const okMsg = typeof sp.ok === "string" ? OK_LABELS[sp.ok] ?? "Done." : null;
  const errMsg = typeof sp.error === "string" ? decodeURIComponent(sp.error) : null;

  const sizeLabel = detail.sizeBytes != null
    ? formatSize(detail.sizeBytes)
    : null;

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Catalog", href: "/platform/catalog/products" },
          { label: "Design Asset Library", href: `/platform/catalog/assets?kind=${detail.kind}` },
          { label: detail.name },
        ]} />
        <div className="mt-3">
          <PageHeader
            title={detail.name}
            description={
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {detail.slug}
                </span>
                <StatusPill status={detail.status} />
                <LicensePill license={detail.license} />
                <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {KIND_LABEL[detail.kind]}
                  {detail.format && ` · ${detail.format}`}
                  {sizeLabel && ` · ${sizeLabel}`}
                </span>
              </span>
            }
            actions={canManage ? <ActionRow id={detail.id} status={detail.status} /> : null}
          />
        </div>
      </div>

      {okMsg && (
        <div className="rounded-md border px-3 py-2 text-[12px]"
             style={{ background: "var(--success-surface)", color: "var(--success-fg)", borderColor: "var(--success-fg)" }}>
          {okMsg}
        </div>
      )}
      {errMsg && (
        <div className="rounded-md border px-3 py-2 text-[12px]"
             style={{ background: "var(--danger-surface)", color: "var(--danger-fg)", borderColor: "var(--danger-fg)" }}>
          {errMsg}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
        <form action={upsertDesignAsset} className="space-y-4">
          <input type="hidden" name="id" value={detail.id} />

          <Section title="Identity">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Slug *" name="slug" defaultValue={detail.slug}
                     maxLength={80} disabled={!canManage}
                     hint="Lowercase letters, digits, hyphens or underscores." />
              <Field label="Name *" name="name" defaultValue={detail.name}
                     maxLength={120} disabled={!canManage} />
              <Select label="Kind *" name="kind" defaultValue={detail.kind} disabled={!canManage}
                      options={KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
              <Select label="Status" name="status" defaultValue={detail.status} disabled={!canManage}
                      options={[
                        { value: "ACTIVE", label: "Active" },
                        { value: "ARCHIVED", label: "Archived" },
                      ]} />
              <Field label="Format" name="format" defaultValue={detail.format ?? ""}
                     maxLength={40} disabled={!canManage}
                     placeholder='e.g. "OTF", "SVG", "PNG", "PSD"' />
              <Field label="Size (bytes)" name="sizeBytes" type="number"
                     defaultValue={detail.sizeBytes != null ? String(detail.sizeBytes) : ""}
                     disabled={!canManage} />
              <Field label="Tags (comma-separated)" name="tags"
                     defaultValue={detail.tags.join(", ")} maxLength={500} disabled={!canManage} wide />
              <TextArea label="Description" name="description"
                        defaultValue={detail.description ?? ""} rows={3} maxLength={2000}
                        disabled={!canManage} />
            </div>
          </Section>

          <Section title="Files">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="File URL" name="fileUrl" defaultValue={detail.fileUrl ?? ""}
                     maxLength={500} disabled={!canManage}
                     hint="Direct binary URL — storage SDK upload deferred." />
              <Field label="Thumbnail URL" name="thumbnailUrl" defaultValue={detail.thumbnailUrl ?? ""}
                     maxLength={500} disabled={!canManage}
                     hint="Preview image surfaced on the list card." />
              <TextArea label="Metadata JSON" name="metadataJson"
                        defaultValue={detail.metadata != null ? JSON.stringify(detail.metadata, null, 2) : ""}
                        rows={4} disabled={!canManage} mono
                        hint='Free-form spec metadata — e.g. { "width": 1200, "glyphs": 350 }.' />
            </div>
          </Section>

          {detail.kind === "PALETTE" && (
            <Section title="Palette colors"
                     description="Comma-separated hex codes — order matters for the swatch row.">
              <Field label="Colors" name="paletteColors"
                     defaultValue={detail.paletteColors.join(", ")}
                     maxLength={1000} disabled={!canManage}
                     placeholder='#FF6B6B, #4ECDC4, #45B7D1, #FFA62B'
                     wide />
            </Section>
          )}
          {detail.kind !== "PALETTE" && (
            <input type="hidden" name="paletteColors" value={detail.paletteColors.join(", ")} />
          )}

          <Section title="License">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Select label="License *" name="license" defaultValue={detail.license} disabled={!canManage}
                      options={LICENSES.map((l) => ({ value: l, label: LICENSE_LABEL[l] }))} />
              <Field label="License URL" name="licenseUrl" defaultValue={detail.licenseUrl ?? ""}
                     maxLength={500} disabled={!canManage} />
              <TextArea label="License attribution" name="licenseAttribution"
                        defaultValue={detail.licenseAttribution ?? ""}
                        rows={2} maxLength={500} disabled={!canManage}
                        hint='e.g. "© Foundry Co. — used under commercial license #12345"' />
            </div>
          </Section>

          <Section title="Plan-tier gate"
                   description="Comma-separated plan slugs. Empty = available to all plans.">
            <Field label="Allowed plan slugs" name="allowedPlanSlugs"
                   defaultValue={detail.allowedPlanSlugs.join(", ")}
                   maxLength={500} disabled={!canManage}
                   placeholder="professional, enterprise"
                   wide />
          </Section>

          <Section title="Internal">
            <TextArea label="Internal notes" name="internalNotes"
                      defaultValue={detail.internalNotes ?? ""} rows={3} maxLength={2000}
                      disabled={!canManage}
                      hint="Never customer-facing — visible to platform staff only." />
          </Section>

          {canManage && (
            <div className="flex items-end justify-end">
              <button type="submit"
                      className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                      style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
                Save asset
              </button>
            </div>
          )}

          <DeferredNote>
            <strong>Direct binary upload + license-doc attestation are deferred.</strong> File
            URL today is a free-form HTTPS link; the upload widget + signed-URL flow ships when
            the storage SDK is wired. Per-tenant usage tracking + license-doc PDF storage land
            with the same pass.
          </DeferredNote>
        </form>

        <aside className="space-y-4">
          <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
              <h2 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
                Preview
              </h2>
            </div>
            <div className="p-4">
              <PreviewBlock detail={detail} />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function ActionRow({ id, status }: { id: string; status: "ACTIVE" | "ARCHIVED" }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={duplicateDesignAsset.bind(null, id)}>
        <button type="submit"
                className="ts-focus rounded-md border px-3 py-1.5 text-[12px] font-medium"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}>
          Duplicate
        </button>
      </form>
      {status === "ACTIVE" ? (
        <form action={archiveDesignAsset.bind(null, id)}>
          <button type="submit"
                  className="ts-focus rounded-md border px-3 py-1.5 text-[12px] font-medium"
                  style={{ borderColor: "var(--border-subtle)", color: "var(--danger-fg)", background: "var(--surface-1)" }}>
            Archive
          </button>
        </form>
      ) : (
        <form action={reactivateDesignAsset.bind(null, id)}>
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Reactivate
          </button>
        </form>
      )}
    </div>
  );
}

function PreviewBlock({ detail }: { detail: { kind: DesignAssetKind; thumbnailUrl: string | null; paletteColors: string[]; name: string } }) {
  if (detail.kind === "PALETTE" && detail.paletteColors.length > 0) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-1 overflow-hidden rounded-md border"
             style={{ borderColor: "var(--border-subtle)" }}>
          {detail.paletteColors.map((c, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2"
                 style={{ background: c, color: contrastColor(c) }}>
              <span className="font-mono text-[11px]">{c}</span>
              <span className="text-[10px]">#{i + 1}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (detail.thumbnailUrl) {
    return (
      <div className="overflow-hidden rounded-md border"
           style={{ borderColor: "var(--border-subtle)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={detail.thumbnailUrl} alt={detail.name}
             className="block w-full object-cover" />
      </div>
    );
  }
  return (
    <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
      No preview yet. Add a <strong>Thumbnail URL</strong> to render it here.
    </p>
  );
}

function contrastColor(hex: string): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return "white";
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  // YIQ luminance — black if light bg, white if dark.
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? "#111" : "white";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
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
  label, name, type = "text", defaultValue, maxLength, disabled, hint, placeholder, wide,
}: {
  label: string; name: string; type?: string;
  defaultValue?: string; maxLength?: number; disabled?: boolean;
  hint?: string; placeholder?: string; wide?: boolean;
}) {
  return (
    <label className={"block " + (wide ? "md:col-span-2" : "")}>
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input type={type} name={name} defaultValue={defaultValue}
             maxLength={maxLength} disabled={disabled} placeholder={placeholder}
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
    <label className="block md:col-span-2">
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
