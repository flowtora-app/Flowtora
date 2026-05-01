"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Input,
  Select,
  useToast,
} from "@/components/ui";
import {
  createAuditWebhook,
  deleteAuditWebhook,
  setAuditWebhookActive,
  testAuditWebhook,
} from "@/app/actions/audit-log";
import type { WebhookSubscriptionRow } from "@/server/platform/audit-log";

export function WebhooksButton({ subscriptions }: { subscriptions: WebhookSubscriptionRow[] }) {
  const [open, setOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [secretJustMinted, setSecretJustMinted] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState("*");
  const [minSeverity, setMinSeverity] = React.useState<"INFO" | "WARNING" | "CRITICAL">("INFO");
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const toast = useToast();

  const onCreate = async () => {
    if (!name.trim() || !url.trim()) { toast.error("Name + URL required"); return; }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("name", name.trim());
      fd.set("url", url.trim());
      fd.set("actionFilter", actionFilter.trim() || "*");
      fd.set("minSeverity", minSeverity);
      const res = await createAuditWebhook(fd);
      if (res.ok) {
        toast.success("Subscription created");
        setSecretJustMinted(res.secret);
        setName(""); setUrl(""); setActionFilter("*"); setMinSeverity("INFO");
        setCreating(false);
        router.refresh();
      } else toast.error(res.error ?? "Couldn't create");
    } finally { setPending(false); }
  };

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Subscribe via webhook
      </Button>
      <Dialog open={open} onClose={() => { setOpen(false); setSecretJustMinted(null); setCreating(false); }} size="lg">
        <DialogHeader title="Audit-log webhook subscriptions"
                      description="Each row receives an HMAC-signed POST for every matching audit event. Secret shown once at creation only."
                      onClose={() => { setOpen(false); setSecretJustMinted(null); setCreating(false); }} />
        <DialogBody>
          <div className="flex flex-col gap-4">
            {secretJustMinted && (
              <div className="rounded-md border p-3"
                   style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)", color: "var(--amber-700)" }}>
                <div className="text-[11px] font-semibold uppercase tracking-wide">Secret (shown once)</div>
                <code className="mt-1 block break-all text-[11px]">{secretJustMinted}</code>
                <p className="mt-1 text-[10px]">Copy this now — admins can&apos;t see it again. Rotate by deleting the subscription and creating a new one.</p>
              </div>
            )}

            {creating ? (
              <div className="flex flex-col gap-2.5 rounded-md border p-3"
                   style={{ borderColor: "var(--border-subtle)" }}>
                <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
                <Input label="Destination URL" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={500} />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Input label="Action filter" value={actionFilter}
                         onChange={(e) => setActionFilter(e.target.value)}
                         hint='"*" or comma-separated keys (e.g. "platform.tenant_archived")' />
                  <Select label="Min severity" value={minSeverity}
                          onChange={(e) => setMinSeverity(e.target.value as "INFO" | "WARNING" | "CRITICAL")}>
                    <option value="INFO">Info (everything)</option>
                    <option value="WARNING">Warning + Critical</option>
                    <option value="CRITICAL">Critical only</option>
                  </Select>
                </div>
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setCreating(false)} disabled={pending}>Cancel</Button>
                  <Button size="sm" onClick={onCreate} disabled={pending}>
                    {pending ? "Creating…" : "Create"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" onClick={() => setCreating(true)}>+ New subscription</Button>
            )}

            {subscriptions.length === 0 ? (
              <div className="rounded-md border border-dashed py-6 text-center text-[12px]"
                   style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
                No subscriptions yet.
              </div>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {subscriptions.map((s) => (
                  <SubRow key={s.id} sub={s} />
                ))}
              </ul>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setSecretJustMinted(null); setCreating(false); }}>
            Done
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}

function SubRow({ sub }: { sub: WebhookSubscriptionRow }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  const runFd = async (
    action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    fd: FormData,
    msg: string,
  ) => {
    setBusy(true);
    try {
      const res = await action(fd);
      if (res.ok) { toast.success(msg); router.refresh(); }
      else toast.error(res.error ?? "Couldn't run action");
    } finally { setBusy(false); }
  };

  const onTest = () => {
    const fd = new FormData();
    fd.set("subscriptionId", sub.id);
    return runFd(testAuditWebhook, fd, "Test sent");
  };
  const onToggle = () => {
    const fd = new FormData();
    fd.set("subscriptionId", sub.id);
    fd.set("active", sub.active ? "off" : "on");
    return runFd(setAuditWebhookActive, fd, sub.active ? "Paused" : "Resumed");
  };
  const onDelete = () => {
    if (!window.confirm(`Delete subscription "${sub.name}"?`)) return;
    const fd = new FormData();
    fd.set("subscriptionId", sub.id);
    return runFd(deleteAuditWebhook, fd, "Deleted");
  };

  return (
    <li className="flex items-start gap-3 py-2 text-[12px]">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold" style={{ color: "var(--text-default)" }}>{sub.name}</span>
          <span className="rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  background: sub.active ? "var(--emerald-50)" : "var(--surface-2)",
                  color: sub.active ? "var(--emerald-700)" : "var(--text-muted)",
                }}>
            {sub.active ? "active" : "paused"}
          </span>
          <span className="rounded-full px-1.5 text-[10px]"
                style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
            {sub.minSeverity.toLowerCase()}+
          </span>
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
          {sub.url}
        </div>
        <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
          Filter: <span className="font-mono">{sub.actionFilter}</span> · delivered {sub.totalDelivered} · failed {sub.totalFailed}
          {sub.lastDeliveredAt && ` · last ${sub.lastDeliveredAt.toLocaleString()}`}
        </div>
        {sub.lastFailureReason && (
          <div className="text-[10px]" style={{ color: "var(--rose-700)" }}>
            Last failure: {sub.lastFailureReason}
          </div>
        )}
      </div>
      <div className="shrink-0 flex gap-1.5">
        <Button size="xs" variant="ghost" onClick={onTest} disabled={busy}>Test</Button>
        <Button size="xs" variant="ghost" onClick={onToggle} disabled={busy}>
          {sub.active ? "Pause" : "Resume"}
        </Button>
        <Button size="xs" variant="ghost" onClick={onDelete} disabled={busy}>Delete</Button>
      </div>
    </li>
  );
}
