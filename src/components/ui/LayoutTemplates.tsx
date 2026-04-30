import * as React from "react";
import { cn } from "@/lib/cn";

// LayoutTemplates — Spec Page 0 §0.12 (List / Detail / Settings /
// Wizard / Empty / Error).
//
// Each template is a thin layout wrapper that bakes in the spec's
// dimensions + structure. They're optional — pages can compose
// directly from primitives — but using these keeps page heights /
// gutters / sticky behavior aligned across the admin.

/* ───── List page ─────────────────────────────────────────────
 * 1. Breadcrumb (24px)
 * 2. Title row (64px): H1 + subtitle on left, actions on right
 * 3. KPI strip (optional, 96px)
 * 4. Tabs (optional)
 * 5. Filter bar (56px)
 * 6. Selection bar (visible only when rows selected)
 * 7. Data table
 * 8. Pagination (56px)
 * ─────────────────────────────────────────────────────────── */

export interface ListPageTemplateProps {
  breadcrumb?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  kpiStrip?: React.ReactNode;
  tabs?: React.ReactNode;
  filterBar?: React.ReactNode;
  selectionBar?: React.ReactNode;
  table: React.ReactNode;
  pagination?: React.ReactNode;
  className?: string;
}

export function ListPageTemplate({
  breadcrumb, title, subtitle, actions, kpiStrip, tabs, filterBar, selectionBar, table, pagination, className,
}: ListPageTemplateProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {breadcrumb && <div style={{ minHeight: 24 }}>{breadcrumb}</div>}
      <header className="flex flex-wrap items-end justify-between gap-3" style={{ minHeight: 64 }}>
        <div>
          <h1 className="text-[var(--text-h1,1.875rem)] font-bold tracking-tight" style={{ color: "var(--text-default)" }}>{title}</h1>
          {subtitle && (
            <p className="mt-1 text-[var(--text-body-m,0.875rem)]" style={{ color: "var(--text-muted)" }}>{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      {kpiStrip}
      {tabs}
      {filterBar}
      {selectionBar}
      {table}
      {pagination}
    </div>
  );
}

/* ───── Detail page ────────────────────────────────────────────
 * 1. Breadcrumb
 * 2. Title row: avatar + H1 + status pill + meta chips · actions
 * 3. Optional alert banners
 * 4. Sticky tab bar
 * 5. 2-column body: 2/3 main + 1/3 right rail
 * ─────────────────────────────────────────────────────────── */

export interface DetailPageTemplateProps {
  breadcrumb?: React.ReactNode;
  /** Optional avatar / logo to the left of the title. */
  identity?: React.ReactNode;
  title: React.ReactNode;
  /** Status pill + meta chips (env, plan, etc). */
  metaChips?: React.ReactNode;
  actions?: React.ReactNode;
  banners?: React.ReactNode;
  tabs?: React.ReactNode;
  /** Main column. */
  main: React.ReactNode;
  /** Optional right rail (summary, quick actions, related links). */
  rightRail?: React.ReactNode;
  className?: string;
}

export function DetailPageTemplate({
  breadcrumb, identity, title, metaChips, actions, banners, tabs, main, rightRail, className,
}: DetailPageTemplateProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {breadcrumb && <div style={{ minHeight: 24 }}>{breadcrumb}</div>}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {identity}
          <div>
            <h1 className="text-[var(--text-h1,1.875rem)] font-bold tracking-tight" style={{ color: "var(--text-default)" }}>{title}</h1>
            {metaChips && <div className="mt-1 flex flex-wrap items-center gap-2">{metaChips}</div>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </header>
      {banners && <div className="flex flex-col gap-2">{banners}</div>}
      {tabs && (
        <div className="sticky z-[var(--z-sticky,200)]" style={{ top: 56, background: "var(--surface-0)", paddingBlock: 8 }}>
          {tabs}
        </div>
      )}
      {rightRail ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 lg:col-span-2">{main}</div>
          <aside className="min-w-0">{rightRail}</aside>
        </div>
      ) : (
        main
      )}
    </div>
  );
}

/* ───── Settings page ──────────────────────────────────────────
 * Two-column: left nav (sticky) · right content panel (24px gutter)
 * Each setting card: heading + description + control + helper +
 * inline auto-save toast.
 * ─────────────────────────────────────────────────────────── */

export interface SettingsPageTemplateProps {
  /** Left-rail nav. */
  nav: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function SettingsPageTemplate({ nav, children, className }: SettingsPageTemplateProps) {
  return (
    <div className={cn("grid gap-6 lg:grid-cols-[220px_1fr]", className)}>
      <aside className="lg:sticky lg:top-20 lg:self-start">
        {nav}
      </aside>
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

export interface SettingsCardProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-side helper / save state. */
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function SettingsCard({ title, description, meta, children, className }: SettingsCardProps) {
  return (
    <section
      className={cn("flex flex-col gap-3 rounded-lg border p-4", className)}
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[var(--text-h4,1.125rem)] font-semibold" style={{ color: "var(--text-default)" }}>{title}</h2>
          {description && (
            <p className="mt-0.5 text-[var(--text-body-s,0.8125rem)]" style={{ color: "var(--text-muted)" }}>{description}</p>
          )}
        </div>
        {meta && <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>{meta}</div>}
      </div>
      <div>{children}</div>
    </section>
  );
}

/* ───── Wizard ───────────────────────────────────────────────── */

export interface WizardTemplateProps {
  /** Stepper element. */
  stepper: React.ReactNode;
  children: React.ReactNode;
  /** Footer slot (Cancel · Save draft · Back · Next/Finish). */
  footer: React.ReactNode;
  className?: string;
}

export function WizardTemplate({ stepper, children, footer, className }: WizardTemplateProps) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {stepper}
      <div className="mx-auto w-full max-w-[720px]">{children}</div>
      <div className="mt-2 flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
        {footer}
      </div>
    </div>
  );
}

/* ───── Empty state template ─────────────────────────────────── */

export interface EmptyStateTemplateProps {
  illustration?: React.ReactNode;
  heading: React.ReactNode;
  body?: React.ReactNode;
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
}

export function EmptyStateTemplate({ illustration, heading, body, primary, secondary, className }: EmptyStateTemplateProps) {
  return (
    <div className={cn("mx-auto flex max-w-[480px] flex-col items-center text-center", className)}>
      {illustration && <div className="mb-4">{illustration}</div>}
      <h3 className="text-[var(--text-h3,1.25rem)] font-semibold" style={{ color: "var(--text-default)" }}>{heading}</h3>
      {body && <p className="mt-1 text-[var(--text-body-m,0.875rem)]" style={{ color: "var(--text-muted)" }}>{body}</p>}
      {(primary || secondary) && (
        <div className="mt-4 flex items-center gap-2">
          {primary}
          {secondary}
        </div>
      )}
    </div>
  );
}

/* ───── Error pages ──────────────────────────────────────────── */

export interface ErrorPageTemplateProps {
  /** "404" / "403" / "500" / "503" / "network". */
  code: 404 | 403 | 500 | 503 | "network";
  title?: React.ReactNode;
  body?: React.ReactNode;
  /** Reference / correlation id (500). */
  reference?: React.ReactNode;
  primary?: React.ReactNode;
  secondary?: React.ReactNode;
  /** Status page link (500 / 503). */
  statusHref?: string;
  className?: string;
}

const DEFAULTS: Record<ErrorPageTemplateProps["code"], { title: string; body: string }> = {
  404: { title: "Page not found", body: "The page you were looking for doesn't exist or was moved." },
  403: { title: "You don't have access", body: "Ask an admin to grant you access, or sign in with a different account." },
  500: { title: "Something went wrong", body: "We hit an unexpected error. Try again, and if it keeps happening let us know with the reference ID below." },
  503: { title: "Maintenance in progress", body: "We'll be back shortly. Check the status page for the latest ETA." },
  network: { title: "Network error", body: "Couldn't reach the server. Check your connection and retry." },
};

export function ErrorPageTemplate({
  code, title, body, reference, primary, secondary, statusHref, className,
}: ErrorPageTemplateProps) {
  const def = DEFAULTS[code];
  return (
    <div className={cn("mx-auto flex max-w-[480px] flex-col items-center py-16 text-center", className)}>
      <div className="text-[64px] font-bold leading-none tabular-nums" style={{ color: "var(--brand-300, var(--accent-primary))" }}>
        {code}
      </div>
      <h1 className="mt-3 text-[var(--text-h2,1.5rem)] font-semibold" style={{ color: "var(--text-default)" }}>{title ?? def.title}</h1>
      <p className="mt-1 text-[var(--text-body-m,0.875rem)]" style={{ color: "var(--text-muted)" }}>{body ?? def.body}</p>
      {reference && (
        <div className="mt-3 rounded-md border px-3 py-1.5 font-mono text-[11px]" style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
          Reference: {reference}
        </div>
      )}
      {(primary || secondary || statusHref) && (
        <div className="mt-4 flex items-center gap-2">
          {primary}
          {secondary}
          {statusHref && (
            <a href={statusHref} className="ts-focus text-[12px] font-medium" style={{ color: "var(--accent-primary)" }}>
              Status page →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
