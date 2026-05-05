// Page 40 §Templates — pre-built sequence library.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import { loadSequenceTemplates } from "@/server/platform/sequences";
import {
  seedPrebuiltTemplates,
  removeSequenceTemplate,
  createSequence,
} from "@/app/actions/platform-sequences";
import { TRIGGER_LABEL } from "@/lib/sequence-steps";
import { FormError, FormOk, relativeFromNow } from "../_components/shared";

export const dynamic = "force-dynamic";

export default async function SequenceTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("announcement.write");
  const templates = await loadSequenceTemplates();

  return (
    <div className="space-y-5">
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/platform/marketing/sequences" className="underline" style={{ color: "var(--text-muted)" }}>
          Sequences
        </Link>
        <span className="mx-1.5">/</span>
        <span style={{ color: "var(--text-default)" }}>Templates</span>
      </div>

      <h1 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
        Sequence templates
      </h1>
      <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        Pre-built sequences (Onboarding · Trial conversion · Win-back · Feature adoption · Renewal reminder)
        cloned into a fresh sequence on use. Edit blueprint via lib/sequence-steps.ts.
      </p>

      <FormOk msg={sp.ok} />
      <FormError msg={sp.error} />

      {canWrite && templates.length === 0 && (
        <form action={seedPrebuiltTemplates}>
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-semibold"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
            🌱 Load 5 pre-built templates
          </button>
        </form>
      )}

      {templates.length === 0 ? (
        <div className="rounded-lg border p-10 text-center text-[12px]"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          <div className="mb-1 text-2xl" aria-hidden>🧩</div>
          <div className="font-medium" style={{ color: "var(--text-default)" }}>
            No templates installed yet.
          </div>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const blueprint = Array.isArray(t.blueprint) ? (t.blueprint as { kind: string }[]) : [];
            return (
              <li key={t.id}
                  className="overflow-hidden rounded-lg border"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
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
                  <p className="mt-2 text-[10px]" style={{ color: "var(--text-faint)" }}>
                    Trigger: {TRIGGER_LABEL[t.triggerType]} · {blueprint.length} step{blueprint.length === 1 ? "" : "s"} · added {relativeFromNow(t.createdAt)}
                  </p>
                  {canWrite && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <form action={createSequence}>
                        <input type="hidden" name="name" value={`${t.name} — copy`} />
                        <input type="hidden" name="triggerType" value={t.triggerType} />
                        <input type="hidden" name="templateId" value={t.id} />
                        <button type="submit"
                                className="ts-focus rounded-md px-2 py-1 text-[11px] font-semibold"
                                style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                          Clone into new sequence
                        </button>
                      </form>
                      <form action={removeSequenceTemplate}>
                        <input type="hidden" name="id" value={t.id} />
                        <button type="submit"
                                className="text-[11px] underline" style={{ color: "var(--danger-fg)" }}>
                          Delete
                        </button>
                      </form>
                    </div>
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
