// Phase 6 — per-persona dashboard data loaders.
//
// The old dashboard ran one Promise.all over every query any persona
// might want and then branched on `persona` in the render. That worked
// but meant a CSR's dashboard paid for aggregates they never saw. Now
// each persona has its own loader that runs a tightly-scoped
// Promise.all over only the queries that persona's tiles need.
//
// All loaders accept `(ctx: LoaderCtx)` where ctx carries the tenant
// id, caller's userId, and the branch scoping closure — the branch
// filter logic lives in one helper so a persona view doesn't reinvent
// it per query.
//
// The shapes returned are the `*Data` types below; views consume them
// as props. That keeps the view components dumb (all formatting stays
// in the view) while the queries stay testable in isolation.

import { db } from "@/lib/db";
import { ACTIVE_PIPELINE_STAGES } from "@/lib/crm";
import { ACTIVE_ORDER_STATUSES } from "@/lib/orders";
import { OPEN_INVOICE_STATUSES } from "@/lib/invoices";
import { OPEN_INSTALL_STATUSES, startOfWeekMonday, addDays } from "@/lib/installs";
import { applyBranchScope } from "@/lib/locations";
import type { Prisma } from "@prisma/client";

export type LoaderCtx = {
  tenantId: string;
  userId: string;
  branchScope: string[] | null;
  /** Explicit single-branch filter chosen via ?branch= query string. */
  branchFilter: string | null;
};

/**
 * Apply both the caller's branch scope (security) and the optional
 * branch filter (UX toggle). Every persona loader uses this so we
 * never accidentally skip the RBAC scope.
 */
function scope<T extends { AND?: unknown }>(where: T, ctx: LoaderCtx): T {
  const out = applyBranchScope(where, ctx.branchScope);
  if (ctx.branchFilter) {
    (out as { locationId?: string }).locationId = ctx.branchFilter;
  }
  return out;
}

// ────────────────────────────────────────────────────────────
// Shapes returned by the loaders.
// ────────────────────────────────────────────────────────────

export type ExecutiveData = {
  activeLeads: number;
  wonCount: number;
  wonLast30: number;
  pipelineValue: number;
  activeOrders: number;
  backlog: number;
  wipOrders: number;
  openInvoices: number;
  overdueInvoices: number;
  outstanding: number;
  paidLast30: number;
  installsThisWeek: number;
};

export type SalesData = {
  myActiveLeads: number;
  myQuotesPending: number;
  myQuotesAccepted30: number;
  myWon30: number;
  myOpenTasks: number;
  teamActiveLeads: number;
  teamPipelineValue: number;
  followUpsDue: number;
};

export type CsrData = {
  proofsAwaitingResponse: number;
  installsToConfirm: number;
  openCustomerTasks: number;
  myOpenTasks: number;
  newLeadsLast7: number;
  quotesSentLast7: number;
};

export type DesignerData = {
  myProofsDraft: number;
  myProofsAwaiting: number;
  myProofsRevisions: number;
  teamProofsAwaiting: number;
  myOpenTasks: number;
  approvedLast7: number;
};

export type ProductionData = {
  wipOrders: number;
  activeOrders: number;
  overdueOrders: number;
  proofsAwaitingResponse: number;
  installsThisWeek: number;
  unconfirmedInstalls: number;
  myOpenTasks: number;
};

export type InstallerData = {
  myInstallsThisWeek: number;
  myInstallsToday: number;
  myUnconfirmedInstalls: number;
  myUpcomingInstalls: number;
  myOpenTasks: number;
};

export type FinanceData = {
  openInvoices: number;
  outstanding: number;
  overdueInvoices: number;
  overdueAmount: number;
  paidLast30: number;
  draftInvoices: number;
  backlog: number;
  paymentsLast7: number;
};

export type EmployeeData = {
  myOpenTasks: number;
  myCompletedThisWeek: number;
  activeOrders: number;
};

// ────────────────────────────────────────────────────────────
// Loaders.
// ────────────────────────────────────────────────────────────

