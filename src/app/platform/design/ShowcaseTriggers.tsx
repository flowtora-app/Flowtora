"use client";

import * as React from "react";
import {
  Button,
  Banner,
  ConfirmDialog,
  Drawer,
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
