import type { Metadata } from "next";
import { Container } from "@/components/marketing/Container";

// Phase 5 — /legal/privacy.
//
// A real-enough privacy policy for a pre-launch SaaS. Not legal advice;
// a legitimate production company needs a lawyer to review this. What
// this page does NOT pretend to be:
//   • GDPR/DPA-ready boilerplate
//   • A substitute for a real privacy review
//
// What it IS: an honest, readable statement of what we collect, why,
// who we share with, and how users get control — enough to pass basic
// buyer due diligence and get a footer link to stop 404ing.

export const metadata: Metadata = {
  title: "Privacy policy — Tracksign",
  description:
    "What data Tracksign collects, why we collect it, who sees it, and how you stay in control.",
  alternates: { canonical: "/legal/privacy" },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <section className="py-16 md:py-20">
      <Container size="md">
        <div
          className="mb-8 text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--accent-primary)" }}
        >
          Legal
        </div>
        <h1
          className="text-3xl font-semibold tracking-tight md:text-4xl"
          style={{ color: "var(--text-default)" }}
        >
          Privacy policy
        </h1>
        <p
          className="mt-3 text-sm"
          style={{ color: "var(--text-faint)" }}
        >
          Last updated: January 1, 2026
        </p>

        <div
          className="prose prose-invert mt-10 max-w-none space-y-8 text-base leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          <p>
            This policy explains what personal data Tracksign, Inc.
            (&ldquo;Tracksign,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;)
            collects when you use the Tracksign platform, website, and
            related services, and how we use it. Plain-English version:
            we collect the minimum we need to run the product, we never
            sell it, and you can take it with you when you leave.
          </p>

          <LegalHeading>What we collect</LegalHeading>
          <p>
            <strong>Account data.</strong> Your name, email, company,
            role, and any profile information you enter. You provide
            this directly; we store it to give you access.
          </p>
          <p>
            <strong>Workspace data.</strong> The customers, quotes,
            orders, invoices, files, and other business records you
            create inside Tracksign. This data is yours — we process it
            to operate the service.
          </p>
          <p>
            <strong>Usage telemetry.</strong> We record basic product
            events (pages visited, features used, errors encountered)
            to improve the product. This telemetry is attributed to
            your account but not shared externally.
          </p>
          <p>
            <strong>Security logs.</strong> Sign-in events, permission
            changes, and audit-sensitive actions are logged for your
            safety and our compliance.
          </p>
          <p>
            <strong>Marketing interactions.</strong> If you submit a
            contact, demo, or newsletter form, we keep your submission
            (and a hashed copy of your IP, for spam prevention) until
            you unsubscribe or request deletion.
          </p>

          <LegalHeading>Why we collect it</LegalHeading>
          <ul className="list-disc space-y-2 pl-6">
            <li>To operate and secure the product.</li>
            <li>To respond to your support requests and notify you of changes that affect your account.</li>
            <li>To detect abuse, fraud, and spam.</li>
            <li>To improve features based on how customers actually use them.</li>
          </ul>
          <p>
            We do not sell your personal data. We do not share it for
            third-party advertising. We do not build profiles on your
            end customers from the data you store with us.
          </p>

          <LegalHeading>Who sees it</LegalHeading>
          <p>
            Tracksign staff may access your data in the course of
            providing support — always with an audited impersonation
            session and a banner displayed in your workspace while the
            session is active.
          </p>
          <p>
            We use a small, current list of sub-processors to operate
            the service (managed Postgres, hosting, email delivery, file
            storage, payments). The list is published on our{" "}
            <a href="/security" style={{ color: "var(--accent-primary)" }}>
              security page
            </a>
            .
          </p>

          <LegalHeading>How long we keep it</LegalHeading>
          <p>
            For as long as your workspace is active. After cancellation,
            you have 30 days of full export access. We soft-archive for
            another 60 days (retrievable through support). After that,
            we permanently delete. You can request immediate deletion
            at any time.
          </p>
          <p>
            Marketing-form submissions are retained until you ask us to
            delete them (email support@tracksign.com) or until 24 months
            have passed without further contact, whichever is sooner.
          </p>

          <LegalHeading>Your rights</LegalHeading>
          <p>
            You can access, export, correct, or delete your personal
            data at any time from within the app or by emailing
            support@tracksign.com. If you&apos;re in a jurisdiction that
            provides specific privacy rights (EU, UK, California), those
            rights apply to your data with us regardless of where
            Tracksign is incorporated.
          </p>

          <LegalHeading>Security</LegalHeading>
          <p>
            TLS in transit, AES-256 at rest, per-tenant data isolation,
            two-factor authentication, role-based access, and audited
            admin actions. Details on the{" "}
            <a href="/security" style={{ color: "var(--accent-primary)" }}>
              security page
            </a>
            .
          </p>

          <LegalHeading>Changes to this policy</LegalHeading>
          <p>
            We&apos;ll update this page when practices change, and give
            30 days&apos; notice via email to workspace owners for
            material changes. The &ldquo;last updated&rdquo; date above
            always reflects the current version.
          </p>

          <LegalHeading>Contact</LegalHeading>
          <p>
            Questions? Email{" "}
            <a
              href="mailto:privacy@tracksign.com"
              style={{ color: "var(--accent-primary)" }}
            >
              privacy@tracksign.com
            </a>
            {" "}or reach out through the{" "}
            <a href="/contact" style={{ color: "var(--accent-primary)" }}>
              contact form
            </a>
            .
          </p>
        </div>
      </Container>
    </section>
  );
}

function LegalHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mt-10 text-xl font-semibold"
      style={{ color: "var(--text-default)" }}
    >
      {children}
    </h2>
  );
}