export async function loadExecutiveData(ctx: LoaderCtx): Promise<ExecutiveData> {
  const now = new Date();
  const weekStart = startOfWeekMonday(now);
  const weekEnd = addDays(weekStart, 7);
  const last30Start = addDays(now, -30);

  const [
    activeLeads,
    wonCount,
    wonLast30,
    pipelineAgg,
    activeOrders,
    backlogAgg,
    wipOrders,
    openInvoices,
    overdueInvoices,
    arAgg,
    paidLast30Agg,
    installsThisWeek,
  ] = await Promise.all([
    db.customer.count({
      where: scope({ tenantId: ctx.tenantId, status: "ACTIVE", stage: { in: ACTIVE_PIPELINE_STAGES } } as Prisma.CustomerWhereInput, ctx),
    }),
    db.customer.count({
      where: scope({ tenantId: ctx.tenantId, status: "ACTIVE", stage: "WON" } as Prisma.CustomerWhereInput, ctx),
    }),
    db.customer.count({
      where: scope({ tenantId: ctx.tenantId, stage: "WON", updatedAt: { gte: last30Start } } as Prisma.CustomerWhereInput, ctx),
    }),
    db.customer.aggregate({
      where: scope({ tenantId: ctx.tenantId, status: "ACTIVE", stage: { in: ACTIVE_PIPELINE_STAGES } } as Prisma.CustomerWhereInput, ctx),
      _sum: { estimatedValue: true },
    }),
    db.order.count({
      where: scope({ tenantId: ctx.tenantId, status: { in: ACTIVE_ORDER_STATUSES } } as Prisma.OrderWhereInput, ctx),
    }),
    db.order.aggregate({
      where: scope({ tenantId: ctx.tenantId, status: { in: ACTIVE_ORDER_STATUSES } } as Prisma.OrderWhereInput, ctx),
      _sum: { total: true },
    }),
    db.order.count({
      where: scope({ tenantId: ctx.tenantId, status: { in: ["IN_PRODUCTION", "READY"] } } as Prisma.OrderWhereInput, ctx),
    }),
    db.invoice.count({
      where: scope({ tenantId: ctx.tenantId, status: { in: OPEN_INVOICE_STATUSES } } as Prisma.InvoiceWhereInput, ctx),
    }),
    db.invoice.count({
      where: scope({ tenantId: ctx.tenantId, status: "OVERDUE" } as Prisma.InvoiceWhereInput, ctx),
    }),
    db.invoice.aggregate({
      where: scope({ tenantId: ctx.tenantId, status: { in: OPEN_INVOICE_STATUSES } } as Prisma.InvoiceWhereInput, ctx),
      _sum: { total: true, amountPaid: true },
    }),
    db.invoice.aggregate({
      where: scope({ tenantId: ctx.tenantId, status: "PAID", paidAt: { gte: last30Start } } as Prisma.InvoiceWhereInput, ctx),
      _sum: { total: true },
    }),
    db.installEvent.count({
      where: scope({
        tenantId: ctx.tenantId,
        status: { in: OPEN_INSTALL_STATUSES },
        scheduledStart: { gte: weekStart, lt: weekEnd },
      } as Prisma.InstallEventWhereInput, ctx),
    }),
  ]);

  return {
    activeLeads,
    wonCount,
    wonLast30,
    pipelineValue: Number(pipelineAgg._sum.estimatedValue ?? 0),
    activeOrders,
    backlog: Number(backlogAgg._sum.total ?? 0),
    wipOrders,
    openInvoices,
    overdueInvoices,
    outstanding: Math.max(0, Number(arAgg._sum.total ?? 0) - Number(arAgg._sum.amountPaid ?? 0)),
    paidLast30: Number(paidLast30Agg._sum.total ?? 0),
    installsThisWeek,
  };
}

