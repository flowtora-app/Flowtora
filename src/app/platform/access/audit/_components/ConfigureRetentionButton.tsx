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
  Textarea,
  useToast,
} from "@/components/ui";
import { updateRetentionPolicy } from "@/app/actions/audit-log";
import type { RetentionPolicy } from "@/server/platform/audit-log";

export function ConfigureRetentionButton({ retention }: { retention: RetentionPolicy }) {
  const [open, setOpen] = React.useState(false);
  const [defaultDays, setDefaultDays] = React.useState(retention.defaultDays);
  const [overridesJson, setOverridesJson] = React.useState(
    JSON.stringify(retention.overrides, null, 2),
  );
  const [legalHold, setLegalHold] = React.useState(retention.legalHold);
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const toast = useToast();

  const onSubmit = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("defaultDays", String(defaultDays));
      if (overridesJson.trim() && overridesJson.trim() !== "{}") {
        fd.set("overridesJson", overridesJson);
      }
      if (legalHold) fd.set("legalHold", "on");
      const res = await updateRetentionPolicy(fd);
      if (res.ok) { toast.success("Retention saved"); setOpen(false); router.refresh(); }
      else toast.error(res.error ?? "Couldn't save");
    } finally { setPending(false); }
  };

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Configure retention</Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader title="Audit retention"
                      description="Default retention applies to every action key not in overrides. Legal hold pauses retention pruning entirely."
                      onClose={() => setOpen(false)} />
        <DialogBody>
          <div className="flex flex-col gap-3">
            <Input label="Default retention (days)" type="number" min={7} max={36500}
                   value={defaultDays}
                   onChange={(e) => setDefaultDays(Number(e.target.value) || 2555)}
                   hint="Default 2555 ≈ 7 years." />
            <Textarea label="Per-event overrides (JSON)" rows={6}
                      value={overridesJson}
                      onChange={(e) => setOverridesJson(e.target.value)}
                      className="font-mono"
                      hint='Map of action key → days. Example: {"platform.tenant_archived": 3650}' />
            <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
              <input type="checkbox" checked={legalHold}
                     onChange={(e) => setLegalHold(e.target.checked)} />
              Legal hold (pauses retention sweep)
            </label>
            {retention.updatedAt && (
              <p className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                Last updated {retention.updatedAt.toLocaleString()}
              </p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={onSubmit} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
