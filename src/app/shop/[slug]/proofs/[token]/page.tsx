import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { proofStatusColor, proofStatusLabel } from "@/lib/proofs";
import { approveProof, requestProofChanges, bumpProofTokenView } from "@/app/actions/customer-proofs";

// Customer proof approval (S-7).
//
// Token-protected, full-screen proof viewer. Real data when the
// ShareToken resolves to a live PROOF, scaffold demo content when it
// doesn't (so the visual stays reviewable from any URL).

export const dynamic = "force-dynamic";

type ResolvedProof = {
  shareId: string;
  shareLastUsedAt: Date | null;
  proofId: string;
  proofTitle: string;
  proofVersion: number;
  proofStatus: string;
  proofStatusTone: string;
  proofStatusLabel: string;
  proofUpdatedAt: Date;
  proofRound: number;
  customerResponse: string | null;
  customerEmail: string | null;
  customerId: string;
  orderNumber: string;
  versions: { id: string; version: number; status: string; current: boolean; createdAt: Date; description: string | null }[];
};

async function resolve(slug: string, token: string): Promise<{ tenant: { name: string; brandPrimaryColor: string | null }; resolved: ResolvedProof | null }> {
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true, brandPrimaryColor: true },
  });
  if (!tenant) notFound();

  const share = await db.shareToken.findUnique({
    where: { token },
    include: {
      proof: {
        include: {
          order: {
            select: {
              number: true,
              customer: { select: { id: true, email: true } },
            },
          },
        },
      },
    },
  });

  // Bad / mismatched / wrong-kind tokens fall back to scaffold view.
  if (
    !share ||
    share.tenantId !== tenant.id ||
    share.kind !== "PROOF" ||
    !share.proof ||
    share.revokedAt ||
    (share.expiresAt && share.expiresAt.getTime() < Date.now())
  ) {
    return {
      tenant: { name: tenant.name, brandPrimaryColor: tenant.brandPrimaryColor },
      resolved: null,
    };
  }

  // Sibling versions of the same order for the version pager.
  const siblings = await db.proof.findMany({
    where: { orderId: share.proof.orderId },
    orderBy: { version: "asc" },
    select: {
      id: true,
      version: true,
      status: true,
      createdAt: true,
      description: true,
    },
  });

  return {
    tenant: { name: tenant.name, brandPrimaryColor: tenant.brandPrimaryColor },
    resolved: {
      shareId:         share.id,
      shareLastUsedAt: share.lastUsedAt,
      proofId:         share.proof.id,
      proofTitle:      share.proof.title ?? `Proof for ${share.proof.order.number}`,
      proofVersion:    share.proof.version,
      proofStatus:     share.proof.status,
      proofStatusTone: proofStatusColor(share.proof.status),
      proofStatusLabel: proofStatusLabel(share.proof.status),
      proofUpdatedAt:  share.proof.updatedAt,
      proofRound:      share.proof.revisionRound,
      customerResponse: share.proof.customerResponse,
      customerEmail:   share.proof.order.customer.email,
      customerId:      share.proof.order.customer.id,
      orderNumber:     share.proof.order.number,
      versions: siblings.map((v) => ({
        id: v.id,
        version: v.version,
        status: v.status,
        current: v.id === share.proof!.id,
        createdAt: v.createdAt,
        description: v.description,
      })),
    },
  };
}

function fmtAgo(d: Date | null): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const m = Math.round(ms / 60_000);
  if (m < 1)   return "just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24)  return `${h}h ago`;
  const d2 = Math.round(h / 24);
  if (d2 < 7)  return `${d2}d ago`;
  return d.toISOString().slice(0, 10);
}