export async function loadSalesData(ctx: LoaderCtx): Promise<SalesData> {
  const now = new Date();
  const last7Start = addDays(now, -7);
  const last30Start = addDays(now, -30);

  const [
    myActiveLeads,
    myQuotesPending,
    myQuotesAccepted30,
    myWon30,
    myOpenTasks,
    teamActiveLeads,
    teamPipelineAgg,
    followUpsDue,
  ] = await Promise.all([
    db.customer.count({
      where: scope({
        tenantId: ctx.tenantId,
        ownerId: ctx.userId,
        status: "ACTIVE",
        stage: { in: ACTIVE_PIPELINE_STAGES },
      } as Prisma.CustomerWhereInput, ctx),
    }),
    db.quote.count({
      where: { tenantId: ctx.tenantId, createdBy: ctx.userId, status: { in: ["SENT", "VIEWED"] } },
    }),
    db.quote.count({
      where: {
        tenantId: ctx.tenantId,
        createdBy: ctx.userId,
        status: "APPROVED",
        updatedAt: { gte: last30Start },
      },
    }),
    db.customer.count({
      where: scope({
        tenantId: ctx.tenantId,
        ownerId: ctx.userId,
        stage: "WON",
        updatedAt: { gte: last30Start },
      } as Prisma.CustomerWhereInput, ctx),
    }),
    db.task.count({
      where: { tenantId: ctx.tenantId, assignedTo: ctx.userId, completedAt: null },
    }),
    db.customer.count({
      where: scope({
        tenantId: ctx.tenantId,
        status: "ACTIVE",
        stage: { in: ACTIVE_PIPELINE_STAGES },
      } as Prisma.CustomerWhereInput, ctx),
    }),
    db.customer.aggregate({
      where: scope({
        tenantId: ctx.tenantId,
        status: "ACTIVE",
        stage: { in: ACTIVE_PIPELINE_STAGES },
      } as Prisma.CustomerWhereInput, ctx),
      _sum: { estimatedValue: true },
    }),
    db.task.count({
      where: {
        tenantId: ctx.tenantId,
        assignedTo: ctx.userId,
        completedAt: null,
        dueDate: { gte: last7Start, lt: addDays(now, 7) },
      },
    }),
  ]);

  return {
    myActiveLeads,
    myQuotesPending,
    myQuotesAccepted30,
    myWon30,
    myOpenTasks,
    teamActiveLeads,
    teamPipelineValue: Number(teamPipelineAgg._sum.estimatedValue ?? 0),
    followUpsDue,
  };
}

export async function loadCsrData(ctx: LoaderCtx): Promise<CsrData> {
  const now = new Date();
  const last7Start = addDays(now, -7);
  const weekStart = startOfWeekMonday(now);
  const weekEnd = addDays(weekStart, 7);

  const [
    proofsAwaitingResponse,
    installsToConfirm,
    openCustomerTasks,
    myOpenTasks,
    newLeadsLast7,
    quotesSentLast7,
  ] = await Promise.all([
    db.proof.count({
      where: {
        tenantId: ctx.tenantId,
        status: "SENT",
        respondedAt: null,
      },
    }),
    db.installEvent.count({
      where: scope({
        tenantId: ctx.tenantId,
        status: "SCHEDULED",
        scheduledStart: { gte: weekStart, lt: weekEnd },
      } as Prisma.InstallEventWhereInput, ctx),
    }),
    db.task.count({
      where: { tenantId: ctx.tenantId, completedAt: null, customerId: { not: null } },
    }),
    db.task.count({
      where: { tenantId: ctx.tenantId, assignedTo: ctx.userId, completedAt: null },
    }),
    db.customer.count({
      where: scope({
        tenantId: ctx.tenantId,
        stage: "NEW_LEAD",
        createdAt: { gte: last7Start },
      } as Prisma.CustomerWhereInput, ctx),
    }),
    db.quote.count({
      where: {
        tenantId: ctx.tenantId,
        status: { in: ["SENT", "VIEWED"] },
        sentAt: { gte: last7Start },
      },
    }),
  ]);

  return {
    proofsAwaitingResponse,
    installsToConfirm,
    openCustomerTasks,
    myOpenTasks,
    newLeadsLast7,
    quotesSentLast7,
  };
}

