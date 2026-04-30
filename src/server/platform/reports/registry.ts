// Pre-built reports registry — Page 3 of the admin spec.
//
// Every entry below is a report the platform ships out of the box.
// The library page reads this registry to build its grid; the
// detail page reads it to look up the loader and viz config.
//
// Three states for each entry's data source:
//   • READY    — we have the data, real numbers
//   • PARTIAL  — we have *some* of the data, the loader returns
//                a useful approximation but flags the gap
//   • PENDING  — the source we'd need (NPS scores, bug tracker,
//                affiliate program) doesn't exist yet. The detail
//                page renders an "Awaiting data source" empty state
//                with a clear explanation instead of fake numbers.
//
// We never fake values for PENDING — being honest about what
// exists matters more than padding the catalog.

export type ReportCategory =
  | "financials"
  | "subscriptions"
  | "tenants"
  | "cohorts"
  | "funnels"
  | "feature-adoption"
  | "engagement"
  | "industry-benchmarks"
  | "support"
  | "operations"
  | "security";

export type ReportVizKind =
  | "waterfall"
  | "line"
  | "area"
  | "bar"
  | "donut"
  | "stacked-bar"
  | "funnel"
  | "sankey"
  | "heatmap"
  | "table-only"
  | "kpi-grid";

export type ReportDataState = "READY" | "PARTIAL" | "PENDING";

export interface ReportRegistryEntry {
  key: string;
  name: string;
  description: string;
  category: ReportCategory;
  viz: ReportVizKind;
  dataState: ReportDataState;
  /** When PARTIAL or PENDING, what's missing — surfaced on the
   *  detail page as an explanatory banner. */
  dataNote?: string;
  /** Single emoji used as the report icon in the library grid.
   *  Replace with a proper Lucide icon if/when we want a
   *  consistent illustration set. */
  icon: string;
}

export const REPORT_CATEGORIES: { id: ReportCategory; label: string }[] = [
  { id: "financials",          label: "Financials" },
  { id: "subscriptions",       label: "Subscriptions" },
  { id: "tenants",             label: "Tenants" },
  { id: "cohorts",             label: "Cohorts" },
  { id: "funnels",             label: "Funnels" },
  { id: "feature-adoption",    label: "Feature adoption" },
  { id: "engagement",          label: "Engagement" },
  { id: "industry-benchmarks", label: "Industry benchmarks" },
  { id: "support",             label: "Support" },
  { id: "operations",          label: "Operations" },
  { id: "security",            label: "Security" },
];

