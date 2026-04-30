import { db } from "@/lib/db";
import {
  Avatar,
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
} from "@/components/ui";
import { TenantNoteComposer, TenantNoteRow } from "./TenantNotesClient";

// Notes tab — pinned + recent. Composer is a client island; the
// list is server-rendered so deep-links / bookmarks work without JS.

export interface TenantNotesPanelProps {
  tenantId: string;
  currentUserId: string;
  canWrite: boolean;
}

export async function TenantNotesPanel({ tenantId, currentUserId, canWrite }: TenantNotesPanelProps) {
  const rows = await db.tenantNote.findMany({
    where: {
      tenantId,
      OR: [{ isPrivate: false }, { isPrivate: true, authorId: currentUserId }],
    },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    select: {
      id: true, body: true, pinned: true, isPrivate: true,
      authorId: true, createdAt: true, updatedAt: true,
      author: { select: { name: true, email: true } },
    },
  });
  const pinned = rows.filter((r) => r.pinned);
  const recent = rows.filter((r) => !r.pinned);

  return (
    <div className="space-y-4">
      {canWrite && (
        <Card padding="md">
          <CardHeader title="Add a note" description="Rich-text supported. Mark as private to keep it visible only to you." />
          <CardBody>
            <TenantNoteComposer tenantId={tenantId} />
          </CardBody>
        </Card>
      )}

      {pinned.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <CardHeader title="Pinned" right={<Badge size="xs" color="warning">{pinned.length}</Badge>} />
          </div>
          <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {pinned.map((n) => (
              <li key={n.id}><TenantNoteRow note={n} currentUserId={currentUserId} /></li>
            ))}
          </ul>
        </Card>
      )}

      <Card padding="none" className="overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <CardHeader title="Recent notes" description={`${recent.length} ${recent.length === 1 ? "note" : "notes"}`} />
        </div>
        {recent.length === 0 ? (
          <CardBody>
            <EmptyState
              title="No notes yet"
              description="Capture sales-call summaries, special handling, escalation context — anything internal that the next admin to look at this account should know."
            />
          </CardBody>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {recent.map((n) => (
              <li key={n.id}><TenantNoteRow note={n} currentUserId={currentUserId} /></li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// Re-export client pieces so the parent can import without two paths.
export { Avatar };
