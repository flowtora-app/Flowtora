import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";

// Customer proof approval (S-7).
//
// Token-protected, full-screen proof viewer for customers.
// Per spec layout:
//   - Body: large proof preview (zoom, pan, multi-page navigation)
//   - Sidebar: customer info + status + comments + version history
//   - Actions: Approve (with signature) / Request changes / Download
//
// Token validation, file rendering, and signature pad wire up when
// the proof backend ships. This scaffold establishes the IA + design
// + action surface in advance so the visual direction is reviewable.

export const dynamic = "force-dynamic";

export default async function StorefrontProofPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }>;
}) {
  const { slug, token } = await params;
  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { name: true, brandPrimaryColor: true },
  });
  if (!tenant) notFound();
  const brand = tenant.brandPrimaryColor ?? "#7C3AED";

  // Token validation will look up the underlying ProofVersion + parent
  // Quote/Order when the backend is wired. Until then we render with
  // placeholder copy so the surface design is reviewable.

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
              Storefront sign · Bright Coffee Co.
            </h1>
            <p
              className="mt-1"
              style={{ color: "#6b7280", fontSize: 12.5, lineHeight: 1.4 }}
            >
              <span style={{ color: "#0b0d10", fontWeight: 500 }}>Version 2</span>
              <span style={{ color: "#9ca3af" }}> · </span>
              uploaded 2 hours ago by {tenant.name}
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
              color: "#f59e0b",
              background: "color-mix(in oklab, #f59e0b 14%, transparent)",
              border: "1px solid color-mix(in oklab, #f59e0b 30%, transparent)",
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
                background: "#f59e0b",
                boxShadow: "0 0 0 2px color-mix(in oklab, #f59e0b 25%, transparent)",
              }}
            />
            Awaiting your approval
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
              <ToolbarBtn label="Page 1 of 2" />
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

          {/* Proof preview (placeholder until backend wires in). */}
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
                    fontSize: 36,
                    fontWeight: 800,
                    letterSpacing: "-0.025em",
                    color: brand,
                    lineHeight: 1,
                  }}
                >
                  BRIGHT
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    letterSpacing: "0.3em",
                    color: "#4b5563",
                    marginTop: 4,
                  }}
                >
                  COFFEE CO.
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
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "#9ca3af",
                  }}
                >
                  Proof preview · 12&apos; × 4&apos; storefront sign
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
            {[1, 2].map((n) => (
              <button
                key={n}
                type="button"
                style={{
                  width: 38,
                  height: 28,
                  borderRadius: 7,
                  background: n === 1 ? "rgba(255,255,255,0.08)" : "transparent",
                  border: n === 1 ? "1px solid rgba(255,255,255,0.18)" : "1px solid transparent",
                  color: n === 1 ? "white" : "#6b7280",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFeatureSettings: "'tnum' 1",
                  cursor: "pointer",
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </main>

        {/* Sidebar: info + actions + comments. */}
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
            <button
              type="button"
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
                cursor: "pointer",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Approve this proof
            </button>
            <button
              type="button"
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
                cursor: "pointer",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Request changes
            </button>
            <p
              className="mt-3"
              style={{ color: "#6b7280", fontSize: 11.5, lineHeight: 1.5 }}
            >
              Approving signs off on this version. We&apos;ll start production right after.
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
              <InfoRow label="Order" value="O-1042" mono />
              <InfoRow label="Version" value="2 of 2" />
              <InfoRow label="Sent" value="2 hours ago" />
            </dl>
          </div>

          {/* Version history. */}
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
              <VersionRow n={2} when="2h ago" current note="Logo color updated; tagline tightened." brand={brand} />
              <VersionRow n={1} when="Yesterday" status="Changes requested" note="Original proof — color was off." brand={brand} />
            </ul>
          </div>
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
      </p>
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
