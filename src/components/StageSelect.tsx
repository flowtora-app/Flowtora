"use client";

import { useRouter } from "next/navigation";
import { PIPELINE_STAGES } from "@/lib/crm";
import type { PipelineStage } from "@prisma/client";

// Phase 7 — kanban quick-pick.
//
// Quick-select handles the common "advance one column" case — no
// dialog, no page nav, just flip the stage. But we route WON and
// LOST through the detail page instead. Both stages need a guided
// capture step (quote-required check, canonical lost reason), and
// doing that via a bare <select> quietly skips the learning step.
export function StageSelect({
  slug,
  customerId,
  current,
  action,
}: {
  slug: string;
  customerId: string;
  current: PipelineStage;
  action: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="customerId" value={customerId} />
      <select
        name="stage"
        defaultValue={current}
        onChange={(e) => {
          const next = e.currentTarget.value as PipelineStage;
          // Terminal stages need the guided form — hop to detail page.
          if (next === "WON" || next === "LOST" || current === "LOST") {
            router.push(`/t/${slug}/customers/${customerId}#stage`);
            return;
          }
          if (next === current) return;
          e.currentTarget.form?.requestSubmit();
        }}
        className="w-full rounded-md px-2 py-1 text-xs"
        style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
      >
        {PIPELINE_STAGES.map((s) => (
          <option key={s.value} value={s.value}>Move → {s.label}</option>
        ))}
      </select>
    </form>
  );
}
