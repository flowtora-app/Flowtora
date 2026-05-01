"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Input,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  setWinbackCampaignLifecycle,
  upsertWinbackCampaign,
} from "@/app/actions/churn";
import {
  ARCHIVE_REASON_LABEL,
  type WinbackCampaignRow,
} from "@/server/platform/churn";
import type { ArchiveReasonCode, WinbackCampaignStatus } from "@prisma/client";

// WinbackTab — campaign cards with start/pause/end controls and a
// "+ New campaign" button that opens the email builder.

export function WinbackTab({
  campaigns,
  reasonCodes,
  canEdit,
}: {
  campaigns: WinbackCampaignRow[];
  reasonCodes: ArchiveReasonCode[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = React.useState<WinbackCampaignRow | "new" | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Win-back campaigns
        </h2>
        {canEdit && (
          <Button size="sm" onClick={() => setEditing("new")}>+ New campaign</Button>
        )}
      </div>

      {campaigns.length === 0 ? (
        <Card padding="lg">
          <div className="text-center">
            <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>No campaigns yet</h3>
            <p className="mx-auto mt-1 max-w-md text-[12px]" style={{ color: "var(--text-muted)" }}>
              Create a win-back campaign to email churned tenants with a discount, new feature, or "we miss you" pitch.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
          {campaigns.map((c) => (
            <CampaignCard key={c.id} campaign={c} canEdit={canEdit} onEdit={() => setEditing(c)} />
          ))}
        </div>
      )}

      {editing && (
        <CampaignEditor
          campaign={editing === "new" ? null : editing}
          reasonCodes={reasonCodes}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function StatusPill({ status }: { status: WinbackCampaignStatus }) {
  const palette =
    status === "ACTIVE" ? { bg: "var(--emerald-50)",  fg: "var(--emerald-700)" } :
    status === "PAUSED" ? { bg: "var(--amber-50)",    fg: "var(--amber-700)" } :
    status === "ENDED"  ? { bg: "var(--surface-2)",   fg: "var(--text-muted)" } :
                          { bg: "var(--surface-2)",   fg: "var(--text-muted)" };
  return (
    <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: palette.bg, color: palette.fg }}>
      {status.toLowerCase()}
    </span>
  );
}

function CampaignCard({
  campaign,
  canEdit,
  onEdit,
}: {
  campaign: WinbackCampaignRow;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);

  const onLifecycle = async (action: "start" | "pause" | "resume" | "end") => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("campaignId", campaign.id);
      fd.set("action", action);
      const res = await setWinbackCampaignLifecycle(fd);
      if (res.ok) { toast.success("Updated"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't update");
    } finally { setPending(false); }
  };

  const openRate = campaign.emailsSent === 0 ? null : Math.round((campaign.emailsOpened / campaign.emailsSent) * 100);

  return (
    <Card padding="md" className="h-full">
      <div className="flex h-full flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>
                {campaign.name}
              </h3>
              <StatusPill status={campaign.status} />
            </div>
            {campaign.emailSubject && (
              <p className="mt-0.5 truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                Subject: {campaign.emailSubject}
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <Stat label="Audience" value={campaign.audienceSize.toLocaleString()} />
          <Stat label="Sent" value={campaign.emailsSent.toLocaleString()} />
          <Stat label="Opens" value={openRate == null ? "—" : `${openRate}%`} />
          <Stat label="Replies" value={campaign.replies.toLocaleString()} />
          <Stat label="Won back" value={campaign.wonBackCount.toLocaleString()} />
          <Stat label="Started" value={campaign.startedAt ? campaign.startedAt.toLocaleDateString() : "—"} />
        </div>
        {canEdit && (
          <div className="mt-auto flex flex-wrap gap-1.5">
            {campaign.status === "DRAFT" && (
              <Button size="xs" onClick={() => onLifecycle("start")} disabled={pending}>Start</Button>
            )}
            {campaign.status === "ACTIVE" && (
              <Button size="xs" variant="secondary" onClick={() => onLifecycle("pause")} disabled={pending}>Pause</Button>
            )}
            {campaign.status === "PAUSED" && (
              <Button size="xs" onClick={() => onLifecycle("resume")} disabled={pending}>Resume</Button>
            )}
            {(campaign.status === "ACTIVE" || campaign.status === "PAUSED") && (
              <Button size="xs" variant="ghost" onClick={() => onLifecycle("end")} disabled={pending}>End</Button>
            )}
            <Button size="xs" variant="ghost" onClick={onEdit} disabled={pending}>Edit</Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2" style={{ borderColor: "var(--border-subtle)" }}>
      <div className="text-[9px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>{label}</div>
      <div className="mt-0.5 text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{value}</div>
    </div>
  );
}

/* ── Campaign editor / sequence builder ─────────────────────── */

function CampaignEditor({
  campaign,
  reasonCodes,
  onClose,
}: {
  campaign: WinbackCampaignRow | null;
  reasonCodes: ArchiveReasonCode[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = React.useState(campaign?.name ?? "Untitled win-back");
  const [subject, setSubject] = React.useState(campaign?.emailSubject ?? "We miss you on Flowtora");
  const [body, setBody] = React.useState(
    campaign?.emailBody ??
    `Hey,\n\nIt's been a while since we saw you on Flowtora. We've shipped a bunch since you left:\n\n• [Highlight 1]\n• [Highlight 2]\n• [Highlight 3]\n\nIf there's something we could do to win you back — a discount, a missing feature, a quick walkthrough — reply to this email and we'll make it happen.\n\n— The Flowtora team`,
  );
  const initialFilter = campaign?.audienceFilter as { reasonCodes?: ArchiveReasonCode[]; cancelledSinceDays?: number } | null;
  const [selectedReasons, setSelectedReasons] = React.useState<ArchiveReasonCode[]>(initialFilter?.reasonCodes ?? []);
  const [sinceDays, setSinceDays] = React.useState<number | "">(initialFilter?.cancelledSinceDays ?? 90);
  const [pending, setPending] = React.useState(false);

  const toggleReason = (code: ArchiveReasonCode) => {
    setSelectedReasons((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]);
  };

  const onSubmit = async () => {
    if (!name.trim()) { toast.error("Name is required"); return; }
    if (!subject.trim() || !body.trim()) { toast.error("Subject and body are required"); return; }
    setPending(true);
    try {
      const fd = new FormData();
      if (campaign?.id) fd.set("id", campaign.id);
      fd.set("name", name.trim());
      fd.set("emailSubject", subject.trim());
      fd.set("emailBody", body);
      fd.set("audienceFilterJson", JSON.stringify({
        reasonCodes: selectedReasons,
        cancelledSinceDays: typeof sinceDays === "number" ? sinceDays : undefined,
      }));
      const res = await upsertWinbackCampaign(fd);
      if (res.ok) {
        toast.success(campaign ? "Updated" : "Created");
        onClose();
        router.refresh();
      } else toast.error(res.error ?? "Couldn't save");
    } finally { setPending(false); }
  };

  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogHeader
        title={campaign ? `Edit campaign: ${campaign.name}` : "+ New win-back campaign"}
        description="Define audience, write the email, and start when you're ready. Stats update as the daily cron sends."
        onClose={onClose}
      />
      <DialogBody>
        <div className="flex flex-col gap-4">
          <Input label="Campaign name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />

          <section>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
              Audience
            </h3>
            <div className="flex flex-wrap items-end gap-2">
              <Input
                label="Cancelled in last (days)"
                type="number" min={1} max={3650}
                value={sinceDays}
                onChange={(e) => setSinceDays(e.target.value === "" ? "" : Number(e.target.value))}
                hint="Leave blank for all churned tenants."
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {reasonCodes.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleReason(c)}
                  className="ts-focus inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium"
                  style={{
                    borderColor: selectedReasons.includes(c) ? "var(--accent-primary)" : "var(--border-default)",
                    background: selectedReasons.includes(c) ? "var(--accent-surface)" : "var(--surface-1)",
                    color: selectedReasons.includes(c) ? "var(--accent-primary)" : "var(--text-muted)",
                  }}
                >
                  {ARCHIVE_REASON_LABEL[c]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px]" style={{ color: "var(--text-faint)" }}>
              No reasons selected = match all reason codes.
            </p>
          </section>

          <section>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
              Email
            </h3>
            <div className="flex flex-col gap-2">
              <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
              <Textarea label="Body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} maxLength={8000} />
            </div>
          </section>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={onSubmit} disabled={pending}>
          {pending ? "Saving…" : campaign ? "Save" : "Create campaign"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
