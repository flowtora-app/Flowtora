// Shared bits for the Industry Templates pages.

import * as React from "react";
import type {
  IndustryTemplateKind,
  IndustryTemplateStatus,
} from "@prisma/client";

export const KIND_LABEL: Record<IndustryTemplateKind, string> = {
  STOREFRONT: "Storefronts",
  QUOTE_PDF: "Quote PDFs",
  WORK_ORDER: "Work Orders",
  INVOICE: "Invoices",
  PROOF_EMAIL: "Proof Emails",
  CUSTOMER_EMAIL: "Customer Emails",
};

export const KIND_DESCRIPTION: Record<IndustryTemplateKind, string> = {
  STOREFRONT: "Tenant-facing marketing pages",
  QUOTE_PDF: "Quote document for prospects",
  WORK_ORDER: "Shop-floor production sheet",
  INVOICE: "Invoice document",
  PROOF_EMAIL: "Proof-approval email",
  CUSTOMER_EMAIL: "Generic customer communication",
};

export const STATUS_LABEL: Record<IndustryTemplateStatus, string> = {
  DRAFT: "Draft",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export function Kpi({
  label, value, sub, tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "good" | "warning" | "danger";
}) {
  const palette =
    tone === "good"    ? { borderColor: "var(--emerald-200)" } :
    tone === "warning" ? { borderColor: "var(--amber-200)" } :
    tone === "danger"  ? { borderColor: "var(--rose-200)" } :
                          undefined;
  return (
    <div className="rounded-lg border px-4 py-3"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", ...(palette ?? {}) }}>
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-[22px] font-semibold leading-none tabular-nums"
           style={{ color: "var(--text-default)" }}>
        {value}
      </div>
      {sub && <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{sub}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: IndustryTemplateStatus }) {
  const palette =
    status === "PUBLISHED" ? { bg: "var(--success-surface)", fg: "var(--success-fg)" } :
    status === "DRAFT"     ? { bg: "var(--surface-2)",       fg: "var(--text-muted)" } :
                              { bg: "var(--surface-2)",       fg: "var(--text-faint)" };
  return (
    <span className="inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{ background: palette.bg, color: palette.fg }}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function DeferredNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border px-3 py-2 text-[11px]"
         style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)", color: "var(--amber-700)" }}>
      {children}
    </div>
  );
}