export async function loadDesignerData(ctx: LoaderCtx): Promise<DesignerData> {
  const now = new Date();
  const last7Start = addDays(now, -7);

  const [
    myProofsDraft,
    myProofsAwaiting,
    myProofsRevisions,
    teamProofsAwaiting,
    myOpenTasks,
    approvedLast7,
  ] = await Promise.all([
    db.proof.count({
      where: { tenantId: ctx.tenantId, createdBy: ctx.userId, status: "DRAFT" },
    }),
    db.proof.count({
      where: {
        tenantId: ctx.tenantId,
        createdBy: ctx.userId,
        status: "SENT",
        respondedAt: null,
      },
    }),
    db.proof.count({
      where: { tenantId: ctx.tenantId, createdBy: ctx.userId, status: "CHANGES_REQUESTED" },
    }),
    db.proof.count({
      where: { tenantId: ctx.tenantId, status: "SENT", respondedAt: null },
    }),
    db.task.count({
      where: { tenantId: ctx.tenantId, assignedTo: ctx.userId, completedAt: null },
    }),
    db.proof.count({
      where: {
        tenantId: ctx.tenantId,
        createdBy: ctx.userId,
        status: "APPROVED",
        respondedAt: { gte: last7Start },
      },
    }),
  ]);

  return {
    myProofsDraft,
    myProofsAwaiting,
    myProofsRevisions,
    teamProofsAwaiting,
    myOpenTasks,
    approvedLast7,
  };
}

export async function loadProductionData(ctx: LoaderCtx): Promise<ProductionData> {
  const now = new Date();
  const weekStart = startOfWeekMonday(now);
  const weekEnd = addDays(weekStart, 7);

  const [
    wipOrders,
    activeOrders,
    overdueOrders,
    proofsAwaitingResponse,
    installsThisWeek,
    unconfirmedInstalls,
    myOpenTasks,
  ] = await Promise.all([
    db.order.count({
      where: scope({
        tenantId: ctx.tenantId,
        status: { in: ["IN_PRODUCTION", "READY"] },
      } as Prisma.OrderWhereInput, ctx),
    }),
    db.order.count({
      where: scope({
        tenantId: ctx.tenantId,
        status: { in: ACTIVE_ORDER_STATUSES },
      } as Prisma.OrderWhereInput, ctx),
    }),
    db.order.count({
      where: scope({
        tenantId: ctx.tenantId,
        status: { in: ACTIVE_ORDER_STATUSES },
        dueDate: { lt: now },
      } as Prisma.OrderWhereInput, ctx),
    }),
    db.proof.count({
      where: { tenantId: ctx.tenantId, status: "SENT", respondedAt: null },
    }),
    db.installEvent.count({
      where: scope({
        tenantId: ctx.tenantId,
        status: { in: OPEN_INSTALL_STATUSES },
        scheduledStart: { gte: weekStart, lt: weekEnd },
      } as Prisma.InstallEventWhereInput, ctx),
    }),
    db.installEvent.count({
      where: scope({
        tenantId: ctx.tenantId,
        status: "SCHEDULED",
      } as Prisma.InstallEventWhereInput, ctx),
    }),
    db.task.count({
      where: { tenantId: ctx.tenantId, assignedTo: ctx.userId, completedAt: null },
    }),
  ]);

  return {
    wipOrders,
    activeOrders,
    overdueOrders,
    proofsAwaitingResponse,
    installsThisWeek,
    unconfirmedInstalls,
    myOpenTasks,
  };
}

export async function loadInstallerData(ctx: LoaderCtx): Promise<InstallerData> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = addDays(todayStart, 1);
  const weekStart = startOfWeekMonday(now);
  const weekEnd = addDays(weekStart, 7);
  const upcomingEnd = addDays(now, 14);

  const [
    myInstallsThisWeek,
    myInstallsToday,
    myUnconfirmedInstalls,
    myUpcomingInstalls,
    myOpenTasks,
  ] = await Promise.all([
    db.installEvent.count({
      where: scope({
        tenantId: ctx.tenantId,
        installerId: ctx.userId,
        status: { in: OPEN_INSTALL_STATUSES },
        scheduledStart: { gte: weekStart, lt: weekEnd },
      } as Prisma.InstallEventWhereInput, ctx),
    }),
    db.installEvent.count({
      where: scope({
        tenantId: ctx.tenantId,
        installerId: ctx.userId,
        status: { in: OPEN_INSTALL_STATUSES },
        scheduledStart: { gte: todayStart, lt: todayEnd },
      } as Prisma.InstallEventWhereInput, ctx),
    }),
    db.installEvent.count({
      where: scope({
        tenantId: ctx.tenantId,
        installerId: ctx.userId,
        status: "SCHEDULED",
        scheduledStart: { gte: now },
      } as Prisma.InstallEventWhereInput, ctx),
    }),
    db.installEvent.count({
      where: scope({
        tenantId: ctx.tenantId,
        installerId: ctx.userId,
        status: { in: OPEN_INSTALL_STATUSES },
        scheduledStart: { gte: now, lt: upcomingEnd },
      } as Prisma.InstallEventWhereInput, ctx),
    }),
    db.task.count({
      where: { tenantId: ctx.tenantId, assignedTo: ctx.userId, completedAt: null },
    }),
  ]);

  return {
    myInstallsThisWeek,
    myInstallsToday,
    myUnconfirmedInstalls,
    myUpcomingInstalls,
    myOpenTasks,
  };
}

