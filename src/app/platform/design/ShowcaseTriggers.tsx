"use client";

import * as React from "react";
import {
  Button,
  Banner,
  ConfirmDialog,
  Drawer,
  FilterBar,
  Pagination,
  PillFilterChips,
  SearchWithSuggestions,
  type Suggestion,
  useToast,
} from "@/components/ui";

// Interactive demos for the design system page. The page itself is a
// server component; this client wrapper holds open/close state for
// modals/drawers and exposes one button per scenario.

export function ConfirmTriggers() {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [destructiveOpen, setDestructiveOpen] = React.useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(true)}>
        Confirmation
      </Button>
      <Button variant="destructive" size="sm" onClick={() => setDestructiveOpen(true)}>
        Destructive (type-to-confirm)
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Send invitations?"
        description="Three team members will receive a sign-in link by email. They'll have 7 days to accept."
        confirmLabel="Send invites"
        onConfirm={() => {
          // demo: simulate async work
          return new Promise((resolve) => setTimeout(() => { setConfirmOpen(false); resolve(); }, 800));
        }}
      />
      <ConfirmDialog
        open={destructiveOpen}
        onClose={() => setDestructiveOpen(false)}
        variant="destructive"
        title="Delete tenant ACME-SIGNS?"
        description="60 invoices and all related data will be retained for 7 years for compliance, but the tenant will lose access immediately. Type the tenant's slug to confirm."
        typeToConfirm="acme-signs"
        confirmLabel="Delete tenant"
        onConfirm={() => {
          return new Promise((resolve) => setTimeout(() => { setDestructiveOpen(false); resolve(); }, 800));
        }}
      />
    </div>
  );
}

export function DrawerTriggers() {
  const [right, setRight] = React.useState(false);
  const [left, setLeft] = React.useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={() => setRight(true)}>
        Right drawer
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setLeft(true)}>
        Left drawer
      </Button>
      <Drawer
        open={right}
        onOpenChange={setRight}
        side="right"
        size="md"
        title="Tenant filters"
        description="Filter the tenant list by health, plan, and cohort."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setRight(false)}>
              Reset
            </Button>
            <Button size="sm" onClick={() => setRight(false)}>
              Apply
            </Button>
          </>
        }
      >
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Drawer body content goes here. Spec §0.5.29 — header sticky,
          tabs optional, body scrolls, footer sticky.
        </p>
      </Drawer>
      <Drawer
        open={left}
        onOpenChange={setLeft}
        side="left"
        size="sm"
        title="Quick nav"
      >
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Left drawer — useful for secondary nav sheets.
        </p>
      </Drawer>
    </div>
  );
}

export function ToastTriggers() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={() => toast.success("Saved.")}>
        Success
      </Button>
      <Button variant="secondary" size="sm" onClick={() => toast.info("Invite sent", { description: "They'll get a sign-in link by email." })}>
        Info
      </Button>
      <Button variant="secondary" size="sm" onClick={() => toast.warning("Plan limit approaching", { description: "85% of monthly quotes used." })}>
        Warning
      </Button>
      <Button variant="secondary" size="sm" onClick={() => toast.error("Couldn't save", { description: "Network error — try again in a moment." })}>
        Error
      </Button>
      <Button variant="secondary" size="sm" onClick={() => toast.loading("Importing tenants…")}>
        Loading
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          toast.promise(
            new Promise<{ count: number }>((res) => setTimeout(() => res({ count: 47 }), 1500)),
            {
              loading: "Generating report…",
              success: (data) => `Got ${data.count} rows.`,
              error:   () => "Report failed to generate.",
            },
          )
        }
      >
        Promise
      </Button>
    </div>
  );
}

/* ── Pagination demo ───────────────────────────────────────── */

export function PaginationDemos() {
  const [page1, setPage1] = React.useState(3);
  const [size1, setSize1] = React.useState(25);
  const [page2, setPage2] = React.useState(7);
  const [size2, setSize2] = React.useState(50);
  const [page3, setPage3] = React.useState(1);
  return (
    <div className="space-y-4">
      <Pagination
        variant="numbered"
        page={page1}
        pageSize={size1}
        total={1247}
        onPageChange={setPage1}
        onPageSizeChange={setSize1}
      />
      <Pagination
        variant="prev-next"
        page={page2}
        pageSize={size2}
        total={50_000}
        onPageChange={setPage2}
        onPageSizeChange={setSize2}
      />
      <Pagination
        variant="load-more"
        page={page3}
        pageSize={20}
        total={120}
        onPageChange={setPage3}
      />
    </div>
  );
}

