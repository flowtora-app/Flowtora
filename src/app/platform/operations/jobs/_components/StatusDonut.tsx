import { DonutChartCard } from "@/components/ui/Charts";
import type { StatusSlice } from "@/server/platform/operations";
import { STATUS_LABEL } from "./shared";

export function StatusDonut({ slices }: { slices: StatusSlice[] }) {
  if (slices.length === 0) {
    return (
      <p className="py-8 text-center text-[12px]" style={{ color: "var(--text-muted)" }}>
        No orders match the current filters.
      </p>
    );
  }
  return (
    <DonutChartCard
      data={slices.map((s) => ({ name: STATUS_LABEL[s.status], value: s.count }))}
      height="md"
    />
  );
}
