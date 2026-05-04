// Page 33 §Macros — manage SupportCannedReply rows.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import { db } from "@/lib/db";
import {
  upsertMacro,
  archiveMacro,
  unarchiveMacro,
} from "@/app/actions/platform-support-macros";
import type { SupportTicketCategory } from "@prisma/client";
import { FormError, FormOk, CATEGORY_LABEL } from "../_components/shared";

export const dynamic = "force-dynamic";

const CATEGORIES: SupportTicketCategory[] = ["BILLING", "BUG", "FEATURE_REQUEST", "QUESTION", "OTHER"];

export default async function MacrosPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string; edit?: string; show?: "active" | "archived" }>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("support.macro_manage");
  const showArchived = sp.show === "archived";
  const editingId = typeof sp.edit === "string" ? sp.edit : null;
  const isCreating = editingId === "__new__";

  const macros = await db.supportCannedReply.findMany({
    where: showArchived ? { archivedAt: { not: null } } : { archivedAt: null },
    orderBy: { title: "asc" },
  });

  const editingMacro = editingId && editingId !== "__new__"
    ? macros.find((m) => m.id === editingId) ?? null
    : null;

  return (
    <div className="space-y-5">
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/platform/operations/tickets" className="underline" style={{ color: "var(--text-muted)" }}>
          Support tickets
        </Link>
        <span className="mx-1.5">/</span>
        <span style={{ color: "var(--text-default)" }}>Macros</span>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
            Reply macros
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            Reusable canned replies for the support team. Variables{" "}
            <code>{"{{tenantName}}"}</code> and <code>{"{{ticketSubject}}"}</code> are substituted
            client-side at insert time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/platform/operations/tickets"
            className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-medium"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-default)",
              border: "1px solid var(--border-default)",
            }}
          >
            ← Inbox
          </Link>
          <Link
            href={showArchived ? "?" : "?show=archived"}
            className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-medium"
            style={{
              background: showArchived ? "var(--accent-primary)" : "var(--surface-1)",
              color: showArchived ? "var(--accent-fg)" : "var(--text-default)",
              border: `1px solid ${showArchived ? "var(--accent-primary)" : "var(--border-default)"}`,
            }}
          >
            {showArchived ? "✓ Archived" : "Show archived"}
          </Link>
          {canWrite && !showArchived && (
            <Link
              href="?edit=__new__"
              className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-semibold"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              + New macro
            </Link>
          )}
        </div>
      </div>

      <FormOk msg={sp.ok} />
      <FormError msg={sp.error} />

      {(isCreating || editingMacro) && (
        <form
          action={upsertMacro}
          className="flex flex-col gap-3 rounded-lg border p-4"
          style={{ background: "var(--surface-1)", borderColor: "var(--accent-primary)" }}
        >
          {editingMacro && <input type="hidden" name="id" value={editingMacro.id} />}
          <Field label="Title">
            <input
              name="title"
              required
              defaultValue={editingMacro?.title ?? ""}
              maxLength={120}
              className="ts-focus w-full rounded-md px-3 py-2 text-[13px] outline-none"
              style={inputStyle()}
            />
          </Field>
          <Field label="Category" help="Optional — limits where the macro shows up in the picker.">
            <Select name="category" defaultValue={editingMacro?.category ?? ""}>
              <option value="">Any category</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </Select>
          </Field>
          <Field label="Body">
            <textarea
              name="body"
              required
              rows={8}
              defaultValue={editingMacro?.body ?? ""}
              maxLength={10_000}
              className="ts-focus w-full rounded-md px-3 py-2 text-[12px] outline-none"
              style={{ ...inputStyle(), lineHeight: 1.5 }}
            />
          </Field>
          <div className="flex items-center justify-end gap-2">
            <Link
              href="?"
              className="text-[11px] underline"
              style={{ color: "var(--text-muted)" }}
            >
              cancel
            </Link>
            <button
              type="submit"
              className="ts-focus rounded-md px-4 py-2 text-[12px] font-semibold"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              {editingMacro ? "Save changes" : "Create macro"}
            </button>
          </div>
        </form>
      )}

      <div
        className="overflow-hidden rounded-lg"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
      >
        {macros.length === 0 ? (
          <div className="px-6 py-10 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
            <div className="mb-1 text-2xl" aria-hidden>🧩</div>
            <div className="font-medium" style={{ color: "var(--text-default)" }}>
              {showArchived ? "No archived macros." : "No macros yet."}
            </div>
            {!showArchived && canWrite && (
              <Link
                href="?edit=__new__"
                className="mt-2 inline-block text-[11px] underline"
                style={{ color: "var(--accent-primary)" }}
              >
                Create the first one →
              </Link>
            )}
          </div>
        ) : (
          <ul>
            {macros.map((m, idx) => (
              <li
                key={m.id}
                className="px-4 py-3"
                style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
                        {m.title}
                      </span>
                      {m.category && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                          style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
                        >
                          {CATEGORY_LABEL[m.category]}
                        </span>
                      )}
                    </div>
                    <p
                      className="mt-1 max-h-24 overflow-hidden whitespace-pre-wrap text-[11px]"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {m.body.length > 240 ? m.body.slice(0, 240) + "…" : m.body}
                    </p>
                  </div>
                  {canWrite && (
                    <div className="flex shrink-0 items-center gap-2">
                      <Link
                        href={`?edit=${m.id}`}
                        className="ts-focus text-[11px] underline"
                        style={{ color: "var(--accent-primary)" }}
                      >
                        Edit
                      </Link>
                      <form action={m.archivedAt ? unarchiveMacro : archiveMacro}>
                        <input type="hidden" name="id" value={m.id} />
                        <button
                          type="submit"
                          className="ts-focus text-[11px] underline"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {m.archivedAt ? "Restore" : "Archive"}
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Field({
  label, help, children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
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

function Select({
  name, defaultValue, children,
}: {
  name: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
      style={inputStyle()}
    >
      {children}
    </select>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-default)",
  };
}
