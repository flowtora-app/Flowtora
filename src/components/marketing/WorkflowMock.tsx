import * as React from "react";
import { FeatureMock } from "./FeatureMock";

// WorkflowMock — tiny labeled mocks for industry-page workflow steps.
// FeatureMock covers the big three screens (quote, production,
// invoice); WorkflowMock fills in the rest: site survey, proofing,
// install scheduling, field sign-off, press run, bindery, shipping.
//
// Unlike FeatureMock these are intentionally smaller and more
// diagrammatic — the page stacks six of them so anything too rich
// visually drowns the walkthrough copy. We use a shared chrome so
// the alternating L/R layout stays cohesive, then draw the body
// with just enough detail to evoke the screen.
//
// All variants share:
//   • Window chrome (same macOS-style dots as ProductMock)
//   • A record header with a short title + a status badge
//   • A body that's a single visual gesture (a list, a form, a
//     calendar grid, a photo strip)

export type WorkflowMockKind =
  // Sign-shop specific
  | "survey"
  | "proofing"
  | "install-schedule"
  | "field-signoff"
  // Print-shop specific
  | "catalog"
  | "press-run"
  | "bindery"
  | "shipping"
  // Shared (re-exported FeatureMock kinds)
  | "quote"
  | "production"
  | "invoice";

// We re-use FeatureMock for the three big screens so the industry
// pages don't accidentally drift from the home/features visuals.
export function WorkflowMock({
  kind,
  className,
}: {
  kind: WorkflowMockKind;
  className?: string;
}) {
  if (kind === "quote" || kind === "production" || kind === "invoice") {
    return <FeatureMock kind={kind} className={className} />;
  }

  return (
    <div
      className={className}
      style={{
        background: "var(--surface-1)",
        borderRadius: "var(--radius-2xl)",
        boxShadow:
          "0 0 0 1px var(--border-subtle), var(--shadow-lg), inset 0 1px 0 0 color-mix(in oklab, var(--text-default) 8%, transparent)",
        overflow: "hidden",
      }}
    >
      {/* Chrome */}
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{
          borderBottom: "1px solid var(--border-subtle)",
          background:
            "color-mix(in oklab, var(--surface-1) 60%, var(--surface-0))",
        }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--danger)", opacity: 0.55 }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--warning)", opacity: 0.55 }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--success)", opacity: 0.55 }} />
      </div>

      {/* Body routes by kind */}
      {kind === "survey" && <SurveyBody />}
      {kind === "proofing" && <ProofingBody />}
      {kind === "install-schedule" && <InstallScheduleBody />}
      {kind === "field-signoff" && <FieldSignoffBody />}
      {kind === "catalog" && <CatalogBody />}
      {kind === "press-run" && <PressRunBody />}
      {kind === "bindery" && <BinderyBody />}
      {kind === "shipping" && <ShippingBody />}
    </div>
  );
}

// ==== Shared small atoms ====

function RecordHeader({
  label,
  title,
  badge,
}: {
  label: string;
  title: string;
  badge?: { text: string; tone: "success" | "info" | "warning" | "accent" };
}) {
  const tone =
    badge?.tone === "success"
      ? { bg: "var(--success-surface)", fg: "var(--success-fg)" }
      : badge?.tone === "info"
        ? { bg: "var(--info-surface)", fg: "var(--info-fg)" }
        : badge?.tone === "warning"
          ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)" }
          : { bg: "var(--accent-surface)", fg: "var(--accent-primary)" };
  return (
    <div
      className="flex items-center justify-between gap-3 px-5 py-3.5"
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
          {label}
        </div>
        <div className="mt-0.5 truncate text-sm font-semibold" style={{ color: "var(--text-default)" }}>
          {title}
        </div>
      </div>
      {badge && (
        <span
          className="flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: tone.bg, color: tone.fg }}
        >
          {badge.text}
        </span>
      )}
    </div>
  );
}

// ==== Sign-shop bodies ====

