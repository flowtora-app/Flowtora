"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button, Dialog, DialogBody, DialogFooter, DialogHeader, Input, Select, Textarea, useToast,
} from "@/components/ui";
import {
  bulkAddTag, bulkRemoveTag,
  bulkSuspend, bulkReactivate,
  bulkMovePlan, bulkApplyCoupon,
  bulkAssignCsm, bulkEmailOwners,
  bulkHardDelete,
} from "@/app/actions/tenants-bulk";

export type BulkKind =
  | "tag-add" | "tag-remove" | "suspend" | "reactivate"
  | "plan"    | "coupon"     | "csm"     | "email" | "delete";

export interface BulkModalProps {
  kind: BulkKind;
  ids: string[];
  onClose: () => void;
}

export function BulkModal({ kind, ids, onClose }: BulkModalProps) {
  const toast = useToast();
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  // Generic field shapes — each modal binds the ones it needs.
  const [tag, setTag] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [plan, setPlan] = React.useState<"STARTER" | "GROWTH" | "PRO" | "ENTERPRISE">("PRO");
  const [coupon, setCoupon] = React.useState("");
  const [csmUserId, setCsmUserId] = React.useState<string>("none");
  const [csmOptions, setCsmOptions] = React.useState<{ id: string; label: string }[]>([]);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");

  // Lazy-load CSM options when the assign-CSM modal opens.
  React.useEffect(() => {
    if (kind !== "csm") return;
    void (async () => {
      try {
        const res = await fetch("/api/platform/staff-options", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { options: { id: string; label: string }[] };
        setCsmOptions(data.options);
      } catch {
        // Silently fail — fall back to "type a user id" textbox below.
      }
    })();
  }, [kind]);

  const submit = async () => {
    setPending(true);
    const fd = new FormData();
    fd.set("ids", ids.join(","));
    let res: { ok: boolean; error?: string; count?: number } = { ok: false };
    try {
      if (kind === "tag-add") {
        fd.set("tag", tag);
        res = await bulkAddTag(fd);
      } else if (kind === "tag-remove") {
        fd.set("tag", tag);
        res = await bulkRemoveTag(fd);
      } else if (kind === "suspend") {
        fd.set("reason", reason);
        res = await bulkSuspend(fd);
      } else if (kind === "reactivate") {
        res = await bulkReactivate(fd);
      } else if (kind === "plan") {
        fd.set("plan", plan);
        res = await bulkMovePlan(fd);
      } else if (kind === "coupon") {
        fd.set("code", coupon);
        res = await bulkApplyCoupon(fd);
      } else if (kind === "csm") {
        fd.set("csmUserId", csmUserId);
        res = await bulkAssignCsm(fd);
      } else if (kind === "email") {
        fd.set("subject", subject);
        fd.set("body", body);
        res = await bulkEmailOwners(fd);
      } else if (kind === "delete") {
        fd.set("confirmation", confirmation);
        res = await bulkHardDelete(fd);
      }
    } catch (err) {
      res = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    setPending(false);
    if (!res.ok) {
      toast.error(res.error ?? "Action failed");
      return;
    }
    toast.success(`${res.count ?? ids.length} tenant${(res.count ?? ids.length) === 1 ? "" : "s"} updated`);
    onClose();
    router.refresh();
  };

  const t = (() => {
    switch (kind) {
      case "tag-add":    return { title: "Add tag",          description: `Add a tag to ${ids.length} tenant${ids.length === 1 ? "" : "s"}.`, button: "Add tag" };
      case "tag-remove": return { title: "Remove tag",       description: `Remove a tag from ${ids.length} tenant${ids.length === 1 ? "" : "s"}. Tenants without the tag are skipped.`, button: "Remove tag" };
      case "suspend":    return { title: "Suspend",          description: `Sign-in stops immediately for owners of ${ids.length} tenant${ids.length === 1 ? "" : "s"}. Reactivate restores access.`, button: "Suspend" };
      case "reactivate": return { title: "Reactivate",       description: `Lift suspension on ${ids.length} tenant${ids.length === 1 ? "" : "s"} and flip them back to ACTIVE.`, button: "Reactivate" };
      case "plan":       return { title: "Move plan",        description: `Change the plan on ${ids.length} tenant${ids.length === 1 ? "" : "s"}. MRR-movement events log the change.`, button: "Apply plan change" };
      case "coupon":     return { title: "Apply coupon",     description: `Set the active coupon on ${ids.length} tenant${ids.length === 1 ? "" : "s"}. Replaces any existing coupon on the row.`, button: "Apply coupon" };
      case "csm":        return { title: "Assign CSM",       description: `Set the account manager on ${ids.length} tenant${ids.length === 1 ? "" : "s"}.`, button: "Assign" };
      case "email":      return { title: "Email selected",   description: `Send a one-off email to the OWNER of ${ids.length} tenant${ids.length === 1 ? "" : "s"}.`, button: "Send" };
      case "delete":     return { title: "Hard delete",      description: `Permanently delete ${ids.length} tenant${ids.length === 1 ? "" : "s"} and every cascade-linked row. This can't be undone.`, button: "Delete forever" };
    }
  })();

  return (
    <Dialog open onClose={onClose} size={kind === "email" ? "lg" : "md"}>
      <DialogHeader title={t.title} description={t.description} />
      <DialogBody>
        {kind === "tag-add" || kind === "tag-remove" ? (
          <Input
            label="Tag"
            value={tag}
            onChange={(e) => setTag(e.currentTarget.value.toLowerCase())}
            placeholder="vip"
            hint="Lowercase letters, numbers, dashes and underscores."
            autoFocus
          />
        ) : null}
        {kind === "suspend" ? (
          <Textarea
            label="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            placeholder="Customer breach of terms…"
            rows={3}
          />
        ) : null}
        {kind === "plan" ? (
          <Select
            label="New plan"
            value={plan}
            onChange={(e) => setPlan(e.currentTarget.value as typeof plan)}
            options={[
              { value: "STARTER",    label: "Starter" },
              { value: "GROWTH",     label: "Growth" },
              { value: "PRO",        label: "Pro" },
              { value: "ENTERPRISE", label: "Enterprise" },
            ]}
          />
        ) : null}
        {kind === "coupon" ? (
          <Input
            label="Coupon code"
            value={coupon}
            onChange={(e) => setCoupon(e.currentTarget.value.toUpperCase())}
            placeholder="LAUNCH2026"
            autoFocus
          />
        ) : null}
        {kind === "csm" ? (
          <Select
            label="Account manager"
            value={csmUserId}
            onChange={(e) => setCsmUserId(e.currentTarget.value)}
            options={[
              { value: "none", label: "Unassign" },
              ...csmOptions.map((o) => ({ value: o.id, label: o.label })),
            ]}
            hint={csmOptions.length === 0 ? "Loading staff users…" : undefined}
          />
        ) : null}
        {kind === "email" ? (
          <div className="flex flex-col gap-3">
            <Input label="Subject" value={subject} onChange={(e) => setSubject(e.currentTarget.value)} required autoFocus />
            <Textarea label="Body (plain text)" value={body} onChange={(e) => setBody(e.currentTarget.value)} rows={8} required />
            <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
              Sent to the OWNER membership of each selected tenant via Resend. No template variables — what you type is what they get.
            </div>
          </div>
        ) : null}
        {kind === "delete" ? (
          <Input
            label='Type "DELETE" to confirm'
            value={confirmation}
            onChange={(e) => setConfirmation(e.currentTarget.value)}
            error={confirmation && confirmation !== "DELETE" ? "Must match exactly" : undefined}
            autoFocus
          />
        ) : null}
        {kind === "reactivate" ? (
          <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            CANCELED tenants get a REACTIVATED subscription event so MRR-movement reports
            account for the comeback.
          </div>
        ) : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button
          loading={pending}
          disabled={
               (kind === "tag-add" || kind === "tag-remove") && !tag.trim()
            || kind === "coupon" && !coupon.trim()
            || kind === "email"  && (!subject.trim() || !body.trim())
            || kind === "delete" && confirmation !== "DELETE"
          }
          onClick={submit}
          variant={kind === "delete" ? "destructive" : "primary"}
        >
          {t.button}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
