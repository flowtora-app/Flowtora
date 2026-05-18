import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/format";

// Product configurator (S-3).
//
// Customer-facing product builder. Stepper across the top, current
// step in the main area, live price preview in the right rail.
// Per spec steps:
//   1. Size       - dimensions OR pre-set size selector
//   2. Material   - choose from option group
//   3. Finishing  - lamination, grommets, hemming, etc.
//   4. Quantity   - number input
//   5. Upload     - drag-drop artwork
//   6. Review     - confirm everything before submitting
//
// Step state is URL-driven (?step=size) so the page is fully server
// rendered. Form state will move to client when the actual configurator
// inputs (file upload, dynamic pricing) wire up in a later slice.
//
// This first slice scaffolds the entire UI - stepper, navigation,
// right rail, step bodies as placeholders that read the product's
// catalog values and render an honest "configure here" surface per
// step. Backend integration (option groups, price formulas, file
// upload, cart persistence) lands incrementally.

export const dynamic = "force-dynamic";

type Step = "size" | "material" | "finishing" | "quantity" | "upload" | "review";

const STEPS: { id: Step; label: string; sub: string }[] = [
  { id: "size",      label: "Size",      sub: "Dimensions" },
  { id: "material",  label: "Material",  sub: "Substrate" },
  { id: "finishing", label: "Finishing", sub: "Edges & extras" },
  { id: "quantity",  label: "Quantity",  sub: "How many" },
  { id: "upload",    label: "Upload",    sub: "Your artwork" },
  { id: "review",    label: "Review",    sub: "Confirm" },
];

function parseStep(raw: string | undefined): Step {
  return STEPS.some((s) => s.id === raw) ? (raw as Step) : "size";
}

