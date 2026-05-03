// Page 29 — Industry Template editor.
// 3 tabs: Content (HTML body + plain-text fallback + variables hint),
// Preview (sample-data render in iframe), Versions.

import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { Breadcrumb, PageHeader } from "@/components/ui";
import { loadTemplateDetail } from "@/server/platform/industry-templates";
import {
  archiveIndustryTemplate,
  duplicateIndustryTemplate,
  publishIndustryTemplate,
} from "@/app/actions/platform-industry-templates";
import { KIND_LABEL, StatusPill } from "../_components/shared";
import { ContentTab } from "./_components/ContentTab";
import { PreviewTab } from "./_components/PreviewTab";
import { VersionsTab } from "./_components/VersionsTab";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
type TabKey = "content" | "preview" | "versions";
const TAB_KEYS: TabKey[] = ["content", "preview", "versions"];
const TAB_LABEL: Record<TabKey, string> = {
  content: "Content",
  preview: "Preview",
  versions: "Versions",
};

const OK_LABELS: Record<string, string> = {
  saved: "Saved.",
  created: "Template created.",
  duplicated: "Duplicated.",
  published: "Published.",
  archived: "Archived.",
};

export default async function TemplateEditorPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();
  const canManage = ctx.can("plans.manage");

  const detail = await loadTemplateDetail(id);
  if (!detail) notFound();

  const tabRaw = typeof sp.tab === "string" ? sp.tab : "content";
  const tab: TabKey = (TAB_KEYS as readonly string[]).includes(tabRaw) ? (tabRaw as TabKey) : "content";
  const okMsg = typeof sp.ok === "string" ? OK_LABELS[sp.ok] ?? "Done." : null;
  const errMsg = typeof sp.error === "string" ? decodeURIComponent(sp.error) : null;

  // Resolve "published by" emails for the versions tab.
  const userIds = Array.from(new Set(
    detail.versions.map((v) => v.publishedByUserId).filter((x): x is string => !!x),
  ));
  const users = userIds.length === 0 ? [] : await db.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, email: true },
  });
  const userById = new Map(users.map((u) => [u.id, u.name ?? u.email ?? null]));

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Catalog", href: "/platform/catalog/products" },
          { label: "Industry Templates", href: `/platform/catalog/templates?kind=${detail.kind}` },
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
                <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {KIND_LABEL[detail.kind]} · locale {detail.locale} ·{" "}
                  {detail.versions.length} version{detail.versions.length === 1 ? "" : "s"}
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

      <TabBar templateId={detail.id} active={tab} />

      {tab === "content"  && <ContentTab detail={detail} canManage={canManage} />}
      {tab === "preview"  && <PreviewTab detail={detail} />}
      {tab === "versions" && (
        <VersionsTab versions={detail.versions.map((v) => ({
          ...v,
          publishedByName: v.publishedByUserId ? userById.get(v.publishedByUserId) ?? null : null,
        }))} />
      )}
    </div>
  );
}

function TabBar({ templateId, active }: { templateId: string; active: TabKey }) {
  return (
    <div className="overflow-x-auto border-b" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="flex min-w-max items-center gap-0">
        {TAB_KEYS.map((key) => {
          const isActive = key === active;
          return (
            <Link
              key={key}
              href={key === "content"
                ? `/platform/catalog/templates/${templateId}`
                : `/platform/catalog/templates/${templateId}?tab=${key}`}
              className="ts-focus relative px-3 py-2 text-[13px] font-medium whitespace-nowrap"
              style={{
                color: isActive ? "var(--text-default)" : "var(--text-muted)",
                borderBottom: isActive ? "2px solid var(--accent-primary)" : "2px solid transparent",
                marginBottom: "-1px",
              }}
            >
              {TAB_LABEL[key]}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ActionRow({ id, status }: { id: string; status: "DRAFT" | "PUBLISHED" | "ARCHIVED" }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "PUBLISHED" && (
        <form action={publishIndustryTemplate.bind(null, id)}>
          <button type="submit"
                  className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
            Publish
          </button>
        </form>
      )}
      <form action={duplicateIndustryTemplate.bind(null, id)}>
        <button type="submit"
                className="ts-focus rounded-md border px-3 py-1.5 text-[12px] font-medium"
                style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}>
          Duplicate
        </button>
      </form>
      {status !== "ARCHIVED" && (
        <form action={archiveIndustryTemplate.bind(null, id)}>
          <button type="submit"
                  className="ts-focus rounded-md border px-3 py-1.5 text-[12px] font-medium"
                  style={{ borderColor: "var(--border-subtle)", color: "var(--danger-fg)", background: "var(--surface-1)" }}>
            Archive
          </button>
        </form>
      )}
    </div>
  );
}
