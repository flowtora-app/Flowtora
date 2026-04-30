"use client";

import * as React from "react";
import Link from "next/link";
import { useToast } from "@/components/ui";
import { startImpersonation } from "@/app/actions/platform";

// Inline 3-dot menu per tenant row — Page 4 §Inline 3-dot menu
// actions: Open · Impersonate · Send email · Edit plan · Apply credit
// · Suspend · Add note · Add tag · Copy ID · Open in Stripe.

export interface TenantRowMenuProps {
  tenantId: string;
  tenantName: string;
  slug: string;
  ownerEmail: string | null;
  stripeCustomerId: string | null;
  canImpersonate: boolean;
  canPlanChange: boolean;
  canSuspend: boolean;
  canTag: boolean;
  canCoupon: boolean;
}

export function TenantRowMenu(props: TenantRowMenuProps) {
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.tenantId);
      toast.success("Tenant ID copied");
    } catch {
      toast.error("Couldn't copy");
    }
    setOpen(false);
  };

  const onImpersonate = async () => {
    setOpen(false);
    // No reason prompt from the row menu — that's saved for the
    // detail page's modal. Most impersonations from the row menu
    // are quick "go look at the bug they reported" jumps.
    const fd = new FormData();
    try {
      await startImpersonation(props.tenantId, fd);
    } catch (err) {
      const isRedirect = err instanceof Error && err.message === "NEXT_REDIRECT";
      if (isRedirect) return;
      toast.error(err instanceof Error ? err.message : "Couldn't start impersonation");
    }
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${props.tenantName}`}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="ts-focus inline-flex h-7 w-7 items-center justify-center rounded-md text-[14px] font-bold leading-none hover:bg-[var(--surface-2)]"
        style={{ color: "var(--text-muted)" }}
      >⋯</button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-md border shadow-lg"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuLink href={`/platform/tenants/${props.tenantId}`}>Open</MenuLink>
          {props.canImpersonate && (
            <MenuButton onClick={onImpersonate}>Impersonate</MenuButton>
          )}
          {props.ownerEmail && (
            <MenuLink href={`mailto:${props.ownerEmail}`}>Send email</MenuLink>
          )}
          {props.canPlanChange && (
            <MenuLink href={`/platform/tenants/${props.tenantId}#billing`}>Edit plan</MenuLink>
          )}
          {props.canCoupon && (
            <MenuLink href={`/platform/tenants/${props.tenantId}#billing`}>Apply credit</MenuLink>
          )}
          {props.canSuspend && (
            <MenuLink href={`/platform/tenants/${props.tenantId}?action=suspend`}>Suspend</MenuLink>
          )}
          <MenuDivider />
          <MenuLink href={`/platform/tenants/${props.tenantId}#notes`}>Add note</MenuLink>
          {props.canTag && (
            <MenuLink href={`/platform/tenants/${props.tenantId}?action=add-tag`}>Add tag</MenuLink>
          )}
          <MenuButton onClick={onCopy}>Copy tenant ID</MenuButton>
          {props.stripeCustomerId && (
            <MenuLink href={`https://dashboard.stripe.com/customers/${props.stripeCustomerId}`} external>
              Open in Stripe ↗
            </MenuLink>
          )}
        </div>
      )}
    </div>
  );
}

function MenuLink({ href, children, external }: { href: string; children: React.ReactNode; external?: boolean }) {
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="ts-focus block w-full px-3 py-2 text-left text-[13px] hover:bg-[var(--surface-2)]"
        style={{ color: "var(--text-default)" }}
      >
        {children}
      </a>
    );
  }
  return (
    <Link
      href={href}
      className="ts-focus block w-full px-3 py-2 text-left text-[13px] hover:bg-[var(--surface-2)]"
      style={{ color: "var(--text-default)" }}
    >
      {children}
    </Link>
  );
}

function MenuButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="ts-focus block w-full px-3 py-2 text-left text-[13px] hover:bg-[var(--surface-2)]"
      style={{ color: "var(--text-default)", background: "transparent" }}
    >
      {children}
    </button>
  );
}

function MenuDivider() {
  return <div style={{ height: 1, background: "var(--border-subtle)" }} />;
}
