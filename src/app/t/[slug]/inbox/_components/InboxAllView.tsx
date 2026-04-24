import Link from "next/link";
import { Card, CardHeader } from "@/components/Card";
import { EmptyState } from "@/components/ui/EmptyState";

// "All" aggregate view — shows a compact preview of every surface so users
// can triage without chip-hopping. Three columns on wide screens, stacked
// on mobile. Each section caps at 5 items with a "View all" link to the
// chip-scoped view.
//
// Deliberately minimal rows: title + one detail line. Users switch to the
// specific chip if they want to take action; this view is for seeing the
// shape of the work, not doing it.

export type AllViewItem = {
  key:    string;
  title:  string;
  detail: string;
  href:   string; // absolute href
};

export type AllViewSection = {
  chip:         "attention" | "messages" | "approvals" | "notifications" | "tasks";
  title:        string;
  totalCount:   number;
  items:        AllViewItem[];       // capped to ~5 upstream
  emptyTitle:   string;
  emptyBody:    string;
};

export function InboxAllView({
  slug,
  sections,
}: {
  slug: string;
  sections: AllViewSection[];
}) {
  const allEmpty = sections.every((s) => s.totalCount === 0);

  if (allEmpty) {
    return (
      <Card>
        <EmptyState
          title="Inbox zero 🎉"
          description="No attention items, no unread messages, no approvals waiting. Nothing to do — go build something."
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sections.map((section) => (
        <AllViewCard key={section.chip} slug={slug} section={section} />
      ))}
    </div>
  );
}

function AllViewCard({
  slug,
  section,
}: {
  slug: string;
  section: AllViewSection;
}) {
  const href = `/t/${slug}/inbox?chip=${section.chip}`;

  return (
    <Card className="overflow-hidden p-0">
      <CardHeader
        title={section.title}
        right={
          section.totalCount > 0 ? (
            <span
              className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-semibold"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-muted)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              {section.totalCount > 99 ? "99+" : section.totalCount}
            </span>
          ) : null
        }
      />
      {section.items.length === 0 ? (
        <div className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
          {section.emptyTitle}
        </div>
      ) : (
        <>
          <ul>
            {section.items.map((it, idx) => (
              <li
                key={it.key}
                className="px-5 py-3"
                style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
              >
                <Link href={it.href} className="text-sm font-medium underline">
                  {it.title}
                </Link>
                <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  {it.detail}
                </div>
              </li>
            ))}
          </ul>
          {section.totalCount > section.items.length && (
            <div
              className="px-5 py-2 text-xs"
              style={{ borderTop: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
            >
              <Link href={href} className="underline">
                View all {section.totalCount}
              </Link>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
