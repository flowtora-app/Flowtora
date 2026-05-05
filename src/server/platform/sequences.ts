// Page 40 — Lifecycle / Drip Sequences data layer.

import { db } from "@/lib/db";
import { Prisma } from "@prisma/client";
import type {
  SequenceStatus,
  SequenceTriggerType,
  SequenceStepKind,
  SequenceEnrollmentStatus,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── KPIs ──────────────────────────────────────────────── */

export interface SequenceKpis {
  drafts: number;
  active: number;
  paused: number;
  totalEnrolled: number;
  activeEnrolled: number;
  totalConverted: number;
  /** converted / enrolled across all sequences. */
  conversionRate: number | null;
}

export async function loadSequenceKpis(): Promise<SequenceKpis> {
  const [byStatus, agg] = await Promise.all([
    db.sequence.groupBy({ by: ["status"], _count: { _all: true } }),
    db.sequence.aggregate({
      _sum: {
        totalEnrolled: true,
        activeEnrolled: true,
        totalConverted: true,
      },
    }),
  ]);
  const map = new Map<SequenceStatus, number>();
  for (const r of byStatus) map.set(r.status, r._count._all);
  const enrolled = agg._sum.totalEnrolled ?? 0;
  const converted = agg._sum.totalConverted ?? 0;
  return {
    drafts: map.get("DRAFT") ?? 0,
    active: map.get("ACTIVE") ?? 0,
    paused: map.get("PAUSED") ?? 0,
    totalEnrolled: enrolled,
    activeEnrolled: agg._sum.activeEnrolled ?? 0,
    totalConverted: converted,
    conversionRate: enrolled === 0 ? null : converted / enrolled,
  };
}

/* ── List ──────────────────────────────────────────────── */

export interface SequenceRow {
  id: string;
  name: string;
  description: string | null;
  status: SequenceStatus;
  triggerType: SequenceTriggerType;
  triggerConfig: Record<string, unknown>;
  conversionGoal: string | null;
  totalEnrolled: number;
  activeEnrolled: number;
  totalConverted: number;
  conversionRate: number | null;
  stepCount: number;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

export interface SequenceListFilters {
  q?: string;
  status?: SequenceStatus;
  triggerType?: SequenceTriggerType;
}

export async function loadSequenceList(args: {
  filters: SequenceListFilters;
  page: number;
  pageSize: number;
}): Promise<{ rows: SequenceRow[]; total: number; filteredTotal: number }> {
  const where: Prisma.SequenceWhereInput = {};
  const ands: Prisma.SequenceWhereInput[] = [];
  if (args.filters.status)      ands.push({ status: args.filters.status });
  if (args.filters.triggerType) ands.push({ triggerType: args.filters.triggerType });
  if (args.filters.q) {
    where.OR = [
      { name: { contains: args.filters.q, mode: "insensitive" } },
      { description: { contains: args.filters.q, mode: "insensitive" } },
    ];
  }
  if (ands.length > 0) where.AND = ands;

  const [total, filteredTotal, rows] = await Promise.all([
    db.sequence.count(),
    db.sequence.count({ where }),
    db.sequence.findMany({
      where,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
      include: { _count: { select: { steps: true } } },
    }),
  ]);
  return {
    total,
    filteredTotal,
    rows: rows.map((r): SequenceRow => ({
      id: r.id,
      name: r.name,
      description: r.description,
      status: r.status,
      triggerType: r.triggerType,
      triggerConfig: (r.triggerConfig ?? {}) as Record<string, unknown>,
      conversionGoal: r.conversionGoal,
      totalEnrolled: r.totalEnrolled,
      activeEnrolled: r.activeEnrolled,
      totalConverted: r.totalConverted,
      conversionRate: r.totalEnrolled === 0 ? null : r.totalConverted / r.totalEnrolled,
      stepCount: r._count.steps,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      publishedAt: r.publishedAt,
    })),
  };
}

/* ── Detail ────────────────────────────────────────────── */

export interface SequenceStepNode {
  id: string;
  position: number;
  parentStepId: string | null;
  branchKey: string | null;
  kind: SequenceStepKind;
  config: Record<string, unknown>;
  title: string | null;
  enteredCount: number;
  exitedCount: number;
  convertedCount: number;
  /** Convenience — children indexed by branchKey so the renderer can build a tree. */
  children: SequenceStepNode[];
}

export interface SequenceDetail extends SequenceRow {
  exitOnGoal: boolean;
  /** Top-level steps (parentStepId == null), nested via .children. */
  rootSteps: SequenceStepNode[];
  /** Flat list — used by the editor for forms, ordered by position. */
  flatSteps: SequenceStepNode[];
}

export async function loadSequenceDetail(id: string): Promise<SequenceDetail | null> {
  const row = await db.sequence.findUnique({
    where: { id },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  if (!row) return null;

  const allSteps: SequenceStepNode[] = row.steps.map((s) => ({
    id: s.id,
    position: s.position,
    parentStepId: s.parentStepId,
    branchKey: s.branchKey,
    kind: s.kind,
    config: (s.config ?? {}) as Record<string, unknown>,
    title: s.title,
    enteredCount: s.enteredCount,
    exitedCount: s.exitedCount,
    convertedCount: s.convertedCount,
    children: [],
  }));
  const byId = new Map(allSteps.map((s) => [s.id, s]));
  const rootSteps: SequenceStepNode[] = [];
  for (const s of allSteps) {
    if (!s.parentStepId) {
      rootSteps.push(s);
      continue;
    }
    const parent = byId.get(s.parentStepId);
    if (parent) parent.children.push(s);
  }

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    triggerType: row.triggerType,
    triggerConfig: (row.triggerConfig ?? {}) as Record<string, unknown>,
    conversionGoal: row.conversionGoal,
    exitOnGoal: row.exitOnGoal,
    totalEnrolled: row.totalEnrolled,
    activeEnrolled: row.activeEnrolled,
    totalConverted: row.totalConverted,
    conversionRate: row.totalEnrolled === 0 ? null : row.totalConverted / row.totalEnrolled,
    stepCount: row.steps.length,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
    rootSteps,
    flatSteps: allSteps,
  };
}

/* ── Templates ─────────────────────────────────────────── */

export async function loadSequenceTemplates() {
  return db.sequenceTemplate.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

/* ── Per-step performance ─────────────────────────────── */

export interface StepPerformanceRow {
  stepId: string;
  /** Per-event counts (entered, completed, exited, converted, branch_yes, …). */
  events: Record<string, number>;
}

export async function loadStepPerformance(sequenceId: string): Promise<Map<string, Record<string, number>>> {
  const events = await db.sequenceStepEvent.groupBy({
    by: ["stepId", "event"],
    where: { step: { sequenceId } },
    _count: { _all: true },
  });
  const out = new Map<string, Record<string, number>>();
  for (const e of events) {
    const cell = out.get(e.stepId) ?? {};
    cell[e.event] = e._count._all;
    out.set(e.stepId, cell);
  }
  return out;
}

/* ── Recent enrollments ───────────────────────────────── */

export interface EnrollmentRow {
  id: string;
  status: SequenceEnrollmentStatus;
  tenantId: string | null;
  tenantName: string | null;
  enrolledAt: Date;
  completedAt: Date | null;
  exitedAt: Date | null;
  exitReason: string | null;
  currentStepId: string | null;
  currentStepTitle: string | null;
  eventCount: number;
}

export async function loadRecentEnrollments(args: {
  sequenceId: string;
  status?: SequenceEnrollmentStatus;
  page: number;
  pageSize: number;
}): Promise<{ rows: EnrollmentRow[]; total: number }> {
  const where: Prisma.SequenceEnrollmentWhereInput = { sequenceId: args.sequenceId };
  if (args.status) where.status = args.status;

  const [total, rows] = await Promise.all([
    db.sequenceEnrollment.count({ where }),
    db.sequenceEnrollment.findMany({
      where,
      orderBy: { enrolledAt: "desc" },
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
      include: {
        _count: { select: { events: true } },
      },
    }),
  ]);
  const tenantIds = Array.from(new Set(rows.map((r) => r.tenantId).filter((x): x is string => Boolean(x))));
  const stepIds = Array.from(new Set(rows.map((r) => r.currentStepId).filter((x): x is string => Boolean(x))));
  const [tenants, steps] = await Promise.all([
    tenantIds.length === 0 ? [] : db.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true } }),
    stepIds.length === 0   ? [] : db.sequenceStep.findMany({ where: { id: { in: stepIds } }, select: { id: true, title: true, kind: true } }),
  ]);
  const tMap = new Map(tenants.map((t) => [t.id, t]));
  const sMap = new Map(steps.map((s) => [s.id, s]));
  return {
    total,
    rows: rows.map((r): EnrollmentRow => ({
      id: r.id,
      status: r.status,
      tenantId: r.tenantId,
      tenantName: r.tenantId ? tMap.get(r.tenantId)?.name ?? null : null,
      enrolledAt: r.enrolledAt,
      completedAt: r.completedAt,
      exitedAt: r.exitedAt,
      exitReason: r.exitReason,
      currentStepId: r.currentStepId,
      currentStepTitle: r.currentStepId
        ? sMap.get(r.currentStepId)?.title ?? sMap.get(r.currentStepId)?.kind ?? null
        : null,
      eventCount: r._count.events,
    })),
  };
}

/* ── Daily enrollment / conversion trend ──────────────── */

export interface SequenceTrend {
  daily: { date: string; enrolled: number; converted: number; exited: number }[];
}

export async function loadSequenceTrend(sequenceId: string, days = 30): Promise<SequenceTrend> {
  const since = new Date(Date.now() - days * DAY);
  since.setHours(0, 0, 0, 0);
  const enrollments = await db.sequenceEnrollment.findMany({
    where: { sequenceId, enrolledAt: { gte: since } },
    select: { enrolledAt: true, completedAt: true, exitedAt: true, status: true },
    take: 50_000,
  });
  const dayMap = new Map<string, { enrolled: number; converted: number; exited: number }>();
  for (let i = 0; i < days; i++) {
    const k = new Date(since.getTime() + i * DAY).toISOString().slice(0, 10);
    dayMap.set(k, { enrolled: 0, converted: 0, exited: 0 });
  }
  for (const e of enrollments) {
    const ek = e.enrolledAt.toISOString().slice(0, 10);
    const cell = dayMap.get(ek); if (cell) cell.enrolled += 1;
    if (e.completedAt) {
      const k = e.completedAt.toISOString().slice(0, 10);
      const c = dayMap.get(k); if (c) c.converted += 1;
    }
    if (e.exitedAt) {
      const k = e.exitedAt.toISOString().slice(0, 10);
      const c = dayMap.get(k); if (c) c.exited += 1;
    }
  }
  return {
    daily: Array.from(dayMap.entries())
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
