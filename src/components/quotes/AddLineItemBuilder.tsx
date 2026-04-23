"use client";

import * as React from "react";
import { useRef, useState, useTransition } from "react";
import { Field, SelectField, Button } from "@/components/Field";
import { PRICING_MODELS } from "@/lib/pricing";

export type ProductOption = {
  id: string;
  name: string;
  category: string | null;
  pricingLabel: string;
};

export type PackageOption = {
  id: string;
  name: string;
  componentCount: number;
};

type Mode = "catalog" | "custom" | "package";

type Props = {
  addAction: (formData: FormData) => void | Promise<void>;
  addPackageAction: (formData: FormData) => void | Promise<void>;
  products: ProductOption[];
  packages: PackageOption[];
};

export function AddLineItemBuilder({
  addAction,
  addPackageAction,
  products,
  packages,
}: Props) {
  const hasPackages = packages.length > 0;
  const hasCatalog = products.length > 0;

  const [mode, setMode] = useState<Mode>(hasCatalog ? "catalog" : "custom");
  const [isPending, startTransition] = useTransition();

  const catalogRef = useRef<HTMLFormElement>(null);
  const customRef = useRef<HTMLFormElement>(null);
  const packageRef = useRef<HTMLFormElement>(null);

  function resetAndFocus(ref: React.RefObject<HTMLFormElement | null>) {
    const form = ref.current;
    if (!form) return;
    form.reset();
    const first = form.querySelector<HTMLInputElement | HTMLSelectElement>(
      'input:not([type="hidden"]):not([type="submit"]), select',
    );
    first?.focus();
  }

  const tabs: { value: Mode; label: string; available: boolean }[] = [
    { value: "catalog", label: "From catalog", available: hasCatalog },
    { value: "custom", label: "Custom line", available: true },
    { value: "package", label: "Package", available: hasPackages },
  ];

  const hint: Record<Mode, string> = {
    catalog: "Pick a saved product — pricing model and base price are snapshotted from the catalog.",
    custom: "Ad-hoc line with a name and price. Use this for rush fees, one-off items, or line-level notes.",
    package: "Expand a saved bundle into multiple lines in one click.",
  };

  return (
    <section
      className="rounded-lg"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
      aria-label="Add line item"
    >
      <header className="flex flex-col gap-2 px-4 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            Add a line item
          </h3>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {hint[mode]}
          </p>
        </div>
        <div
          role="tablist"
          className="inline-flex shrink-0 rounded-md p-0.5"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {tabs
            .filter((t) => t.available)
            .map((t) => {
              const active = t.value === mode;
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMode(t.value)}
                  className="rounded-sm px-2.5 py-1 text-xs font-medium transition-colors"
                  style={{
                    background: active ? "var(--surface-0)" : "transparent",
                    color: active ? "var(--text-default)" : "var(--text-muted)",
                    boxShadow: active ? "0 1px 0 rgb(0 0 0 / 0.04)" : "none",
                  }}
                >
                  {t.label}
                </button>
              );
            })}
        </div>
      </header>

      <div className="px-4 pb-4 pt-3">
        {mode === "catalog" && hasCatalog && (
          <form
            ref={catalogRef}
            action={(fd) => {
              startTransition(async () => {
                await addAction(fd);
                resetAndFocus(catalogRef);
              });
            }}
            className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <SelectField
              label="Product"
              name="productId"
              defaultValue=""
              required
              options={[
                { value: "", label: "— pick a product —" },
                ...products.map((p) => ({
                  value: p.id,
                  label: `${p.name}${p.category ? ` — ${p.category}` : ""} · ${p.pricingLabel}`,
                })),
              ]}
            />
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adding…" : "Add item"}
            </Button>
          </form>
        )}

        {mode === "custom" && (
          <form
            ref={customRef}
            action={(fd) => {
              startTransition(async () => {
                await addAction(fd);
                resetAndFocus(customRef);
              });
            }}
            className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1fr)_auto]"
          >
            <Field
              label="Product / service name"
              name="name"
              required
              placeholder="e.g. Rush surcharge, Custom banner"
            />
            <SelectField
              label="Pricing model"
              name="pricingModel"
              defaultValue="FIXED"
              options={PRICING_MODELS.map((m) => ({ value: m.value, label: m.label }))}
            />
            <Field
              label="Base price"
              name="basePrice"
              type="number"
              step="0.01"
              min="0"
              defaultValue="0"
            />
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adding…" : "Add item"}
            </Button>
          </form>
        )}

        {mode === "package" && hasPackages && (
          <form
            ref={packageRef}
            action={(fd) => {
              startTransition(async () => {
                await addPackageAction(fd);
                resetAndFocus(packageRef);
              });
            }}
            className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
          >
            <SelectField
              label="Package"
              name="packageId"
              defaultValue=""
              required
              options={[
                { value: "", label: "— pick a package —" },
                ...packages.map((p) => ({
                  value: p.id,
                  label: `${p.name} · ${p.componentCount} component${p.componentCount === 1 ? "" : "s"}`,
                })),
              ]}
            />
            <Button type="submit" disabled={isPending}>
              {isPending ? "Expanding…" : "Expand into lines"}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
