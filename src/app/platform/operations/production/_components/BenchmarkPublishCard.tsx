import { saveBenchmarkConfig } from "@/app/actions/platform-production-health";
import type { ProductionBenchmarkConfig } from "@prisma/client";

const TOGGLES: { key: keyof ProductionBenchmarkConfig; label: string; help: string }[] = [
  { key: "publishOnTimeDeliveryRate", label: "On-time delivery rate",  help: "% of completed orders shipped on or before due date." },
  { key: "publishAvgCycleDays",       label: "Avg cycle time",          help: "createdAt → completedAt averaged over closed orders." },
  { key: "publishAvgOrderValue",      label: "Avg order value",         help: "Average Order.total across completed orders." },
  { key: "publishEstGrossMarginPct",  label: "Est. gross margin %",     help: "Revenue − cost / revenue across order items with cost data." },
  { key: "publishLateRate",           label: "Late rate (open orders)", help: "Open orders past dueDate / total open orders." },
  { key: "publishEquipmentUptime",    label: "Equipment uptime",        help: "Per-workstation active time / window. Higher is better." },
  { key: "publishWasteRate",          label: "Material waste rate",     help: "Quantity-weighted MaterialUsage waste %. Lower is better." },
  { key: "publishReworkRate",         label: "Rework rate",             help: "% of completed orders with a MAJOR/CRITICAL defect. Lower is better." },
];

export function BenchmarkPublishCard({
  config, canManage,
}: {
  config: ProductionBenchmarkConfig;
  canManage: boolean;
}) {
  return (
    <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
        <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
          Benchmark publishing
        </h2>
        <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Toggle which industry-wide benchmarks are eligible to surface on tenant dashboards.
          The minimum sample size below is the privacy floor — metrics with fewer tenants
          contributing samples are suppressed.
        </p>
      </div>
      <form action={saveBenchmarkConfig} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
        {TOGGLES.map((t) => {
          const checked = config[t.key] as boolean;
          return (
            <label key={String(t.key)}
                   className="flex items-start gap-2 rounded-md border px-3 py-2"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <input type="checkbox" name={String(t.key)} defaultChecked={checked} disabled={!canManage}
                     className="mt-0.5" />
              <div>
                <div className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>
                  {t.label}
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {t.help}
                </div>
              </div>
            </label>
          );
        })}
        <label className="block md:col-span-2">
          <span className="block text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Minimum sample size
          </span>
          <input type="number" name="minSampleSize"
                 defaultValue={String(config.minSampleSize)}
                 min={1} max={1000} disabled={!canManage}
                 className="ts-focus mt-1 w-32 rounded-md border px-3 py-2 text-[13px]"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
          <span className="mt-1 block text-[11px]" style={{ color: "var(--text-muted)" }}>
            Number of tenants required before any single tenant&apos;s metric is surfaced via
            this benchmark. Defaults to 10.
          </span>
        </label>
        {canManage && (
          <div className="md:col-span-2 flex items-end justify-end">
            <button type="submit"
                    className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                    style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
              Save publish config
            </button>
          </div>
        )}
      </form>
      <div className="border-t px-4 py-3 text-[11px]" style={{ borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
        Live on tenant dashboards: the BenchmarkBadge widget reads this config + the privacy
        floor before deciding what to show. Tenants only see metrics where at least
        <b style={{ color: "var(--text-default)" }}> {config.minSampleSize}</b>{" "}
        peers are contributing samples.
      </div>
    </section>
  );
}
