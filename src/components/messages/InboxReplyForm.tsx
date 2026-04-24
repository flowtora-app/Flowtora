"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

// Inline reply form for the inbox detail pane. Lives on the client so we
// can reset the textarea after a successful submit and re-focus it for
// rapid back-and-forth — the full-page reload of a classic server-action
// <form> would blow away scroll + focus state.

type Props = {
  action: (formData: FormData) => Promise<void>;
  customerId: string;
  toAddress: string;
  defaultSubject?: string;
};

export function InboxReplyForm({ action, customerId, toAddress, defaultSubject }: Props) {
  const router = useRouter();
  const [subject, setSubject] = React.useState("");
  const [body, setBody]       = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting || !body.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("customerId", customerId);
      fd.set("toAddress", toAddress);
      if (subject.trim()) fd.set("subject", subject.trim());
      fd.set("body", body.trim());
      await action(fd);
      setSubject("");
      setBody("");
      router.refresh();
    } catch (err) {
      if (err instanceof Error && err.message === "NEXT_REDIRECT") {
        // The underlying action redirects on success; treat as win.
        setSubject("");
        setBody("");
        router.refresh();
        return;
      }
      console.error("[InboxReplyForm] submit failed:", err);
      setError("Could not send reply. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      {error && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          {error}
        </div>
      )}
      <div className="space-y-1">
        <label className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Subject <span className="text-[10px] font-normal">(optional)</span>
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={300}
          placeholder={defaultSubject ?? "Re: your message"}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--input-bg)",
            border: "1px solid var(--border-default)",
            color: "var(--text-default)",
          }}
        />
      </div>
      <div className="space-y-1">
        <label className="block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
          Reply <span className="text-[10px] text-red-500">*</span>
          <span className="ml-2 text-[10px] font-normal" style={{ color: "var(--text-faint)" }}>
            press <kbd className="rounded border px-1">r</kbd> to jump here
          </span>
        </label>
        <textarea
          id="inbox-reply-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          required
          maxLength={4000}
          placeholder="Type your reply…"
          className="w-full resize-y rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            background: "var(--input-bg)",
            border: "1px solid var(--border-default)",
            color: "var(--text-default)",
          }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: "var(--text-faint)" }}>
          Sends as email + updates thread
        </span>
        <button
          type="submit"
          disabled={submitting || !body.trim()}
          className="rounded-lg px-4 py-1.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--accent-primary)", color: "white" }}
        >
          {submitting ? "Sending…" : "Send reply"}
        </button>
      </div>
    </form>
  );
}
