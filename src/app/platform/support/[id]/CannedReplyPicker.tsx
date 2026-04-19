"use client";

// Phase 20 Slice D — dropdown beside the reply textarea. Picking a template
// overwrites the textarea body, with {{tenantName}} / {{ticketSubject}}
// interpolated client-side. Staff can still edit the result before sending.

import { useState } from "react";

type Template = {
  id: string;
  title: string;
  body: string;
  category: string | null;
};

export function CannedReplyPicker({
  templates,
  tenantName,
  ticketSubject,
  bodyTextareaName,
}: {
  templates: Template[];
  tenantName: string;
  ticketSubject: string;
  bodyTextareaName: string;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (templates.length === 0) return null;

  const apply = (t: Template, force: boolean) => {
    const textarea = document.querySelector<HTMLTextAreaElement>(
      `textarea[name="${bodyTextareaName}"]`,
    );
    if (!textarea) return;
    if (!force && textarea.value.trim().length > 0) {
      setConfirmingId(t.id);
      return;
    }
    textarea.value = t.body
      .replace(/\{\{tenantName\}\}/g, tenantName)
      .replace(/\{\{ticketSubject\}\}/g, ticketSubject);
    textarea.focus();
    setConfirmingId(null);
  };

  return (
    <div className="space-y-2">
      <label className="text-xs" style={{ color: "var(--muted)" }}>
        Insert canned reply
      </label>
      <select
        value=""
        onChange={(e) => {
          const t = templates.find((x) => x.id === e.target.value);
          if (t) apply(t, false);
          e.currentTarget.value = "";
        }}
        className="w-full rounded-md px-3 py-2 text-sm"
        style={{
          background: "var(--panel)",
          color: "var(--text)",
          border: "1px solid var(--border)",
        }}
      >
        <option value="">— pick a template —</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.title}
            {t.category ? ` (${t.category.toLowerCase()})` : ""}
          </option>
        ))}
      </select>
      {confirmingId && (
        <div
          className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-xs"
          style={{ background: "#3a2f15", color: "#ffc98b", border: "1px solid #5b4920" }}
        >
          <span>Overwrite what you've already typed?</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const t = templates.find((x) => x.id === confirmingId);
                if (t) apply(t, true);
              }}
              className="underline"
            >
              Yes, replace
            </button>
            <button type="button" onClick={() => setConfirmingId(null)} className="underline">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
