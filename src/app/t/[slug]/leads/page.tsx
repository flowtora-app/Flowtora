import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/Card";
import { Button } from "@/components/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { ACTIVE_PIPELINE_STAGES, PIPELINE_STAGES, stageColor } from "@/lib/crm";
import { formatMoney } from "@/lib/format";
import { changeStage } from "@/app/actions/customers";
import { memberLookup } from "@/lib/members";
import { StageSelect } from "@/components/StageSelect";
import { loadHealthBundle } from "@/lib/opportunity-health-loader";
import { computeOpportunityHealth } from "@/lib/opportunity-health";
import { HealthBadge } from "@/components/crm/HealthBadge";
import { loadLeadSourceStats } from "@/lib/lead-sources";
import { LeadSourcePanel } from "@/components/crm/LeadSourcePanel";
import type { Customer, PipelineStage } from "@prisma/client";

const COLUMN_STAGES: PipelineStage[] = [...ACTIVE_PIPELINE_STAGES, "WON", "LOST"];

export default async function LeadsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requirePermission(slug, "customers:view");

  const [customers, members, sourceStats] = await Promise.all([
    db.customer.findMany({
      where: { tenantId: ctx.tenant.id, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 500,
    }),
    memberLookup(ctx.tenant.id),
    loadLeadSourceStats(ctx.tenant.id),
  ]);

  // Phase 7 — health scoring across the whole board. Four batched
  // aggregate queries for the entire customer list, then a pure
  // function per row. Worst case 500 customers × a couple ms each.
  const healthBundle = await loadHealthBundle(ctx.tenant.id, customers);
  const healthReports = new Map<string, ReturnType<typeof computeOpportunityHealth>>();
  for (const c of customers) {
    const input = healthBundle.get(c.id);
    if (input) healthReports.set(c.id, computeOpportunityHealth(input));
  }

  const byStage = new Map<PipelineStage, Customer[]>();
  COLUMN_STAGES.forEach((s) => byStage.set(s, []));
  for (const c of customers) byStage.get(c.stage)?.push(c);

  // Surface "at-risk" opportunities up top inside each column so the
  // ones bleeding momentum never hide at the bottom of a long list.
  for (const [stage, list] of byStage) {
    list.sort((a, b) => {
      const ra = healthReports.get(a.id);
      const rb = healthReports.get(b.id);
      const aRisk = ra?.atRisk ? 1 : 0;
      const bRisk = rb?.atRisk ? 1 : 0;
      if (aRisk !== bRisk) return bRisk - aRisk;
      const sa = ra?.score ?? 0;
      const sb = rb?.score ?? 0;
      if (sa !== sb) return sb - sa;
      return 0;
    });
    byStage.set(stage, list);
  }

  const totalsByStage = new Map<PipelineStage, number>();
  for (const [stage, list] of byStage) {
    totalsByStage.set(
      stage,
      list.reduce((sum, c) => sum + Number(c.estimatedValue ?? 0), 0),
    );
  }

  const atRiskCount = Array.from(healthReports.values()).filter((r) => r.atRisk).length;

  const canEdit = ctx.can("customers:edit");

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Pipeline</h1>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {customers.length} active records
            {atRiskCount > 0 && (
              <>
                {" · "}
                <span style={{ color: "var(--danger-fg)" }}>
                  {atRiskCount} at risk
                </span>
              </>
            )}
          </p>
        </div>
        <Link href={`/t/${slug}/customers/new`}>
          <Button type="button">New lead</Button>
        </Link>
      </div>

      {/* Phase 7 — lead source analytics. Helps managers see which
          channels are paying off and where to double down. */}
      <div className="mt-6">
        <LeadSourcePanel stats={sourceStats} currency={ctx.tenant.currency} />
      </div>

      {customers.length === 0 ? (
        <Card className="mt-6">
          <EmptyState
            title="No leads yet"
            description="The pipeline is where deals live before they become quotes. Add your first lead to start tracking opportunities through the stages."
            actionHref={`/t/${slug}/customers/new`}
            actionLabel="Add first lead"
          />
        </Card>
      ) : (
      <div className="mt-6 grid auto-cols-[280px] grid-flow-col gap-4 overflow-x-auto pb-4">
        {COLUMN_STAGES.map((stage) => {
          const list = byStage.get(stage) ?? [];
          const total = totalsByStage.get(stage) ?? 0;
          return (
            <div key={stage} className="rounded-md" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2">
                  <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: stageColor(stage) }} />
                  <span className="text-sm font-medium">{PIPELINE_STAGES.find((s) => s.value === stage)?.label}</span>
                </div>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {list.length} · {formatMoney(total, ctx.tenant.currency)}
                </span>
              </div>
              <ul className="space-y-2 p-2">
                {list.length === 0 && (
                  <li className="px-2 py-3 text-center text-xs" style={{ color: "var(--muted)" }}>—</li>
                )}
                {list.map((c) => {
                  const move = changeStage.bind(null, slug);
                  const report = healthReports.get(c.id);
                  return (
                    <li key={c.id} className="rounded-md p-3 text-sm" style={{ background: "var(--bg)", border: "1px solid var(--border)" }}>
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/t/${slug}/customers/${c.id}`} className="font-medium underline">
                          {c.name}
                        </Link>
                        {report && (
                          <HealthBadge
                            tier={report.tier}
                            score={report.score}
                            atRisk={report.atRisk}
                            size="sm"
                          />
                        )}
                      </div>
                      <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                        {c.estimatedValue ? formatMoney(c.estimatedValue.toString(), ctx.tenant.currency) : "—"}
                        {c.ownerId && members.get(c.ownerId) && <> · {members.get(c.ownerId)!.name}</>}
                      </div>
                      {canEdit && <StageSelect slug={slug} customerId={c.id} current={c.stage} action={move} />}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
