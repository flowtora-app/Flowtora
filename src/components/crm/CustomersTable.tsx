"use client";

import * as React from "react";
import Link from "next/link";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { HealthBadge } from "@/components/crm/HealthBadge";
import type { HealthTier } from "@/lib/opportunity-health";
import { bulkSetCustomerStatus, bulkTagCustomers, deleteCustomer } from "@/app/actions/customers";

// Shape passed from the server page. We keep it flat + serializable
// so the page can hand us plain data without leaking Prisma Decimal
// instances (which don't survive the client boundary).
export type CustomersTableRow = {
  id: string;
  name: string;
  kind: string;
  status: string;
  stage: string;
  stageLabel: string;
  stageColor: string;
  ownerId: string | null;
  ownerName: string | null;
  value: string; // already formatted
  email: string | null;
  phone: string | null;
  tags: string[];
  health: {
    tier: HealthTier;
    score: number;
    atRisk: boolean;
  } | null;
};

interface CustomersTableProps {
  slug: string;
  rows: CustomersTableRow[];
  empty: React.ReactNode;
  canEdit: boolean;
}

export function CustomersTable({ slug, rows, empty, canEdit }: CustomersTableProps) {
  const columns: DataTableColumn<CustomersTableRow>[] = [
    {
      key: "name",
      header: "Name",
      cell: (c) => (
        <div>
          <div className="font-medium" style={{ color: "var(--text-default)" }}>
            {c.name}
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            {humanize(c.kind)} · {humanize(c.status)}
          </div>
          {c.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {c.tags.slice(0, 4).map((tag) => (
                <Link
                  key={tag}
                  href={`/t/${slug}/customers?tag=${encodeURIComponent(tag)}`}
                  onClick={(e) => e.stopPropagation()}
                  className="inline-block rounded-full px-1.5 py-0.5 text-[10px] hover:brightness-110"
                  style={{
                    background: "var(--accent-surface)",
                    color: "var(--accent-primary)",
                  }}
                >
                  {tag}
                </Link>
              ))}
              {c.tags.length > 4 && (
                <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                  +{c.tags.length - 4}
                </span>
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "stage",
      header: "Stage",
      cell: (c) => (
        <span
          className="rounded-full px-2 py-0.5 text-xs"
          style={{ background: c.stageColor, color: "white" }}
        >
          {c.stageLabel}
        </span>
      ),
    },
    {
      key: "health",
      header: "Health",
      hideBelow: "md",
      cell: (c) =>
        c.health ? (
          <HealthBadge
            tier={c.health.tier}
            score={c.health.score}
            atRisk={c.health.atRisk}
            size="sm"
          />
        ) : (
          <span style={{ color: "var(--text-muted)" }}>—</span>
        ),
    },
    {
      key: "owner",
      header: "Owner",
      hideBelow: "md",
      cell: (c) => (
        <span style={{ color: "var(--text-muted)" }}>
          {c.ownerName ?? "—"}
        </span>
      ),
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      hideBelow: "md",
      cell: (c) => c.value,
    },
    {
      key: "email",
      header: "Email",
      hideBelow: "lg",
      cell: (c) => (
        <span className="truncate" style={{ color: "var(--text-muted)" }}>
          {c.email ?? "—"}
        </span>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      hideBelow: "lg",
      cell: (c) => (
        <span style={{ color: "var(--text-muted)" }}>{c.phone ?? "—"}</span>
      ),
    },
  ];

  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowHref={(c) => `/t/${slug}/customers/${c.id}`}
      empty={empty}
      selectable={canEdit}
      densityKey="customers"
      bulkActions={canEdit ? (ids, clear) => (
        <BulkBar slug={slug} ids={ids} onAfter={clear} />
      ) : undefined}
      rowActions={
        canEdit
          ? (c) => [
              { label: "Open customer", href: `/t/${slug}/customers/${c.id}` },
              { label: "Edit details", href: `/t/${slug}/customers/${c.id}/edit` },
              { label: "New quote", href: `/t/${slug}/quotes/new?customer=${c.id}` },
              { type: "separator" as const },
              {
                label: "Delete",
                destructive: true,
                form: (
                  <form
                    action={deleteCustomer.bind(null, slug, c.id)}
                    onSubmit={(e) => {
                      if (!confirm(`Delete ${c.name}? This can't be undone.`)) {
                        e.preventDefault();
                      }
                    }}
                  >
                    <button
                      type="submit"
                      className="w-full px-3 py-2 text-left text-sm"
                      style={{ color: "var(--danger-fg)" }}
                    >
                      Delete customer
                    </button>
                  </form>
                ),
              },
            ]
          : undefined
      }
    />
  );
}

function BulkBar({
  slug,
  ids,
  onAfter,
}: {
  slug: string;
  ids: string[];
  onAfter: () => void;
}) {
  const [tagOpen, setTagOpen] = React.useState(false);
  const [tag, setTag] = React.useState("");
  const serialized = ids.join(",");

  const setStatus = async (status: "ACTIVE" | "INACTIVE" | "ARCHIVED") => {
    const fd = new FormData();
    fd.set("ids", serialized);
    fd.set("status", status);
    await bulkSetCustomerStatus(slug, fd);
    onAfter();
  };

  const tagSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!tag.trim()) return;
    const fd = new FormData();
    fd.set("ids", serialized);
    fd.set("tag", tag.trim());
    await bulkTagCustomers(slug, fd);
    setTag("");
    setTagOpen(false);
    onAfter();
  };

  return (
    <>
      {tagOpen ? (
        <form onSubmit={tagSubmit} className="flex items-center gap-1.5">
          <input
            autoFocus
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="Tag name"
            className="ts-focus rounded-md px-2 py-1 text-xs outline-none"
            style={{
              background: "var(--surface-0)",
              border: "1px solid var(--border-default)",
              color: "var(--text-default)",
              width: 140,
            }}
          />
          <button
            type="submit"
            className="ts-focus rounded-md px-2 py-1 text-xs font-semibold"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            Apply
          </button>
          <button
            type="button"
            onClick={() => {
              setTagOpen(false);
              setTag("");
            }}
            className="ts-focus rounded-md px-2 py-1 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Cancel
          </button>
        </form>
      ) : (
        <>
          <BulkButton onClick={() => setTagOpen(true)}>Add tag</BulkButton>
          <BulkButton onClick={() => setStatus("ACTIVE")}>Mark active</BulkButton>
          <BulkButton onClick={() => setStatus("INACTIVE")}>Mark inactive</BulkButton>
          <BulkButton onClick={() => setStatus("ARCHIVED")} destructive>
            Archive
          </BulkButton>
        </>
      )}
    </>
  );
}

function BulkButton({
  onClick,
  children,
  destructive,
}: {
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="ts-focus rounded-md px-2.5 py-1 text-xs font-medium transition-colors hover:brightness-110"
      style={{
        background: "var(--surface-0)",
        border: `1px solid ${
          destructive ? "var(--danger-fg)" : "var(--border-default)"
        }`,
        color: destructive ? "var(--danger-fg)" : "var(--text-default)",
      }}
    >
      {children}
    </button>
  );
}

function humanize(s: string): string {
  return s.replace(/_/g, " ").toLowerCase();
}
