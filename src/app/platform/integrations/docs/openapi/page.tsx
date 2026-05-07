// Page 47 — OpenAPI sub-page (/openapi).
//
// Upload OpenAPI 3.1 YAML/JSON, run schema validation, diff vs the
// previous spec, generate per-endpoint docs scaffolding, and toggle
// auto-publish.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadOpenApiSpecs,
  type OpenApiSpecRow,
} from "@/server/platform/developer-docs";
import {
  uploadOpenApiSpec,
  publishOpenApiSpec,
} from "@/app/actions/platform-developer-docs";
import { FormError, FormOk, Field, relativeFromNow } from "../_shared";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

export default async function OpenApiPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const canWrite = ctx.can("docs.write");
  const canPublish = ctx.can("docs.publish");

  const { rows, current } = await loadOpenApiSpecs();

  return (
    <div className="space-y-5">
      <Header />
      {ok && <FormOk msg={ok} />}
      {error && <FormError msg={error} />}

      <CurrentSpecCard current={current} canPublish={canPublish} />

      {canWrite && <UploadForm />}

      <SpecsList rows={rows} canPublish={canPublish} />
    </div>
  );
}

function Header() {
  return (
    <div>
      <nav className="text-[11px]" aria-label="Breadcrumbs">
        <Link href="/platform/integrations" className="ts-focus underline" style={{ color: "var(--text-muted)" }}>
          Integrations Catalog
        </Link>
        <span className="mx-1.5" style={{ color: "var(--text-faint)" }}>/</span>
        <Link href="/platform/integrations/docs" className="ts-focus underline" style={{ color: "var(--text-muted)" }}>
          Developer Documentation
        </Link>
        <span className="mx-1.5" style={{ color: "var(--text-faint)" }}>/</span>
        <span style={{ color: "var(--text-default)" }}>OpenAPI</span>
      </nav>
      <h1 className="mt-1 text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
        OpenAPI Reference
      </h1>
      <p className="mt-1 max-w-3xl text-[12px]" style={{ color: "var(--text-muted)" }}>
        Upload OpenAPI 3.1 YAML or JSON specs. Each upload is validated, diff'd against the previous
        version, and can be published to the public docs site (or set to auto-publish on upload).
      </p>
    </div>
  );
}

function CurrentSpecCard({ current, canPublish }: { current: OpenApiSpecRow | null; canPublish: boolean }) {
  if (!current) {
    return (
      <div className="rounded-lg border p-3 text-center"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          No published OpenAPI spec yet. Upload one below to publish.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border p-3 space-y-2"
         style={{ background: "var(--success-surface)", borderColor: "var(--emerald-200)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--success-fg)" }}>
            Currently published
          </span>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            v{current.version}
            <span className="ml-2 text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>
              {current.format.toUpperCase()} · {(current.byteSize / 1024).toFixed(1)} KB
            </span>
          </h2>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Published {relativeFromNow(current.publishedAt)}
            {current.uploadedByName && ` by ${current.uploadedByName}`}
          </p>
        </div>
        {canPublish && current.autoPublish && (
          <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
            auto-publish on upload
          </span>
        )}
      </div>
    </div>
  );
}

function UploadForm() {
  return (
    <details className="rounded-lg border p-3"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        + Upload OpenAPI 3.1 spec
      </summary>
      <form action={uploadOpenApiSpec} className="mt-2 space-y-2">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Field label="Version (semver, e.g. 2026.05.0)">
            <input type="text" name="version" required maxLength={50}
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Format">
            <select name="format" defaultValue="yaml"
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              <option value="yaml">YAML</option>
              <option value="json">JSON</option>
            </select>
          </Field>
        </div>
        <Field label="Spec body (paste full document)" full>
          <textarea name="body" required rows={12} maxLength={2_000_000}
                    placeholder="openapi: 3.1.0
info:
  title: Flowtora API
  version: 2026.05.0
paths:
  /v1/tenants:
    get:
      summary: List tenants
"
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[11px] font-mono"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-2)" }} />
        </Field>
        <label className="inline-flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" name="autoPublish" className="ts-focus h-4 w-4" />
          Auto-publish if validation passes
        </label>
        <div className="flex justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Upload &amp; validate
          </button>
        </div>
      </form>
    </details>
  );
}

function SpecsList({ rows, canPublish }: { rows: OpenApiSpecRow[]; canPublish: boolean }) {
  return (
    <div className="rounded-lg border overflow-x-auto"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <h2 className="px-3 pt-3 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        Spec history · {rows.length}
      </h2>
      {rows.length === 0 ? (
        <p className="p-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
          No OpenAPI specs uploaded yet.
        </p>
      ) : (
        <table className="mt-2 w-full text-[12px]">
          <thead>
            <tr style={{ color: "var(--text-muted)" }}>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Version</th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Format</th>
              <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Size</th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Validation</th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Published</th>
              <th className="px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide">Uploaded</th>
              {canPublish && <th className="px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                <td className="px-2 py-1.5 font-mono font-semibold" style={{ color: "var(--text-default)" }}>
                  {r.version}
                </td>
                <td className="px-2 py-1.5" style={{ color: "var(--text-muted)" }}>{r.format.toUpperCase()}</td>
                <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: "var(--text-muted)" }}>
                  {(r.byteSize / 1024).toFixed(1)} KB
                </td>
                <td className="px-2 py-1.5">
                  {r.validationErrors.length === 0 ? (
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}>
                      ✓ valid
                    </span>
                  ) : (
                    <details className="inline-block">
                      <summary className="cursor-pointer">
                        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                              style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)" }}>
                          {r.validationErrors.length} error{r.validationErrors.length === 1 ? "" : "s"}
                        </span>
                      </summary>
                      <ul className="mt-1 text-[10px]" style={{ color: "var(--danger-fg)" }}>
                        {r.validationErrors.map((e, i) => <li key={i}>· {e}</li>)}
                      </ul>
                    </details>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {r.publishedAt ? (
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}>
                      ✓ {relativeFromNow(r.publishedAt)}
                    </span>
                  ) : (
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>not published</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {relativeFromNow(r.createdAt)}
                  {r.uploadedByName && (
                    <div className="text-[10px]">{r.uploadedByName}</div>
                  )}
                </td>
                {canPublish && (
                  <td className="px-2 py-1.5">
                    <div className="flex justify-end">
                      {!r.publishedAt && r.validationErrors.length === 0 && (
                        <form action={publishOpenApiSpec}>
                          <input type="hidden" name="version" value={r.version} />
                          <button type="submit"
                                  className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                                  style={{ background: "var(--success-fg)", color: "white" }}>
                            Publish
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
