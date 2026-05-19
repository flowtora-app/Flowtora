import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { submitStorefrontCheckout } from "@/app/actions/customer-checkout";
import { CustomerFileStaging } from "@/components/storefront/CustomerFileStaging";

// Customer checkout (S-5).
//
// 4-step checkout flow per spec. URL-driven step state so the steps
// are server rendered; data is collected on the final "Pay" step in
// one consolidated form so the submission has everything it needs
// without cross-step persistence.
//
// Steps:
//   1. Contact   - name, email, phone (+ sign-in option for returning)
//   2. Delivery  - shipping address or pickup details
//   3. Review    - line items + notes to shop
//   4. Pay       - Pay now (Stripe) or Request quote (creates pending)

export const dynamic = "force-dynamic";

type Step = "contact" | "delivery" | "review" | "pay";

const STEPS: { id: Step; label: string; sub: string }[] = [
  { id: "contact",  label: "Contact",  sub: "Who you are" },
  { id: "delivery", label: "Delivery", sub: "Where it goes" },
  { id: "review",   label: "Review",   sub: "Confirm details" },
  { id: "pay",      label: "Pay",      sub: "Pay now or request quote" },
];

function parseStep(raw: string | undefined): Step {
  return STEPS.some((s) => s.id === raw) ? (raw as Step) : "contact";
}

