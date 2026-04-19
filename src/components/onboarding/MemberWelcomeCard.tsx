import Link from "next/link";
import { dismissMemberWelcome } from "@/app/actions/activation";

// Phase 4 Slice F — non-admin member first-run welcome card.
//
// Owners and admins get the multi-step onboarding wizard. Everyone
// else — designers, CSRs, installers, accountants — gets dropped
// straight into the dashboard the first time they sign in, which is
// disorienting. This card shows once (stamp `welcomeSeenAt` on the
// membership) to orient them:
//
//   • What workspace they're in (tenant name)
//   • What role they have
//   • Where to find their day's work (dashboard already below)
//   • Where to get help
//
// It's dismissible via a form action. No auto-dismiss — some members
// may want to leave it up while they read, and we'd rather err on the
// side of visible than polite.
//
// We deliberately do NOT generate role-specific deep links here (e.g.
// "go to your tasks"). The persona dashboard already surfaces those
// prominently — duplicating them in the welcome card would just add
// noise. The card is pure orientation, not a nav menu.

export function MemberWelcomeCard({
  slug,
  tenantName,
  roleLabel,
}: {
  slug: string;
  tenantName: string;
  roleLabel: string;
}) {
  const dismissAction = dismissMemberWelcome.bind(null, slug);

  return (
    <section
      className="mb-6 rounded-xl p-5"
      style={{
        background: "var(--accent-surface)",
        border: "1px solid var(--accent-surface-strong)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div
            className="text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--accent-primary)" }}
          >
            Welcome
          </div>
          <h2
            className="mt-1 text-lg font-semibold"
            style={{ color: "var(--text-default)" }}
          >
            You&apos;re in {tenantName}.
          </h2>
          <p
            className="mt-2 max-w-xl text-sm leading-relaxed"
            style={{ color: "var(--text-default)" }}
          >
            You&apos;re signed in as{" "}
            <span className="font-semibold">{roleLabel}</span>. The tiles
            below are tailored to what you actually work on — your tasks,
            the jobs assigned to you, and the parts of the pipeline that
            touch your role.
          </p>
          <ul
            className="mt-3 space-y-1 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            <li>
              · Use the search in the top bar (or ⌘K) to jump to a
              customer, quote, or order by name.
            </li>
            <li>
              · Pressing <kbd className="px-1">?</kbd> anywhere pulls up
              a keyboard shortcuts cheat-sheet.
            </li>
            <li>
              ·{" "}
              <Link
                href={`/t/${slug}/support`}
                className="underline"
                style={{ color: "var(--accent-primary)" }}
              >
                Support
              </Link>{" "}
              is one click away if you get stuck — your shop&apos;s admin
              will get a ping.
            </li>
          </ul>
        </div>
        <form action={dismissAction}>
          <button
            type="submit"
            className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors hover:brightness-110"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-fg)",
            }}
          >
            Got it — hide this
          </button>
        </form>
      </div>
    </section>
  );
}
