import Link from "next/link";
import { formatMoney } from "@/lib/billing-currency";
import {
  archivePromotion,
  createPromotion,
  endPromotion,
} from "@/app/actions/platform-promotions";
import type { CouponDiscountType, PromotionStatus } from "@prisma/client";

// Page 20 — Promotions tab.
//
// Server-rendered. The composer is a simple form posting to the
// createPromotion action; per-row "End" / "Archive" buttons post to
// the matching actions. No client-only JS needed for the basic flow.

export interface PromotionListItem {
  id: string;
  name: string;
  description: string | null;
  status: PromotionStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  landingUrl: string | null;
  audience: string | null;
  goal: string | null;
  emailTemplateKind: string | null;
  coupon: {
    id: string;
    code: string;
    discountType: CouponDiscountType;
    amount: number;
    currency: string | null;
  };
  redemptionCount: number;
  totalDiscounted: number;
}

const STATUS_PALETTE: Record<PromotionStatus, { bg: string; fg: string; label: string }> = {
  DRAFT:     { bg: "var(--surface-2)",      fg: "var(--text-muted)",     label: "DRAFT" },
  SCHEDULED: { bg: "var(--accent-surface)", fg: "var(--accent-primary)", label: "SCHEDULED" },
  ACTIVE:    { bg: "var(--success-surface)",fg: "var(--success-fg)",     label: "ACTIVE" },
  ENDED:     { bg: "var(--surface-2)",      fg: "var(--text-faint)",     label: "ENDED" },
  ARCHIVED:  { bg: "var(--surface-2)",      fg: "var(--text-faint)",     label: "ARCHIVED" },
};

export function PromotionsTab({
  promotions,
  couponOptions,
  canWrite,
}: {
  promotions: PromotionListItem[];
  couponOptions: { id: string; code: string }[];
  canWrite: boolean;
}) {
  return (
    <div className="space-y-6">
      {canWrite && couponOptions.length > 0 && (
        <ComposerSection couponOptions={couponOptions} />
      )}
      {canWrite && couponOptions.length === 0 && (
        <div
          className="rounded-md border px-4 py-3 text-[12px]"
          style={{ background: "var(--warning-surface)", borderColor: "var(--warning-fg)", color: "var(--warning-fg)" }}
        >
          Mint a coupon first — promotions need a coupon to drive redemptions.
        </div>
      )}

      <PromotionsTable rows={promotions} canWrite={canWrite} />
    </div>
  );
}

function ComposerSection({ couponOptions }: { couponOptions: { id: string; code: string }[] }) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          New promotion
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Bundle a coupon with a marketing context — landing URL, audience description,
          run window, success goal. Coupons keep redeeming the same way; promotions are
          reporting metadata.
        </p>
      </div>
      <form action={createPromotion} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <FormField label="Name" name="name" required maxLength={120} placeholder="Q2 launch promo" />
        <FormField label="Description" name="description" maxLength={500} placeholder="Drive new sign-ups via NSP outreach"
                   wide />
        <FormSelect label="Coupon" name="couponId" required
                    options={couponOptions.map((c) => ({ value: c.id, label: c.code }))} />
        <FormField label="Landing URL" name="landingUrl" maxLength={500}
                   placeholder="https://flowtora.com/q2-launch" />
        <FormField label="Email template kind" name="emailTemplateKind" maxLength={100}
                   placeholder="marketing.q2_launch" />
        <FormSelect label="Status" name="status"
                    options={[
                      { value: "DRAFT",     label: "Draft" },
                      { value: "SCHEDULED", label: "Scheduled" },
                      { value: "ACTIVE",    label: "Active" },
                    ]} defaultValue="DRAFT" />
        <FormField label="Audience" name="audience" maxLength={500}
                   placeholder="Trial tenants ≥ 14 days old, US sign shops"
                   wide />
        <FormField label="Goal" name="goal" maxLength={500}
                   placeholder="500 redemptions, 10% conversion lift" wide />
        <FormField label="Starts at" name="startsAt" type="datetime-local" />
        <FormField label="Ends at" name="endsAt" type="datetime-local" />

        <div className="md:col-span-3 flex items-end justify-end gap-3">
          <button
            type="submit"
            className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
            style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}
          >
            Create promotion
          </button>
        </div>
      </form>
    </section>
  );
}

