import { requirePortalToken } from "@/lib/portal";
import { PortalNav } from "@/components/portal/PortalNav";
import { portalBrandVars } from "@/lib/portal-theme";
import { Logomark } from "@/components/brand/BrandMark";

// Phase 18 Slice E — customer portal chrome.
//
// Same visual language as the app shell (neutral surface + accented
// active link) so a customer moving between invoice and proof pages
// gets consistent feedback about where they are.

const NAV: { href: string; label: string }[] = [
  { href: "", label: "Overview" },
  { href: "quotes", label: "Quotes" },
  { href: "orders", label: "Orders" },
  { href: "proofs", label: "Proofs" },
  { href: "invoices", label: "Invoices" },
  { href: "installs", label: "Install schedule" },
  { href: "history", label: "Activity" },
  // Phase 16 — two-way portal messaging.
  { href: "messages", label: "Messages" },
];

export default async function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await requirePortalToken(token);
  const basePath = `/portal/${token}`;

  // Phase 15 Slice D — if the tenant has a brand color set, surface it as
  // the portal accent without touching the rest of the palette.
  const brandVars = portalBrandVars(ctx.tenant);
  const contactLines = [
    ctx.tenant.phone,
    ctx.tenant.website,
    [ctx.tenant.city, ctx.tenant.region].filter(Boolean).join(", ") || null,
  ].filter(Boolean) as string[];

  return (
    <div
      className="flex min-h-screen"
      style={{ background: "var(--surface-0)", ...brandVars }}
    >
      <aside
        className="flex w-64 flex-col"
        style={{
          background: "var(--surface-1)",
          borderRight: "1px solid var(--border-subtle)",
        }}
      >
        <div
          className="px-5 py-5"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          {ctx.tenant.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ctx.tenant.logoUrl}
              alt={ctx.tenant.name}
              className="mb-2 h-8 w-auto"
            />
          )}
          <div
            className="text-sm font-semibold"
            style={{ color: "var(--text-default)" }}
          >
            {ctx.tenant.name}
          </div>
          <div
            className="mt-0.5 text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--text-faint)" }}
          >
            Customer portal
          </div>
        </div>
        <PortalNav token={token} basePath={basePath} items={NAV} />
        <div
          className="px-5 py-3 text-xs"
          style={{
            borderTop: "1px solid var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          Signed in as{" "}
          <span style={{ color: "var(--text-default)" }}>
            {ctx.customer.name}
          </span>
        </div>
        {/* Phase 15 Slice D — shop contact footer. Gives the customer an
            obvious "reach my rep" path without forcing them to hunt for it
            in an email chain. Only renders lines that are populated so a
            half-filled profile doesn't look half-rendered. */}
        {contactLines.length > 0 && (
          <div
            className="mt-auto px-5 py-3 text-xs"
            style={{
              borderTop: "1px solid var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
              Questions?
            </div>
            {contactLines.map((line) => (
              <div key={line} className="truncate">{line}</div>
            ))}
          </div>
        )}
        {contactLines.length === 0 && <div className="mt-auto" />}

        {/* Subtle product attribution. The tenant's brand dominates the
            portal — this line just tells an inquisitive customer what
            platform their shop is using, without competing for eye. */}
        <div
          className="flex items-center gap-1.5 px-5 py-3 text-[10px]"
          style={{
            borderTop: "1px solid var(--border-subtle)",
            color: "var(--text-faint)",
          }}
        >
          <span>Powered by</span>
          <Logomark size={14} />
          <span
            className="font-semibold tracking-tight"
            style={{ color: "var(--text-muted)" }}
          >
            Tracksign
          </span>
        </div>
      </aside>
      <main className="flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
