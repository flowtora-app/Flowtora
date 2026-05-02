import { Kpi, SectionHeader, DeferredNote } from "./shared";

export function CacTab() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="CAC (blended)" value="—" sub="Awaiting marketing spend integration" />
        <Kpi label="CAC (paid)" value="—" />
        <Kpi label="Payback months" value="—" />
        <Kpi label="LTV : CAC" value="—" />
      </div>

      <div className="rounded-lg border p-6"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <SectionHeader
          title="CAC & Payback — honestly deferred"
          description="What we'd need to compute these:"
        />
        <ul className="mt-4 space-y-2 text-[12px]" style={{ color: "var(--text-default)" }}>
          <li>• Monthly marketing spend (paid + content + sales) per attribution channel</li>
          <li>• Tenant acquisition channel attribution at signup</li>
          <li>• Sales team comp + activity costs (for the sales-led portion)</li>
        </ul>
        <p className="mt-4 text-[12px]" style={{ color: "var(--text-muted)" }}>
          Once we add a <span className="font-mono">MarketingSpend</span> table (per month, per channel) and
          stamp <span className="font-mono">tenant.acquisitionChannel</span> at signup, this tab lights up with
          live numbers without UI changes — the loaders are stubbed and ready.
        </p>
      </div>

      <DeferredNote>
        Faking CAC numbers would actively mislead the operator. We&apos;ll keep this honest until the
        underlying data exists.
      </DeferredNote>
    </div>
  );
}
