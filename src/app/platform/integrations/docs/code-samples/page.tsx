// Page 47 — Code Sample Manager.
//
// Per-(endpoint, language) snippets. Lint runs on save; sandbox-test
// hook is reserved for a future slice.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadCodeSamples,
  SUPPORTED_LANGUAGES,
  languageLabel,
  type CodeSampleRow,
} from "@/server/platform/developer-docs";
import {
  saveCodeSample,
  deleteCodeSample,
} from "@/app/actions/platform-developer-docs";
import { FormError, FormOk, Field, relativeFromNow } from "../_shared";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

export default async function CodeSamplesPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const filterEndpoint = asString(sp.endpoint);
  const filterLang = asString(sp.lang);
  const canWrite = ctx.can("docs.write");

  const samples = await loadCodeSamples({
    endpointKey: filterEndpoint,
    language: filterLang,
  });

  // Group by endpoint
  const byEndpoint = new Map<string, CodeSampleRow[]>();
  for (const s of samples) {
    const list = byEndpoint.get(s.endpointKey) ?? [];
    list.push(s);
    byEndpoint.set(s.endpointKey, list);
  }

  const endpoints = Array.from(new Set(samples.map((s) => s.endpointKey))).sort();

  return (
    <div className="space-y-5">
      <Header />
      {ok && <FormOk msg={ok} />}
      {error && <FormError msg={error} />}

      <Filters endpoints={endpoints} filterEndpoint={filterEndpoint} filterLang={filterLang} />

      {canWrite && <NewSampleForm />}

      <div className="rounded-lg border p-3 space-y-3"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
          Snippets · {samples.length} across {byEndpoint.size} endpoints
        </h2>
        {samples.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            No code samples match. Add one above.
          </p>
        ) : (
          <ul className="space-y-3">
            {Array.from(byEndpoint.entries()).map(([endpoint, list]) => (
              <li key={endpoint} className="rounded-md border p-2"
                  style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="text-[12px] font-semibold"
                        style={{ color: "var(--text-default)" }}>
                    {endpoint}
                  </code>
                  <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {list.length} of {SUPPORTED_LANGUAGES.length} languages
                  </span>
                </div>
                <ul className="mt-2 space-y-2">
                  {list.map((s) => (
                    <SampleCard key={s.id} s={s} canWrite={canWrite} />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
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
        <span style={{ color: "var(--text-default)" }}>Code Samples</span>
      </nav>
      <h1 className="mt-1 text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
        Code Sample Manager
      </h1>
      <p className="mt-1 max-w-3xl text-[12px]" style={{ color: "var(--text-muted)" }}>
        Per-endpoint snippets in {SUPPORTED_LANGUAGES.length} languages.
        Lint runs on save; sandbox-test hook ships in a follow-up slice.
      </p>
    </div>
  );
}

function Filters({
  endpoints, filterEndpoint, filterLang,
}: { endpoints: string[]; filterEndpoint?: string; filterLang?: string }) {
  return (
    <form className="flex flex-wrap items-center gap-2" method="get">
      <select name="endpoint" defaultValue={filterEndpoint ?? ""}
              className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
              style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
        <option value="">All endpoints</option>
        {endpoints.map((e) => <option key={e} value={e}>{e}</option>)}
      </select>
      <select name="lang" defaultValue={filterLang ?? ""}
              className="ts-focus rounded-md border px-2 py-1.5 text-[12px]"
              style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
        <option value="">All languages</option>
        {SUPPORTED_LANGUAGES.map((l) => <option key={l} value={l}>{languageLabel(l)}</option>)}
      </select>
      <button type="submit"
              className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
              style={{ background: "var(--surface-2)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
        Filter
      </button>
      <Link href="/platform/integrations/docs/code-samples"
            className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}>
        Reset
      </Link>
    </form>
  );
}

function NewSampleForm() {
  return (
    <details className="rounded-lg border p-3"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
        + Add or update sample
      </summary>
      <form action={saveCodeSample} className="mt-2 space-y-2">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <Field label="Endpoint key (e.g. GET /v1/tenants)">
            <input type="text" name="endpointKey" required maxLength={200}
                   placeholder="GET /v1/tenants"
                   className="ts-focus w-full rounded-md border px-2 py-1 text-[12px] font-mono"
                   style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }} />
          </Field>
          <Field label="Language">
            <select name="language" defaultValue="curl"
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[12px]"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-1)" }}>
              {SUPPORTED_LANGUAGES.map((l) => <option key={l} value={l}>{languageLabel(l)}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Snippet body" full>
          <textarea name="body" required rows={8} maxLength={20_000}
                    className="ts-focus w-full rounded-md border px-2 py-1 text-[11px] font-mono"
                    style={{ borderColor: "var(--border-default)", background: "var(--surface-2)" }} />
        </Field>
        <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          Lint will check for placeholder secrets (e.g. <code>your-api-key</code>) and missing
          Authorization headers / SDK imports.
        </p>
        <div className="flex justify-end">
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "white" }}>
            Save snippet
          </button>
        </div>
      </form>
    </details>
  );
}

function SampleCard({ s, canWrite }: { s: CodeSampleRow; canWrite: boolean }) {
  const tone = s.lintStatus === "ok" ? { bg: "var(--success-surface)", fg: "var(--success-fg)", label: "✓ ok" } :
               s.lintStatus === "warnings" ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)", label: "⚠ warnings" } :
               s.lintStatus === "errors" ? { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)", label: "✗ errors" } :
               { bg: "var(--surface-2)", fg: "var(--text-muted)", label: "not linted" };
  return (
    <li className="rounded-md border p-2 space-y-1.5"
        style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
          {languageLabel(s.language)}
        </span>
        <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: tone.bg, color: tone.fg }}>
          {tone.label}
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          edited {relativeFromNow(s.updatedAt)}
        </span>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          · linted {relativeFromNow(s.lintedAt)}
        </span>
        {canWrite && (
          <form action={deleteCodeSample} className="ml-auto">
            <input type="hidden" name="id" value={s.id} />
            <button type="submit"
                    className="ts-focus rounded-md px-2 py-1 text-[10px] font-medium"
                    style={{ background: "var(--rose-50, var(--surface-2))", color: "var(--danger-fg)", border: "1px solid var(--rose-200)" }}>
              Delete
            </button>
          </form>
        )}
      </div>
      {s.lintMessage && (
        <p className="rounded-md border-l-2 px-2 py-1 text-[11px]"
           style={{
             borderColor: s.lintStatus === "errors" ? "var(--rose-200)" : "var(--amber-200)",
             background: s.lintStatus === "errors" ? "var(--rose-50, var(--surface-2))" : "var(--warning-surface)",
             color: s.lintStatus === "errors" ? "var(--danger-fg)" : "var(--warning-fg)",
           }}>
          {s.lintMessage}
        </p>
      )}
      <pre className="rounded-md border p-2 text-[10px] font-mono whitespace-pre-wrap overflow-x-auto"
           style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)", color: "var(--text-default)" }}>
        {s.body}
      </pre>
    </li>
  );
}
