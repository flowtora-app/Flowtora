import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/marketing/Container";
import { ManageCookiesButton } from "@/components/consent/ManageCookiesButton";

// /legal/cookies — public-facing cookie policy.
//
// Plain-English description of what categories exist, what each
// covers, which third parties (if any) we use, and how visitors
// change or revoke their consent at any time.
//
// Not a substitute for a lawyer's review on a production launch.

export const metadata: Metadata = {
  title: "Cookie policy — Flowtora",
  description:
    "What cookies and similar storage Flowtora uses, why, and how to change your preferences at any time.",
  alternates: { canonical: "/legal/cookies" },
  robots: { index: true, follow: true },
};

export default function CookiePolicyPage() {
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
          Cookie policy
        </h1>
        <p
          className="mt-3 text-sm"
          style={{ color: "var(--text-faint)" }}
        >
          Last updated: April 28, 2026
        </p>

        <div
          className="prose prose-invert mt-10 max-w-none space-y-6 text-base leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          <p>
            This page explains what cookies and similar browser storage
            Flowtora uses, why we use them, and how you can change or
            revoke your preferences at any time. Plain-English version:
            we use the minimum we need to run the product. We do not
            sell visitor data, we don&apos;t embed third-party
            advertising trackers, and you can opt out of everything
            optional with one click.
          </p>

          <H2>What is a cookie?</H2>
          <p>
            Cookies are small text files placed on your device by the
            websites you visit. We also use the closely-related
            <em> localStorage</em> mechanism for some things — it works
            similarly but is read only by JavaScript on Flowtora pages
            and is never sent to other servers. We treat both as
            &ldquo;cookies&rdquo; for the purposes of this policy.
          </p>

          <H2>Categories we use</H2>
          <p>
            When you first visit Flowtora you&apos;ll see a banner asking
            which optional categories you allow. Strictly necessary
            cookies don&apos;t need consent because the site cannot
            function without them; everything else is opt-in.
          </p>

          <ul className="space-y-4">
            <Cat
              name="Strictly necessary"
              required
              description="Required for the site to work — auth sessions, security, and remembering your cookie choice."
              examples={[
                "authjs.session-token (sign-in session)",
                "ts.cookieConsent (your cookie preference)",
                "ts_consent (mirror so the server can see your choice)",
              ]}
            />
            <Cat
              name="Analytics"
              description="Helps us understand which marketing pages help most so we can improve them. First-party only — no Google Analytics, no third-party trackers, no cross-site profiling."
              examples={[
                "ts.sessionId (de-duplicates page views from one browser)",
                "ts.cookieConsent.anonId (correlates consent decisions)",
              ]}
              what="Path you viewed, page-load timestamp, your country/city/lat-lon (resolved at the network edge by Vercel — we never see your raw IP), and a one-way hash of your IP that resets daily."
            />
            <Cat
              name="Marketing"
              description="Tracking pixels and remarketing tags from advertising platforms."
              examples={[]}
              what="None at the moment. This category is reserved for if Flowtora ever runs paid ad campaigns. It will stay disabled by default; you would have to opt in explicitly."
            />
            <Cat
              name="Preferences"
              description="Remembers UI choices like your theme between visits."
              examples={["theme (dark/light selection)"]}
              what="Only the values you explicitly set — never browsing patterns or content."
            />
          </ul>

          <H2>Third parties</H2>
          <p>
            We try to keep these to a minimum. The only third parties
            that can set cookies in connection with Flowtora are:
          </p>
          <ul className="ml-6 list-disc space-y-2">
            <li>
              <strong style={{ color: "var(--text-default)" }}>Stripe</strong>{" "}
              — when you reach the checkout page or invoice payment screen, Stripe
              sets its own cookies to detect fraud. These load only on payment
              pages, not on browsing pages, and only when you actually navigate
              to a payment surface.
            </li>
            <li>
              <strong style={{ color: "var(--text-default)" }}>Vercel</strong>{" "}
              — our hosting provider. They may set their own analytics cookies
              for infrastructure-level metrics; we don&apos;t directly invoke
              these and they don&apos;t identify individual visitors to us.
            </li>
          </ul>

          <H2>How we use IP addresses</H2>
          <p>
            We never persist raw IP addresses. For both analytics and
            consent-audit logging, we apply a one-way SHA-256 hash with
            a salt that rotates every 24 hours. That means: same visitor,
            different days &rarr; different hashes &rarr; no possibility
            of correlating your behavior across days from our database.
          </p>

          <H2>How to change your preferences</H2>
          <p>
            You can change or revoke your decision at any time. There&apos;s a{" "}
            <strong style={{ color: "var(--text-default)" }}>Manage cookies</strong>{" "}
            link in the footer of every page, or use this button:
          </p>
          <p>
            <ManageCookiesButton
              className="inline-block underline"
              label="Open cookie preferences"
            />
          </p>
          <p>
            Withdrawing consent does not affect anything you&apos;ve done
            before — but new analytics data will stop being collected
            immediately, and any non-essential storage we put in your
            browser is cleared.
          </p>

          <H2>How long we keep your decision</H2>
          <p>
            Your preference is stored in your browser&apos;s localStorage
            for one year, and mirrored as a cookie with the same TTL.
            We keep an audit-log row in our database for as long as we
            need it for legal compliance — typically 24 months from the
            decision — recording your anonymous browser ID, the decision
            you made, the version of this policy in force, and a
            daily-rotating IP hash. We do not retain raw IPs.
          </p>

          <H2>Privacy policy</H2>
          <p>
            This page covers cookies and similar storage. For our broader
            data-handling practices, see the{" "}
            <Link
              href="/legal/privacy"
              className="underline"
              style={{ color: "var(--text-default)" }}
            >
              privacy policy
            </Link>
            .
          </p>

          <H2>Contact</H2>
          <p>
            Questions, complaints, or data-subject requests:{" "}
            <a
              href="mailto:privacy@flowtora.app"
              className="underline"
              style={{ color: "var(--text-default)" }}
            >
              privacy@flowtora.app
            </a>
            .
          </p>
        </div>
      </Container>
    </section>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mt-8 text-xl font-semibold"
      style={{ color: "var(--text-default)" }}
    >
      {children}
    </h2>
  );
}

function Cat({
  name,
  description,
  what,
  examples,
  required,
}: {
  name: string;
  description: string;
  what?: string;
  examples?: string[];
  required?: boolean;
}) {
  return (
    <li
      className="rounded-lg p-4"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-base font-semibold"
          style={{ color: "var(--text-default)" }}
        >
          {name}
        </span>
        {required && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide"
            style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}
          >
            Always on
          </span>
        )}
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
        {description}
      </p>
      {what && (
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <span style={{ color: "var(--text-default)" }}>What it stores: </span>
          {what}
        </p>
      )}
      {examples && examples.length > 0 && (
        <details
          className="mt-2 text-xs"
          style={{ color: "var(--text-muted)" }}
        >
          <summary className="cursor-pointer">Cookies in this category</summary>
          <ul className="ml-5 mt-2 list-disc space-y-1">
            {examples.map((e) => (
              <li key={e}>
                <code style={{ color: "var(--text-default)" }}>{e}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}
