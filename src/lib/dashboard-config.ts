// Phase 6 — per-persona dashboard config.
//
// Keeps "which attention kinds does X persona care about", "which
// quick actions do they want", and "what does an empty workspace look
// like for them" in one table. The dashboard page reads this instead
// of open-coding three switches.

import type { QuickAction } from "@/components/dashboard/QuickActions";
import type { AttentionKind } from "@/lib/attention";
import type { DashboardPersona } from "@/lib/dashboard-persona";

export type PersonaConfig = {
  /** Attention kinds shown in the "Needs your attention" panel, in order. */
  attentionKinds: AttentionKind[];
  /** Factory that yields quick actions for a given tenant slug. */
  quickActions: (slug: string) => QuickAction[];
  /** First-run empty state copy when the workspace has nothing yet. */
  emptyState: {
    icon: string;
    title: string;
    body: string;
    primary: { label: string; href: (slug: string) => string };
    secondary?: { label: string; href: (slug: string) => string };
  };
};

export const PERSONA_CONFIG: Record<DashboardPersona, PersonaConfig> = {
  // ────────────────── Executive ──────────────────
  executive: {
    attentionKinds: [
      "invoice.overdue",
      "order.overdue",
      "quote.overdue",
      "install.unconfirmed",
      "proof.stale",
      "quote.stale",
      "invoice.unsent",
      "quote.expiring",
      "task.overdue",
    ],
    quickActions: (slug) => [
      { label: "New customer",   href: `/t/${slug}/customers/new`, hint: "Start a lead", icon: "+" , primary: true },
      { label: "New quote",      href: `/t/${slug}/quotes/new`,    hint: "Build a quote", icon: "Q" },
      { label: "View pipeline",  href: `/t/${slug}/customers?stage=QUALIFIED`, hint: "Open opportunities", icon: "≡" },
      { label: "Open invoices",  href: `/t/${slug}/invoices?scope=open`, hint: "See AR", icon: "$" },
    ],
    emptyState: {
      icon: "🚀",
      title: "Your shop is empty — let's fill it.",
      body: "Import your customers, seed your price book, and send your first quote. The dashboard will come alive once there's data to show.",
      primary: { label: "Add your first customer", href: (s) => `/t/${s}/customers/new` },
      secondary: { label: "Open getting-started guide", href: (s) => `/t/${s}/settings` },
    },
  },

  // ────────────────── Sales ──────────────────
  sales: {
    attentionKinds: [
      "quote.overdue",
      "quote.expiring",
      "quote.stale",
      "task.overdue",
    ],
    quickActions: (slug) => [
      { label: "New lead",      href: `/t/${slug}/customers/new`,           hint: "Capture a prospect", icon: "+", primary: true },
      { label: "New quote",     href: `/t/${slug}/quotes/new`,              hint: "Build a quote",      icon: "Q" },
      { label: "My pipeline",   href: `/t/${slug}/customers?owner=me`,      hint: "Your open leads",    icon: "≡" },
      { label: "My quotes",     href: `/t/${slug}/quotes?owner=me`,         hint: "Your sent quotes",   icon: "✎" },
    ],
    emptyState: {
      icon: "🎯",
      title: "No leads on your desk yet.",
      body: "Add your first prospect and send them a quote. Your pipeline and follow-ups will populate as deals move.",
      primary: { label: "Add a lead", href: (s) => `/t/${s}/customers/new` },
    },
  },

  // ────────────────── CSR ──────────────────
  csr: {
    attentionKinds: [
      "proof.stale",
      "install.unconfirmed",
      "quote.stale",
      "invoice.unsent",
      "task.overdue",
    ],
    quickActions: (slug) => [
      { label: "New customer", href: `/t/${slug}/customers/new`, hint: "Capture a walk-in", icon: "+", primary: true },
      { label: "Proofs sent",  href: `/t/${slug}/proofs?status=SENT`, hint: "Awaiting customer", icon: "✎" },
      { label: "Installs to confirm", href: `/t/${slug}/installs?status=SCHEDULED`, hint: "This week", icon: "☎" },
      { label: "All tasks",    href: `/t/${slug}/inbox?chip=tasks&view=all`, hint: "Open tickets", icon: "✓" },
    ],
    emptyState: {
      icon: "☎",
      title: "Nothing waiting on customers.",
      body: "Once your team starts sending proofs and scheduling installs, you'll see everything that needs a customer reply here.",
      primary: { label: "Add a customer", href: (s) => `/t/${s}/customers/new` },
    },
  },

  // ────────────────── Designer ──────────────────
  designer: {
    attentionKinds: [
      "proof.stale",
      "task.overdue",
    ],
    quickActions: (slug) => [
      { label: "Proof queue",    href: `/t/${slug}/proofs?owner=me&status=DRAFT`, hint: "Drafts on your desk", icon: "✎", primary: true },
      { label: "Awaiting reply", href: `/t/${slug}/proofs?owner=me&status=SENT`,  hint: "Customer not replied", icon: "⧗" },
      { label: "Revisions",      href: `/t/${slug}/proofs?owner=me&status=CHANGES_REQUESTED`, hint: "Changes requested", icon: "↻" },
      { label: "Orders",         href: `/t/${slug}/orders?status=IN_PRODUCTION`,  hint: "On the floor", icon: "≡" },
    ],
    emptyState: {
      icon: "✎",
      title: "Your proof queue is empty.",
      body: "Once a sales rep creates an order for you, proofs will appear here. You can also start a proof straight from any order.",
      primary: { label: "Browse orders", href: (s) => `/t/${s}/orders` },
    },
  },

  // ────────────────── Production ──────────────────
  production: {
    attentionKinds: [
      "order.overdue",
      "install.unconfirmed",
      "proof.stale",
      "task.overdue",
    ],
    quickActions: (slug) => [
      { label: "Production floor", href: `/t/${slug}/orders?status=IN_PRODUCTION`, hint: "WIP", icon: "≡", primary: true },
      { label: "Schedule install", href: `/t/${slug}/installs/new`, hint: "New install event", icon: "+" },
      { label: "Past-due orders",  href: `/t/${slug}/orders?scope=overdue`, hint: "Needs attention", icon: "!" },
      { label: "Proofs in flight", href: `/t/${slug}/proofs?status=SENT`, hint: "Waiting on customer", icon: "✎" },
    ],
    emptyState: {
      icon: "🔧",
      title: "Nothing on the floor.",
      body: "Once an order is accepted and moved to production, it'll show up here. Check the sales pipeline to see what's incoming.",
      primary: { label: "See the pipeline", href: (s) => `/t/${s}/customers?stage=QUALIFIED` },
    },
  },

  // ────────────────── Installer ──────────────────
  installer: {
    attentionKinds: [
      "install.unconfirmed",
      "task.overdue",
    ],
    quickActions: (slug) => [
      { label: "Today's installs", href: `/t/${slug}/installs?scope=mine&when=today`, hint: "Your schedule today", icon: "📅", primary: true },
      { label: "This week",        href: `/t/${slug}/installs?scope=mine&when=week`, hint: "Your week ahead", icon: "≡" },
      { label: "Awaiting confirm", href: `/t/${slug}/installs?scope=mine&status=SCHEDULED`, hint: "Customer not confirmed", icon: "☎" },
      { label: "My tasks",         href: `/t/${slug}/inbox?chip=tasks`, hint: "Your open items", icon: "✓" },
    ],
    emptyState: {
      icon: "🚚",
      title: "No installs on your schedule.",
      body: "Your scheduled installs will appear here. Check in with the production manager about upcoming work.",
      primary: { label: "See all installs", href: (s) => `/t/${s}/installs` },
    },
  },

  // ────────────────── Finance ──────────────────
  finance: {
    attentionKinds: [
      "invoice.overdue",
      "invoice.unsent",
    ],
    quickActions: (slug) => [
      { label: "Open invoices",   href: `/t/${slug}/invoices?scope=open`, hint: "Unpaid, not yet overdue", icon: "$", primary: true },
      { label: "Overdue invoices", href: `/t/${slug}/invoices?scope=overdue`, hint: "Past due date", icon: "!" },
      { label: "Draft invoices",  href: `/t/${slug}/invoices?status=DRAFT`, hint: "Never sent", icon: "✎" },
      { label: "Payments booked", href: `/t/${slug}/invoices?scope=paid`, hint: "Recently paid", icon: "✓" },
    ],
    emptyState: {
      icon: "💰",
      title: "No invoices in the system yet.",
      body: "Once your team starts creating quotes and orders, invoices will flow through here. You can also create one directly.",
      primary: { label: "Create an invoice", href: (s) => `/t/${s}/invoices/new` },
    },
  },

  // ────────────────── Employee ──────────────────
  employee: {
    attentionKinds: [
      "task.overdue",
    ],
    quickActions: (slug) => [
      { label: "My tasks",      href: `/t/${slug}/inbox?chip=tasks`, hint: "Your open items", icon: "✓", primary: true },
      { label: "Active orders", href: `/t/${slug}/orders`,         hint: "On the floor",    icon: "≡" },
    ],
    emptyState: {
      icon: "👋",
      title: "Nothing assigned to you yet.",
      body: "Ask a teammate to assign you a task or add you to an order.",
      primary: { label: "Browse orders", href: (s) => `/t/${s}/orders` },
    },
  },
};
