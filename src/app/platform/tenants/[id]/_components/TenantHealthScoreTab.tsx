import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, EmptyState, ProgressBar } from "@/components/ui";
import { TenantHealthRecomputeButton } from "./TenantHealthClient";

// Tab 14 — Health Score. Big ring + sub-scores + 12-month trend +
// auto-generated driver insights.

export interface TenantHealthScoreTabProps { tenantId: string; canRecompute: boolean }

export async function TenantHealthScoreTab({ tenantId, canRecompute }: TenantHealthScoreTabProps) {
  const t = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { status: true, lastActivityAt: true, plan: true, trialEndsAt: true },
  });
  if (!t) return null;

  const snapshots = await db.tenantHealthSnapshot.findMany({
    where: { tenantId },
    orderBy: { computedAt: "asc" },
    take: 365,
    select: { id: true, score: true, subscores: true, computedAt: true, trigger: true, note: true },
  });

  // Compute "current" using the same heuristic the list view uses so
  // the ring is in sync even if no manual recompute has fired.
  const lastDays = t.lastActivityAt ? Math.floor((Date.now() - t.lastActivityAt.getTime()) / 86_400_000) : null;
  const baseScore = t.status === "ACTIVE" ? 90 : t.status === "PAST_DUE" ? 40 : t.status === "TRIAL" ? 70 : 30;
  const activityPenalty = lastDays == null ? 20 : lastDays > 30 ? 30 : lastDays > 7 ? 10 : 0;
  const liveScore = Math.max(0, Math.min(100, baseScore - activityPenalty));
  const loginRecency = lastDays == null ? 50 : Math.max(0, Math.min(100, 100 - lastDays * 3));
  const paymentHealth = t.status === "PAST_DUE" ? 30 : t.status === "ACTIVE" ? 95 : 70;

  const sub = [
    { label: "Login recency",   value: loginRecency,        weight: 40 },
    { label: "Payment health",  value: paymentHealth,       weight: 30 },
    { label: "Account base",    value: baseScore - activityPenalty, weight: 30 },
  ];

  // Driver insight — compare latest two snapshots if we have them.
  const driver = (() => {
    if (snapshots.length < 2) return null;
    const last = snapshots[snapshots.length - 1]!;
    const prev = snapshots[snapshots.length - 2]!;
    const delta = last.score - prev.score;
    if (Math.abs(delta) < 5) return null;
    return delta > 0
      ? `Score is up ${delta} points since the last snapshot on ${prev.computedAt.toLocaleDateString()}.`
      : `Score dropped ${Math.abs(delta)} points since ${prev.computedAt.toLocaleDateString()}. Check the Audit tab for recent payment / login events.`;
  })();

  return (
    <div className="space-y-4">
      <Card padding="md">
        <CardHeader title="Overall score" right={canRecompute ? <TenantHealthRecomputeButton tenantId={tenantId} /> : null} />
        <CardBody>
          <div className="flex flex-wrap items-center gap-6">
            <RingScore score={liveScore} />
            <div className="flex-1 space-y-2">
              {sub.map((s) => (
                <div key={s.label} className="grid grid-cols-[140px_1fr_60px_60px] items-center gap-2 text-[12px]">
                  <span style={{ color: "var(--text-muted)" }}>{s.label}</span>
                  <ProgressBar value={s.value} size="sm" tone={s.value >= 80 ? "success" : s.value >= 50 ? "warning" : "danger"} />
                  <span className="text-right font-mono tabular-nums" style={{ color: "var(--text-default)" }}>{s.value}</span>
                  <span className="text-right text-[10px]" style={{ color: "var(--text-faint)" }}>w {s.weight}%</span>
                </div>
              ))}
            </div>
          </div>
          {driver && (
            <div className="mt-4 rounded-md border-l-4 px-3 py-2 text-[12px]"
                 style={{ background: "var(--surface-2)", borderLeftColor: "var(--brand-500)", color: "var(--text-default)" }}>
              <strong>Driver: </strong>{driver}
            </div>
          )}
        </CardBody>
      </Card>

      <Card padding="md">
        <CardHeader title="12-month trend" />
        <CardBody>
          {snapshots.length === 0 ? (
            <EmptyState
              title="No snapshot history yet"
              description={`Click Recompute above to start a history. The trend chart fills in once daily snapshots accumulate. Live score: ${liveScore}.`}
            />
          ) : (
            <SparkLine values={snapshots.map((s) => s.score)} />
          )}
        </CardBody>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <CardHeader title="Snapshot history" description={`${snapshots.length} on file`} />
        </div>
        {snapshots.length === 0 ? (
          <CardBody><EmptyState title="No snapshots" description="Use the Recompute button to start tracking." /></CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr><Th>When</Th><Th>Score</Th><Th>Trigger</Th><Th>Note</Th></tr>
              </thead>
              <tbody>
                {[...snapshots].reverse().slice(0, 50).map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <Td>{s.computedAt.toLocaleString()}</Td>
                    <Td><span className="font-mono tabular-nums">{s.score}</span></Td>
                    <Td>{s.trigger}</Td>
                    <Td>{s.note ?? <span style={{ color: "var(--text-faint)" }}>—</span>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function RingScore({ score }: { score: number }) {
  const color = score >= 80 ? "var(--emerald-500)" : score >= 50 ? "var(--amber-500)" : "var(--rose-500)";
  const r = 38;
  const c = 2 * Math.PI * r;
  const off = c - (score / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: 96, height: 96 }}>
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="8" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
                strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" transform="rotate(-90 48 48)" />
      </svg>
      <div className="absolute text-[24px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>{score}</div>
    </div>
  );
}

function SparkLine({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>Not enough data yet.</div>;
  const w = 600, h = 80, padY = 4;
  const min = Math.min(...values), max = Math.max(...values);
  const range = Math.max(1, max - min);
  const stepX = w / (values.length - 1);
  const points = values.map((v, i) => `${i * stepX},${h - padY - ((v - min) / range) * (h - padY * 2)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block w-full" style={{ height: 80 }} aria-hidden>
      <polygon points={`0,${h} ${points} ${w},${h}`} fill="var(--brand-500)" fillOpacity={0.12} />
      <polyline points={points} fill="none" stroke="var(--brand-600)" strokeWidth={1.5} />
    </svg>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2" style={{ color: "var(--text-default)" }}>{children}</td>;
}
