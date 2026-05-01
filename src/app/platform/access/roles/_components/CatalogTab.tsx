"use client";

import * as React from "react";
import { Card, CardBody, Input } from "@/components/ui";
import {
  PLATFORM_ROLE_PERMISSIONS,
  type PlatformPermission,
} from "@/lib/rbac";
import { platformRoleLabel } from "@/lib/rbac";
import type { PlatformRole } from "@prisma/client";

// CatalogTab — searchable list of every permission key with a
// description and which roles grant it. Read-only — adding new
// permission keys requires a code change (engineering-only).

export function CatalogTab({
  catalog,
  descriptions,
}: {
  catalog: { domain: string; perms: PlatformPermission[] }[];
  descriptions: Record<PlatformPermission, string>;
}) {
  const [q, setQ] = React.useState("");

  // Reverse index: which built-in roles include each permission.
  const includedBy = React.useMemo(() => {
    const map = new Map<PlatformPermission, PlatformRole[]>();
    const roles = Object.keys(PLATFORM_ROLE_PERMISSIONS) as PlatformRole[];
    for (const role of roles) {
      for (const p of PLATFORM_ROLE_PERMISSIONS[role]) {
        const arr = map.get(p) ?? [];
        arr.push(role);
        map.set(p, arr);
      }
    }
    return map;
  }, []);

  const filtered = React.useMemo(() => {
    if (!q.trim()) return catalog;
    const needle = q.toLowerCase();
    return catalog
      .map((g) => ({
        domain: g.domain,
        perms: g.perms.filter((p) =>
          p.toLowerCase().includes(needle) ||
          (descriptions[p] ?? "").toLowerCase().includes(needle),
        ),
      }))
      .filter((g) => g.perms.length > 0);
  }, [catalog, q, descriptions]);

  return (
    <div className="space-y-4">
      <Card padding="md">
        <Input
          label="Search permissions"
          size="sm"
          placeholder="e.g. tenant, billing, refund…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {filtered.map((g) => (
          <Card key={g.domain}>
            <CardBody>
              <div className="mb-2 flex items-center gap-2 border-b pb-1.5"
                   style={{ borderColor: "var(--border-subtle)" }}>
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
                  Domain
                </span>
                <span className="text-[13px] font-semibold font-mono" style={{ color: "var(--text-default)" }}>
                  {g.domain}
                </span>
              </div>
              <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                {g.perms.map((p) => (
                  <li key={p} className="flex flex-col gap-1 py-2 text-[12px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono" style={{ color: "var(--text-default)" }}>{p}</span>
                      <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                        {includedBy.get(p)?.length ?? 0} role{(includedBy.get(p)?.length ?? 0) === 1 ? "" : "s"}
                      </span>
                    </div>
                    <span style={{ color: "var(--text-muted)" }}>{descriptions[p] ?? ""}</span>
                    <div className="flex flex-wrap gap-1">
                      {(includedBy.get(p) ?? []).map((role) => (
                        <span key={role} className="inline-flex items-center rounded-full px-1.5 text-[10px]"
                              style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
                          {platformRoleLabel(role)}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>

      {filtered.length === 0 && (
        <Card padding="lg">
          <div className="text-center text-[12px]" style={{ color: "var(--text-faint)" }}>
            No permissions match.
          </div>
        </Card>
      )}

      <Card padding="sm" style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)" }}>
        <p className="text-[11px]" style={{ color: "var(--amber-700)" }}>
          <strong>Adding new permission keys</strong> is engineering-only — they live in <span className="font-mono">src/lib/rbac.ts</span>
          {" "}so the type system catches misspellings at every call site.
        </p>
      </Card>
    </div>
  );
}