function SurveyBody() {
  return (
    <>
      <RecordHeader
        label="Site survey"
        title="Harbor Eats · 1422 SW Broadway"
        badge={{ text: "3 photos", tone: "info" }}
      />
      <div className="grid grid-cols-3 gap-2 p-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex h-20 items-center justify-center rounded-md"
            style={{
              background: `linear-gradient(135deg, var(--accent-surface) 0%, var(--surface-2) 100%)`,
              border: "1px solid var(--border-subtle)",
            }}
          >
            <span className="text-lg opacity-40" aria-hidden>📷</span>
          </div>
        ))}
      </div>
      <div className="px-4 pb-4">
        <MetaRow label="Fascia" value="28 ft" />
        <MetaRow label="Clearance" value="12 ft 4 in" />
        <MetaRow label="Electrical" value="J-box present" />
      </div>
    </>
  );
}

function ProofingBody() {
  return (
    <>
      <RecordHeader
        label="Proof round 2"
        title="Harbor Eats · Front-lit channel letters"
        badge={{ text: "Awaiting sign-off", tone: "warning" }}
      />
      <div className="p-4">
        <div
          className="relative h-24 rounded-md"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in oklab, var(--accent-surface) 70%, var(--surface-2)) 0%, var(--surface-2) 100%)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <span
            className="absolute left-3 top-3 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            1
          </span>
          <span
            className="absolute bottom-3 right-3 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
            style={{ background: "var(--warning)", color: "var(--accent-fg)" }}
          >
            2
          </span>
        </div>
        <ul className="mt-3 space-y-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
          <li>1 · Font weight one notch heavier?</li>
          <li>2 · Match PMS 202 instead of 186</li>
        </ul>
      </div>
    </>
  );
}

