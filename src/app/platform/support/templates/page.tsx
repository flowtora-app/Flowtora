import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Card, CardHeader } from "@/components/Card";
import { Field, TextArea, SelectField, Button } from "@/components/Field";
import {
  createCannedReply,
  updateCannedReply,
  archiveCannedReply,
  restoreCannedReply,
} from "@/app/actions/platform";

// Phase 20 Slice D — platform-wide library of canned support replies.
// Any platform staff can view; only admins can create, edit, or archive
// (enforced in the action handlers, not here).

const CATEGORY_OPTIONS = [
  { value: "",                label: "Any category" },
  { value: "BILLING",         label: "Billing" },
  { value: "BUG",             label: "Bug" },
  { value: "FEATURE_REQUEST", label: "Feature request" },
  { value: "QUESTION",        label: "Question" },
  { value: "OTHER",           label: "Other" },
];

export default async function PlatformSupportTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; archived?: string }>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const showArchived = sp.archived === "1";

  const templates = await db.supportCannedReply.findMany({
    where: showArchived ? {} : { archivedAt: null },
    orderBy: [{ archivedAt: "asc" }, { title: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          <Link href="/platform/support" className="underline">Support queue</Link> / templates
        </div>
        <h1 className="mt-1 text-2xl font-semibold">Canned replies</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Shared library for the support team. Pick from the dropdown on any ticket reply form.
          Use <code>{"{{tenantName}}"}</code> and <code>{"{{ticketSubject}}"}</code> as placeholders.
        </p>
      </div>

      {sp.error && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{ background: "#3a1517", color: "#ff8b8b", border: "1px solid #5b2024" }}
        >
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <Link
        href={`/platform/support/templates?archived=${showArchived ? "0" : "1"}`}
        className="inline-block text-xs underline"
        style={{ color: "var(--muted)" }}
      >
        {showArchived ? "Hide archived" : "Show archived"}
      </Link>

      {ctx.canWrite && (
        <Card>
          <CardHeader title="New template" />
          <form action={createCannedReply} className="space-y-3 px-5 py-4">
            <Field label="Title" name="title" required maxLength={120} placeholder="e.g. Request more details" />
            <SelectField label="Category (optional)" name="category" options={CATEGORY_OPTIONS} defaultValue="" />
            <TextArea
              label="Body"
              name="body"
              rows={6}
              required
              maxLength={8000}
              placeholder="Hi {{tenantName}},\n\nThanks for reaching out about &quot;{{ticketSubject}}&quot;. ..."
            />
            <div className="flex justify-end">
              <Button type="submit">Save template</Button>
            </div>
          </form>
        </Card>
      )}

      <div className="space-y-3">
        {templates.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>No templates yet.</p>
        ) : (
          templates.map((t) => {
            const isArchived = Boolean(t.archivedAt);
            const updateAction = updateCannedReply.bind(null);
            const archive = archiveCannedReply.bind(null, t.id);
            const restore = restoreCannedReply.bind(null, t.id);
            return (
              <Card key={t.id}>
                <CardHeader
                  title={t.title}
                  description={[
                    t.category ? t.category.replace(/_/g, " ").toLowerCase() : "any category",
                    isArchived ? "archived" : null,
                  ].filter(Boolean).join(" · ")}
                />
                {ctx.canWrite ? (
                  <form action={updateAction} className="space-y-3 px-5 py-4">
                    <input type="hidden" name="id" value={t.id} />
                    <Field label="Title" name="title" required maxLength={120} defaultValue={t.title} />
                    <SelectField
                      label="Category"
                      name="category"
                      options={CATEGORY_OPTIONS}
                      defaultValue={t.category ?? ""}
                    />
                    <TextArea label="Body" name="body" rows={6} required maxLength={8000} defaultValue={t.body} />
                    <div className="flex items-center justify-between">
                      {isArchived ? (
                        <button
                          type="submit"
                          formAction={restore}
                          className="text-xs underline"
                          style={{ color: "var(--muted)" }}
                        >
                          Restore
                        </button>
                      ) : (
                        <button
                          type="submit"
                          formAction={archive}
                          className="text-xs underline"
                          style={{ color: "var(--muted)" }}
                        >
                          Archive
                        </button>
                      )}
                      <Button type="submit">Save changes</Button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-2 px-5 py-4 text-sm">
                    <div className="whitespace-pre-wrap" style={{ color: "var(--muted)" }}>{t.body}</div>
                    <p className="text-xs" style={{ color: "var(--muted)" }}>Admin-only to edit.</p>
                  </div>
                )}
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