export default async function StorefrontCheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ step?: string; error?: string; canceled?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const step = parseStep(sp.step);

  const tenant = await db.tenant.findUnique({
    where: { slug },
    select: { name: true, brandPrimaryColor: true },
  });
  if (!tenant) notFound();

  const brand = tenant.brandPrimaryColor ?? "#7C3AED";
  const currentIdx = STEPS.findIndex((s) => s.id === step);
  const prevStep = currentIdx > 0 ? STEPS[currentIdx - 1] : null;
  const nextStep = currentIdx < STEPS.length - 1 ? STEPS[currentIdx + 1] : null;
  const progressPct = Math.round(((currentIdx + 1) / STEPS.length) * 100);

  const buildHref = (id: Step) => `/shop/${slug}/checkout?step=${id}`;

  const inputStyle = {
    width: "100%",
    height: 44,
    padding: "0 14px",
    borderRadius: 10,
    background: "#f9fafb",
    border: "1px solid #e5e7eb",
    color: "#0b0d10",
    fontSize: 14,
    outline: "none",
    letterSpacing: "-0.005em",
  } as const;

  const fieldLabel = (label: string) => ({
    display: "block",
    marginBottom: 6,
    color: "#0b0d10",
    fontSize: 12.5,
    fontWeight: 600 as const,
    letterSpacing: "-0.005em",
  });

  return (
    <div style={{ paddingTop: 24 }}>
      <div style={{ fontSize: 12, marginBottom: 16 }}>
        <Link
          href={`/shop/${slug}/cart`}
          style={{ color: "#6b7280", textDecoration: "none" }}
        >
          ← Back to cart
        </Link>
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
              Checkout
            </span>
            <h1
              className="mt-1 font-semibold"
              style={{
                color: "#0b0d10",
                fontSize: 32,
                letterSpacing: "-0.022em",
                lineHeight: 1.15,
              }}
            >
              Almost done
            </h1>
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

        <ol className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
          {STEPS.map((s, i) => {
            const isDone = i < currentIdx;
            const isActive = i === currentIdx;
            return (
              <li key={s.id}>
                <Link
                  href={buildHref(s.id)}
                  className="flex items-center gap-2"
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
                      background: isDone
                        ? "linear-gradient(135deg, color-mix(in oklab, #10b981 24%, white), color-mix(in oklab, #10b981 14%, white))"
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
                        color: isActive ? "#0b0d10" : "#4b5563",
                        fontSize: 12.5,
                        fontWeight: isActive ? 700 : 500,
                        letterSpacing: "-0.005em",
                        lineHeight: 1.2,
                      }}
                    >
                      {s.label}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Step body. */}
        <main
          style={{
            padding: "28px",
            borderRadius: 16,
            background: "white",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 2px 0 rgba(0,0,0,0.04)",
          }}
        >
          {step === "contact" && (
            <section>
              <SectionTitle brand={brand} title="Your contact info" />
              <p
                className="mt-2 max-w-lg"
                style={{ color: "#4b5563", fontSize: 13.5, lineHeight: 1.55 }}
              >
                We&apos;ll use this to send your proof and order updates. Already have an account?{" "}
                <Link
                  href={`/shop/${slug}/account/signin`}
                  style={{ color: brand, fontWeight: 600, textDecoration: "none" }}
                >
                  Sign in
                </Link>{" "}
                to autofill.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span style={fieldLabel("First name")}>First name</span>
                  <input type="text" placeholder="Sarah" style={inputStyle} />
                </label>
                <label className="block">
                  <span style={fieldLabel("Last name")}>Last name</span>
                  <input type="text" placeholder="Johnson" style={inputStyle} />
                </label>
                <label className="block">
                  <span style={fieldLabel("Email")}>Email</span>
                  <input type="email" placeholder="you@example.com" style={inputStyle} required />
                </label>
                <label className="block">
                  <span style={fieldLabel("Phone")}>Phone</span>
                  <input type="tel" placeholder="(555) 123-4567" style={inputStyle} />
                </label>
                <label className="block sm:col-span-2">
                  <span style={fieldLabel("Company (optional)")}>Company (optional)</span>
                  <input type="text" placeholder="Acme Co." style={inputStyle} />
                </label>
              </div>
            </section>
          )}

          {step === "delivery" && (
            <section>
              <SectionTitle brand={brand} title="Delivery details" />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <DeliveryOption
                  brand={brand}
                  active
                  title="Ship to address"
                  hint="Direct to your door — local addresses ship free over $250."
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <rect x="3" y="7" width="14" height="10" rx="1" />
                      <path d="M17 10h3l1 3v4h-4M5 17h0M16 17h0" />
                    </svg>
                  }
                />
                <DeliveryOption
                  brand={brand}
                  title="Pickup in shop"
                  hint="Save shipping — pick up at our location. We&rsquo;ll text you when it&rsquo;s ready."
                  icon={
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M3 21V8l9-5 9 5v13M9 22V12h6v10" />
                    </svg>
                  }
                />
              </div>
              <div className="mt-6">
                <h3
                  style={{
                    color: "#0b0d10",
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  Shipping address
                </h3>
                <div className="mt-3 grid gap-4">
                  <label className="block">
                    <span style={fieldLabel("Street address")}>Street address</span>
                    <input type="text" placeholder="123 Main St" style={inputStyle} />
                  </label>
                  <label className="block">
                    <span style={fieldLabel("Apartment, suite, etc. (optional)")}>Apartment, suite, etc. (optional)</span>
                    <input type="text" style={inputStyle} />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <label className="block">
                      <span style={fieldLabel("City")}>City</span>
                      <input type="text" style={inputStyle} />
                    </label>
                    <label className="block">
                      <span style={fieldLabel("State / Region")}>State / Region</span>
                      <input type="text" style={inputStyle} />
                    </label>
                    <label className="block">
                      <span style={fieldLabel("ZIP / Postal")}>ZIP / Postal</span>
                      <input type="text" style={inputStyle} />
                    </label>
                  </div>
                </div>
              </div>
            </section>
          )}

          {step === "review" && (
            <section>
              <SectionTitle brand={brand} title="Review your order" />
              <p
                className="mt-2 max-w-lg"
                style={{ color: "#4b5563", fontSize: 13.5, lineHeight: 1.55 }}
              >
                Take a last look before we send it through to {tenant.name}.
              </p>
              <div
                className="mt-5"
                style={{
                  padding: "20px",
                  borderRadius: 12,
                  background: "#f9fafb",
                  border: "1px solid #e5e7eb",
                }}
              >
                <p
                  className="text-center"
                  style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.55 }}
                >
                  Line items show here once cart persistence ships. For now, this is a frame for the order summary.
                </p>
              </div>
              <label className="block mt-5">
                <span style={fieldLabel("Notes to the shop (optional)")}>Notes to the shop (optional)</span>
                <textarea
                  rows={4}
                  placeholder="Any special instructions, deadline pressure, install location, etc."
                  style={{
                    ...inputStyle,
                    height: "auto",
                    paddingTop: 12,
                    paddingBottom: 12,
                    resize: "vertical",
                    lineHeight: 1.5,
                  }}
                />
              </label>
            </section>
          )}

          {step === "pay" && (
            <section>
              <SectionTitle brand={brand} title="Your details + how to proceed" />
              <p
                className="mt-2 max-w-lg"
                style={{ color: "#4b5563", fontSize: 13.5, lineHeight: 1.55 }}
              >
                Tell us who you are and pick how you&apos;d like to move forward. We&apos;ll send the quote to your email and{" "}
                <Link
                  href={`/shop/${slug}/account/signin`}
                  style={{ color: brand, fontWeight: 500, textDecoration: "none" }}
                >
                  create an account
                </Link>{" "}
                so you can track it.
              </p>
              {sp.error && (
                <div
                  className="mt-4 rounded-lg px-3.5 py-2.5"
                  style={{
                    background: "color-mix(in oklab, #ef4444 12%, white)",
                    color: "#b91c1c",
                    border: "1px solid color-mix(in oklab, #ef4444 32%, transparent)",
                    fontSize: 12.5,
                    fontWeight: 500,
                    lineHeight: 1.4,
                  }}
                >
                  {decodeURIComponent(sp.error)}
                </div>
              )}

              <form
                action={submitStorefrontCheckout.bind(null, slug)}
                className="mt-6 space-y-5"
                id="checkout-form"
              >
                {/* Contact section. */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span style={fieldLabel("First name")}>First name</span>
                    <input type="text" name="firstName" required placeholder="Sarah" style={inputStyle} />
                  </label>
                  <label>
                    <span style={fieldLabel("Last name")}>Last name</span>
                    <input type="text" name="lastName" placeholder="Johnson" style={inputStyle} />
                  </label>
                  <label>
                    <span style={fieldLabel("Email")}>Email</span>
                    <input type="email" name="email" required placeholder="you@example.com" style={inputStyle} />
                  </label>
                  <label>
                    <span style={fieldLabel("Phone")}>Phone</span>
                    <input type="tel" name="phone" placeholder="(555) 123-4567" style={inputStyle} />
                  </label>
                  <label className="sm:col-span-2">
                    <span style={fieldLabel("Company (optional)")}>Company (optional)</span>
                    <input type="text" name="company" placeholder="Acme Co." style={inputStyle} />
                  </label>
                  <label className="sm:col-span-2">
                    <span style={fieldLabel("Project details")}>Project details</span>
                    <textarea
                      name="notes"
                      rows={4}
                      placeholder="Size, materials, deadline, where it&rsquo;s going — anything that helps us quote it."
                      style={{
                        ...inputStyle,
                        height: "auto",
                        paddingTop: 12,
                        paddingBottom: 12,
                        resize: "vertical",
                        lineHeight: 1.5,
                      }}
                    />
                  </label>

                  {/* Optional file attachments. Drag-and-drop multi-file
                      uploader that submits its FileList with the rest of
                      the form. Files land on the new quote as
                      CUSTOMER_UPLOAD kind so shop staff can see them on
                      the quote detail page right away. */}
                  <div className="sm:col-span-2">
                    <CustomerFileStaging brand={brand} />
                  </div>
                </div>

                {/* Payment radios. */}
                <div className="grid gap-3 sm:grid-cols-2 pt-1">
                  <label
                    className="flex cursor-pointer items-start gap-3"
                    style={{
                      padding: "16px 18px",
                      borderRadius: 12,
                      background: `color-mix(in oklab, ${brand} 8%, white)`,
                      border: `1px solid color-mix(in oklab, ${brand} 32%, transparent)`,
                    }}
                  >
                    <input
                      type="radio"
                      name="payment"
                      value="now"
                      defaultChecked
                      style={{ width: 16, height: 16, accentColor: brand, marginTop: 3, flexShrink: 0 }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span
                          aria-hidden
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: `color-mix(in oklab, ${brand} 12%, white)`,
                            color: brand,
                            border: `1px solid color-mix(in oklab, ${brand} 22%, transparent)`,
                          }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="6" width="18" height="13" rx="2" />
                            <path d="M3 10h18" />
                          </svg>
                        </span>
                        <span style={{ color: "#0b0d10", fontSize: 14, fontWeight: 600, letterSpacing: "-0.005em" }}>
                          Reserve with $50 deposit
                        </span>
                        <span
                          style={{
                            fontSize: 9.5,
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: brand,
                            background: `color-mix(in oklab, ${brand} 14%, white)`,
                            border: `1px solid color-mix(in oklab, ${brand} 30%, transparent)`,
                            padding: "2px 7px",
                            borderRadius: 999,
                            lineHeight: 1,
                          }}
                        >
                          Recommended
                        </span>
                      </span>
                      <span
                        className="block mt-2"
                        style={{ color: "#6b7280", fontSize: 12.5, lineHeight: 1.5 }}
                      >
                        Secure card payment via Stripe. Holds your slot in the queue — applied to your final invoice.
                      </span>
                    </span>
                  </label>
                  <label
                    className="flex cursor-pointer items-start gap-3"
                    style={{
                      padding: "16px 18px",
                      borderRadius: 12,
                      background: "white",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <input
                      type="radio"
                      name="payment"
                      value="quote"
                      style={{ width: 16, height: 16, accentColor: brand, marginTop: 3, flexShrink: 0 }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            background: `color-mix(in oklab, ${brand} 12%, white)`,
                            color: brand,
                            border: `1px solid color-mix(in oklab, ${brand} 22%, transparent)`,
                          }}
                        >
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M6 4h9l5 5v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
                            <path d="M15 4v5h5M8 13h8M8 17h5" />
                          </svg>
                        </span>
                        <span style={{ color: "#0b0d10", fontSize: 14, fontWeight: 600, letterSpacing: "-0.005em" }}>
                          Request quote
                        </span>
                      </span>
                      <span
                        className="block mt-2"
                        style={{ color: "#6b7280", fontSize: 12.5, lineHeight: 1.5 }}
                      >
                        We&rsquo;ll send a quote within one business day. No charge until you accept.
                      </span>
                    </span>
                  </label>
                </div>
              </form>
            </section>
          )}
        </main>

        {/* Order summary sidebar. */}
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
            <span aria-hidden style={{ width: 3, height: 3, borderRadius: 1, background: brand }} />
            <h2
              style={{
                color: "#0b0d10",
                fontSize: 10.5,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Order summary
            </h2>
          </div>
          <dl className="mt-4 space-y-2" style={{ fontSize: 12.5 }}>
            <div className="flex items-center justify-between">
              <dt style={{ color: "#6b7280" }}>Subtotal</dt>
              <dd style={{ color: "#9ca3af" }}>—</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt style={{ color: "#6b7280" }}>Shipping</dt>
              <dd style={{ color: "#9ca3af" }}>—</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt style={{ color: "#6b7280" }}>Tax</dt>
              <dd style={{ color: "#9ca3af" }}>Calculated at next step</dd>
            </div>
          </dl>
          <div
            className="mt-4 flex items-center justify-between"
            style={{
              paddingTop: 14,
              borderTop: "1px solid #e5e7eb",
            }}
          >
            <span
              style={{
                color: "#0b0d10",
                fontSize: 13,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
              }}
            >
              Total
            </span>
            <span
              style={{
                color: "#0b0d10",
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: "-0.018em",
                fontFeatureSettings: "'tnum' 1",
              }}
            >
              —
            </span>
          </div>
        </aside>
      </div>

      {/* Footer action bar. */}
      <div
        className="mt-6 mb-8 flex items-center justify-between gap-3"
        style={{
          padding: "14px 18px",
          borderRadius: 14,
          background: "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
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
              border: "1px solid #e5e7eb",
              textDecoration: "none",
            }}
          >
            ← {prevStep.label}
          </Link>
        ) : (
          <Link
            href={`/shop/${slug}/cart`}
            style={{ color: "#6b7280", fontSize: 13, fontWeight: 500, textDecoration: "none" }}
          >
            ← Back to cart
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
          <button
            type="submit"
            form="checkout-form"
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
              border: `1px solid color-mix(in oklab, ${brand} 80%, black 20%)`,
              boxShadow:
                "0 1px 0 0 rgba(255,255,255,0.18) inset, " +
                `0 4px 14px -2px color-mix(in oklab, ${brand} 40%, transparent), ` +
                "0 1px 2px 0 rgba(0,0,0,0.12)",
              cursor: "pointer",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Submit order
          </button>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ brand, title }: { brand: string; title: string }) {
  return (
    <div className="flex items-center gap-1.5">
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
        {title}
      </h2>
    </div>
  );
}

function DeliveryOption({
  brand, active, title, hint, icon,
}: {
  brand: string;
  active?: boolean;
  title: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <label
      className="flex cursor-pointer items-start gap-3"
      style={{
        padding: "16px 18px",
        borderRadius: 12,
        background: active ? `color-mix(in oklab, ${brand} 8%, white)` : "white",
        border: active
          ? `1px solid color-mix(in oklab, ${brand} 32%, transparent)`
          : "1px solid #e5e7eb",
      }}
    >
      <input
        type="radio"
        name="delivery"
        defaultChecked={active}
        style={{ width: 16, height: 16, accentColor: brand, marginTop: 3, flexShrink: 0 }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 8,
              background: `color-mix(in oklab, ${brand} 12%, white)`,
              color: brand,
              border: `1px solid color-mix(in oklab, ${brand} 22%, transparent)`,
            }}
          >
            {icon}
          </span>
          <span
            style={{
              color: "#0b0d10",
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "-0.005em",
            }}
          >
            {title}
          </span>
        </span>
        <span
          className="block mt-2"
          style={{ color: "#6b7280", fontSize: 12.5, lineHeight: 1.5 }}
        >
          {hint}
        </span>
      </span>
    </label>
  );
}

function PaymentOption({
  brand, active, title, hint, badge, icon,
}: {
  brand: string;
  active?: boolean;
  title: string;
  hint: string;
  badge?: string;
  icon: React.ReactNode;
}) {
  return (
    <label
      className="flex cursor-pointer items-start gap-3"
      style={{
        padding: "16px 18px",
        borderRadius: 12,
        background: active ? `color-mix(in oklab, ${brand} 8%, white)` : "white",
        border: active
          ? `1px solid color-mix(in oklab, ${brand} 32%, transparent)`
          : "1px solid #e5e7eb",
      }}
    >
      <input
        type="radio"
        name="payment"
        defaultChecked={active}
        style={{ width: 16, height: 16, accentColor: brand, marginTop: 3, flexShrink: 0 }}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 flex-wrap">
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 32,
              height: 32,
              borderRadius: 8,
              background: `color-mix(in oklab, ${brand} 12%, white)`,
              color: brand,
              border: `1px solid color-mix(in oklab, ${brand} 22%, transparent)`,
            }}
          >
            {icon}
          </span>
          <span
            style={{
              color: "#0b0d10",
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "-0.005em",
            }}
          >
            {title}
          </span>
          {badge && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: brand,
                background: `color-mix(in oklab, ${brand} 14%, white)`,
                border: `1px solid color-mix(in oklab, ${brand} 30%, transparent)`,
                padding: "2px 7px",
                borderRadius: 999,
                lineHeight: 1,
              }}
            >
              {badge}
            </span>
          )}
        </span>
        <span
          className="block mt-2"
          style={{ color: "#6b7280", fontSize: 12.5, lineHeight: 1.5 }}
        >
          {hint}
        </span>
      </span>
    </label>
  );
}
