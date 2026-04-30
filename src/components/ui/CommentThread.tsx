"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Avatar } from "./Avatar";

// CommentThread — Spec Page 0 §0.5.54.
//
// Anatomy: avatar + author + role badge + timestamp + body (markdown
// or plain text) + reactions row + reply button + 3-dot menu (edit,
// delete, copy link).
// Reply: indented 32px.
// Mentions: `@user` highlights brand-700.
//
// Caller-driven thread tree — pass a flat list of comments with
// optional `parentId`. The component groups + indents replies and
// emits intents (reply, react, edit, delete) up to the caller.

export interface Comment {
  id: string;
  parentId?: string | null;
  author: {
    name: string;
    avatarUrl?: string | null;
    role?: string;
  };
  /** Plain text or simple markdown — inline @-mentions get highlighted. */
  body: string;
  createdAt: Date;
  /** Map of emoji → count. */
  reactions?: Record<string, number>;
  /** Whose reaction is this? Set of emoji the current user added. */
  myReactions?: Set<string>;
  /** Caller flag — show edit/delete only for the user's own comments. */
  canEdit?: boolean;
}

export interface CommentThreadProps {
  comments: Comment[];
  /** Currently signed-in user (used for the composer). */
  me?: { name: string; avatarUrl?: string | null };
  onReply?: (parentId: string, body: string) => void;
  onTopLevelComment?: (body: string) => void;
  onReact?: (commentId: string, emoji: string) => void;
  onEdit?: (commentId: string) => void;
  onDelete?: (commentId: string) => void;
  onCopyLink?: (commentId: string) => void;
  className?: string;
}

