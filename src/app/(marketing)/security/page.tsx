import type { Metadata } from "next";
import Link from "next/link";
import { Hero } from "@/components/marketing/Hero";
import { Section } from "@/components/marketing/Section";
import { CTA } from "@/components/marketing/CTA";

// Phase 5 — /security.
//
// Security/trust page. Buyers in the $100+/mo SMB bracket are
// increasingly asking these questions before signing up (especially
// franchised shops with corporate IT). We answer them up-front rather
// than forcing a sales call.
//
// Structure:
//   1. Hero — value framing (your data, locked down)
//   2. Pillars — encryption, isolation, access, backup, compliance
//   3. Sub-processors transparency
//   4. Security FAQ / responsible disclosure
//   5. CTA
//
// Copy is honest about our current posture — we don't fake SOC2
// certification we don't have. "On our roadmap" is the right framing
// for something we plan to earn.

export const metadata: Metadata = {
  title: "Security & trust — Flowtora",
  description:
    "How Flowtora protects your shop data: encryption in transit and at rest, per-tenant isolation, backed-up Postgres, role-based access, and a concrete compliance roadmap.",
  alternates: { canonical: "/security" },
  openGraph: {
    title: "Flowtora security",
    description:
      "Encryption, tenant isolation, backups, RBAC, and an honest compliance roadmap.",
    type: "website",
  },
};

const PILLARS = [
  {
    title: "Encryption in transit and at rest",
    body: "TLS 1.2+ for every request. Data in our Postgres cluster is encrypted at rest by the storage layer (AES-256). Secrets — API keys, webhook signing, OAuth tokens — are stored via platform-managed key material, not in application code.",
  },
  {
    title: "Per-tenant isolation",
    body: "Every tenant-scoped row carries a `tenantId`. Every request runs through a server-side gate that resolves the tenant from the URL, checks membership, and attaches it to the query. Two tenants cannot read each other's data by any URL, API, or mistake.",
  },
  {
    title: "Role-based access, down to the action",
    body: "Owners, admins, managers, sales, designers, installers, accountants, and employees each have an explicit permission set. Every server action and every UI button gates on the same capability check — no hidden escalation paths.",
  },
  {
    title: "Point-in-time Postgres backups",
    body: "Managed Postgres on a provider with automated daily backups and point-in-time recovery. A production incident that corrupts your data can be restored to a timestamp, not a 'last night's backup' hand-wave.",
  },
  {
    title: "Audit trail by default",
    body: "Sign-ins, permission changes, record deletions, impersonation sessions — all logged to an append-only audit stream. Owners can review the last 90 days of activity from the settings panel.",
  },
  {
    title: "Two-factor authentication",
    body: "TOTP-based 2FA is available for every user, and owners can require it for every member of their workspace. Recovery codes are one-time-use and rotate on use.",
  },
  {
    title: "Platform impersonation, audited",
    body: "When our support staff need to view your workspace, they do so via an audited impersonation session — banner displayed to the customer, every action logged against the support agent's platform account, not yours.",
  },
  {
    title: "Data export on demand",
    body: "Every tenant can export their complete data set (customers, quotes, orders, invoices, files) as structured JSON at any time. No lock-in. No data-held-hostage if you leave.",
  },
];

const SUBPROCESSORS: { name: string; role: string; region: string }[] = [
  { name: "Neon", role: "Managed Postgres — primary database", region: "US East" },
  { name: "Vercel", role: "Application hosting and edge delivery", region: "Global edge" },
  { name: "Stripe", role: "Payment processing and card vault", region: "US / global" },
  { name: "Postmark", role: "Transactional email (quotes, invoices, notifications)", region: "US" },
  { name: "Cloudflare R2", role: "Proof and artwork file storage", region: "Global" },
];

const ROADMAP: { label: string; detail: string; status: "live" | "progress" | "planned" }[] = [
  { label: "SOC 2 Type I audit", status: "progress", detail: "In-flight with a Big Four-adjacent audit firm. Targeting Q2 next year." },
  { label: "SOC 2 Type II", status: "planned", detail: "Targeted for ~12 months after Type I report." },
  { label: "SSO (SAML / OIDC)", status: "planned", detail: "On the roadmap for franchise/enterprise tier. Contact us if it's a blocker." },
  { label: "Enterprise DPA template", status: "live", detail: "Available on request for annual contracts." },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Where is my data stored?",
    a: "Primary database is in US East (Neon). Files (proofs, artwork, attachments) are in Cloudflare R2 with global replication. Data residency controls for EU-only are on our enterprise-tier roadmap.",
  },
  {
    q: "Can I require 2FA for my whole team?",
    a: "Yes. Owners can flip a workspace-wide 2FA requirement in settings, which kicks in at the next login for members who haven't enrolled.",
  },
  {
    q: "What happens if I cancel?",
    a: "You keep full export access for 30 days after cancellation. After that, we soft-archive for another 60 days (retrievable by support) and then permanently delete. You can also request immediate deletion at any time.",
  },
  {
    q: "How do I report a security issue?",
    a: "Email security@flowtora.com with details. We respond within 24 business hours and track through resolution. Good-faith researchers get credit in our advisories; no legal action against ethical disclosure.",
  },
  {
    q: "Is there a status page?",
    a: "A public status page is on our near-term roadmap. Until then, incidents are announced via in-app banner and email to workspace owners.",
  },
];

