"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select, Textarea, useToast } from "@/components/ui";
import { provisionTenant } from "@/app/actions/tenants-provision";

// 3-step manual-provisioning wizard. Steps:
//   1. Basics — shop name + slug + industry + country + source + notes
//   2. Owner  — name + email + (optional) initial password
//   3. Plan   — plan + status (TRIAL | ACTIVE) + trial days
//
// Data lives in client state; final submit hands the assembled
// FormData to the provisionTenant server action which redirects to
// the new tenant's detail page on success.

const PLAN_OPTIONS = [
  { value: "STARTER",    label: "Starter — $49/mo" },
  { value: "GROWTH",     label: "Growth — $149/mo" },
  { value: "PRO",        label: "Pro — $299/mo" },
  { value: "ENTERPRISE", label: "Enterprise — custom" },
];
const INDUSTRY_OPTIONS = [
  { value: "",                     label: "(Skip)" },
  { value: "SIGN_SHOP",            label: "Sign shop" },
  { value: "PRINT_SHOP",           label: "Print shop" },
  { value: "APPAREL_SCREEN_PRINT", label: "Apparel / screen-print" },
  { value: "EMBROIDERY",           label: "Embroidery" },
  { value: "PROMO_PRODUCTS",       label: "Promo products" },
  { value: "TRADE_PRINTER",        label: "Trade printer" },
  { value: "WIDE_FORMAT_ONLY",     label: "Wide-format only" },
  { value: "MULTI_DISCIPLINE",     label: "Multi-discipline" },
  { value: "HYBRID",               label: "Hybrid" },
  { value: "OTHER",                label: "Other" },
];
const SOURCE_OPTIONS = [
  { value: "ORGANIC",  label: "Organic" },
  { value: "REFERRAL", label: "Referral" },
  { value: "PAID",     label: "Paid acquisition" },
  { value: "PARTNER",  label: "Partner / warm intro" },
  { value: "OTHER",    label: "Other" },
];
const STATUS_OPTIONS = [
  { value: "TRIAL",  label: "Trial (14d default)" },
  { value: "ACTIVE", label: "Active (skip trial)" },
];

type Step = 1 | 2 | 3;

