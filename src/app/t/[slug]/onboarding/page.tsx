import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { ONBOARDING_STEPS } from "./steps";

// Phase 18 Slice D — onboarding welcome.
//
// Replaces the old redirect-to-/business with a proper landing that
// (a) sets expectations about what's ahead, and (b) gives the user a
// beat to orient themselves. Five minutes is a real commitment, and
// showing the four steps up front makes it feel finite.

export default async function OnboardingWelcome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireTenant(slug);

  return (
    <div className="space-y-6">
      <section
        className="rounded-xl p-6"
        style={{
          background: "var(--accent-surface)",
          border: "1px solid var(--accent-surface-strong)",
        }}
      >
        <h2
          className="text-base font-semibold"
          style={{ color: "var(--accent-primary)" }}
        >
          Here's what we'll cover
        </h2>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--text-default)" }}
        >
          Four short steps. Everything's editable later from Settings —
          this is just to get your shop running on sensible defaults.
        </p>
      </section>

      <ol className="grid gap-3">
        {ONBOARDING_STEPS.map((step, i) => (
          <li
            key={step.slug}
            className="flex items-start gap-4 rounded-lg p-4"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              style={{
                background: "var(--surface-2)",
                color: "var(--text-default)",
              }}
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div
                className="text-sm font-semibold"
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
      </ol>

      <div className="flex items-center justify-between">
        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          Takes about 5 minutes.
        </p>
        <Link
          href={`/t/${slug}/onboarding/${ONBOARDING_STEPS[0].slug}`}
          className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors hover:brightness-110"
          style={{
            background: "var(--accent-primary)",
            color: "var(--accent-fg)",
          }}
        >
          Let&apos;s get started
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
