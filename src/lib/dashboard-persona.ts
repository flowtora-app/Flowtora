// Phase 6 — dashboard personas (expanded).
//
// We have 10 tenant roles. The previous mapping collapsed them into 5
// personas and, for the CSR/Designer/Installer, that meant everyone got
// a generic "production" or "sales" view that didn't match their day.
// This version splits out those three into their own personas — 8 total:
//
//   executive  (OWNER, ADMIN)        — full shop overview
//   sales      (SALES_REP)           — my pipeline, my quotes
//   csr        (CSR)                 — customer comms + approvals
//   designer   (DESIGNER)            — proof queue, revisions
//   production (PRODUCTION_MANAGER)  — WIP + install coordination
//   installer  (INSTALLER)           — my installs this week
//   finance    (ACCOUNTING)          — AR, aging, payments
//   employee   (EMPLOYEE, portal,
//               fallback)            — assigned work
//
// The mapping is deliberate — a CSR spends the day on proofs, approvals,
// and customer follow-up; a Designer lives on the proof queue with a
// different slice of data. A Sales Rep cares about pipeline value, not
// WIP. Giving each their own view lets us tune the KPIs, quick actions,
// and the "needs your attention" feed to what actually matters.
//
// Adding a role to the schema later only requires extending the switch
// here and adding a view to `src/components/dashboard/views/`.

import type { TenantRole } from "@prisma/client";

export type DashboardPersona =
  | "executive"
  | "sales"
  | "csr"
  | "designer"
  | "production"
  | "installer"
  | "finance"
  | "employee";

export function dashboardPersona(role: TenantRole): DashboardPersona {
  switch (role) {
    case "OWNER":
    case "ADMIN":
      return "executive";
    case "SALES_REP":
      return "sales";
    case "CSR":
      return "csr";
    case "DESIGNER":
      return "designer";
    case "PRODUCTION_MANAGER":
      return "production";
    case "INSTALLER":
      return "installer";
    case "ACCOUNTING":
      return "finance";
    case "EMPLOYEE":
    // CUSTOMER_PORTAL is a reserved-but-unassigned enum member (see
    // docs/transformation-plan.md §Phase 1). This case is defensive —
    // if a stray row ever carried the role, fall back to the minimal
    // employee dashboard.
    case "CUSTOMER_PORTAL":
    default:
      return "employee";
  }
}

export const PERSONA_LABEL: Record<DashboardPersona, string> = {
  executive: "Shop overview",
  sales: "Sales pipeline",
  csr: "Customer desk",
  designer: "Design queue",
  production: "Production floor",
  installer: "Your installs",
  finance: "Receivables & billing",
  employee: "Your day",
};

export const PERSONA_SUBTITLE: Record<DashboardPersona, string> = {
  executive: "The whole shop at a glance — pipeline, production, and cash.",
  sales: "Your leads, your quotes, and what's closing this week.",
  csr: "Customer replies, proofs awaiting response, and follow-ups.",
  designer: "Proofs to build, revisions to turn, and what's queued for you.",
  production: "What's on the floor, what's installing, what's blocked.",
  installer: "What you're installing this week and what needs confirming.",
  finance: "Open invoices, aging buckets, and payments collected.",
  employee: "Your tasks and the work assigned to you.",
};
