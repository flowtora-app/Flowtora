import type { Metadata } from "next";
import { Container } from "@/components/marketing/Container";

// Phase 5 — /legal/terms.
//
// Terms of service stub. Like the privacy policy, this is a readable
// pre-launch placeholder — NOT legal advice, and production operation
// requires attorney review. It covers the obvious ground (acceptance,
// usage, availability, billing, termination, disclaimers, governing
// law placeholder) in a tone that matches the rest of the site.

export const metadata: Metadata = {
  title: "Terms of service — Tracksign",
  description:
    "The legal terms under which you use Tracksign's platform and services.",
  alternates: { canonical: "/legal/terms" },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
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
          Terms of service
        </h1>
        <p className="mt-3 text-sm" style={{ color: "var(--text-faint)" }}>
          Last updated: January 1, 2026
        </p>

        <div
          className="mt-10 max-w-none space-y-8 text-base leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your
            access to and use of Tracksign, Inc.&apos;s (&ldquo;Tracksign,&rdquo; &ldquo;we,&rdquo; &ldquo;us&rdquo;)
            website, platform, and related services
            (the &ldquo;Service&rdquo;). By creating an account or using
            the Service, you agree to these Terms.
          </p>

          <LegalHeading>1. Accounts</LegalHeading>
          <p>
            You must provide accurate information when registering. You
            are responsible for keeping your credentials secure and for
            all activity under your account. If you&apos;re creating a
            workspace on behalf of an organization, you represent that
            you have authority to bind that organization to these Terms.
          </p>

          <LegalHeading>2. Acceptable use</LegalHeading>
          <p>
            You agree not to use the Service to violate laws, infringe
            intellectual property, distribute malware, send unsolicited
            communications, or otherwise abuse the platform or other
            users. We may suspend or terminate accounts that violate
            this section.
          </p>

          <LegalHeading>3. Your data</LegalHeading>
          <p>
            You own the data you store in Tracksign. We store and
            process it to provide the Service on your behalf. You grant
            us a limited license to do so. We do not claim ownership,
            and you can export your data at any time.
          </p>

          <LegalHeading>4. Service availability</LegalHeading>
          <p>
            We strive for high availability but do not guarantee the
            Service will be uninterrupted or error-free. We perform
            scheduled maintenance with notice when practicable, and
            respond to incidents through our support channel.
          </p>

          <LegalHeading>5. Fees and billing</LegalHeading>
          <p>
            Paid plans are billed in advance on a monthly or annual
            cycle. Fees are non-refundable except where required by law
            or expressly stated. You&apos;re responsible for taxes
            applicable to your use. We&apos;ll provide 30 days&apos;
            notice before any price increase on your current plan.
          </p>

          <LegalHeading>6. Termination</LegalHeading>
          <p>
            You can cancel your workspace at any time. We may suspend
            or terminate your access for material breach of these
            Terms, with notice when practicable. On termination, export
            access remains available for 30 days. See our{" "}
            <a href="/legal/privacy" style={{ color: "var(--accent-primary)" }}>
              privacy policy
            </a>{" "}
            for data-retention specifics.
          </p>

          <LegalHeading>7. Disclaimers</LegalHeading>
          <p>
            The Service is provided &ldquo;as is&rdquo; and &ldquo;as
            available&rdquo; without warranties of any kind, to the
            fullest extent permitted by law. We do not warrant that the
            Service will meet your requirements or operate without
            interruption.
          </p>

          <LegalHeading>8. Limitation of liability</LegalHeading>
          <p>
            To the maximum extent permitted by law, Tracksign&apos;s
            total liability for any claim arising out of or related to
            the Service is limited to the amounts you paid us in the
            twelve (12) months preceding the claim. We are not liable
            for indirect, incidental, or consequential damages.
          </p>

          <LegalHeading>9. Changes to the Service and Terms</LegalHeading>
          <p>
            We may update the Service and these Terms. Material changes
            will be communicated to workspace owners by email with at
            least 30 days&apos; notice where practicable. Continued use
            after the effective date constitutes acceptance.
          </p>

          <LegalHeading>10. Governing law</LegalHeading>
          <p>
            These Terms are governed by the laws of the State of
            Delaware, without regard to conflict-of-law principles.
            Disputes will be resolved in the state or federal courts
            located in Delaware, unless otherwise required by law.
          </p>

          <LegalHeading>11. Contact</LegalHeading>
          <p>
            Questions about these Terms? Email{" "}
            <a
              href="mailto:legal@tracksign.com"
              style={{ color: "var(--accent-primary)" }}
            >
              legal@tracksign.com
            </a>
            {" "}or use our{" "}
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