export default async function StorefrontConfiguratorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; productId: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  const { slug, productId } = await params;
  const sp = await searchParams;
  const step = parseStep(sp.step);

  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      currency: true,
      brandPrimaryColor: true,
    },
  });
  if (!tenant) notFound();

  const product = await db.product.findFirst({
    where: { id: productId, tenantId: tenant.id, active: true },
    select: {
      id: true,
      name: true,
      description: true,
      basePrice: true,
      pricingModel: true,
      unit: true,
      category: true,
      optionGroups: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          required: true,
          options: {
            orderBy: { sortOrder: "asc" },
            select: { id: true, label: true, priceAdjustment: true },
          },
        },
      },
    },
  });
  if (!product) notFound();

  const brand = tenant.brandPrimaryColor ?? "#7C3AED";
  const currentIdx = STEPS.findIndex((s) => s.id === step);
  const prevStep = currentIdx > 0 ? STEPS[currentIdx - 1] : null;
  const nextStep = currentIdx < STEPS.length - 1 ? STEPS[currentIdx + 1] : null;
  const progressPct = Math.round(((currentIdx + 1) / STEPS.length) * 100);

  const buildHref = (id: Step) =>
    `/shop/${slug}/order/${productId}?step=${id}`;

  // Identify option groups by inferred name match for the per-step
  // bodies. We're tolerant about naming - "material", "substrate",
  // "finishing", "finish" all map to their natural step.
  const matchGroup = (predicate: (name: string) => boolean) =>
    product.optionGroups.find((g) => predicate(g.name.toLowerCase()));

  const materialGroup = matchGroup((n) => n.includes("material") || n.includes("substrate"));
  const finishingGroup = matchGroup((n) => n.includes("finish") || n.includes("edge"));
  const sizeGroup = matchGroup((n) => n.includes("size") || n.includes("dimension"));

  return (
    <div style={{ paddingTop: 24 }}>
      {/* Breadcrumb. */}
      <div className="mb-4" style={{ fontSize: 12 }}>
        <Link
          href={`/shop/${slug}/order`}
          style={{ color: "#6b7280", textDecoration: "none" }}
          className="hover:text-[#0b0d10]"
        >
          ← Back to catalog
        </Link>
        <span style={{ color: "#9ca3af", margin: "0 8px" }}>·</span>
        {product.category && (
          <>
            <span style={{ color: "#6b7280" }}>{product.category}</span>
            <span style={{ color: "#9ca3af", margin: "0 8px" }}>·</span>
          </>
        )}
        <span style={{ color: "#0b0d10", fontWeight: 600 }}>{product.name}</span>
      </div>

      {/* Stepper header. */}
      <header
        className="relative overflow-hidden"
        style={{
          padding: "20px 24px",
          borderRadius: 18,
          background:
            `radial-gradient(720px circle at -8% -40%, color-mix(in oklab, ${brand} 14%, transparent), transparent 55%), ` +
            "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
          border: "1px solid #e5e7eb",
          boxShadow:
            "inset 0 1px 0 0 rgba(255,255,255,0.6), " +
            "0 1px 4px 0 rgba(0,0,0,0.04)",
        }}
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <span
              style={{
                color: brand,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Configure
            </span>
            <h1
              className="mt-1 font-semibold"
              style={{
                color: "#0b0d10",
                fontSize: 28,
                letterSpacing: "-0.022em",
                lineHeight: 1.15,
              }}
            >
              {product.name}
            </h1>
            {product.description && (
              <p
                className="mt-1.5 max-w-2xl"
                style={{
                  color: "#4b5563",
                  fontSize: 13.5,
                  lineHeight: 1.5,
                }}
              >
                {product.description}
              </p>
            )}
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: brand,
              background: `color-mix(in oklab, ${brand} 12%, white)`,
              border: `1px solid color-mix(in oklab, ${brand} 28%, transparent)`,
              padding: "4px 10px",
              borderRadius: 999,
              lineHeight: 1,
              fontFeatureSettings: "'tnum' 1",
              flexShrink: 0,
            }}
          >
            Step {currentIdx + 1} of {STEPS.length} · {progressPct}%
          </span>
        </div>

        {/* Progress bar. */}
        <div
          className="mt-4"
          style={{
            position: "relative",
            height: 6,
            borderRadius: 999,
            background: "#f3f4f6",
            border: "1px solid #e5e7eb",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${progressPct}%`,
              background: `linear-gradient(90deg, ${brand}, color-mix(in oklab, ${brand} 70%, white 30%))`,
              borderRadius: 999,
              transition: "width 240ms cubic-bezier(0.22, 1, 0.36, 1)",
              boxShadow: `0 0 10px color-mix(in oklab, ${brand} 50%, transparent)`,
            }}
          />
        </div>

        {/* Step chips. */}
        <ol className="mt-4 grid grid-cols-3 gap-2 md:grid-cols-6">
          {STEPS.map((s, i) => {
            const isDone = i < currentIdx;
            const isActive = i === currentIdx;
            const isUpcoming = i > currentIdx;
            return (
              <li key={s.id}>
                <Link
                  href={buildHref(s.id)}
                  className="flex items-center gap-2 transition-colors"
                  style={{
                    padding: "8px 10px",
                    borderRadius: 9,
                    background: isActive
                      ? `color-mix(in oklab, ${brand} 10%, white)`
                      : "transparent",
                    border: isActive
                      ? `1px solid color-mix(in oklab, ${brand} 28%, transparent)`
                      : "1px solid transparent",
                    textDecoration: "none",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      flexShrink: 0,
                      fontSize: 11,
                      fontWeight: 700,
                      fontFeatureSettings: "'tnum' 1",
                      background: isDone
                        ? `linear-gradient(135deg, color-mix(in oklab, #10b981 24%, white), color-mix(in oklab, #10b981 14%, white))`
                        : isActive
                          ? brand
                          : "#f3f4f6",
                      color: isDone
                        ? "#10b981"
                        : isActive
                          ? "white"
                          : "#9ca3af",
                      border: isDone
                        ? "1px solid color-mix(in oklab, #10b981 30%, transparent)"
                        : isActive
                          ? `1px solid color-mix(in oklab, ${brand} 80%, black 20%)`
                          : "1px solid #e5e7eb",
                    }}
                  >
                    {isDone ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="min-w-0">
                    <span
                      className="block"
                      style={{
                        color: isActive
                          ? "#0b0d10"
                          : isUpcoming
                            ? "#9ca3af"
                            : "#4b5563",
                        fontSize: 12.5,
                        fontWeight: isActive ? 700 : 500,
                        letterSpacing: "-0.005em",
                        lineHeight: 1.2,
                      }}
                    >
                      {s.label}
                    </span>
                    <span
                      className="block hidden md:block"
                      style={{
                        color: "#9ca3af",
                        fontSize: 10.5,
                        lineHeight: 1.2,
                        marginTop: 1,
                      }}
                    >
                      {s.sub}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </header>

      {/* Main layout — step body + right rail. */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Step body ─────────────────────────────────────────── */}
        <main
          style={{
            padding: "28px",
            borderRadius: 16,
            background: "white",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)",
          }}
        >
          {step === "size" && (
            <StepSection
              title="Pick a size"
              hint="Choose a preset or enter custom dimensions."
              brand={brand}
            >
              {sizeGroup ? (
                <OptionList
                  options={sizeGroup.options}
                  currency={tenant.currency}
                  brand={brand}
                />
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <LabeledInput label="Width" placeholder="24" suffix="in" />
                  <LabeledInput label="Height" placeholder="36" suffix="in" />
                </div>
              )}
              <p
                className="mt-4"
                style={{ color: "#6b7280", fontSize: 12, lineHeight: 1.5 }}
              >
                Not sure? Most yard signs are 18 × 24&quot; — most banners are 3 × 8&apos;.
              </p>
            </StepSection>
          )}

          {step === "material" && (
            <StepSection
              title="Choose your material"
              hint="The substrate is what your design is printed on."
              brand={brand}
            >
              {materialGroup ? (
                <OptionList
                  options={materialGroup.options}
                  currency={tenant.currency}
                  brand={brand}
                />
              ) : (
                <ComingSoon
                  copy="This product doesn&rsquo;t expose material options yet. Continue and we&rsquo;ll suggest the right substrate for your project."
                  brand={brand}
                />
              )}
            </StepSection>
          )}

          {step === "finishing" && (
            <StepSection
              title="Finishing touches"
              hint="Lamination, grommets, hemming — anything that affects how it&rsquo;s built."
              brand={brand}
            >
              {finishingGroup ? (
                <OptionList
                  options={finishingGroup.options}
                  currency={tenant.currency}
                  brand={brand}
                />
              ) : (
                <ComingSoon
                  copy="No finishing options on this product. Skip to quantity if you&rsquo;re happy with the default build."
                  brand={brand}
                />
              )}
            </StepSection>
          )}

          {step === "quantity" && (
            <StepSection
              title="How many do you need?"
              hint="Volume discounts kick in at higher quantities."
              brand={brand}
            >
              <div className="grid gap-3 sm:grid-cols-3">
                {[1, 5, 10, 25, 50, 100].map((n) => (
                  <button
                    key={n}
                    type="button"
                    style={{
                      padding: "16px 12px",
                      borderRadius: 12,
                      background: "white",
                      border: "1px solid #e5e7eb",
                      color: "#0b0d10",
                      fontSize: 18,
                      fontWeight: 700,
                      letterSpacing: "-0.015em",
                      fontFeatureSettings: "'tnum' 1",
                      cursor: "pointer",
                    }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <LabeledInput label="Or enter a custom quantity" placeholder="500" suffix={product.unit ?? "ea"} />
              </div>
            </StepSection>
          )}

          {step === "upload" && (
            <StepSection
              title="Upload your artwork"
              hint="PDF, JPG, PNG, AI, EPS, SVG up to 50MB. We&rsquo;ll prep a digital proof for you to approve."
              brand={brand}
            >
              <div
                style={{
                  padding: "44px 24px",
                  borderRadius: 14,
                  border: `2px dashed color-mix(in oklab, ${brand} 24%, #e5e7eb)`,
                  background: `color-mix(in oklab, ${brand} 4%, white)`,
                  textAlign: "center",
                }}
              >
                <div
                  aria-hidden
                  className="mx-auto flex items-center justify-center"
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 13,
                    background: `color-mix(in oklab, ${brand} 14%, white)`,
                    color: brand,
                    border: `1px solid color-mix(in oklab, ${brand} 30%, transparent)`,
                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                  </svg>
                </div>
                <h3
                  className="mt-3 font-semibold"
                  style={{
                    color: "#0b0d10",
                    fontSize: 16,
                    letterSpacing: "-0.012em",
                  }}
                >
                  Drop your file here, or click to browse
                </h3>
                <p
                  className="mt-1"
                  style={{
                    color: "#6b7280",
                    fontSize: 12.5,
                    lineHeight: 1.5,
                  }}
                >
                  We accept PDF, JPG, PNG, AI, EPS, SVG — up to 50MB.
                </p>
                <button
                  type="button"
                  className="mt-4"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    height: 38,
                    padding: "0 16px",
                    borderRadius: 10,
                    background: "white",
                    color: "#0b0d10",
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: "-0.005em",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  Choose file
                </button>
              </div>
              <p
                className="mt-4"
                style={{ color: "#6b7280", fontSize: 12, lineHeight: 1.5 }}
              >
                Don&apos;t have artwork? Skip this step — we&apos;ll reach out to set up design help.
              </p>
            </StepSection>
          )}

          {step === "review" && (
            <StepSection
              title="Review your order"
              hint="Confirm everything before we kick off your project."
              brand={brand}
            >
              <div className="space-y-3">
                {[
                  { label: "Product",   value: product.name },
                  { label: "Size",      value: "—" },
                  { label: "Material",  value: "—" },
                  { label: "Finishing", value: "—" },
                  { label: "Quantity",  value: "1" },
                  { label: "Artwork",   value: "Not uploaded" },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-4"
                    style={{
                      padding: "12px 16px",
                      borderRadius: 10,
                      background: "#f9fafb",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <span
                      style={{
                        color: "#6b7280",
                        fontSize: 12,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {row.label}
                    </span>
                    <span
                      style={{
                        color: row.value === "—" || row.value === "Not uploaded"
                          ? "#9ca3af"
                          : "#0b0d10",
                        fontSize: 13.5,
                        fontWeight: 500,
                        letterSpacing: "-0.005em",
                      }}
                    >
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
              <div
                className="mt-5 rounded-xl px-4 py-3"
                style={{
                  background: `color-mix(in oklab, ${brand} 8%, white)`,
                  border: `1px solid color-mix(in oklab, ${brand} 22%, transparent)`,
                  fontSize: 12.5,
                  color: "#4b5563",
                  lineHeight: 1.5,
                }}
              >
                <span
                  style={{
                    color: brand,
                    fontWeight: 700,
                    fontSize: 11,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  Heads up
                </span>
                <p className="mt-1">
                  Submitting creates a quote in {tenant.name}&apos;s queue. They&apos;ll send you a digital proof to approve before any work starts — no charge yet.
                </p>
              </div>
            </StepSection>
          )}
        </main>

        {/* ── Right rail — live price preview ───────────────────── */}
        <aside
          style={{
            padding: "20px",
            borderRadius: 16,
            background:
              `radial-gradient(540px circle at 100% 0%, color-mix(in oklab, ${brand} 12%, transparent), transparent 55%), ` +
              "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
            border: "1px solid #e5e7eb",
            boxShadow:
              "inset 0 1px 0 0 rgba(255,255,255,0.6), " +
              "0 1px 4px 0 rgba(0,0,0,0.04)",
            position: "sticky",
            top: 88,
            alignSelf: "start",
          }}
        >
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden
              style={{ width: 3, height: 3, borderRadius: 1, background: brand }}
            />
            <h2
              style={{
                color: "#0b0d10",
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Your order
            </h2>
          </div>
          <div
            className="mt-3"
            style={{
              color: "#6b7280",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
            }}
          >
            Estimated total
          </div>
          <div
            className="mt-1"
            style={{
              color: "#0b0d10",
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: "-0.022em",
              lineHeight: 1.1,
              fontFeatureSettings: "'tnum' 1",
            }}
          >
            {product.pricingModel === "CUSTOM_QUOTE"
              ? "Custom"
              : `From ${formatMoney(product.basePrice?.toString() ?? "0", tenant.currency)}`}
          </div>
          <div
            className="mt-1"
            style={{ color: "#6b7280", fontSize: 11.5, lineHeight: 1.4 }}
          >
            Updates as you configure. Final price is set after the shop reviews artwork and sizing.
          </div>

          {/* Line-item summary. */}
          <dl
            className="mt-5 space-y-2"
            style={{ fontSize: 12.5 }}
          >
            <div className="flex items-center justify-between">
              <dt style={{ color: "#6b7280" }}>Base price</dt>
              <dd
                style={{
                  color: "#0b0d10",
                  fontWeight: 600,
                  fontFeatureSettings: "'tnum' 1",
                }}
              >
                {formatMoney(product.basePrice?.toString() ?? "0", tenant.currency)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt style={{ color: "#6b7280" }}>Material</dt>
              <dd style={{ color: "#9ca3af" }}>—</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt style={{ color: "#6b7280" }}>Finishing</dt>
              <dd style={{ color: "#9ca3af" }}>—</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt style={{ color: "#6b7280" }}>Quantity</dt>
              <dd
                style={{
                  color: "#0b0d10",
                  fontWeight: 600,
                  fontFeatureSettings: "'tnum' 1",
                }}
              >
                ×1
              </dd>
            </div>
          </dl>

          <div
            style={{
              marginTop: 16,
              padding: "10px 12px",
              borderRadius: 10,
              background: `color-mix(in oklab, ${brand} 6%, white)`,
              border: `1px solid color-mix(in oklab, ${brand} 18%, transparent)`,
              fontSize: 11.5,
              color: "#4b5563",
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: brand, fontWeight: 700 }}>Tip:</strong>{" "}
            Higher quantities unlock volume pricing — at 100+ you save up to 18%.
          </div>
        </aside>
      </div>

      {/* Footer action bar. */}
      <div
        className="mt-6 mb-8 flex items-center justify-between gap-3"
        style={{
          padding: "14px 18px",
          borderRadius: 14,
          background:
            "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
          border: "1px solid #e5e7eb",
          boxShadow: "0 1px 4px 0 rgba(0,0,0,0.04)",
        }}
      >
        {prevStep ? (
          <Link
            href={buildHref(prevStep.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 40,
              padding: "0 16px",
              borderRadius: 10,
              background: "white",
              color: "#0b0d10",
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "-0.005em",
              border: "1px solid #e5e7eb",
              textDecoration: "none",
            }}
          >
            ← {prevStep.label}
          </Link>
        ) : (
          <Link
            href={`/shop/${slug}/order`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "#6b7280",
              fontSize: 13,
              fontWeight: 500,
              textDecoration: "none",
            }}
          >
            ← Back to catalog
          </Link>
        )}

        {nextStep ? (
          <Link
            href={buildHref(nextStep.id)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 44,
              padding: "0 22px",
              borderRadius: 11,
              background: `linear-gradient(180deg, color-mix(in oklab, ${brand} 96%, white 4%) 0%, ${brand} 100%)`,
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "-0.005em",
              border: `1px solid color-mix(in oklab, ${brand} 80%, black 20%)`,
              boxShadow:
                "0 1px 0 0 rgba(255,255,255,0.18) inset, " +
                `0 4px 14px -2px color-mix(in oklab, ${brand} 35%, transparent), ` +
                "0 1px 2px 0 rgba(0,0,0,0.12)",
              textDecoration: "none",
            }}
          >
            Continue to {nextStep.label}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        ) : (
          <Link
            href={`/shop/${slug}/cart`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              height: 44,
              padding: "0 22px",
              borderRadius: 11,
              background: `linear-gradient(180deg, color-mix(in oklab, ${brand} 96%, white 4%) 0%, ${brand} 100%)`,
              color: "white",
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "-0.005em",
              border: `1px solid color-mix(in oklab, ${brand} 80%, black 20%)`,
              boxShadow:
                "0 1px 0 0 rgba(255,255,255,0.18) inset, " +
                `0 4px 14px -2px color-mix(in oklab, ${brand} 40%, transparent), ` +
                "0 1px 2px 0 rgba(0,0,0,0.12)",
              textDecoration: "none",
            }}
          >
            Submit for quote
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </Link>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────

function StepSection({
  title,
  hint,
  brand,
  children,
}: {
  title: string;
  hint: string;
  brand: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          style={{ width: 3, height: 3, borderRadius: 1, background: brand }}
        />
        <h2
          style={{
            color: "#0b0d10",
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {title}
        </h2>
      </div>
      <p
        className="mt-2 max-w-xl"
        style={{ color: "#4b5563", fontSize: 13.5, lineHeight: 1.55 }}
      >
        {hint}
      </p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function OptionList({
  options,
  currency,
  brand,
}: {
  options: { id: string; label: string; priceAdjustment: { toString: () => string } | null }[];
  currency: string;
  brand: string;
}) {
  if (options.length === 0) return null;
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {options.map((o) => {
        const delta = o.priceAdjustment ? Number(o.priceAdjustment.toString()) : 0;
        return (
          <label
            key={o.id}
            className="flex cursor-pointer items-center gap-3 transition-colors hover:border-[color:var(--tenant-brand-hover,#cbd5e1)]"
            style={{
              padding: "14px 16px",
              borderRadius: 11,
              background: "white",
              border: "1px solid #e5e7eb",
            }}
          >
            <input
              type="radio"
              name="option"
              style={{
                width: 16,
                height: 16,
                accentColor: brand,
                flexShrink: 0,
              }}
            />
            <span className="flex-1">
              <span
                className="block"
                style={{
                  color: "#0b0d10",
                  fontSize: 13.5,
                  fontWeight: 600,
                  letterSpacing: "-0.005em",
                  lineHeight: 1.3,
                }}
              >
                {o.label}
              </span>
              <span
                className="block mt-0.5"
                style={{
                  color: delta > 0 ? brand : delta < 0 ? "#10b981" : "#9ca3af",
                  fontSize: 11.5,
                  fontWeight: 600,
                  fontFeatureSettings: "'tnum' 1",
                }}
              >
                {delta === 0
                  ? "Included"
                  : delta > 0
                    ? `+${formatMoney(delta, currency)}`
                    : `−${formatMoney(Math.abs(delta), currency)}`}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}

function LabeledInput({
  label,
  placeholder,
  suffix,
}: {
  label: string;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <label className="block">
      <span
        style={{
          display: "block",
          marginBottom: 6,
          color: "#0b0d10",
          fontSize: 12.5,
          fontWeight: 600,
          letterSpacing: "-0.005em",
        }}
      >
        {label}
      </span>
      <div
        className="flex items-center"
        style={{
          height: 44,
          padding: "0 14px",
          borderRadius: 10,
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
        }}
      >
        <input
          type="text"
          placeholder={placeholder}
          style={{
            flex: 1,
            minWidth: 0,
            background: "transparent",
            border: 0,
            outline: "none",
            color: "#0b0d10",
            fontSize: 14,
            letterSpacing: "-0.005em",
          }}
        />
        {suffix && (
          <span
            style={{
              color: "#9ca3af",
              fontSize: 12,
              fontWeight: 600,
              marginLeft: 8,
              flexShrink: 0,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function ComingSoon({ copy, brand }: { copy: string; brand: string }) {
  return (
    <div
      style={{
        padding: "20px 22px",
        borderRadius: 12,
        background: `color-mix(in oklab, ${brand} 6%, white)`,
        border: `1px solid color-mix(in oklab, ${brand} 22%, transparent)`,
        color: "#4b5563",
        fontSize: 13,
        lineHeight: 1.55,
      }}
    >
      <span
        style={{
          color: brand,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginRight: 8,
        }}
      >
        Default
      </span>
      <span dangerouslySetInnerHTML={{ __html: copy }} />
    </div>
  );
}