export const REPORT_REGISTRY: ReportRegistryEntry[] = [
  // 1
  {
    key: "mrr-movement-waterfall",
    name: "MRR Movement Waterfall",
    description: "Starting MRR → expansion → contraction → churn → new = ending MRR.",
    category: "financials",
    viz: "waterfall",
    dataState: "READY",
    icon: "💧",
  },
  // 2
  {
    key: "arr-trend-12m",
    name: "ARR Trend (12m)",
    description: "Annualised recurring revenue over the last 12 months.",
    category: "financials",
    viz: "area",
    dataState: "READY",
    icon: "📈",
  },
  // 3
  {
    key: "churn-analysis",
    name: "Churn Analysis",
    description: "Gross + net + revenue + logo churn over time.",
    category: "subscriptions",
    viz: "stacked-bar",
    dataState: "READY",
    icon: "🌊",
  },
  // 4
  {
    key: "cohort-retention-heatmap",
    name: "Cohort Retention Heatmap",
    description: "Signup-month cohorts × months-since-signup retention rate.",
    category: "cohorts",
    viz: "heatmap",
    dataState: "READY",
    icon: "🔲",
  },
  // 5
  {
    key: "onboarding-funnel",
    name: "Onboarding Funnel",
    description: "Sign-up → setup steps → first quote → first invoice paid.",
    category: "funnels",
    viz: "funnel",
    dataState: "READY",
    icon: "🪜",
  },
  // 6
  {
    key: "trial-conversion-funnel",
    name: "Trial Conversion Funnel",
    description: "Trial signup → activation → trial-to-paid conversion.",
    category: "funnels",
    viz: "funnel",
    dataState: "READY",
    icon: "🎯",
  },
  // 7
  {
    key: "feature-adoption-matrix",
    name: "Feature Adoption Matrix",
    description: "Per-plan feature entitlement × tenant override count.",
    category: "feature-adoption",
    viz: "heatmap",
    dataState: "PARTIAL",
    dataNote: "Counts per-tenant FeatureFlag overrides plus baseline plan entitlements. We don't yet track per-tenant feature *usage* — those numbers would come from app-level instrumentation in a later slice.",
    icon: "🧩",
  },
  // 8
  {
    key: "nps-trend",
    name: "NPS Trend",
    description: "Net Promoter Score over time, plus promoter / passive / detractor split.",
    category: "engagement",
    viz: "line",
    dataState: "READY",
    icon: "💬",
  },
  // 9
  {
    key: "top-customer-ltv",
    name: "Top Customer Lifetime Value",
    description: "Top 50 tenants by total payments to date.",
    category: "financials",
    viz: "table-only",
    dataState: "READY",
    icon: "💎",
  },
  // 10
  {
    key: "plan-migration-sankey",
    name: "Plan Migration Sankey",
    description: "From-plan → to-plan flows over the selected window.",
    category: "subscriptions",
    viz: "sankey",
    dataState: "READY",
    icon: "🔀",
  },
  // 11
  {
    key: "revenue-by-region",
    name: "Revenue by Region",
    description: "Payments aggregated by country.",
    category: "financials",
    viz: "bar",
    dataState: "READY",
    icon: "🌎",
  },
  // 12
  {
    key: "tax-liability-jurisdiction",
    name: "Tax Liability by Jurisdiction",
    description: "Estimated tax owed per country (uncollected).",
    category: "financials",
    viz: "table-only",
    dataState: "PARTIAL",
    dataNote: "Calculates a flat 0% pass-through — Flowtora doesn't yet operate a Stripe Tax integration. The schema is ready (Tenant.country, Payment.amount), so once we plug Stripe Tax in, the per-jurisdiction collected-vs-owed split lights up.",
    icon: "🧾",
  },
  // 13
  {
    key: "support-sla-compliance",
    name: "Support Ticket SLA Compliance",
    description: "First-response and resolution-time compliance vs. policy.",
    category: "support",
    viz: "stacked-bar",
    dataState: "READY",
    icon: "⏱️",
  },
  // 14
  {
    key: "bug-volume-by-module",
    name: "Bug Report Volume by Module",
    description: "BUG-category tickets grouped by the module they touch.",
    category: "operations",
    viz: "bar",
    dataState: "READY",
    icon: "🐛",
  },
  // 15
  {
    key: "api-usage-by-tenant",
    name: "API Usage by Tenant",
    description: "API-flagged audit-log volume per tenant (last 30 days).",
    category: "engagement",
    viz: "bar",
    dataState: "PARTIAL",
    dataNote: "Approximates API usage by counting AuditLog rows with action prefix `api.*`. Real usage tracking would need a per-request middleware emitting metric counters.",
    icon: "🔌",
  },
  // 16
  {
    key: "storage-growth-by-tenant",
    name: "Storage Growth by Tenant",
    description: "Stored-file count + cumulative size per tenant.",
    category: "operations",
    viz: "table-only",
    dataState: "PARTIAL",
    dataNote: "We count files on the FileObject table (count + sum of sizeBytes) but Flowtora isn't enforcing per-tenant storage caps yet, so the cumulative number is informational rather than billable.",
    icon: "💾",
  },
  // 17
  {
    key: "failed-payment-recovery",
    name: "Failed Payment Recovery Funnel",
    description: "Failed → retry → succeed → recovered MRR per dunning stage.",
    category: "financials",
    viz: "funnel",
    dataState: "READY",
    icon: "🛟",
  },
  // 18
  {
    key: "coupon-performance",
    name: "Coupon Performance",
    description: "Per-coupon redemptions, gross discount, net retained MRR.",
    category: "financials",
    viz: "table-only",
    dataState: "READY",
    icon: "🎟️",
  },
  // 19
  {
    key: "affiliate-earnings",
    name: "Affiliate Earnings",
    description: "Per-affiliate referrals + commission accrued from attributed payments.",
    category: "financials",
    viz: "table-only",
    dataState: "READY",
    icon: "🤝",
  },
  // 20
  {
    key: "industry-vertical-benchmarks",
    name: "Industry Vertical Benchmarks",
    description: "MRR + active count + churn by businessType (sign vs print vs apparel).",
    category: "industry-benchmarks",
    viz: "stacked-bar",
    dataState: "READY",
    icon: "🏭",
  },
];

export function findReportByKey(key: string): ReportRegistryEntry | undefined {
  return REPORT_REGISTRY.find((r) => r.key === key);
}

export function reportsByCategory(category: ReportCategory): ReportRegistryEntry[] {
  return REPORT_REGISTRY.filter((r) => r.category === category);
}