/* ── PillFilterChips demo ──────────────────────────────────── */

export function PillFilterChipsDemos() {
  const [single, setSingle] = React.useState<string | null>("active");
  const [multi, setMulti] = React.useState<string[]>(["growth", "pro"]);
  return (
    <div className="space-y-4">
      <PillFilterChips
        mode="single"
        label="Status"
        value={single}
        onChange={setSingle}
        options={[
          { value: "all",      label: "All",      count: 1247 },
          { value: "active",   label: "Active",   count: 1014 },
          { value: "trialing", label: "Trialing", count: 189 },
          { value: "past_due", label: "Past due", count: 27 },
          { value: "suspended", label: "Suspended", count: 17 },
        ]}
      />
      <PillFilterChips
        mode="multi"
        label="Plan"
        value={multi}
        onChange={setMulti}
        options={[
          { value: "starter",    label: "Starter" },
          { value: "growth",     label: "Growth" },
          { value: "pro",        label: "Pro" },
          { value: "enterprise", label: "Enterprise" },
        ]}
      />
    </div>
  );
}

/* ── FilterBar demo ────────────────────────────────────────── */

export function FilterBarDemo() {
  const [query, setQuery] = React.useState("");
  const [filters, setFilters] = React.useState([
    { id: "1", field: "Plan",   operator: "is one of", value: "Pro, Enterprise" },
    { id: "2", field: "Health", operator: "is",        value: "Unhealthy" },
  ]);
  return (
    <FilterBar
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder="Search tenants by name or slug…"
      filters={filters}
      onRemoveFilter={(id) => setFilters((f) => f.filter((x) => x.id !== id))}
      onEditFilter={() => alert("Open edit popover (caller implements)")}
      onAddFilter={() => alert("Open Add-filter menu (caller implements)")}
      onReset={() => { setQuery(""); setFilters([]); }}
      onSaveView={() => alert("Save view (caller implements)")}
    />
  );
}

/* ── SearchWithSuggestions demo ────────────────────────────── */

const DEMO_SUGGESTIONS: Suggestion[] = [
  { id: "t1", category: "Tenants", label: "Acme Signs Ltd.",       description: "acme-signs · Pro · 47 orders" },
  { id: "t2", category: "Tenants", label: "Apex Print Co.",        description: "apex-print · Growth · 12 orders" },
  { id: "u1", category: "Users",   label: "Ada Lovelace",          description: "ada@flowtora.com · Admin" },
  { id: "u2", category: "Users",   label: "Alan Turing",           description: "alan@flowtora.com · Member" },
  { id: "i1", category: "Invoices", label: "INV-2026-0042",        description: "$2,499 · Acme Signs Ltd. · paid" },
];

export function SearchWithSuggestionsDemo() {
  const [q, setQ] = React.useState("");
  const filtered = q.trim() === ""
    ? DEMO_SUGGESTIONS
    : DEMO_SUGGESTIONS.filter((s) => s.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="max-w-md">
      <SearchWithSuggestions
        query={q}
        onQueryChange={setQ}
        suggestions={filtered}
        onSelect={(s) => alert(`Selected: ${s.label}`)}
        onSubmit={(query) => alert(`Search submitted: ${query}`)}
        placeholder="Search tenants, users, invoices…"
      />
    </div>
  );
}

export function BannerDemos() {
  return (
    <div className="space-y-3">
      <Banner variant="info" layout="inline">
        Inline info — terse callout in flow.
      </Banner>
      <Banner variant="warning" title="Plan limit approaching" cta={{ label: "Upgrade", href: "#" }}>
        85% of your monthly quote allowance has been used. Upgrade to Pro for unlimited quotes.
      </Banner>
      <Banner
        variant="error"
        title="Maintenance window scheduled"
        cta={{ label: "Status page", href: "#" }}
        dismissId="design-demo-maintenance"
      >
        Tonight 02:00–03:00 UTC. The platform will be read-only for ~30 minutes.
      </Banner>
      <Banner variant="success" layout="inline">
        Stripe coupon mirroring is live.
      </Banner>
      <Banner variant="neutral" layout="inline">
        Read-only system message — no tone applied.
      </Banner>
    </div>
  );
}
