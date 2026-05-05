// Page 39 §Audiences — saved segment definitions.

import { requirePlatformStaff } from "@/lib/platform";
import { loadAudiences } from "@/server/platform/email-campaigns";
import { upsertAudience, deleteAudience } from "@/app/actions/platform-email-campaigns";
import { TabsBar } from "../_components/TabsBar";
import { FormError, FormOk, relativeFromNow } from "../_components/shared";

export const dynamic = "force-dynamic";

export default async function AudiencesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string }>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("announcement.write");

  const audiences = await loadAudiences();
  const editing = sp.edit && sp.edit !== "__new__"
    ? audiences.find((a) => a.id === sp.edit)
    : null;
  const isCreating = sp.edit === "__new__";

  return (
    <div className="space-y-5">
      <h1 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
        Email campaigns
      </h1>
      <TabsBar active="audiences" />

      <FormOk msg={sp.ok} />
      <FormError msg={sp.error} />

      <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        Saved audience filters reusable across campaigns. Filter shape — paste JSON conforming to{" "}
        <code>SegmentFilter</code>:
      </p>
      <pre className="overflow-auto rounded-md border p-3 font-mono text-[11px]"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
{`{
  "plans": ["GROWTH", "PRO"],
  "tenantStatuses": ["ACTIVE"],
  "tagsAny": ["beta"],
  "regions": ["US-CA"],
  "cohorts": ["BETA"],
  "signupAfter": "2026-01-01",
  "lastLoginAfter": "2026-04-01",
  "memberRoles": ["OWNER", "ADMIN"],
  "limit": 5000
}`}</pre>

      {canWrite && !isCreating && !editing && (
        <a href="?edit=__new__"
           className="ts-focus inline-block rounded-md px-3 py-1.5 text-[12px] font-semibold"
           style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
          + New audience
        </a>
      )}

      {(isCreating || editing) && canWrite && (
        <form action={upsertAudience}
              className="flex flex-col gap-2 rounded-lg border p-4"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <Field label="Name">
            <input name="name" required maxLength={120}
                   defaultValue={editing?.name ?? ""}
                   className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
                   style={inputStyle()} />
          </Field>
          <Field label="Description">
            <input name="description" maxLength={400}
                   defaultValue={editing?.description ?? ""}
                   className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
                   style={inputStyle()} />
          </Field>
          <Field label="Filter (JSON)">
            <textarea name="filterJson" rows={10}
                      defaultValue={editing ? JSON.stringify(editing.filter, null, 2) : "{\n  \"plans\": [\"GROWTH\"],\n  \"memberRoles\": [\"OWNER\"]\n}"}
                      className="ts-focus rounded-md px-3 py-2 font-mono text-[11px] outline-none"
                      style={{ ...inputStyle(), lineHeight: 1.5 }} />
          </Field>
          <div className="flex items-center justify-end gap-2">
            <a href="?" className="text-[11px] underline" style={{ color: "var(--text-muted)" }}>cancel</a>
            <button type="submit"
                    className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-semibold"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
              {editing ? "Save changes" : "Save audience"}
            </button>
          </div>
        </form>
      )}

      {audiences.length === 0 ? (
        <div className="rounded-lg border p-10 text-center text-[12px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          <div className="mb-1 text-2xl" aria-hidden>👥</div>
          <div className="font-medium" style={{ color: "var(--text-default)" }}>No saved audiences yet.</div>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-lg"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}>
          {audiences.map((a, idx) => (
            <li key={a.id}
                className="px-4 py-3"
                style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}>
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <span className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>{a.name}</span>
                  {a.description && (
                    <p className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>{a.description}</p>
                  )}
                  <p className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
                    {a.estimatedSize.toLocaleString()} estimated · last estimated{" "}
                    {a.estimatedAt ? relativeFromNow(a.estimatedAt) : "—"} · updated {relativeFromNow(a.updatedAt)}
                  </p>
                </div>
                {canWrite && (
                  <div className="flex items-center gap-2">
                    <a href={`?edit=${a.id}`}
                       className="ts-focus text-[11px] underline" style={{ color: "var(--accent-primary)" }}>Edit</a>
                    <form action={deleteAudience}>
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit"
                              className="text-[11px] underline" style={{ color: "var(--danger-fg)" }}>Delete</button>
                    </form>
                  </div>
                )}
              </div>
              <details className="mt-2">
                <summary className="cursor-pointer text-[10px]" style={{ color: "var(--text-muted)" }}>view filter JSON</summary>
                <pre className="mt-1 overflow-auto rounded-md border p-2 font-mono text-[11px]"
                     style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
                  {JSON.stringify(a.filter, null, 2)}
                </pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
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
