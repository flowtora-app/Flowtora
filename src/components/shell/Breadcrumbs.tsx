"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";

// Auto-derived breadcrumbs for tenant pages. We strip the /t/[slug]
// prefix and render the remaining path segments. A mapping table
// translates segment slugs ("feature-flags") into human labels
// ("Feature flags"); unknown segments fall back to a Title-Cased version.
//
// This component intentionally stays dumb: no access to page-level data
// (like a customer name). Pages that want "… / Acme Signs" breadcrumbs
// should render their own <Breadcrumb> from @/components/ui at the top
// of the page body.

const LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  attention: "Needs attention",
  leads: "Pipeline",
  customers: "Customers",
  tasks: "Tasks",
  products: "Products",
  quotes: "Quotes",
  orders: "Orders",
  installs: "Installs",
  invoices: "Invoices",
  reports: "Reports",
  support: "Support",
  settings: "Settings",
  notifications: "Notifications",
  onboarding: "Setup",
  "message-templates": "Messages",
  "feature-flags": "Feature flags",
  compliance: "Compliance",
  audit: "Audit log",
  platform: "Platform",
  tenants: "Tenants",
  design: "Design system",
  franchise: "Group",
  billing: "Billing",
  profile: "Profile",
  numbering: "Numbering",
  financial: "Financial",
  workflow: "Workflow",
  locations: "Locations",
  templates: "Checklists",
  team: "Team",
  danger: "Danger zone",
};

function prettify(seg: string) {
  if (LABELS[seg]) return LABELS[seg];
  // CUIDs are long + lowercase + alphanumeric. If the segment is 20+
  // chars with no separators, it's probably an id — hide it.
  if (seg.length >= 20 && /^[a-z0-9]+$/.test(seg)) return null;
  return seg
    .split("-")
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(" ");
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const params = useParams<{ slug?: string }>();
  const slug = params?.slug;

  const segments = pathname.split("/").filter(Boolean);
  // Expected shape: ["t", slug, ...rest]
  const rest = slug && segments[0] === "t" && segments[1] === slug
    ? segments.slice(2)
    : segments;

  if (rest.length === 0) return null;

  const trail: { label: string; href?: string }[] = [];
  let acc = slug ? `/t/${slug}` : "";
  for (let i = 0; i < rest.length; i++) {
    const seg = rest[i];
    acc += `/${seg}`;
    const label = prettify(seg);
    if (!label) continue; // skip ids
    const isLast = i === rest.length - 1;
    trail.push({ label, href: isLast ? undefined : acc });
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1.5 text-xs"
      style={{ color: "var(--text-muted)" }}
    >
      {trail.map((t, i) => {
        const isLast = i === trail.length - 1;
        return (
          <React.Fragment key={i}>
            {t.href && !isLast ? (
              <Link href={t.href} className="rounded px-1 py-0.5 hover:underline">
                {t.label}
              </Link>
            ) : (
              <span
                className="px-1 py-0.5"
                style={{ color: isLast ? "var(--text-default)" : "var(--text-muted)" }}
                aria-current={isLast ? "page" : undefined}
              >
                {t.label}
              </span>
            )}
            {!isLast && <span style={{ color: "var(--text-faint)" }}>/</span>}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
