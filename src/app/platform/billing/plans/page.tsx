import { redirect } from "next/navigation";

// Page 19 spec route is /admin/billing/plans which maps to
// /platform/billing/plans here. The actual implementation has lived
// at /platform/plans since Phase 3, with hundreds of in-app links and
// server-action redirects already pointing there. Rather than churn
// every reference, this thin redirect makes the spec URL reachable.

export default function PlatformBillingPlansRedirect() {
  redirect("/platform/plans");
}
