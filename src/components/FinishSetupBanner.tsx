import Link from "next/link";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { dismissActivationBanner } from "@/app/actions/activation";

// Phase 4 Slice D — persistent "finish setup" banner.
//
// Renders when activation score < 50 and the owner hasn't snoozed it in
// the last 7 days. Sits at the top of every tenant page just below the
// environment/billing ribbons so it's impossible to miss, but dismissible
// so a shop that's genuinely power-using with low "setup" score (rare
// but real — a shop can run entirely from the portal without ever
// finishing the wizard) isn't nagged forever.
//
// The CTA targets the activation widget on the dashboard specifically
// (anchor #activation) — from there the user can click into any of the
// next-best-actions the engine recommended.

export function FinishSetupBanner({
  slug,
  score,
  topAction,
}: {
  slug: string;
  score: number;
  topAction: { title: string; href: string } | null;
}) {
  const dismissAction = dismissActivationBanner.bind(null, slug);

  return (
    <div
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm"
      style={{
        background: "var(--accent-surface)",
        border: "1px solid var(--accent-surface-strong)",
        color: "var(--text-default)",
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-fg)",
            }}
            aria-hidden
          >
            {score}
          </span>
          <span className="font-medium">
            Your workspace is {score}% activated.{" "}
            <span style={{ color: "var(--text-muted)" }}>
              A few more steps and you&apos;ll be set up for the long haul.
            </span>
          </span>
        </div>
        {topAction && (
          <div
            className="mt-1 pl-8 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Next best step: {topAction.title}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3">
        <Link
          href={`/t/${slug}/dashboard#activation`}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors hover:brightness-110"
          style={{
            background: "var(--accent-primary)",
            color: "var(--accent-fg)",
          }}
        >
          See checklist
          <span aria-hidden>→</span>
        </Link>
        <form action={dismissAction}>
          <SubmitButton
            className="text-xs underline"
            style={{ color: "var(--text-muted)" }}
            pendingLabel={<span className="text-xs">Dismissing…</span>}
          >
            Remind me later
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
