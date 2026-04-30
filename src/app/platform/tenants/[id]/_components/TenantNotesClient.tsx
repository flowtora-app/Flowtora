"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Avatar, Badge, Button, Textarea, useToast } from "@/components/ui";
import {
  createTenantNote,
  deleteTenantNote,
  updateTenantNote,
} from "@/app/actions/tenant-detail";

// Client islands for the Notes tab — composer + per-row edit/delete
// + pin toggle.

export function TenantNoteComposer({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [body, setBody] = React.useState("");
  const [pinned, setPinned] = React.useState(false);
  const [isPrivate, setIsPrivate] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const onSubmit = async () => {
    if (!body.trim() || pending) return;
    setPending(true);
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("body", body.trim());
    if (pinned) fd.set("pinned", "on");
    if (isPrivate) fd.set("isPrivate", "on");
    const res = await createTenantNote(fd);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error ?? "Couldn't save note");
      return;
    }
    setBody("");
    setPinned(false);
    setIsPrivate(false);
    toast.success("Note added");
    router.refresh();
  };

  return (
    <div className="space-y-3">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.currentTarget.value)}
        rows={4}
        placeholder="What should the next admin to look at this account know?"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.currentTarget.checked)} />
          Pin to top
        </label>
        <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.currentTarget.checked)} />
          Private (only you)
        </label>
        <div className="ml-auto">
          <Button size="sm" loading={pending} disabled={!body.trim()} onClick={onSubmit}>Add note</Button>
        </div>
      </div>
    </div>
  );
}

export interface NoteRowData {
  id: string;
  body: string;
  pinned: boolean;
  isPrivate: boolean;
  authorId: string;
  createdAt: Date;
  updatedAt: Date;
  author: { name: string | null; email: string };
}

export function TenantNoteRow({ note, currentUserId }: { note: NoteRowData; currentUserId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = React.useState(false);
  const [body, setBody] = React.useState(note.body);
  const [pending, setPending] = React.useState(false);

  const isAuthor = note.authorId === currentUserId;

  const togglePin = async () => {
    const fd = new FormData();
    fd.set("noteId", note.id);
    fd.set("pinned", note.pinned ? "off" : "on");
    const res = await updateTenantNote(fd);
    if (!res.ok) toast.error(res.error ?? "Couldn't update");
    else router.refresh();
  };

  const onSave = async () => {
    setPending(true);
    const fd = new FormData();
    fd.set("noteId", note.id);
    fd.set("body", body);
    const res = await updateTenantNote(fd);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error ?? "Couldn't update");
      return;
    }
    setEditing(false);
    router.refresh();
  };

  const onDelete = async () => {
    if (!confirm("Delete this note?")) return;
    const fd = new FormData();
    fd.set("noteId", note.id);
    const res = await deleteTenantNote(fd);
    if (!res.ok) toast.error(res.error ?? "Couldn't delete");
    else router.refresh();
  };

  return (
    <div className="px-4 py-3 text-[13px]" style={{ background: note.pinned ? "var(--amber-50)" : undefined }}>
      <div className="mb-1.5 flex items-center gap-2">
        <Avatar size="xs" name={note.author.name ?? note.author.email} />
        <span className="font-medium" style={{ color: "var(--text-default)" }}>{note.author.name ?? note.author.email}</span>
        <span style={{ color: "var(--text-faint)" }}>· {note.createdAt.toLocaleString()}</span>
        {note.pinned && <Badge size="xs" color="warning">Pinned</Badge>}
        {note.isPrivate && <Badge size="xs" color="info">Private</Badge>}
        {note.updatedAt.getTime() !== note.createdAt.getTime() && (
          <span style={{ color: "var(--text-faint)" }}>· edited {note.updatedAt.toLocaleString()}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button size="xs" variant="ghost" onClick={togglePin}>{note.pinned ? "Unpin" : "Pin"}</Button>
          {isAuthor && !editing && (
            <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>
          )}
          {isAuthor && (
            <Button size="xs" variant="ghost" onClick={onDelete}>Delete</Button>
          )}
        </div>
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea value={body} onChange={(e) => setBody(e.currentTarget.value)} rows={4} />
          <div className="flex justify-end gap-2">
            <Button size="xs" variant="ghost" onClick={() => { setEditing(false); setBody(note.body); }}>Cancel</Button>
            <Button size="xs" loading={pending} onClick={onSave}>Save</Button>
          </div>
        </div>
      ) : (
        <div style={{ color: "var(--text-default)", whiteSpace: "pre-wrap" }}>{note.body}</div>
      )}
    </div>
  );
}