export function CommentThread({
  comments,
  me,
  onReply,
  onTopLevelComment,
  onReact,
  onEdit,
  onDelete,
  onCopyLink,
  className,
}: CommentThreadProps) {
  const [composerText, setComposerText] = React.useState("");
  const [replyOpen, setReplyOpen] = React.useState<string | null>(null);

  // Build tree: top-level comments + their replies.
  const tops = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <ul className="flex flex-col gap-3">
        {tops.map((c) => (
          <li key={c.id}>
            <CommentRow
              comment={c}
              onReact={onReact}
              onEdit={onEdit}
              onDelete={onDelete}
              onCopyLink={onCopyLink}
              onReplyToggle={() => setReplyOpen((id) => id === c.id ? null : c.id)}
            />
            <ul className="mt-2 flex flex-col gap-2" style={{ paddingInlineStart: 32 }}>
              {repliesOf(c.id).map((rep) => (
                <li key={rep.id}>
                  <CommentRow
                    comment={rep}
                    onReact={onReact}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onCopyLink={onCopyLink}
                  />
                </li>
              ))}
              {replyOpen === c.id && me && onReply && (
                <li>
                  <ReplyComposer
                    me={me}
                    onSubmit={(body) => { onReply(c.id, body); setReplyOpen(null); }}
                    onCancel={() => setReplyOpen(null)}
                  />
                </li>
              )}
            </ul>
          </li>
        ))}
      </ul>
      {me && onTopLevelComment && (
        <div>
          <div className="flex items-start gap-2">
            <Avatar size="sm" src={me.avatarUrl ?? undefined} name={me.name} />
            <div className="flex-1">
              <textarea
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                rows={3}
                placeholder="Leave a comment…"
                className="ts-focus w-full resize-y rounded-md border bg-transparent px-3 py-2 text-[13px] outline-none"
                style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", color: "var(--text-default)" }}
              />
              <div className="mt-1 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { if (composerText.trim()) { onTopLevelComment(composerText.trim()); setComposerText(""); } }}
                  disabled={!composerText.trim()}
                  className="ts-focus rounded-md px-3 py-1 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: "var(--brand-600, var(--accent-primary))", color: "#fff" }}
                >
                  Comment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CommentRow({
  comment, onReact, onEdit, onDelete, onCopyLink, onReplyToggle,
}: {
  comment: Comment;
  onReact?: (id: string, emoji: string) => void;
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  onCopyLink?: (id: string) => void;
  onReplyToggle?: () => void;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  return (
    <article className="flex items-start gap-2">
      <Avatar size="sm" src={comment.author.avatarUrl ?? undefined} name={comment.author.name} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2 text-[13px]">
          <span className="font-medium" style={{ color: "var(--text-default)" }}>{comment.author.name}</span>
          {comment.author.role && (
            <span
              className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
            >
              {comment.author.role}
            </span>
          )}
          <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>{formatRelative(comment.createdAt)}</span>
          {(onEdit || onDelete || onCopyLink) && (
            <span className="ml-auto relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="Comment menu"
                className="ts-focus rounded p-1 text-[11px]"
                style={{ color: "var(--text-muted)" }}
              >
                ⋯
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 top-full z-10 mt-1 min-w-[160px] rounded-md border py-1 text-[12px]"
                  style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", boxShadow: "var(--shadow-lg)" }}
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  {comment.canEdit && onEdit && <MenuItem onClick={() => { onEdit(comment.id); setMenuOpen(false); }}>Edit</MenuItem>}
                  {onCopyLink && <MenuItem onClick={() => { onCopyLink(comment.id); setMenuOpen(false); }}>Copy link</MenuItem>}
                  {comment.canEdit && onDelete && <MenuItem destructive onClick={() => { onDelete(comment.id); setMenuOpen(false); }}>Delete</MenuItem>}
                </div>
              )}
            </span>
          )}
        </div>
        <div
          className="mt-0.5 whitespace-pre-wrap text-[13px]"
          style={{ color: "var(--text-default)", lineHeight: 1.55 }}
        >
          {renderInlineMentions(comment.body)}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {Object.entries(comment.reactions ?? {}).map(([emoji, count]) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact?.(comment.id, emoji)}
              className="ts-focus inline-flex items-center gap-1 rounded-full border px-1.5 text-[11px]"
              style={{
                borderColor: comment.myReactions?.has(emoji) ? "var(--brand-300, var(--accent-primary))" : "var(--border-default)",
                background: comment.myReactions?.has(emoji) ? "var(--brand-50, var(--accent-surface))" : "transparent",
                color: comment.myReactions?.has(emoji) ? "var(--brand-700, var(--accent-primary))" : "var(--text-default)",
              }}
            >
              {emoji} <span className="tabular-nums">{count}</span>
            </button>
          ))}
          {onReact && (
            <ReactPicker onPick={(emoji) => onReact(comment.id, emoji)} />
          )}
          {onReplyToggle && (
            <button type="button" onClick={onReplyToggle} className="ts-focus text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
              Reply
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function ReactPicker({ onPick }: { onPick: (emoji: string) => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <span className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Add reaction" className="ts-focus inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
        +
      </button>
      {open && (
        <div className="absolute left-0 top-full z-10 mt-1 inline-flex gap-1 rounded-md border bg-[var(--surface-1)] p-1" style={{ borderColor: "var(--border-default)", boxShadow: "var(--shadow-md)" }}>
          {["👍", "❤️", "🎉", "👀", "🚀", "✅"].map((e) => (
            <button key={e} type="button" onClick={() => { onPick(e); setOpen(false); }} className="ts-focus rounded p-1 text-base hover:bg-[var(--surface-3)]">
              {e}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function ReplyComposer({ me, onSubmit, onCancel }: { me: { name: string; avatarUrl?: string | null }; onSubmit: (body: string) => void; onCancel: () => void }) {
  const [text, setText] = React.useState("");
  return (
    <div className="flex items-start gap-2">
      <Avatar size="xs" src={me.avatarUrl ?? undefined} name={me.name} />
      <div className="flex-1">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          autoFocus
          placeholder="Reply…"
          className="ts-focus w-full resize-y rounded-md border bg-transparent px-2 py-1 text-[12px] outline-none"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", color: "var(--text-default)" }}
        />
        <div className="mt-1 flex items-center justify-end gap-1">
          <button type="button" onClick={onCancel} className="ts-focus rounded px-2 py-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>Cancel</button>
          <button type="button" onClick={() => { if (text.trim()) onSubmit(text.trim()); }} disabled={!text.trim()} className="ts-focus rounded px-2 py-0.5 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "var(--brand-600, var(--accent-primary))", color: "#fff" }}>
            Reply
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuItem({ children, destructive, onClick }: { children: React.ReactNode; destructive?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="ts-focus block w-full px-3 py-1.5 text-left text-[12px] hover:bg-[var(--surface-3)]" style={{ color: destructive ? "var(--rose-700, var(--danger-fg))" : "var(--text-default)" }}>
      {children}
    </button>
  );
}

function renderInlineMentions(text: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  const re = /@(\w[\w-]*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) out.push(text.slice(last, match.index));
    out.push(
      <span key={match.index} style={{ color: "var(--brand-700, var(--accent-primary))", fontWeight: 600 }}>
        {match[0]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (ms < min) return "just now";
  if (ms < hour) return `${Math.floor(ms / min)}m`;
  if (ms < day) return `${Math.floor(ms / hour)}h`;
  if (ms < 30 * day) return `${Math.floor(ms / day)}d`;
  return d.toLocaleDateString();
}
