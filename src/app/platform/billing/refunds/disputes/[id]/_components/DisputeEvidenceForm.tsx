"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import { submitDisputeEvidence } from "@/app/actions/platform-refunds";
import type { EvidenceTemplate } from "@/server/platform/refunds-disputes";

function interpolate(body: string, vars: { tenant: string; amount: string; date: string }) {
  return body
    .replaceAll("{tenant}", vars.tenant)
    .replaceAll("{amount}", vars.amount)
    .replaceAll("{date}", vars.date);
}

export function DisputeEvidenceForm({
  disputeId, templates, tenantName, amountStr, dateStr,
}: {
  disputeId: string;
  templates: EvidenceTemplate[];
  tenantName: string;
  amountStr: string;
  dateStr: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const onPickTemplate = (id: string) => {
    if (!id) return;
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    const interpolated = interpolate(tpl.body, { tenant: tenantName, amount: amountStr, date: dateStr });
    if (text && !window.confirm("Replace the current evidence text with this template?")) return;
    setText(interpolated);
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (text.trim().length < 20) {
      toast.error("Evidence is too short (≥ 20 characters)");
      return;
    }
    if (!window.confirm("Submit evidence and flip status to under review?")) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("disputeId", disputeId);
      fd.set("evidenceText", text);
      const res = await submitDisputeEvidence(fd);
      if (res.ok) {
        toast.success("Evidence submitted");
        router.refresh();
      } else toast.error(res.error ?? "Couldn't submit");
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      {templates.length > 0 && (
        <Select label="Start from template" value=""
                onChange={(e) => onPickTemplate(e.target.value)}>
          <option value="">— Pick a template —</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      )}
      <Textarea
        label="Evidence packet"
        required
        rows={14}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`Why this charge is valid:\n\n• Subscription was active and used\n• Customer was notified at billing\n• Refund was offered and declined\n\nSupporting docs: …`}
        hint="Plain text — at least 20 characters. {tenant}, {amount}, {date} placeholders are pre-interpolated when you load a template."
      />
      <div className="flex items-center justify-end gap-2">
        <Button type="submit" size="sm" disabled={busy}>Submit evidence</Button>
      </div>
    </form>
  );
}
