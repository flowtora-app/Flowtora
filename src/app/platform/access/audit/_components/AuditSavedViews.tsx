"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

const PRESETS: { id: string; label: string; query: string }[] = [
  { id: "sensitive",         label: "Sensitive",       query: "preset=sensitive" },
  { id: "failures",          label: "Failed actions",  query: "preset=failures" },
  { id: "mine",              label: "My actions",      query: "preset=mine" },
  { id: "super_admin_week",  label: "Super-admin · 7d", query: "preset=super_admin_week" },
];

export function AuditSavedViews() {
  const router = useRouter();
  const sp = useSearchParams();
  const active = sp.get("preset") ?? "";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        Saved views
      </span>
      {PRESETS.map((p) => (
        <button key={p.id}
                type="button"
                onClick={() => {
                  const u = new URLSearchParams();
                  if (active !== p.id) u.set("preset", p.id);
                  const q = u.toString();
                  router.replace(q ? `/platform/access/audit?${q}` : "/platform/access/audit");
                }}
                className="ts-focus inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium"
                style={{
                  borderColor: active === p.id ? "var(--accent-primary)" : "var(--border-default)",
                  background: active === p.id ? "var(--accent-surface)" : "var(--surface-1)",
                  color: active === p.id ? "var(--accent-primary)" : "var(--text-muted)",
                }}>
          {p.label}
        </button>
      ))}
    </div>
  );
}
