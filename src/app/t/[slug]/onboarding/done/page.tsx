import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { ONBOARDING_STEPS } from "../steps";

// Phase 18 Slice D — onboarding completion celebration.
//
// Showing a "done" screen (rather than a silent redirect to the
// dashboard) does two things:
//   1. Acknowledges the effort the owner just put in — small thing,
//      but it's the first moment Tracksign feels polished to them.
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
    <div className="space-y-6">
      <section
        className="rounded-xl p-8 text-center"
        style={{
          background: "var(--accent-surface)",
          border: "1px solid var(--accent-surface-strong)",
        }}
      >
        <div
          aria-hidden
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-2xl"
          style={{
            background: "var(--success-surface)",
            color: "var(--success-fg)",
            border: "1px solid var(--success-fg)",
          }}
        >
          ✓
        </div>
        <h2
          className="mt-4 text-xl font-semibold"
          style={{ color: "var(--text-default)" }}
        >
          {tenant.name} is ready.
        </h2>
        <p
          className="mx-auto mt-2 max-w-md text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          The basics are in place. Head to the dashboard to start quoting,
          or keep tuning your settings — everything's editable from here on.
        </p>
      </section>

      <section
        className="rounded-xl p-6"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--text-default)" }}
        >
          What&apos;s configured
        </h3>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {ONBOARDING_STEPS.map((step) => (
            <li
              key={step.slug}
              className="flex items-start gap-3 rounded-md px-3 py-2"
              style={{ background: "var(--surface-0)" }}
            >
              <span
                aria-hidden
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                style={{
                  background: "var(--success-surface)",
                  color: "var(--success-fg)",
                  border: "1px solid var(--success-fg)",
                }}
              >
                ✓
              </span>
              <div className="min-w-0">
                <div
                  className="text-sm font-medium"
                  style={{ color: "var(--text-default)" }}
                >
                  {step.label}
                </div>
                <div
                  className="mt-0.5 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {step.description}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/t/${slug}/settings`}
          className="text-sm underline"
          style={{ color: "var(--text-muted)" }}
        >
          Tweak settings
        </Link>
        <Link
          href={`/t/${slug}/dashboard`}
          className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors hover:brightness-110"
          style={{
            background: "var(--accent-primary)",
            color: "var(--accent-fg)",
          }}
        >
          Go to dashboard
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