function PromotionsTable({ rows, canWrite }: { rows: PromotionListItem[]; canWrite: boolean }) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Promotions ({rows.length})
        </h2>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px]" style={{ color: "var(--text-muted)" }}>
          No promotions yet. Create one above to bundle a coupon with marketing context.
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {rows.map((p) => {
            const palette = STATUS_PALETTE[p.status];
            const discountStr = p.coupon.discountType === "PERCENT"
              ? `${p.coupon.amount}% off`
              : `${formatMoney(p.coupon.amount, p.coupon.currency ?? "USD")} off`;
            return (
              <li key={p.id} className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[1.5fr_1fr_1fr_auto]">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
                      {p.name}
                    </span>
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.fg}` }}
                    >
                      {palette.label}
                    </span>
                  </div>
                  {p.description && (
                    <div className="mt-1 truncate text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {p.description}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
                    <span>Code <code style={{ color: "var(--text-default)" }}>{p.coupon.code}</code> · {discountStr}</span>
                    {p.audience && <span>Audience: {p.audience}</span>}
                    {p.goal && <span>Goal: {p.goal}</span>}
                  </div>
                </div>

                <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  <div>
                    {p.startsAt
                      ? <span>Starts <span style={{ color: "var(--text-default)" }}>{p.startsAt.toLocaleDateString()}</span></span>
                      : "No start"}
                  </div>
                  <div>
                    {p.endsAt
                      ? <span>Ends <span style={{ color: "var(--text-default)" }}>{p.endsAt.toLocaleDateString()}</span></span>
                      : "Open-ended"}
                  </div>
                  {p.landingUrl && (
                    <div className="truncate">
                      Landing:{" "}
                      <a href={p.landingUrl} target="_blank" rel="noopener"
                         className="hover:underline" style={{ color: "var(--accent-primary)" }}>
                        {p.landingUrl}
                      </a>
                    </div>
                  )}
                </div>

                <div className="text-[12px]">
                  <div>
                    <span style={{ color: "var(--text-default)" }}>{p.redemptionCount}</span>
                    <span style={{ color: "var(--text-muted)" }}> redemption{p.redemptionCount === 1 ? "" : "s"}</span>
                  </div>
                  <div>
                    <span style={{ color: "var(--text-default)" }}>
                      {p.totalDiscounted > 0 ? formatMoney(p.totalDiscounted, p.coupon.currency ?? "USD") : "—"}
                    </span>
                    <span style={{ color: "var(--text-muted)" }}> discounted</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  {canWrite && p.status !== "ENDED" && p.status !== "ARCHIVED" && (
                    <form action={endPromotion.bind(null, p.id)}>
                      <button type="submit"
                              className="ts-focus rounded-md border px-2.5 py-1.5 text-[12px] font-medium"
                              style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}>
                        End now
                      </button>
                    </form>
                  )}
                  {canWrite && p.status !== "ARCHIVED" && (
                    <form action={archivePromotion.bind(null, p.id)}>
                      <button type="submit"
                              className="ts-focus rounded-md border px-2.5 py-1.5 text-[12px] font-medium"
                              style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)", background: "var(--surface-1)" }}>
                        Archive
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {/* Reference Link to keep the import live. */}
      <span className="hidden" aria-hidden>{Link.name}</span>
    </section>
  );
}

/* ─── Tiny form helpers ─────────────────────────────────────────── */

function FormField({
  label, name, type = "text", required, placeholder, maxLength, wide,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
  wide?: boolean;
}) {
  return (
    <label className={"block " + (wide ? "md:col-span-2" : "")}>
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}{required ? " *" : ""}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        placeholder={placeholder}
        maxLength={maxLength}
        className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
      />
    </label>
  );
}

function FormSelect({
  label, name, required, options, defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}{required ? " *" : ""}
      </span>
      <select
        name={name}
        required={required}
        defaultValue={defaultValue}
        className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
