import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { ONBOARDING_STEPS } from "../steps";

// Phase 18 Slice D — onboarding completion celebration.
//
// Showing a "done" screen (rather than a silent redirect to the
// dashboard) does two things:
//   1. Acknowledges the effort the owner just put in — small thing,
//      but it's the first moment Flowtora feels polished to them.
//   2. Gives them a clear jumping-off point. The dashboard shows the
//      onboarding checklist for any remaining tasks (branding logo,
//      inviting teammates, etc.), so this page sets that up.
//
// The CTA is the dashboard; a secondary link lets them jump back to
// settings if they want to tweak something before continuing.

export default async function OnboardingDone({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const { tenant } = await requireTenant(slug);

  return (
    <div className="space-y-5">
      {/* Celebration card — premium accent halo + emerald glow on the checkmark. */}
      <section
        className="relative overflow-hidden rounded-2xl text-center"
        style={{
          padding: "40px 28px 32px",
          background:
            "radial-gradient(900px circle at 50% -10%, var(--accent-surface), transparent 50%), " +
            "radial-gradient(620px circle at 50% 110%, color-mix(in oklab, var(--emerald-500) 12%, transparent), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div
          aria-hidden
          className="mx-auto flex items-center justify-center"
          style={{
            width: 72,
            height: 72,
            borderRadius: 18,
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--emerald-500) 28%, transparent), color-mix(in oklab, var(--emerald-500) 14%, transparent))",
            color: "var(--emerald-500)",
            border:
              "1px solid color-mix(in oklab, var(--emerald-500) 35%, transparent)",
            boxShadow:
              "inset 0 1px 0 0 color-mix(in oklab, white 8%, transparent), " +
              "0 0 32px -4px color-mix(in oklab, var(--emerald-500) 35%, transparent), " +
              "0 4px 14px -2px rgba(0,0,0,0.25)",
          }}
        >
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h2
          className="mt-5 font-semibold"
          style={{
            color: "var(--text-default)",
            fontSize: 28,
            letterSpacing: "-0.022em",
            lineHeight: 1.15,
          }}
        >
          {tenant.name} is ready.
        </h2>
        <p
          className="mx-auto mt-2 max-w-md"
          style={{
            color: "var(--text-muted)",
            fontSize: 13.5,
            lineHeight: 1.5,
          }}
        >
          The basics are in place. Head to the dashboard to start quoting, or keep tuning your settings — everything&apos;s editable from here on.
        </p>
      </section>

      {/* Configured summary */}
      <section
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "20px 22px",
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex items-center gap-1.5 mb-3">
          <span
            aria-hidden
            style={{
              width: 3,
              height: 3,
              borderRadius: 1,
              background: "var(--accent-primary)",
              flexShrink: 0,
            }}
          />
          <h3
            style={{
              color: "var(--text-default)",
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              lineHeight: 1.2,
            }}
          >
            What&apos;s configured
          </h3>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2">
          {ONBOARDING_STEPS.map((step) => (
            <li
              key={step.slug}
              className="flex items-start gap-2.5"
              style={{
                padding: "10px 12px",
                borderRadius: 9,
                background:
                  "radial-gradient(360px circle at 0% 0%, color-mix(in oklab, var(--emerald-500) 8%, transparent), transparent 55%), " +
                  "color-mix(in oklab, var(--surface-2) 50%, transparent)",
                border:
                  "1px solid color-mix(in oklab, var(--emerald-500) 22%, transparent)",
              }}
            >
              <span
                aria-hidden
                className="flex items-center justify-center"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  background:
                    "linear-gradient(135deg, color-mix(in oklab, var(--emerald-500) 24%, transparent), color-mix(in oklab, var(--emerald-500) 12%, transparent))",
                  color: "var(--emerald-500)",
                  border:
                    "1px solid color-mix(in oklab, var(--emerald-500) 30%, transparent)",
                  flexShrink: 0,
                  marginTop: 1,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
              <div className="min-w-0">
                <div
                  style={{
                    color: "var(--text-default)",
                    fontSize: 12.5,
                    fontWeight: 600,
                    letterSpacing: "-0.005em",
                    lineHeight: 1.25,
                  }}
                >
                  {step.label}
                </div>
                <div
                  className="mt-0.5"
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 11.5,
                    lineHeight: 1.4,
                  }}
                >
                  {step.description}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <Link
          href={`/t/${slug}/settings`}
          className="ts-focus inline-flex items-center gap-1 transition-colors hover:text-[var(--text-default)]"
          style={{
            color: "var(--text-muted)",
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          Tweak settings
        </Link>
        <Link
          href={`/t/${slug}/dashboard`}
          className="ts-focus inline-flex items-center gap-2 rounded-xl font-semibold transition-transform"
          style={{
            height: 44,
            padding: "0 18px",
            background:
              "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
            color: "var(--accent-fg)",
            border:
              "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
            boxShadow:
              "0 1px 0 0 rgba(255,255,255,0.18) inset, " +
              "0 4px 14px -2px color-mix(in oklab, var(--accent-primary) 40%, transparent), " +
              "0 1px 2px 0 rgba(0,0,0,0.35)",
            fontSize: 13.5,
            letterSpacing: "-0.005em",
          }}
        >
          Go to dashboard
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}
