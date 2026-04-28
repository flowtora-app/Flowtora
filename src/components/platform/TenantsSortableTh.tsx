"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Sortable <th> for the tenants table. Click to cycle through:
//   inactive → desc → asc → inactive
//
// Sort state is URL-driven via ?sort=<col>&dir=<asc|desc> so it
// survives reload and is shareable. The page reads these and
// applies them to its Prisma orderBy.

interface TenantsSortableThProps {
  /** Column identifier — must match what the page accepts in ?sort=. */
  column: string;
  children: React.ReactNode;
  className?: string;
}

export function TenantsSortableTh({ column, children, className }: TenantsSortableThProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const activeCol = params.get("sort");
  const activeDir = (params.get("dir") ?? "desc") as "asc" | "desc";

  const isActive = activeCol === column;
  const dirIcon = isActive ? (activeDir === "asc" ? "↑" : "↓") : "";

  const onClick = () => {
    const sp = new URLSearchParams(params.toString());
    if (!isActive) {
      sp.set("sort", column);
      sp.set("dir", "desc");
    } else if (activeDir === "desc") {
      sp.set("sort", column);
      sp.set("dir", "asc");
    } else {
      // asc → clear (back to default page sort)
      sp.delete("sort");
      sp.delete("dir");
    }
    sp.delete("page");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <th
      className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wide ${className ?? ""}`}
      style={{ color: isActive ? "var(--text-default)" : "var(--text-muted)" }}
    >
      <button
        type="button"
        onClick={onClick}
        className="ts-focus inline-flex items-center gap-1 rounded-sm font-medium uppercase tracking-wide"
        style={{ color: "inherit" }}
      >
        {children}
        <span aria-hidden style={{ opacity: isActive ? 1 : 0.35 }}>
          {dirIcon || "↕"}
        </span>
      </button>
    </th>
  );
}
