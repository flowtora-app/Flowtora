"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select, useToast } from "@/components/ui";
import { addTenantIpRule, deleteTenantIpRule } from "@/app/actions/tenant-detail";

export function TenantIpRulesEditor({
  tenantId,
  rules,
}: {
  tenantId: string;
  rules: { id: string; kind: "ALLOW" | "BLOCK"; cidr: string; note: string | null }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = React.useState<"ALLOW" | "BLOCK">("ALLOW");
  const [cidr, setCidr] = React.useState("");
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const onAdd = async () => {
    if (!cidr.trim()) return;
    setPending(true);
    const fd = new FormData();
    fd.set("tenantId", tenantId);
    fd.set("kind", kind);
    fd.set("cidr", cidr.trim());
    if (note.trim()) fd.set("note", note.trim());
    const res = await addTenantIpRule(fd);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error ?? "Couldn't add rule");
      return;
    }
    setCidr("");
    setNote("");
    toast.success("Rule added");
    router.refresh();
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this rule?")) return;
    const fd = new FormData();
    fd.set("id", id);
    const res = await deleteTenantIpRule(fd);
    if (!res.ok) toast.error(res.error ?? "Couldn't delete");
    else { toast.success("Rule removed"); router.refresh(); }
  };

  return (
    <div className="rounded-md border p-3" style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-[110px_1fr_1fr_auto] md:items-end">
        <Select label="Kind" size="sm" value={kind} onChange={(e) => setKind(e.currentTarget.value as "ALLOW" | "BLOCK")}
                options={[
                  { value: "ALLOW", label: "Allow" },
                  { value: "BLOCK", label: "Block" },
                ]} />
        <Input label="CIDR or IP" size="sm" value={cidr} onChange={(e) => setCidr(e.currentTarget.value)} placeholder="192.0.2.0/24" />
        <Input label="Note (optional)" size="sm" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
        <Button size="sm" loading={pending} disabled={!cidr.trim()} onClick={onAdd}>Add rule</Button>
      </div>
      {rules.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          {rules.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onDelete(r.id)}
              className="ts-focus inline-flex items-center gap-1 rounded-full border px-2 py-0.5 hover:bg-[var(--surface-3)]"
              style={{ borderColor: "var(--border-default)", color: "var(--text-default)" }}
              title="Click to remove"
            >
              <span style={{ color: r.kind === "ALLOW" ? "var(--emerald-700)" : "var(--rose-700)" }}>{r.kind === "ALLOW" ? "✓" : "✕"}</span>
              <code className="font-mono">{r.cidr}</code>
              <span style={{ color: "var(--text-faint)" }}>×</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