export default async function StorefrontProofPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; token: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { slug, token } = await params;
  const sp = await searchParams;
  const { tenant, resolved } = await resolve(slug, token);
  const brand = tenant.brandPrimaryColor ?? "#7C3AED";

  // Bump token view stats — non-blocking, ignore errors.
  if (resolved) {
    // Fire-and-forget; intentionally not awaited so the page render
    // isn't slowed by the update.
    void bumpProofTokenView(slug, token);
  }

  // Display values — real when resolved, scaffold when not.
  const live = !!resolved;
  const title = resolved?.proofTitle ?? "Storefront sign · Bright Coffee Co.";
  const versionLabel = resolved
    ? `Version ${resolved.proofVersion}`
    : "Version 2";
  const sentLabel = resolved
    ? `uploaded ${fmtAgo(resolved.proofUpdatedAt)} by ${tenant.name}`
    : `uploaded 2 hours ago by ${tenant.name}`;
  const orderNumber = resolved?.orderNumber ?? "O-1042";
  const statusTone = resolved?.proofStatusTone ?? "#f59e0b";
  const statusLabel = resolved?.proofStatusLabel ?? "Awaiting your approval";
  const versions = resolved?.versions ?? [
    { id: "v2", version: 2, status: "SENT", current: true,  createdAt: new Date(Date.now() - 7_200_000), description: "Logo color updated; tagline tightened." },
    { id: "v1", version: 1, status: "CHANGES_REQUESTED", current: false, createdAt: new Date(Date.now() - 86_400_000), description: "Original proof — color was off." },
  ];
  const isApproved   = resolved?.proofStatus === "APPROVED";
  const canTakeAction = !isApproved;

  // Build action targets — when resolved we POST to the real actions.
  const approveAction = live ? approveProof.bind(null, slug, token) : undefined;
  const changesAction = live ? requestProofChanges.bind(null, slug, token) : undefined;

  return (
    <div style={{ paddingTop: 16, paddingBottom: 24 }}>
      <div style={{ fontSize: 12, marginBottom: 12 }}>
        <Link
          href={`/shop/${slug}`}
          style={{ color: "#6b7280", textDecoration: "none" }}
        >
          ← Back to {tenant.name}
        </Link>
      </div>

      {/* Confirmation banners. */}
      {sp.ok === "approved" && <FlashBanner tone="success" text="Proof approved — thanks! We'll start production right away." />}
      {sp.ok === "changes-requested" && <FlashBanner tone="info" text="Got it — your feedback is in. We'll send a revised proof shortly." />}
      {sp.ok === "already-approved" && <FlashBanner tone="info" text="This proof is already approved." />}
      {sp.error && <FlashBanner tone="error" text={decodeURIComponent(sp.error)} />}

      {/* Header card. */}
      <header
        className="relative overflow-hidden"
        style={{
          padding: "20px 24px",
          borderRadius: 18,
          background:
            `radial-gradient(720px circle at 100% 0%, color-mix(in oklab, ${brand} 14%, transparent), transparent 55%), ` +
            "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
          border: "1px solid #e5e7eb",
          boxShadow:
            "inset 0 1px 0 0 rgba(255,255,255,0.6), " +
            "0 1px 4px 0 rgba(0,0,0,0.04)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span
              style={{
                color: brand,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Proof for your review
            </span>
            <h1
              className="mt-1 font-semibold"
              style={{
                color: "#0b0d10",
                fontSize: 24,
                letterSpacing: "-0.018em",
                lineHeight: 1.2,
              }}
            >
              {title}
            </h1>
            <p
              className="mt-1"
              style={{ color: "#6b7280", fontSize: 12.5, lineHeight: 1.4 }}
            >
              <span style={{ color: "#0b0d10", fontWeight: 500 }}>{versionLabel}</span>
              <span style={{ color: "#9ca3af" }}> · </span>
              {sentLabel}
            </p>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: statusTone,
              background: `color-mix(in oklab, ${statusTone} 14%, transparent)`,
              border: `1px solid color-mix(in oklab, ${statusTone} 30%, transparent)`,
              padding: "4px 10px",
              borderRadius: 999,
              lineHeight: 1,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 5,
                height: 5,
                borderRadius: 999,
                background: statusTone,
                boxShadow: `0 0 0 2px color-mix(in oklab, ${statusTone} 25%, transparent)`,
              }}
            />
            {statusLabel}
          </span>
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Proof viewer. */}
        <main
          style={{
            position: "relative",
            borderRadius: 18,
            background: "#0b0d10",
            border: "1px solid #1f262e",
            overflow: "hidden",
            boxShadow: "0 4px 18px -4px rgba(0,0,0,0.2)",
            minHeight: 580,
          }}
        >
          {/* Viewer toolbar. */}
          <div
            className="flex items-center justify-between gap-3"
            style={{
              padding: "12px 18px",
              background: "rgba(0,0,0,0.4)",
              borderBottom: "1px solid #1f262e",
              backdropFilter: "blur(4px)",
            }}
          >
            <div className="flex items-center gap-1.5">
              <ToolbarBtn label={`Page 1 of ${versions.length || 1}`} />
              <ToolbarBtn icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              } />
              <ToolbarBtn icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              } />
            </div>
            <div className="flex items-center gap-1.5">
              <ToolbarBtn label="100%" />
              <ToolbarBtn icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3M8 11h6" />
                </svg>
              } />
              <ToolbarBtn icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m21 21-4.3-4.3M8 11h6M11 8v6" />
                </svg>
              } />
              <span style={{ width: 1, height: 18, background: "#1f262e", margin: "0 4px" }} />
              <ToolbarBtn icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
              } label="Download" />
            </div>
          </div>

          {/* Proof preview placeholder — real file rendering arrives
              with the proof-file backend. */}
          <div
            className="flex items-center justify-center"
            style={{
              minHeight: 480,
              padding: 24,
              background:
                "radial-gradient(circle at 50% 50%, #161b22 0%, #0b0d10 100%)",
            }}
          >
            <div
              style={{
                width: "100%",
                maxWidth: 520,
                aspectRatio: "4 / 3",
                borderRadius: 12,
                background: "white",
                boxShadow:
                  "0 24px 60px -12px rgba(0,0,0,0.5), " +
                  "0 0 0 1px rgba(255,255,255,0.06)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    `radial-gradient(circle at 80% 20%, color-mix(in oklab, ${brand} 18%, transparent), transparent 55%), ` +
                    `linear-gradient(135deg, color-mix(in oklab, ${brand} 10%, #fafafa), #f3f4f6)`,
                }}
              />
              <div
                className="absolute inset-0 flex flex-col items-center justify-center text-center"
                style={{ padding: 24 }}
              >
                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    letterSpacing: "-0.018em",
                    color: "#0b0d10",
                    lineHeight: 1.2,
                  }}
                >
                  {title}
                </div>
                <div
                  style={{
                    marginTop: 18,
                    width: 80,
                    height: 1,
                    background: `color-mix(in oklab, ${brand} 30%, transparent)`,
                  }}
                />
                <div
                  style={{
                    marginTop: 14,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "#9ca3af",
                  }}
                >
                  Order {orderNumber} · {versionLabel}
                </div>
              </div>
            </div>
          </div>

          {/* Version pager. */}
          <div
            className="flex items-center justify-center gap-2"
            style={{
              padding: "12px",
              background: "rgba(0,0,0,0.4)",
              borderTop: "1px solid #1f262e",
            }}
          >
            {versions.map((v) => (
              <button
                key={v.id}
                type="button"
                style={{
                  width: 38,
                  height: 28,
                  borderRadius: 7,
                  background: v.current ? "rgba(255,255,255,0.08)" : "transparent",
                  border: v.current ? "1px solid rgba(255,255,255,0.18)" : "1px solid transparent",
                  color: v.current ? "white" : "#6b7280",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFeatureSettings: "'tnum' 1",
                  cursor: "pointer",
                }}
              >
                v{v.version}
              </button>
            ))}
          </div>
        </main>

        {/* Sidebar: actions + info + versions. */}
        <aside
          className="space-y-4"
          style={{ position: "sticky", top: 88, alignSelf: "start" }}
        >
          {/* Action buttons. */}
          <div
            style={{
              padding: "18px",
              borderRadius: 16,
              background:
                `radial-gradient(420px circle at 100% 0%, color-mix(in oklab, ${brand} 14%, transparent), transparent 55%), ` +
                "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
              border: "1px solid #e5e7eb",
              boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)",
            }}
          >
            <div className="flex items-center gap-1.5 mb-3">
              <span aria-hidden style={{ width: 3, height: 3, borderRadius: 1, background: brand }} />
              <h2
                style={{
                  color: "#0b0d10",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Take action
              </h2>
            </div>

            {!canTakeAction && (
              <div
                style={{
                  marginBottom: 14,
                  padding: "10px 12px",
                  borderRadius: 9,
                  background: "color-mix(in oklab, #10b981 14%, white)",
                  border: "1px solid color-mix(in oklab, #10b981 32%, transparent)",
                  fontSize: 12.5,
                  color: "#065f46",
                  lineHeight: 1.45,
                }}
              >
                <strong style={{ color: "#10b981", fontWeight: 700 }}>Approved.</strong>{" "}
                {resolved?.customerResponse ?? "This proof is locked and production is underway."}
              </div>
            )}

            {/* Approve form */}
            <form action={approveAction}>
              {canTakeAction && live && (
                <>
                  <label className="block mb-2">
                    <span
                      style={{
                        display: "block",
                        marginBottom: 4,
                        color: "#0b0d10",
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "-0.005em",
                      }}
                    >
                      Sign your name to approve
                    </span>
                    <input
                      type="text"
                      name="signatureName"
                      required
                      placeholder="e.g. Sarah Johnson"
                      style={{
                        width: "100%",
                        height: 38,
                        padding: "0 12px",
                        borderRadius: 8,
                        background: "white",
                        border: "1px solid #e5e7eb",
                        color: "#0b0d10",
                        fontSize: 13,
                        outline: "none",
                        fontFamily: "var(--font-sans, system-ui)",
                      }}
                    />
                  </label>
                </>
              )}
              <button
                type="submit"
                disabled={!canTakeAction}
                className="w-full"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  height: 46,
                  padding: "0 18px",
                  borderRadius: 11,
                  background:
                    "linear-gradient(180deg, color-mix(in oklab, #10b981 96%, white 4%) 0%, #10b981 100%)",
                  color: "white",
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: "-0.005em",
                  border: "1px solid color-mix(in oklab, #10b981 80%, black 20%)",
                  boxShadow:
                    "0 1px 0 0 rgba(255,255,255,0.18) inset, " +
                    "0 4px 14px -2px color-mix(in oklab, #10b981 40%, transparent), " +
                    "0 1px 2px 0 rgba(0,0,0,0.12)",
                  cursor: canTakeAction ? "pointer" : "not-allowed",
                  opacity: canTakeAction ? 1 : 0.55,
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {isApproved ? "Approved" : "Approve this proof"}
              </button>
            </form>

            {/* Request changes form */}
            {canTakeAction && live && (
              <form action={changesAction} className="mt-3">
                <textarea
                  name="feedback"
                  required
                  rows={3}
                  placeholder="What needs to change?"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "white",
                    border: "1px solid #e5e7eb",
                    color: "#0b0d10",
                    fontSize: 12.5,
                    outline: "none",
                    resize: "vertical",
                    lineHeight: 1.5,
                    fontFamily: "var(--font-sans, system-ui)",
                  }}
                />
                <button
                  type="submit"
                  className="w-full mt-2"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    height: 40,
                    padding: "0 18px",
                    borderRadius: 11,
                    background: "white",
                    color: "#0b0d10",
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: "-0.005em",
                    border: "1px solid #e5e7eb",
                    cursor: "pointer",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  Request changes
                </button>
              </form>
            )}

            {!live && canTakeAction && (
              <button
                type="button"
                disabled
                className="w-full mt-2"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  height: 42,
                  padding: "0 18px",
                  borderRadius: 11,
                  background: "white",
                  color: "#0b0d10",
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: "-0.005em",
                  border: "1px solid #e5e7eb",
                  cursor: "not-allowed",
                  opacity: 0.5,
                }}
              >
                Request changes
              </button>
            )}

            <p
              className="mt-3"
              style={{ color: "#6b7280", fontSize: 11.5, lineHeight: 1.5 }}
            >
              {isApproved
                ? "Production is underway. You'll get a notification when it's ready."
                : "Approving signs off on this version. We'll start production right after."}
            </p>
          </div>

          {/* Info block. */}
          <div
            style={{
              padding: "18px",
              borderRadius: 16,
              background: "white",
              border: "1px solid #e5e7eb",
              boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)",
            }}
          >
            <div className="flex items-center gap-1.5 mb-3">
              <span aria-hidden style={{ width: 3, height: 3, borderRadius: 1, background: brand }} />
              <h2
                style={{
                  color: "#0b0d10",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Project details
              </h2>
            </div>
            <dl className="space-y-2.5" style={{ fontSize: 12.5 }}>
              <InfoRow label="From" value={tenant.name} />
              <InfoRow label="Order" value={orderNumber} mono />
              <InfoRow label="Version" value={`${resolved?.proofVersion ?? 2} of ${versions.length || 2}`} />
              <InfoRow label="Sent" value={fmtAgo(resolved?.proofUpdatedAt ?? new Date(Date.now() - 7_200_000))} />
              {resolved?.proofRound && resolved.proofRound > 1 && (
                <InfoRow label="Round" value={`${resolved.proofRound}`} />
              )}
            </dl>
          </div>

          {/* Version history. */}
          {versions.length > 0 && (
            <div
              style={{
                padding: "18px",
                borderRadius: 16,
                background: "white",
                border: "1px solid #e5e7eb",
                boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)",
              }}
            >
              <div className="flex items-center gap-1.5 mb-3">
                <span aria-hidden style={{ width: 3, height: 3, borderRadius: 1, background: brand }} />
                <h2
                  style={{
                    color: "#0b0d10",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                  }}
                >
                  Versions
                </h2>
              </div>
              <ul className="space-y-2">
                {versions
                  .slice()
                  .sort((a, b) => b.version - a.version)
                  .map((v) => (
                    <VersionRow
                      key={v.id}
                      n={v.version}
                      when={fmtAgo(v.createdAt)}
                      current={v.current}
                      status={v.status === "CHANGES_REQUESTED" ? "Changes requested" : undefined}
                      note={v.description ?? "—"}
                      brand={brand}
                    />
                  ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {/* Disclaimer. */}
      <p
        className="mt-6 text-center"
        style={{ color: "#9ca3af", fontSize: 11.5, lineHeight: 1.5 }}
      >
        This is a secure proof link.{" "}
        <span style={{ fontFamily: "var(--font-mono, ui-monospace, monospace)" }}>#{token.slice(0, 8)}</span> —
        do not share it publicly.
        {!live && <span style={{ color: "#f59e0b", marginLeft: 6 }}>Preview mode (token not recognized)</span>}
      </p>
    </div>
  );
}

function FlashBanner({ tone, text }: { tone: "success" | "info" | "error"; text: string }) {
  const colors = tone === "success"
    ? { bg: "color-mix(in oklab, #10b981 12%, white)", border: "color-mix(in oklab, #10b981 35%, transparent)", fg: "#065f46" }
    : tone === "info"
      ? { bg: "color-mix(in oklab, #3b82f6 10%, white)", border: "color-mix(in oklab, #3b82f6 30%, transparent)", fg: "#1e40af" }
      : { bg: "color-mix(in oklab, #ef4444 12%, white)", border: "color-mix(in oklab, #ef4444 30%, transparent)", fg: "#b91c1c" };
  return (
    <div
      className="mb-4 rounded-lg px-4 py-3"
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        color: colors.fg,
        fontSize: 13,
        lineHeight: 1.5,
        fontWeight: 500,
      }}
    >
      {text}
    </div>
  );
}

function ToolbarBtn({
  label,
  icon,
}: {
  label?: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
        height: 28,
        padding: icon && !label ? "0 8px" : "0 10px",
        borderRadius: 7,
        background: "rgba(255,255,255,0.06)",
        color: "rgba(255,255,255,0.88)",
        fontSize: 11.5,
        fontWeight: 600,
        letterSpacing: "-0.005em",
        border: "1px solid rgba(255,255,255,0.12)",
        cursor: "pointer",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt
        style={{
          color: "#6b7280",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </dt>
      <dd
        style={{
          color: "#0b0d10",
          fontSize: 12.5,
          fontWeight: 600,
          fontFamily: mono ? "var(--font-mono, ui-monospace, monospace)" : undefined,
          fontFeatureSettings: "'tnum' 1",
        }}
      >
        {value}
      </dd>
    </div>
  );
}

function VersionRow({
  n,
  when,
  current,
  status,
  note,
  brand,
}: {
  n: number;
  when: string;
  current?: boolean;
  status?: string;
  note: string;
  brand: string;
}) {
  return (
    <li
      className="relative"
      style={{
        padding: "10px 12px",
        borderRadius: 9,
        background: current ? `color-mix(in oklab, ${brand} 8%, white)` : "transparent",
        border: current ? `1px solid color-mix(in oklab, ${brand} 22%, transparent)` : "1px solid transparent",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 22,
              height: 22,
              borderRadius: 6,
              background: current ? brand : "#f3f4f6",
              color: current ? "white" : "#6b7280",
              fontSize: 11,
              fontWeight: 700,
              border: current
                ? `1px solid color-mix(in oklab, ${brand} 80%, black 20%)`
                : "1px solid #e5e7eb",
            }}
          >
            v{n}
          </span>
          <span
            style={{
              color: "#0b0d10",
              fontSize: 12.5,
              fontWeight: current ? 700 : 500,
              letterSpacing: "-0.005em",
            }}
          >
            {when}
          </span>
        </span>
        {status && (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "#f59e0b",
              background: "color-mix(in oklab, #f59e0b 14%, transparent)",
              border: "1px solid color-mix(in oklab, #f59e0b 30%, transparent)",
              padding: "2px 6px",
              borderRadius: 999,
              lineHeight: 1,
            }}
          >
            {status}
          </span>
        )}
        {current && (
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: brand,
              background: `color-mix(in oklab, ${brand} 14%, white)`,
              border: `1px solid color-mix(in oklab, ${brand} 28%, transparent)`,
              padding: "2px 6px",
              borderRadius: 999,
              lineHeight: 1,
            }}
          >
            Current
          </span>
        )}
      </div>
      <p
        className="mt-1.5 pl-7"
        style={{ color: "#6b7280", fontSize: 11.5, lineHeight: 1.5 }}
      >
        {note}
      </p>
    </li>
  );
}
