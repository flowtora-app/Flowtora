import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { SmartTicketForm } from "@/components/support/SmartTicketForm";

// /t/[slug]/support/new — "open a ticket" page (transformation rewrite).
//
// The form itself is a client component (`SmartTicketForm`) that
// captures browser/page context and renders category + severity as
// tappable cards. The page just wires query params (`?from=` and
// `?kind=`) and the breadcrumb / banner shell.

const VALID_KINDS = ["BUG", "QUESTION", "BILLING", "FEATURE_REQUEST", "OTHER"] as const;
type Kind = (typeof VALID_KINDS)[number];

export default async function NewSupportTicketPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; from?: string; kind?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  await requireTenant(slug);

  const kindRaw = (sp.kind ?? "QUESTION").toUpperCase();
  const initialCategory: Kind = (VALID_KINDS as readonly string[]).includes(kindRaw)
    ? (kindRaw as Kind)
    : "QUESTION";

  // The `from` value comes from the FAB or any deep link. We trust it
  // only for display; it gets composed into the message body
  // client-side.
  const fromPath = sp.from ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href={`/t/${slug}/support`} className="hover:underline">
            Support
          </Link>
          <span className="mx-1.5">/</span>
          <span>New ticket</span>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
          Open a ticket
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Describe what's happening — we auto-attach this page, your browser, and a timestamp so
          the team has full context from the first reply.
        </p>
      </div>

      {sp.error && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          <div className="font-semibold">Couldn't submit</div>
          <div className="mt-0.5 text-xs" style={{ opacity: 0.85 }}>
            {decodeURIComponent(sp.error)}
          </div>
        </div>
      )}

      <SmartTicketForm
        slug={slug}
        fromPath={fromPath}
        initialCategory={initialCategory}
      />
    </div>
  );
}