export async function loadFinanceData(ctx: LoaderCtx): Promise<FinanceData> {
  const now = new Date();
  const last7Start = addDays(now, -7);
  const last30Start = addDays(now, -30);

  const [
    openInvoices,
    arAgg,
    overdueInvoices,
    overdueAgg,
    paidLast30Agg,
    draftInvoices,
    backlogAgg,
    paymentsLast7,
  ] = await Promise.all([
    db.invoice.count({
      where: scope({ tenantId: ctx.tenantId, status: { in: OPEN_INVOICE_STATUSES } } as Prisma.InvoiceWhereInput, ctx),
    }),
    db.invoice.aggregate({
      where: scope({ tenantId: ctx.tenantId, status: { in: OPEN_INVOICE_STATUSES } } as Prisma.InvoiceWhereInput, ctx),
      _sum: { total: true, amountPaid: true },
    }),
    db.invoice.count({
      where: scope({ tenantId: ctx.tenantId, status: "OVERDUE" } as Prisma.InvoiceWhereInput, ctx),
    }),
    db.invoice.aggregate({
      where: scope({ tenantId: ctx.tenantId, status: "OVERDUE" } as Prisma.InvoiceWhereInput, ctx),
      _sum: { total: true, amountPaid: true },
    }),
    db.invoice.aggregate({
      where: scope({ tenantId: ctx.tenantId, status: "PAID", paidAt: { gte: last30Start } } as Prisma.InvoiceWhereInput, ctx),
      _sum: { total: true },
    }),
    db.invoice.count({
      where: scope({ tenantId: ctx.tenantId, status: "DRAFT" } as Prisma.InvoiceWhereInput, ctx),
    }),
    db.order.aggregate({
      where: scope({ tenantId: ctx.tenantId, status: { in: ACTIVE_ORDER_STATUSES } } as Prisma.OrderWhereInput, ctx),
      _sum: { total: true },
    }),
    db.payment.count({
      where: { tenantId: ctx.tenantId, receivedAt: { gte: last7Start } },
    }),
  ]);

  return {
    openInvoices,
    outstanding: Math.max(0, Number(arAgg._sum.total ?? 0) - Number(arAgg._sum.amountPaid ?? 0)),
    overdueInvoices,
    overdueAmount: Math.max(0, Number(overdueAgg._sum.total ?? 0) - Number(overdueAgg._sum.amountPaid ?? 0)),
    paidLast30: Number(paidLast30Agg._sum.total ?? 0),
    draftInvoices,
    backlog: Number(backlogAgg._sum.total ?? 0),
    paymentsLast7,
  };
}

export async function loadEmployeeData(ctx: LoaderCtx): Promise<EmployeeData> {
  const now = new Date();
  const weekStart = startOfWeekMonday(now);
  const weekEnd = addDays(weekStart, 7);

  const [myOpenTasks, myCompletedThisWeek, activeOrders] = await Promise.all([
    db.task.count({
      where: { tenantId: ctx.tenantId, assignedTo: ctx.userId, completedAt: null },
    }),
    db.task.count({
      where: {
        tenantId: ctx.tenantId,
        assignedTo: ctx.userId,
        completedAt: { gte: weekStart, lt: weekEnd },
      },
    }),
    db.order.count({
      where: scope({ tenantId: ctx.tenantId, status: { in: ACTIVE_ORDER_STATUSES } } as Prisma.OrderWhereInput, ctx),
    }),
  ]);

  return { myOpenTasks, myCompletedThisWeek, activeOrders };
}
