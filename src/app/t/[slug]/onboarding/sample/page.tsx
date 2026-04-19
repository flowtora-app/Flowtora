import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { loadSampleData } from "@/app/actions/sample-data";
import { completeOnboarding } from "@/app/actions/onboarding";
import { Card, CardHeader } from "@/components/Card";

// Phase 4 Slice C — sample data step.
//
// Optional. The shop can either:
//   • "Load a demo shop" — we seed 5 customers / 6 products / 3 quotes /
//     1 order / 1 invoice so they can click around a populated workspace.
//     They can clear it any time from Settings.
//   • "Start clean" — we complete onboarding and drop them on the
//     dashboard with real-data empty states (which have their own teaching
//     copy, see Slice F).
//
// We deliberately don't let the user load sample data AFTER completing
// onboarding — once they're on day one with real customers, seeding demo
// rows would be a confusion bomb. The path is: onboarding step → yes or
// no. Later removal is the only lever.

export default async function SampleStep({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const { tenant } = await requirePermission(slug, "tenant:manage");

  const loadAction = loadSampleData.bind(null, slug);
  const finishAction = completeOnboarding.bind(null, slug);

  const alreadyLoaded = !!tenant.sampleDataLoadedAt;
  const justLoaded = sp.ok === "1";
  const errored = sp.error === "already_loaded";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Explore with a demo shop?"
          description="Skip to a fully populated workspace to see how Tracksign feels when it's running live."
        />
        <div className="space-y-4 px-5 py-5">
          {justLoaded && (
            <div
              className="rounded-md px-3 py-2 text-sm"
              style={{
                background: "var(--success-surface)",
                border: "1px solid var(--success-fg)",
                color: "var(--success-fg)",
              }}
            >
              Sample data loaded. Check out{" "}
              <Link href={`/t/${slug}/customers`} className="underline">
                customers
              </Link>
              ,{" "}
              <Link href={`/t/${slug}/quotes`} className="underline">
                quotes
              </Link>
              , and{" "}
              <Link href={`/t/${slug}/invoices`} className="underline">
                invoices
              </Link>
              . You can clear it any time from Settings.
            </div>
          )}
          {errored && (
            <div
              className="rounded-md px-3 py-2 text-sm"
              style={{
                background: "var(--warning-surface)",
                border: "1px solid var(--warning-fg)",
                color: "var(--warning-fg)",
              }}
            >
              Sample data has already been loaded once. Use Settings to clear
              it first if you want a fresh copy.
            </div>
          )}

          <div
            className="rounded-lg p-4"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              className="text-sm font-medium"
              style={{ color: "var(--text-default)" }}
            >
              What you&apos;ll get
            </div>
            <ul
              className="mt-2 grid gap-1.5 text-xs sm:grid-cols-2"
              style={{ color: "var(--text-muted)" }}
            >
              <li>· 5 sample customers (leads + one WON, one LOST)</li>
              <li>· 6 products spanning fixed, per-unit, per-sqft, hourly</li>
              <li>· 3 quotes — one draft, one sent, one approved</li>
              <li>· 1 order converted from the approved quote</li>
              <li>· 1 deposit invoice tied to the order</li>
              <li>· All tagged for easy one-click removal</li>
            </ul>
          </div>

          <div
            className="rounded-md px-3 py-2 text-xs"
            style={{
              background: "var(--surface-0)",
              border: "1px solid var(--border-subtle)",
              color: "var(--text-faint)",
            }}
          >
            Sample rows are tagged <code>demo</code>. You can wipe them from
            Settings → Workspace → Sample data without touching real records.
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <form action={finishAction}>
              <button
                type="submit"
                className="text-xs underline"
                style={{ color: "var(--text-muted)" }}
              >
                Start clean — skip the demo
              </button>
            </form>
            <form action={loadAction}>
              <button
                type="submit"
                disabled={alreadyLoaded}
                className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  background: "var(--accent-primary)",
                  color: "var(--accent-fg)",
                }}
              >
                {alreadyLoaded ? "Sample data already loaded" : "Load demo shop"}
                <span aria-hidden>→</span>
              </button>
            </form>
          </div>

          {alreadyLoaded && (
            <form action={finishAction} className="flex justify-end">
              <button
                type="submit"
                className="text-xs underline"
                style={{ color: "var(--text-muted)" }}
              >
                Finish setup and go to dashboard →
              </button>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
