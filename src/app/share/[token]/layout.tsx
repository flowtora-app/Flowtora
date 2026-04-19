import { resolveShareToken } from "@/lib/share";
import { portalBrandVars } from "@/lib/portal-theme";

// Phase 15 Slice A — public share-link chrome.
//
// A stripped-down layout vs the portal: no sidebar, no navigation, just
// a centered page that reads like a one-off document. This is intentional
// — the URL might land in someone's inbox who's never heard of Tracksign,
// and we want the page to feel like "the invoice" rather than "Tracksign
// showing you an invoice".
//
// Phase 15 Slice D: we opportunistically resolve the tenant from the
// token so we can apply the tenant's brand accent. If resolution fails
// (revoked / expired / malformed), we silently fall through to the
// default palette — the page inside the layout will 404 anyway and we
// don't want the layout to double-error.

export default async function ShareLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await resolveShareToken(token);
  const brandVars = ctx ? portalBrandVars(ctx.tenant) : {};

  return (
    <div className="min-h-screen" style={{ background: "var(--surface-0)", ...brandVars }}>
      <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">{children}</div>
      <footer
        className="mx-auto max-w-3xl px-4 pb-8 pt-2 text-center text-[11px]"
        style={{ color: "var(--text-faint)" }}
      >
        Secured by Tracksign
      </footer>
    </div>
  );
}
