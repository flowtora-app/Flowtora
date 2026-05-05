// Page 39 — campaign wizard step navigation.

import Link from "next/link";

export type WizardStep =
  | "setup"
  | "audience"
  | "content"
  | "schedule"
  | "tracking"
  | "review"
  | "performance";

const STEPS: { key: WizardStep; label: string; n: number }[] = [
  { key: "setup",       n: 1, label: "Setup" },
  { key: "audience",    n: 2, label: "Audience" },
  { key: "content",     n: 3, label: "Content" },
  { key: "schedule",    n: 4, label: "Send time" },
  { key: "tracking",    n: 5, label: "Tracking" },
  { key: "review",      n: 6, label: "Review & send" },
];

export function isWizardStep(v: string | undefined): v is WizardStep {
  return ["setup", "audience", "content", "schedule", "tracking", "review", "performance"].includes(v ?? "");
}

export function WizardSteps({
  active, hrefFor, includePerformance,
}: {
  active: WizardStep;
  hrefFor: (step: WizardStep) => string;
  includePerformance: boolean;
}) {
  return (
    <ol className="flex flex-wrap gap-1 rounded-lg border p-1"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      {STEPS.map((s) => {
        const selected = active === s.key;
        return (
          <li key={s.key}>
            <Link href={hrefFor(s.key)}
                  className="ts-focus flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium whitespace-nowrap"
                  style={{
                    background: selected ? "var(--surface-2)" : "transparent",
                    color: selected ? "var(--text-default)" : "var(--text-muted)",
                  }}>
              <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                    style={{
                      background: selected ? "var(--accent-primary)" : "var(--surface-2)",
                      color: selected ? "var(--accent-fg)" : "var(--text-muted)",
                    }}>
                {s.n}
              </span>
              {s.label}
            </Link>
          </li>
        );
      })}
      {includePerformance && (
        <li>
          <Link href={hrefFor("performance")}
                className="ts-focus flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-medium whitespace-nowrap"
                style={{
                  background: active === "performance" ? "var(--surface-2)" : "transparent",
                  color: active === "performance" ? "var(--text-default)" : "var(--text-muted)",
                  borderLeft: "1px dashed var(--border-default)",
                }}>
            📊 Performance
          </Link>
        </li>
      )}
    </ol>
  );
}
