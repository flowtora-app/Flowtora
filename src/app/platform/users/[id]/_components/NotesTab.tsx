"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Textarea,
  useToast,
} from "@/components/ui";
import { deleteUserNote, upsertUserNote } from "@/app/actions/platform-users";
import type { UserNoteRow } from "@/server/platform/users-list";

// NotesTab — internal CRM-style notes about the user. Writers can
// pin or mark private; only the author and admins can edit/delete.

export function NotesTab({
  userId,
  notes,
  currentUserId,
  canModerate,
}: {
  userId: string;
  notes: UserNoteRow[];
  currentUserId: string;
  canModerate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = React.useState("");
  const [pinned, setPinned] = React.useState(false);
  const [isPrivate, setIsPrivate] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const onSubmit = async () => {
    if (body.trim().length === 0) return;
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("userId", userId);
      fd.set("body", body.trim());
      if (pinned) fd.set("pinned", "on");
      if (isPrivate) fd.set("isPrivate", "on");
      const res = await upsertUserNote(fd);
      if (res.ok) {
        toast.success("Note added");
        setBody("");
        setPinned(false);
        setIsPrivate(false);
        router.refresh();
      } else toast.error(res.error ?? "Couldn't save");
    } finally { setPending(false); }
  };

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader title="New note" />
        <CardBody>
          <div className="flex flex-col gap-3">
            <Textarea
              label="Body"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={8000}
              placeholder="Internal context — never shown to the user."
            />
            <div className="flex flex-wrap items-center gap-3 text-[12px]" style={{ color: "var(--text-default)" }}>
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
                Pin
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
                Private (only me)
              </label>
              <div className="ml-auto">
                <Button size="sm" onClick={onSubmit} disabled={pending || body.trim().length === 0}>
                  {pending ? "Saving…" : "Add note"}
                </Button>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {notes.length === 0 ? (
        <Card padding="lg">
          <div className="text-center text-[12px]" style={{ color: "var(--text-faint)" }}>
            No notes yet.
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              currentUserId={currentUserId}
              canModerate={canModerate}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NoteRow({
  note,
  currentUserId,
  canModerate,
}: {
  note: UserNoteRow;
  currentUserId: string;
  canModerate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState(false);
  const [body, setBody] = React.useState(note.body);
  const [pinned, setPinned] = React.useState(note.pinned);
  const [isPrivate, setIsPrivate] = React.useState(note.isPrivate);
  const [busy, setBusy] = React.useState(false);

  const canEdit = note.authorId === currentUserId || canModerate;

  const onSave = async () => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("id", note.id);
      fd.set("userId", "");  // placeholder; action looks up the existing row
      fd.set("body", body.trim());
      if (pinned) fd.set("pinned", "on");
      if (isPrivate) fd.set("isPrivate", "on");
      const res = await upsertUserNote(fd);
      if (res.ok) { toast.success("Saved"); setEditing(false); router.refresh(); }
      else toast.error(res.error ?? "Couldn't save");
    } finally { setBusy(false); }
  };

  const onDelete = async () => {
    if (!window.confirm("Delete this note?")) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("noteId", note.id);
      const res = await deleteUserNote(fd);
      if (res.ok) { toast.success("Deleted"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't delete");
    } finally { setBusy(false); }
  };

  return (
    <Card padding="md" style={{ borderColor: note.pinned ? "var(--accent-primary)" : undefined }}>
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Avatar size="xs" name={note.authorName ?? note.authorEmail} />
            <span className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
              {note.authorName?.trim() || note.authorEmail}
            </span>
            <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
              {note.createdAt.toLocaleString()}
            </span>
            {note.pinned && (
              <span className="inline-flex items-center rounded-full px-1.5 text-[9px] font-semibold uppercase"
                    style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}>
                Pinned
              </span>
            )}
            {note.isPrivate && (
              <span className="inline-flex items-center rounded-full px-1.5 text-[9px] font-semibold uppercase"
                    style={{ background: "var(--amber-50)", color: "var(--amber-700)" }}>
                Private
              </span>
            )}
          </div>
          {canEdit && (
            <div className="flex shrink-0 gap-1.5">
              {editing ? (
                <>
                  <Button size="xs" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
                  <Button size="xs" onClick={onSave} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
                </>
              ) : (
                <>
                  <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
                  <Button size="xs" variant="ghost" onClick={onDelete} disabled={busy}>Delete</Button>
                </>
              )}
            </div>
          )}
        </div>
        {editing ? (
          <>
            <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} maxLength={8000} />
            <div className="flex gap-3 text-[12px]" style={{ color: "var(--text-default)" }}>
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} /> Pin
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} /> Private
              </label>
            </div>
          </>
        ) : (
          <div className="whitespace-pre-wrap text-[12px]" style={{ color: "var(--text-default)" }}>
            {note.body}
          </div>
        )}
      </div>
    </Card>
  );
}