function InstallScheduleBody() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  return (
    <>
      <RecordHeader
        label="Install calendar"
        title="Crew A · week of Apr 15"
        badge={{ text: "3 stops", tone: "accent" }}
      />
      <div className="p-4">
        <div className="grid grid-cols-5 gap-1.5">
          {days.map((d, i) => (
            <div
              key={d}
              className="rounded-md p-2"
              style={{
                background: i === 0 || i === 2 || i === 4 ? "var(--accent-surface)" : "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                {d}
              </div>
              {(i === 0 || i === 2 || i === 4) && (
                <div className="mt-1 text-[10px]" style={{ color: "var(--accent-primary)" }}>
                  • Stop
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1.5 text-xs">
          <StopRow day="Mon" name="Harbor Eats · install" />
          <StopRow day="Wed" name="Sunrise Bakery · punch list" />
          <StopRow day="Fri" name="Reef Dental · final" />
        </div>
      </div>
    </>
  );
}

function StopRow({ day, name }: { day: string; name: string }) {
  return (
    <div
      className="flex items-center gap-2 rounded-md px-2 py-1.5"
      style={{ background: "var(--surface-2)" }}
    >
      <span
        className="inline-flex h-5 w-9 items-center justify-center rounded text-[10px] font-semibold"
        style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
      >
        {day}
      </span>
      <span className="text-xs" style={{ color: "var(--text-default)" }}>
        {name}
      </span>
    </div>
  );
}

function FieldSignoffBody() {
  return (
    <>
      <RecordHeader
        label="Field sign-off"
        title="Harbor Eats · Install complete"
        badge={{ text: "Signed", tone: "success" }}
      />
      <div className="p-4">
        <div className="grid grid-cols-2 gap-2">
          <div
            className="flex h-20 items-center justify-center rounded-md"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>Before</span>
          </div>
          <div
            className="flex h-20 items-center justify-center rounded-md"
            style={{
              background:
                "linear-gradient(135deg, var(--accent-surface) 0%, var(--surface-2) 100%)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <span className="text-[11px]" style={{ color: "var(--accent-primary)" }}>After</span>
          </div>
        </div>
        <div
          className="mt-3 rounded-md p-3"
          style={{ background: "var(--success-surface)", color: "var(--success-fg)" }}
        >
          <div className="text-xs font-semibold">Customer signature captured</div>
          <div className="mt-0.5 text-[11px]">Apr 18 · 2:47pm · GPS ±6ft</div>
        </div>
      </div>
    </>
  );
}

// ==== Print-shop bodies ====

function CatalogBody() {
  return (
    <>
      <RecordHeader
        label="Product catalog"
        title="House SKUs · 124 products"
        badge={{ text: "SKU-0042", tone: "info" }}
      />
      <div className="grid grid-cols-3 gap-2 p-4">
        {[
          { label: "Business card", tone: "accent" },
          { label: "Flyer", tone: "info" },
          { label: "Postcard", tone: "warning" },
          { label: "Banner", tone: "success" },
          { label: "Brochure", tone: "accent" },
          { label: "Sticker", tone: "info" },
        ].map((item, i) => (
          <div
            key={i}
            className="rounded-md p-2"
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <div
              className="h-6 rounded"
              style={{
                background:
                  item.tone === "accent"
                    ? "var(--accent-surface)"
                    : item.tone === "info"
                      ? "var(--info-surface)"
                      : item.tone === "warning"
                        ? "var(--warning-surface)"
                        : "var(--success-surface)",
              }}
            />
            <div className="mt-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
              {item.label}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function PressRunBody() {
  return (
    <>
      <RecordHeader
        label="Press run"
        title="Flatbed UV · job PR-2041"
        badge={{ text: "Running", tone: "warning" }}
      />
      <div className="p-4">
        <MetaRow label="Run size" value="500 / 2,500" />
        <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
          <div
            className="h-full"
            style={{
              width: "20%",
              background: "var(--warning)",
            }}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <MiniStat label="Stock" value="Coated 100#" />
          <MiniStat label="ETA" value="2h 40m" />
          <MiniStat label="Operator" value="M. Chen" />
          <MiniStat label="Waste" value="1.8%" />
        </div>
      </div>
    </>
  );
}

function BinderyBody() {
  return (
    <>
      <RecordHeader
        label="Bindery queue"
        title="Finishing · 4 jobs today"
        badge={{ text: "2 ready", tone: "info" }}
      />
      <div className="space-y-1.5 p-4">
        <BinderyRow name="Harbor Eats · trim + score" state="Up next" tone="accent" />
        <BinderyRow name="Sunrise Bakery · saddle stitch" state="Running" tone="warning" />
        <BinderyRow name="Maker Co · laminate" state="Queued" tone="info" />
        <BinderyRow name="Arbor · perfect bind" state="Done" tone="success" />
      </div>
    </>
  );
}

function BinderyRow({
  name,
  state,
  tone,
}: {
  name: string;
  state: string;
  tone: "accent" | "info" | "warning" | "success";
}) {
  const toneColor =
    tone === "accent"
      ? { bg: "var(--accent-surface)", fg: "var(--accent-primary)" }
      : tone === "info"
        ? { bg: "var(--info-surface)", fg: "var(--info-fg)" }
        : tone === "warning"
          ? { bg: "var(--warning-surface)", fg: "var(--warning-fg)" }
          : { bg: "var(--success-surface)", fg: "var(--success-fg)" };
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5"
      style={{ background: "var(--surface-2)" }}
    >
      <span className="text-xs" style={{ color: "var(--text-default)" }}>
        {name}
      </span>
      <span
        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
        style={{ background: toneColor.bg, color: toneColor.fg }}
      >
        {state}
      </span>
    </div>
  );
}

function ShippingBody() {
  return (
    <>
      <RecordHeader
        label="Shipment"
        title="Harbor Eats · 3 boxes"
        badge={{ text: "In transit", tone: "info" }}
      />
      <div className="p-4">
        <div className="grid grid-cols-3 gap-2">
          {["Pick", "Pack", "Ship"].map((s, i) => (
            <div
              key={s}
              className="rounded-md px-2 py-2 text-center"
              style={{
                background: i < 2 ? "var(--accent-surface)" : "var(--surface-2)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <div
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: i < 2 ? "var(--accent-primary)" : "var(--text-muted)" }}
              >
                {s}
              </div>
              <div
                className="mt-0.5 text-[11px]"
                style={{ color: i < 2 ? "var(--success-fg)" : "var(--text-faint)" }}
              >
                {i < 2 ? "✓" : "—"}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
          <div>Carrier · UPS Ground</div>
          <div>Tracking · 1Z999AA1012345</div>
          <div>ETA · Apr 22</div>
        </div>
      </div>
    </>
  );
}

// ==== Shared meta atoms ====

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color: "var(--text-default)" }}>{value}</span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md px-2 py-1.5" style={{ background: "var(--surface-2)" }}>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
        {label}
      </div>
      <div className="mt-0.5 text-xs" style={{ color: "var(--text-default)" }}>
        {value}
      </div>
    </div>
  );
}