export default function SecurityPage() {
  return (
    <>
      <Hero
        eyebrow="Security & trust"
        title={<>Your shop data, locked down by default.</>}
        description={
          <>
            Signs and print jobs are your customers&apos; brand identity. We
            treat your workspace the way you treat their artwork — no
            leaks, no shortcuts, and a clear paper trail.
          </>
        }
        primary={{ label: "Talk to our team", href: "/contact" }}
        secondary={{ label: "Read our DPA", href: "/contact" }}
      />

      <Section
        eyebrow="How we protect your data"
        title="The security posture, in plain language."
        description="No mission-statement word salad. Each pillar is a concrete thing we do — and a thing you can verify."
        align="center"
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {PILLARS.map((pillar) => (
            <div
              key={pillar.title}
              className="rounded-xl p-6"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                className="text-base font-semibold"
                style={{ color: "var(--text-default)" }}
              >
                {pillar.title}
              </div>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                {pillar.body}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        muted
        eyebrow="Sub-processors"
        title="Who touches your data, and what they do."
        description="We keep this list short and current. If it changes, customers on annual plans get 30 days' notice."
        align="center"
      >
        <div
          className="overflow-hidden rounded-xl"
          style={{
            background: "var(--surface-0)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <table className="w-full text-left text-sm">
            <thead style={{ color: "var(--text-faint)" }}>
              <tr>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider">Vendor</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-xs font-semibold uppercase tracking-wider">Region</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((sp) => (
                <tr
                  key={sp.name}
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <td className="px-6 py-4 text-sm font-medium" style={{ color: "var(--text-default)" }}>
                    {sp.name}
                  </td>
                  <td className="px-6 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                    {sp.role}
                  </td>
                  <td className="px-6 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
                    {sp.region}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        eyebrow="Compliance roadmap"
        title="What we have today. What we&apos;re earning next."
        description="We believe in saying what's true now and what's coming — not checking boxes we haven't earned."
        align="center"
      >
        <ul className="space-y-3">
          {ROADMAP.map((r) => (
            <li
              key={r.label}
              className="flex items-start gap-4 rounded-xl p-5"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <StatusPill status={r.status} />
              <div>
                <div className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
                  {r.label}
                </div>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {r.detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        muted
        eyebrow="Common questions"
        title="Security FAQ"
        align="center"
      >
        <div className="space-y-3">
          {FAQ.map((f) => (
            <details
              key={f.q}
              className="group rounded-xl"
              style={{
                background: "var(--surface-0)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <summary
                className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left"
                style={{ color: "var(--text-default)" }}
              >
                <span className="text-sm font-medium">{f.q}</span>
                <svg
                  aria-hidden
                  width="16"
                  height="16"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  className="transition-transform group-open:rotate-180"
                  style={{ color: "var(--text-muted)" }}
                >
                  <path d="M5 7l5 5 5-5" />
                </svg>
              </summary>
              <p
                className="px-5 pb-5 text-sm leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                {f.a}
              </p>
            </details>
          ))}
        </div>
        <p className="mt-6 text-center text-xs" style={{ color: "var(--text-faint)" }}>
          Report a vulnerability →{" "}
          <Link href="/contact" className="underline" style={{ color: "var(--accent-primary)" }}>
            security@flowtora.com
          </Link>
        </p>
      </Section>

      <CTA
        eyebrow="Still have questions?"
        title="We'll answer them."
        description="Talk to us about your compliance requirements, data residency, or SSO — no sales runaround."
        primary={{ label: "Book a demo", href: "/book-demo" }}
        secondary={{ label: "Contact sales", href: "/contact" }}
      />
    </>
  );
}

function StatusPill({ status }: { status: "live" | "progress" | "planned" }) {
  const { bg, fg, label } =
    status === "live"
      ? { bg: "var(--success-surface)", fg: "var(--success-fg)", label: "Live" }
      : status === "progress"
        ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)", label: "In progress" }
        : { bg: "var(--surface-2)", fg: "var(--text-muted)", label: "Planned" };
  return (
    <span
      className="mt-0.5 inline-flex flex-shrink-0 items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
      style={{ background: bg, color: fg }}
    >
      {label}
    </span>
  );
}
