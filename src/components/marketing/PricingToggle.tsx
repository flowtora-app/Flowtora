"use client";

import * as React from "react";
import { PricingTable, type PricingTier } from "./PricingTable";

// PricingToggle — client wrapper around <PricingTable> that owns the
// monthly/annual billing state. Lives in its own file so the pricing
// page itself can stay a server component.
//
// Annual savings are already shown per-tier inside <PricingTable>; here
// we just provide the segmented control that flips the `billing` prop.

export function PricingToggle({ tiers }: { tiers: PricingTier[] }) {
  const [billing, setBilling] = React.useState<"monthly" | "annual">("annual");

  return (
    <div>
      <div className="mb-10 flex justify-center">
        <div
          className="inline-flex rounded-full p-1"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <BillingButton
            active={billing === "monthly"}
            onClick={() => setBilling("monthly")}
          >
            Monthly
          </BillingButton>
          <BillingButton
            active={billing === "annual"}
            onClick={() => setBilling("annual")}
          >
            Annual
            <span
              className="ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background: "var(--success-surface)",
                color: "var(--success-fg)",
              }}
            >
              Save ~17%
            </span>
          </BillingButton>
        </div>
      </div>
      <PricingTable tiers={tiers} billing={billing} />
    </div>
  );
}

function BillingButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center rounded-full px-4 text-xs font-medium transition-colors"
      style={{
        background: active ? "var(--surface-0)" : "transparent",
        color: active ? "var(--text-default)" : "var(--text-muted)",
        boxShadow: active ? "var(--shadow-xs, 0 1px 2px rgba(0,0,0,0.15))" : "none",
      }}
    >
      {children}
    </button>
  );
}