export function ProvisionWizard() {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = React.useState<Step>(1);

  // Step 1
  const [shopName, setShopName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [industry, setIndustry] = React.useState<string>("");
  const [source, setSource] = React.useState("ORGANIC");
  const [notes, setNotes] = React.useState("");

  // Step 2
  const [ownerName, setOwnerName] = React.useState("");
  const [ownerEmail, setOwnerEmail] = React.useState("");
  const [ownerPassword, setOwnerPassword] = React.useState("");

  // Step 3
  const [plan, setPlan] = React.useState("STARTER");
  const [status, setStatus] = React.useState("TRIAL");
  const [trialDays, setTrialDays] = React.useState("14");

  const [submitting, setSubmitting] = React.useState(false);

  // Slug autofill from shop name (only when slug is empty / unedited).
  const slugManuallyEdited = React.useRef(false);
  React.useEffect(() => {
    if (slugManuallyEdited.current) return;
    setSlug(autoSlug(shopName));
  }, [shopName]);

  const stepValid: Record<Step, boolean> = {
    1: shopName.trim().length > 0 && slug.trim().length >= 2,
    2: ownerName.trim().length > 0 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(ownerEmail),
    3: PLAN_OPTIONS.some((p) => p.value === plan),
  };

  const canSubmit = stepValid[1] && stepValid[2] && stepValid[3];

  const onSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    const fd = new FormData();
    fd.set("shopName", shopName.trim());
    fd.set("slug", slug.trim());
    fd.set("ownerName", ownerName.trim());
    fd.set("ownerEmail", ownerEmail.trim());
    if (ownerPassword) fd.set("ownerPassword", ownerPassword);
    fd.set("plan", plan);
    fd.set("status", status);
    fd.set("trialDays", String(trialDays || "14"));
    if (country) fd.set("country", country);
    if (industry) fd.set("industry", industry);
    fd.set("source", source);
    if (notes.trim()) fd.set("notes", notes.trim());

    try {
      const res = await provisionTenant(fd);
      // provisionTenant redirects on success — if we get here, it
      // returned an error.
      if (res && "ok" in res && !res.ok) {
        toast.error(res.error ?? "Couldn't provision tenant");
        setSubmitting(false);
        return;
      }
      // Redirect happened — Next will navigate.
    } catch (err) {
      // redirect throws synchronously — that's the success path.
      const isRedirect = err instanceof Error && err.message === "NEXT_REDIRECT";
      if (!isRedirect) {
        setSubmitting(false);
        toast.error(err instanceof Error ? err.message : "Couldn't provision");
        return;
      }
      // Redirect: nothing to do — Next handles it.
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <StepRail current={step} />

      {step === 1 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Shop name"
            value={shopName}
            onChange={(e) => setShopName(e.currentTarget.value)}
            placeholder="ACME Signs Ltd."
            required
            autoFocus
          />
          <Input
            label="Slug"
            value={slug}
            onChange={(e) => { slugManuallyEdited.current = true; setSlug(slugify(e.currentTarget.value)); }}
            placeholder="acme-signs"
            hint="Lowercase letters, numbers, dashes. Auto-derived from the shop name."
            required
          />
          <Input
            label="Country (ISO2 or name)"
            value={country}
            onChange={(e) => setCountry(e.currentTarget.value)}
            placeholder="US"
          />
          <Select
            label="Industry"
            value={industry}
            onChange={(e) => setIndustry(e.currentTarget.value)}
            options={INDUSTRY_OPTIONS}
          />
          <Select
            label="Source"
            value={source}
            onChange={(e) => setSource(e.currentTarget.value)}
            options={SOURCE_OPTIONS}
          />
          <Textarea
            label="Notes (admin-only)"
            value={notes}
            onChange={(e) => setNotes(e.currentTarget.value)}
            rows={3}
            hint="Sales call summary, special handling, etc. Never visible to the tenant."
          />
        </div>
      )}

      {step === 2 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Owner name"
            value={ownerName}
            onChange={(e) => setOwnerName(e.currentTarget.value)}
            placeholder="Ada Lovelace"
            required
            autoFocus
          />
          <Input
            label="Owner email"
            type="email"
            value={ownerEmail}
            onChange={(e) => setOwnerEmail(e.currentTarget.value)}
            placeholder="ada@acme-signs.com"
            required
          />
          <Input
            label="Initial password (optional)"
            type="password"
            value={ownerPassword}
            onChange={(e) => setOwnerPassword(e.currentTarget.value)}
            hint="Leave blank — we'll generate a random one and the owner resets via the standard flow."
          />
          <div className="rounded-md border p-3 text-[12px]"
               style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--text-default)" }}>Note · </strong>
            If the email is already on file (e.g. owner of another tenant), we'll attach
            this new tenant as an additional OWNER membership instead of duplicating the user.
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Select
            label="Plan"
            value={plan}
            onChange={(e) => setPlan(e.currentTarget.value)}
            options={PLAN_OPTIONS}
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.currentTarget.value)}
            options={STATUS_OPTIONS}
            hint="Trial gives the new shop the standard 14-day window. Active skips trial entirely (manual onboarding / paid migration)."
          />
          {status === "TRIAL" && (
            <Input
              label="Trial length (days)"
              type="number"
              min={0}
              max={365}
              value={trialDays}
              onChange={(e) => setTrialDays(e.currentTarget.value)}
            />
          )}
          <div className="rounded-md border p-3 text-[12px]"
               style={{ background: "var(--brand-50)", borderColor: "var(--brand-200)", color: "var(--brand-800)" }}>
            <strong>Ready to provision · </strong>
            We'll create the tenant, attach the OWNER user, log a CREATED subscription
            event ({status === "TRIAL" ? "$0 mrrDelta" : "+plan price"}), and send you to
            the tenant detail page.
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4"
           style={{ borderColor: "var(--border-subtle)" }}>
        <div>
          {step > 1 && (
            <Button variant="ghost" onClick={() => setStep((step - 1) as Step)}>← Back</Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {step < 3 ? (
            <Button onClick={() => setStep((step + 1) as Step)} disabled={!stepValid[step]}>
              Next →
            </Button>
          ) : (
            <Button onClick={onSubmit} disabled={!canSubmit} loading={submitting}>
              Provision tenant
            </Button>
          )}
        </div>
      </div>
      {void router}
    </div>
  );
}

/* ── Step rail ───────────────────────────────────────────── */

function StepRail({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { id: 1, label: "Basics" },
    { id: 2, label: "Owner" },
    { id: 3, label: "Plan + provision" },
  ];
  return (
    <ol className="flex items-center gap-3 text-[12px]">
      {steps.map((s, i) => {
        const completed = current > s.id;
        const active = current === s.id;
        return (
          <React.Fragment key={s.id}>
            <li className="flex items-center gap-2">
              <span
                aria-hidden
                style={{
                  width: 24, height: 24, borderRadius: 12,
                  background: completed ? "var(--emerald-500)" : active ? "var(--brand-600)" : "var(--surface-3)",
                  color: completed || active ? "white" : "var(--text-muted)",
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700,
                }}
              >
                {completed ? "✓" : s.id}
              </span>
              <span style={{ color: active || completed ? "var(--text-default)" : "var(--text-muted)", fontWeight: active ? 600 : 400 }}>
                {s.label}
              </span>
            </li>
            {i < steps.length - 1 && (
              <span aria-hidden style={{ flex: 1, height: 1, background: "var(--border-subtle)" }} />
            )}
          </React.Fragment>
        );
      })}
    </ol>
  );
}

/* ── Helpers ───────────────────────────────────────────── */

function autoSlug(s: string): string {
  return slugify(s);
}
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
