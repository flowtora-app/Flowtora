// Page 57 — Background Jobs / Queues data layer.

import { db } from "@/lib/db";
import type {
  QueueBackend,
  QueueStatus,
  QueueWorkerStatus,
  QueueJobStatus,
  CronScheduleStatus,
} from "@prisma/client";

const DAY = 86_400_000;

/* ── Labels & tone palettes ────────────────────────────── */

export const BACKEND_LABEL: Record<QueueBackend, string> = {
  BULLMQ:      "BullMQ",
  SQS:         "AWS SQS",
  CLOUD_TASKS: "GCP Cloud Tasks",
  REDIS_QUEUE: "Redis queue",
  KAFKA:       "Kafka",
  OTHER:       "Other",
};

export const QUEUE_STATUS_TONE: Record<
  QueueStatus,
  { bg: string; fg: string; label: string }
> = {
  ACTIVE:   { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Active" },
  PAUSED:   { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Paused" },
  DRAINING: { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Draining" },
  STOPPED:  { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Stopped" },
};

export const WORKER_STATUS_TONE: Record<
  QueueWorkerStatus,
  { bg: string; fg: string; label: string }
> = {
  RUNNING:   { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Running" },
  IDLE:      { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Idle" },
  STARTING:  { bg: "var(--violet-100)",  fg: "var(--violet-700)",  label: "Starting" },
  UPGRADING: { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Upgrading" },
  STOPPED:   { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Stopped" },
  CRASHED:   { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Crashed" },
};

export const JOB_STATUS_TONE: Record<
  QueueJobStatus,
  { bg: string; fg: string; label: string }
> = {
  WAITING:     { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Waiting" },
  ACTIVE:      { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Active" },
  COMPLETED:   { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Completed" },
  FAILED:      { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Failed" },
  DELAYED:     { bg: "var(--violet-100)",  fg: "var(--violet-700)",  label: "Delayed" },
  DEAD_LETTER: { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Dead-letter" },
  SKIPPED:     { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Skipped" },
  RETRYING:    { bg: "var(--amber-100)",   fg: "var(--amber-700)",   label: "Retrying" },
};

export const CRON_STATUS_TONE: Record<
  CronScheduleStatus,
  { bg: string; fg: string; label: string }
> = {
  ACTIVE:      { bg: "var(--emerald-100)", fg: "var(--emerald-700)", label: "Active" },
  RUNNING_NOW: { bg: "var(--sky-100)",     fg: "var(--sky-700)",     label: "Running" },
  ERRORED:     { bg: "var(--rose-100)",    fg: "var(--rose-700)",    label: "Errored" },
  DISABLED:    { bg: "var(--surface-2)",   fg: "var(--text-muted)",  label: "Disabled" },
};

/* ── KPIs ───────────────────────────────────────────────── */

export interface QueueKpis {
  totalDepth: number;
  totalActive: number;
  throughputJpm: number;
  errorPct24h: number;
  errorTargetPct: number;
  deadLetterCount: number;
  runningWorkers: number;
  totalWorkers: number;
  totalCompleted24h: number;
  totalFailed24h: number;
}

export async function loadQueueKpis(): Promise<QueueKpis> {
  const [queueAgg, workersAgg, dlqCount] = await Promise.all([
    db.jobQueue.aggregate({
      _sum: {
        active: true, waiting: true, delayed: true,
        completed24h: true, failed24h: true, throughputJpm: true,
        deadLetters: true,
      },
    }),
    db.queueWorker.groupBy({ by: ["status"], _count: { _all: true } }),
    db.queueJob.count({ where: { status: "DEAD_LETTER" } }),
  ]);
  const completed = queueAgg._sum.completed24h ?? 0;
  const failed    = queueAgg._sum.failed24h ?? 0;
  const errorPct = completed + failed === 0 ? 0
    : Math.round((failed / (completed + failed)) * 10000) / 100;
  const workerMap = new Map<QueueWorkerStatus, number>();
  for (const w of workersAgg) workerMap.set(w.status, w._count._all);
  const running = workerMap.get("RUNNING") ?? 0;
  const total = Array.from(workerMap.values()).reduce((s, n) => s + n, 0);
  return {
    totalDepth:        (queueAgg._sum.active ?? 0) + (queueAgg._sum.waiting ?? 0) + (queueAgg._sum.delayed ?? 0),
    totalActive:       queueAgg._sum.active ?? 0,
    throughputJpm:     queueAgg._sum.throughputJpm ?? 0,
    errorPct24h:       errorPct,
    errorTargetPct:    1.0,
    deadLetterCount:   dlqCount || (queueAgg._sum.deadLetters ?? 0),
    runningWorkers:    running,
    totalWorkers:      total,
    totalCompleted24h: completed,
    totalFailed24h:    failed,
  };
}

/* ── Queues table ──────────────────────────────────────── */

export interface QueueRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  backend: QueueBackend;
  status: QueueStatus;
  concurrency: number;
  active: number;
  waiting: number;
  delayed: number;
  completed24h: number;
  failed24h: number;
  throughputJpm: number;
  avgDurationMs: number;
  p95Ms: number;
  deadLetters: number;
}

export async function loadQueues(): Promise<QueueRow[]> {
  const rows = await db.jobQueue.findMany({
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });
  return rows.map((q) => ({
    id: q.id, slug: q.slug, name: q.name, description: q.description,
    backend: q.backend, status: q.status, concurrency: q.concurrency,
    active: q.active, waiting: q.waiting, delayed: q.delayed,
    completed24h: q.completed24h, failed24h: q.failed24h,
    throughputJpm: q.throughputJpm, avgDurationMs: q.avgDurationMs, p95Ms: q.p95Ms,
    deadLetters: q.deadLetters,
  }));
}

/* ── Workers table ─────────────────────────────────────── */

export interface WorkerRow {
  id: string;
  workerId: string;
  pool: string;
  queues: string[];
  status: QueueWorkerStatus;
  lastHeartbeatAt: Date | null;
  activeJobs: number;
  memMb: number;
  cpuPct: number;
  version: string | null;
  hostname: string | null;
  pid: number | null;
}

export async function loadWorkers(): Promise<WorkerRow[]> {
  const rows = await db.queueWorker.findMany({
    orderBy: [{ status: "asc" }, { lastHeartbeatAt: "desc" }],
  });
  return rows.map((w) => ({
    id: w.id, workerId: w.workerId, pool: w.pool, queues: w.queues,
    status: w.status, lastHeartbeatAt: w.lastHeartbeatAt,
    activeJobs: w.activeJobs, memMb: w.memMb, cpuPct: w.cpuPct,
    version: w.version, hostname: w.hostname, pid: w.pid,
  }));
}

/* ── Jobs (failed / DLQ / slowest) ─────────────────────── */

export interface JobRow {
  id: string;
  externalId: string;
  queueSlug: string;
  queueName: string;
  jobName: string;
  tenantId: string | null;
  status: QueueJobStatus;
  attempts: number;
  durationMs: number | null;
  errorClass: string | null;
  errorMessage: string | null;
  payloadSummary: string | null;
  enqueuedAt: Date;
  failedAt: Date | null;
  deadLetteredAt: Date | null;
}

export interface JobFilters {
  q?: string;
  queueId?: string;
  jobName?: string;
  errorClass?: string;
  tenantId?: string;
}

export async function loadJobs(
  status: QueueJobStatus | "FAILED_OR_DEAD" | "ALL",
  filters: JobFilters,
  limit = 200,
): Promise<JobRow[]> {
  const conditions: Record<string, unknown>[] = [];
  if (status === "FAILED_OR_DEAD") conditions.push({ status: { in: ["FAILED", "DEAD_LETTER"] } });
  else if (status !== "ALL")       conditions.push({ status });
  if (filters.q) {
    conditions.push({
      OR: [
        { externalId:   { contains: filters.q, mode: "insensitive" } },
        { jobName:      { contains: filters.q, mode: "insensitive" } },
        { errorMessage: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.queueId)    conditions.push({ queueId: filters.queueId });
  if (filters.jobName)    conditions.push({ jobName: filters.jobName });
  if (filters.errorClass) conditions.push({ errorClass: filters.errorClass });
  if (filters.tenantId)   conditions.push({ tenantId: filters.tenantId });
  const where = conditions.length === 0 ? {} : { AND: conditions };
  const rows = await db.queueJob.findMany({
    where,
    orderBy: status === "FAILED_OR_DEAD"
      ? { failedAt: "desc" }
      : status === "DEAD_LETTER"
        ? { deadLetteredAt: "desc" }
        : [{ status: "asc" }, { enqueuedAt: "desc" }],
    take: limit,
    include: { queue: { select: { slug: true, name: true } } },
  });
  return rows.map((j) => ({
    id: j.id, externalId: j.externalId,
    queueSlug: j.queue.slug, queueName: j.queue.name,
    jobName: j.jobName, tenantId: j.tenantId,
    status: j.status, attempts: j.attempts, durationMs: j.durationMs,
    errorClass: j.errorClass, errorMessage: j.errorMessage, payloadSummary: j.payloadSummary,
    enqueuedAt: j.enqueuedAt, failedAt: j.failedAt, deadLetteredAt: j.deadLetteredAt,
  }));
}

export async function loadSlowestJobs(limit = 100): Promise<JobRow[]> {
  const rows = await db.queueJob.findMany({
    where: { durationMs: { not: null } },
    orderBy: { durationMs: "desc" },
    take: limit,
    include: { queue: { select: { slug: true, name: true } } },
  });
  return rows.map((j) => ({
    id: j.id, externalId: j.externalId,
    queueSlug: j.queue.slug, queueName: j.queue.name,
    jobName: j.jobName, tenantId: j.tenantId,
    status: j.status, attempts: j.attempts, durationMs: j.durationMs,
    errorClass: j.errorClass, errorMessage: j.errorMessage, payloadSummary: j.payloadSummary,
    enqueuedAt: j.enqueuedAt, failedAt: j.failedAt, deadLetteredAt: j.deadLetteredAt,
  }));
}

/* ── Cron schedules ────────────────────────────────────── */

export interface CronRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  expression: string;
  ownerEmail: string | null;
  timezone: string;
  status: CronScheduleStatus;
  enabled: boolean;
  lastRunAt: Date | null;
  nextRunAt: Date | null;
  lastDurationMs: number | null;
  lastResult: string | null;
  queueSlug: string | null;
  queueName: string | null;
}

export async function loadCronSchedules(): Promise<CronRow[]> {
  const rows = await db.cronSchedule.findMany({
    orderBy: [{ enabled: "desc" }, { nextRunAt: "asc" }],
    include: { queue: { select: { slug: true, name: true } } },
  });
  return rows.map((c) => ({
    id: c.id, slug: c.slug, name: c.name, description: c.description,
    expression: c.expression, ownerEmail: c.ownerEmail, timezone: c.timezone,
    status: c.status, enabled: c.enabled,
    lastRunAt: c.lastRunAt, nextRunAt: c.nextRunAt, lastDurationMs: c.lastDurationMs,
    lastResult: c.lastResult,
    queueSlug: c.queue?.slug ?? null, queueName: c.queue?.name ?? null,
  }));
}

/* ── Helpers ───────────────────────────────────────────── */

export function relativeFromNow(d: Date | null | undefined): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const future = ms < 0;
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  const fmt = (s: string) => future ? `in ${s}` : `${s} ago`;
  if (mins < 1)  return future ? "soon" : "just now";
  if (mins < 60) return fmt(`${mins}m`);
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return fmt(`${hrs}h`);
  const days = Math.round(hrs / 24);
  if (days < 30) return fmt(`${days}d`);
  const months = Math.round(days / 30);
  return fmt(`${months}mo`);
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(2)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.round((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}

export function shortDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/* ── Aggregate page loader ──────────────────────────────── */

export async function loadQueuesPage(jobsFilters: JobFilters) {
  const [kpis, queues, workers, failed, dlq, schedules, slowest] = await Promise.all([
    loadQueueKpis(),
    loadQueues(),
    loadWorkers(),
    loadJobs("FAILED_OR_DEAD", jobsFilters, 200),
    loadJobs("DEAD_LETTER",   jobsFilters, 200),
    loadCronSchedules(),
    loadSlowestJobs(100),
  ]);
  return { kpis, queues, workers, failed, dlq, schedules, slowest };
}
