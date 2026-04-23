import { Gauge } from "@/components/charts/Gauge";
import { bandFor } from "@/components/charts/gauge-bands";

type Factor = { label: string; value: number; weightPct: number };

// Composite 0-100 platform health card with a radial gauge + factor
// breakdown. Weights add to 100; each factor is scored 0-100.
// Band colors come from the gauge (excellent/healthy/watch/at-risk).

export function HealthCard({
  score,
  factors,
}: {
  score: number;
  factors: Factor[];
}) {
  const band = bandFor(score);
  return (
    <section
      className="rounded-2xl p-5"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
      }}
    >
      <div className="flex items-center justify-between">
        <h2
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Platform health
        </h2>
        <span className="text-xs" style={{ color: band.color }}>
          {band.label}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-5">
        <Gauge value={score} size={140} />
        <ul className="flex-1 space-y-1.5">
          {factors.map((f) => (
            <li key={f.label} className="flex items-center gap-3 text-xs">
              <span className="flex-1" style={{ color: "var(--text-muted)" }}>
                {f.label}
                <span className="ml-1" style={{ color: "var(--text-faint)" }}>
                  · {f.weightPct}%
                </span>
              </span>
              <div
                className="h-1 w-16 overflow-hidden rounded-full"
                style={{ background: "var(--surface-2)" }}
                aria-hidden
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(0, Math.min(100, f.value))}%`,
                    background: bandFor(f.value).color,
                  }}
                />
              </div>
              <span
                className="w-8 text-right tabular-nums"
                style={{ color: "var(--text-default)" }}
              >
                {f.value}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
