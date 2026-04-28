import { Card, CardHeader } from "@/components/Card";
import { Button, TextArea } from "@/components/Field";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { formatDateTime } from "@/lib/format";
import { createComment, deleteComment } from "@/app/actions/comments";
import type { CommentParentKind } from "@/lib/comments";

// Phase 14 — threaded internal comments.
//
// Drop-in card used by every detail page that participates in the
// communication center. Keep it a server component: the list renders from
// props, posting + deleting go through form actions so we don't need any
// client-side state. Author controls are intentionally minimal — toggling
// edit mode is a client concern we'll add alongside Slice B.

export type CommentRow = {
  id:               string;
  authorId:         string;
  body:             string;
  mentionedUserIds: string[];
  editedAt:         Date | null;
  deletedAt:        Date | null;
  createdAt:        Date;
};

export function CommentThread({
  slug,
  parentKind,
  parentId,
  comments,
  currentUserId,
  memberMap,
  canModerate,
  title = "Internal comments",
  emptyLabel = "No comments yet. This is an internal log — the customer can't see it.",
}: {
  slug:          string;
  parentKind:    CommentParentKind;
  parentId:      string;
  comments:      CommentRow[];
  currentUserId: string;
  // Same shape `ChecklistCard` expects — resolve names from userIds without
  // doing another DB round-trip inside this component.
  memberMap:     Map<string, { name: string }>;
  // Governs "Delete" on *other people's* comments. Authors can always delete
  // their own regardless of this flag.
  canModerate:   boolean;
  title?:        string;
  emptyLabel?:   string;
}) {
  const post = createComment.bind(null, slug);

  return (
    <Card>
      <CardHeader
        title={title}
        right={
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {comments.length} comment{comments.length === 1 ? "" : "s"}
          </span>
        }
      />

      {comments.length === 0 ? (
        <div className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>
          {emptyLabel}
        </div>
      ) : (
        <ul>
          {comments.map((c) => {
            const authorName = memberMap.get(c.authorId)?.name ?? "Unknown";
            const isAuthor = c.authorId === currentUserId;
            const canDelete = !c.deletedAt && (isAuthor || canModerate);
            const del = deleteComment.bind(null, slug, c.id);

            return (
              <li
                key={c.id}
                className="px-5 py-3"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2 text-xs" style={{ color: "var(--muted)" }}>
                      <span className="font-medium" style={{ color: "var(--text)" }}>{authorName}</span>
                      <span>· {formatDateTime(c.createdAt)}</span>
                      {c.editedAt && <span>· edited</span>}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap text-sm">
                      {c.deletedAt ? (
                        <span style={{ color: "var(--muted)", fontStyle: "italic" }}>
                          (comment removed)
                        </span>
                      ) : (
                        c.body
                      )}
                    </div>
                    {!c.deletedAt && c.mentionedUserIds.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1 text-xs" style={{ color: "var(--muted)" }}>
                        <span>Mentioned:</span>
                        {c.mentionedUserIds.map((uid) => (
                          <span
                            key={uid}
                            className="rounded-full px-2 py-0.5"
                            style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
                          >
                            {memberMap.get(uid)?.name ?? "Unknown"}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {canDelete && (
                    <form action={del}>
                      <SubmitButton
                        className="text-xs underline"
                        style={{ color: "var(--muted)" }}
                        pendingLabel={<span className="text-xs">Deleting…</span>}
                      >
                        Delete
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Compose box — always visible to anyone who can see the card. */}
      <form action={post} className="space-y-2 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
        <input type="hidden" name="parentKind" value={parentKind} />
        <input type="hidden" name="parentId" value={parentId} />
        <TextArea
          label="Add a comment"
          name="body"
          rows={3}
          placeholder="Internal note — team only. Type @name to ping a teammate."
          required
        />
        <div>
          <Button type="submit">Post comment</Button>
        </div>
      </form>
    </Card>
  );
}
