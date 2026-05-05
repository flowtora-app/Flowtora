// Page 38 §Templates — manage LandingPageTemplate rows.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import { db } from "@/lib/db";
import {
  loadTemplates,
} from "@/server/platform/landing-pages";
import {
  createTemplate,
  removeTemplate,
} from "@/app/actions/platform-landing-pages";
import { FormError, FormOk } from "../_components/shared";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("announcement.write");

  const [templates, sourcePages] = await Promise.all([
    loadTemplates(),
    db.landingPage.findMany({
      orderBy: [{ status: "asc" }, { title: "asc" }],
      select: { id: true, title: true, path: true, status: true },
      take: 100,
    }),
  ]);

  return (
    <div className="space-y-5">
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/platform/marketing/landing-pages" className="underline" style={{ color: "var(--text-muted)" }}>
          Landing pages
        </Link>
        <span className="mx-1.5">/</span>
        <span style={{ color: "var(--text-default)" }}>Templates</span>
      </div>

      <h1 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
        Templates
      </h1>
      <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        Reusable block sets new pages start from. Build a polished page first, then save it as a template.
      </p>

      <FormOk msg={sp.ok} />
      <FormError msg={sp.error} />

      {canWrite && (
        <form
          action={createTemplate}
          className="flex flex-col gap-2 rounded-lg border p-4"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
        >
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            New template
          </h2>
          <div className="grid gap-2 md:grid-cols-2">
            <Field label="Name">
              <input name="name" required maxLength={120}
                     className="ts-focus w-full rounded-md px-2 py-1.5 text-[12px] outline-none"
                     style={inputStyle()} />
            </Field>
            <Field label="Category">
              <input name="category" maxLength={40} placeholder="e.g. Pricing / Product / Lead-gen"
                     className="ts-focus w-full rounded-md px-2 py-1.5 text-[12px] outline-none"
                     style={inputStyle()} />
            </Field>
            <Field label="Description">
              <input name="description" maxLength={400}
                     className="ts-focus w-full rounded-md px-2 py-1.5 text-[12px] outline-none"
                     style={inputStyle()} />
            </Field>
            <Field label="Thumbnail URL">
              <input name="thumbnailUrl" maxLength={500}
                     className="ts-focus w-full rounded-md px-2 py-1.5 text-[12px] outline-none"
                     style={inputStyle()} />
            </Field>
          </div>
          <Field label="Copy blocks from page (optional)" help="If empty, the template starts with a hero + CTA pair.">
            <select name="blocksFromPageId" defaultValue=""
                    className="ts-focus w-full rounded-md px-2 py-1.5 text-[12px] outline-none"
                    style={inputStyle()}>
              <option value="">— Default starter —</option>
              {sourcePages.map((p) => (
                <option key={p.id} value={p.id}>{p.path} · {p.title}</option>
              ))}
            </select>
          </Field>
          <div className="flex items-center justify-end">
            <button type="submit"
                    className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-semibold"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
              + Create template
            </button>
          </div>
        </form>
      )}

      {templates.length === 0 ? (
        <div
          className="rounded-lg border p-10 text-center text-[12px]"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
        >
          <div className="mb-1 text-2xl" aria-hidden>🧩</div>
          <div className="font-medium" style={{ color: "var(--text-default)" }}>
            No templates yet.
          </div>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const blockCount = Array.isArray(t.blocks) ? (t.blocks as unknown[]).length : 0;
            return (
              <li
                key={t.id}
                className="overflow-hidden rounded-lg border"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
              >
                {t.thumbnailUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={t.thumbnailUrl} alt={t.name}
                       className="h-32 w-full object-cover"
                       style={{ background: "var(--surface-2)" }} />
                ) : (
                  <div className="flex h-32 items-center justify-center text-[28px]"
                       style={{ background: "var(--surface-2)", color: "var(--text-faint)" }}>
                    🧩
                  </div>
                )}
                <div className="p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
                      {t.name}
                    </h3>
                    {t.category && (
                      <span className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                        {t.category}
                      </span>
                    )}
                  </div>
                  {t.description && (
                    <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {t.description}
                    </p>
                  )}
                  <p className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                    {blockCount} block{blockCount === 1 ? "" : "s"}
                  </p>
                  {canWrite && (
                    <form action={removeTemplate} className="mt-2">
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" className="text-[11px] underline"
                              style={{ color: "var(--danger-fg)" }}>
                        Delete template
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
      {help && <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{help}</span>}
    </label>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-default)",
  };
}
