import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";

// Equipment (T-8).
//
// Production-floor equipment registry: printers, cutters, presses,
// embroidery, CNC. Tracks model, status (running / idle / maintenance
// / down), assigned operator, current job, and maintenance schedule.
//
// Schema doesn't exist yet - this is a premium scaffold using
// representative example rows so the visual direction is reviewable.
// Real backend wires up when the Equipment model lands.

export const dynamic = "force-dynamic";

type EquipmentStatus = "RUNNING" | "IDLE" | "MAINTENANCE" | "DOWN";

const STATUS_META: Record<
  EquipmentStatus,
  { label: string; tone: string }
> = {
  RUNNING:     { label: "Running",     tone: "#10b981" },
  IDLE:        { label: "Idle",        tone: "#6b7280" },
  MAINTENANCE: { label: "Maintenance", tone: "#f59e0b" },
  DOWN:        { label: "Down",        tone: "#ef4444" },
};

type ExampleEquipment = {
  id: string;
  name: string;
  kind: string;
  model: string;
  status: EquipmentStatus;
  operator: string | null;
  currentJob: string | null;
  utilization: number; // % of last 7 days
  nextService: string | null;
};

const EXAMPLES: ExampleEquipment[] = [
  {
    id: "ex-1",
    name: "Roland #1",
    kind: "Large-format printer",
    model: "Roland TrueVIS VG2-640",
    status: "RUNNING",
    operator: "Sarah J.",
    currentJob: "O-1042 · Storefront sign",
    utilization: 78,
    nextService: "in 12 days",
  },
  {
    id: "ex-2",
    name: "Mimaki",
    kind: "Eco-solvent printer",
    model: "Mimaki JV300-160",
    status: "IDLE",
    operator: null,
    currentJob: null,
    utilization: 62,
    nextService: "in 28 days",
  },
  {
    id: "ex-3",
    name: "Graphtec FC",
    kind: "Vinyl cutter",
    model: "Graphtec FC9000-100",
    status: "RUNNING",
    operator: "Tom K.",
    currentJob: "O-1041 · Vehicle decals",
    utilization: 84,
    nextService: "in 6 days",
  },
  {
    id: "ex-4",
    name: "Heidelberg",
    kind: "Offset press",
    model: "Heidelberg Speedmaster 52",
    status: "MAINTENANCE",
    operator: null,
    currentJob: null,
    utilization: 41,
    nextService: "Today (in progress)",
  },
  {
    id: "ex-5",
    name: "Brother PR1050X",
    kind: "Embroidery",
    model: "Brother PR1050X 10-needle",
    status: "RUNNING",
    operator: "Maya R.",
    currentJob: "O-1038 · Polo shirts ×24",
    utilization: 71,
    nextService: "in 19 days",
  },
  {
    id: "ex-6",
    name: "ShopBot CNC",
    kind: "CNC router",
    model: "ShopBot PRSstandard 96x60",
    status: "DOWN",
    operator: null,
    currentJob: null,
    utilization: 12,
    nextService: "Awaiting bit replacement",
  },
];

export default async function EquipmentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requirePermission(slug, "customers:view");

  // Pull live equipment for this tenant. Falls back to example rows
  // when the shop hasn't added anything yet, so the page is never
  // empty and the visual direction stays reviewable.
  const liveRows = await db.equipment.findMany({
    where: { tenantId: ctx.tenant.id, archivedAt: null },
    orderBy: [{ status: "asc" }, { name: "asc" }],
    include: {
      operator:     { select: { name: true, email: true } },
      currentOrder: { select: { number: true } },
    },
    take: 60,
  });

  const usingPreview = liveRows.length === 0;
  const now = Date.now();

  const items: ExampleEquipment[] = usingPreview
    ? EXAMPLES
    : liveRows.map((e) => {
        const utilization = 0; // Real utilization metric ships when stage events are aggregated.
        const nextService = e.nextServiceDueAt
          ? relativeFromNow(e.nextServiceDueAt.getTime() - now)
          : null;
        return {
          id: e.id,
          name: e.name,
          kind: e.kind,
          model: e.model ?? "—",
          status: e.status as EquipmentStatus,
          operator: e.operator?.name ?? e.operator?.email?.split("@")[0] ?? null,
          currentJob: e.currentOrder ? `${e.currentOrder.number}` : null,
          utilization,
          nextService,
        };
      });

  const counts: Record<EquipmentStatus, number> = {
    RUNNING: 0, IDLE: 0, MAINTENANCE: 0, DOWN: 0,
  };
  for (const e of items) counts[e.status]++;

  return (
    <div className="space-y-5">
      {/* Page header. */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "18px 22px",
          background:
            "radial-gradient(880px circle at -10% -50%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1
                className="font-semibold"
                style={{
                  color: "var(--text-default)",
                  fontSize: 24,
                  letterSpacing: "-0.02em",
                  lineHeight: 1.15,
                }}
              >
                Equipment
              </h1>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  color: "var(--accent-primary)",
                  background: "var(--accent-surface)",
                  border:
                    "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
                  padding: "3px 8px",
                  borderRadius: 999,
                  fontFeatureSettings: "'tnum' 1",
                  lineHeight: 1,
                }}
              >
                {items.length}
              </span>
              {usingPreview && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    color: "var(--amber-500)",
                    background:
                      "color-mix(in oklab, var(--amber-500) 14%, transparent)",
                    border:
                      "1px solid color-mix(in oklab, var(--amber-500) 30%, transparent)",
                    padding: "3px 8px",
                    borderRadius: 999,
                    lineHeight: 1,
                  }}
                >
                  Preview
                </span>
              )}
            </div>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              Printers, cutters, presses, embroidery, CNC — track utilization, assigned operator, and maintenance.
            </p>
          </div>
          <Link
            href={`/t/${slug}/equipment/new`}
            className="ts-focus inline-flex items-center gap-1.5 rounded-lg font-semibold transition-transform"
            style={{
              height: 32,
              padding: "0 14px",
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
              color: "var(--accent-fg)",
              border:
                "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
              boxShadow:
                "0 1px 0 0 rgba(255,255,255,0.15) inset, " +
                "0 1px 2px 0 rgba(0,0,0,0.35)",
              fontSize: 12.5,
              letterSpacing: "-0.005em",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add equipment
          </Link>
        </div>
      </div>

      {/* Status KPI strip. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.keys(STATUS_META) as EquipmentStatus[]).map((s) => (
          <div
            key={s}
            className="relative overflow-hidden rounded-xl"
            style={{
              padding: "16px 18px",
              background:
                `radial-gradient(420px circle at 100% -20%, color-mix(in oklab, ${STATUS_META[s].tone} 14%, transparent), transparent 55%), ` +
                "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
              border: "1px solid var(--border-subtle)",
              boxShadow:
                "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
                "0 1px 2px 0 rgba(0,0,0,0.18)",
            }}
          >
            <div className="flex items-center gap-1.5">
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: STATUS_META[s].tone,
                  boxShadow: `0 0 0 2px color-mix(in oklab, ${STATUS_META[s].tone} 25%, transparent)`,
                }}
              />
              <span
                style={{
                  color: STATUS_META[s].tone,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {STATUS_META[s].label}
              </span>
            </div>
            <div
              className="mt-2"
              style={{
                color: "var(--text-default)",
                fontSize: 24,
                fontWeight: 600,
                letterSpacing: "-0.018em",
                lineHeight: 1.1,
                fontFeatureSettings: "'tnum' 1",
              }}
            >
              {counts[s]}
            </div>
          </div>
        ))}
      </div>

      {/* Equipment grid. */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((e) => (
          <EquipmentCard key={e.id} item={e} />
        ))}
      </div>

      {/* "Coming soon" footnote — only shown in preview mode. */}
      {usingPreview && <div
        className="rounded-xl px-4 py-3"
        style={{
          background:
            "radial-gradient(540px circle at 0% 0%, var(--accent-surface), transparent 55%), " +
            "color-mix(in oklab, var(--surface-1) 80%, transparent)",
          border:
            "1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent)",
          fontSize: 12.5,
          lineHeight: 1.45,
          color: "var(--text-muted)",
        }}
      >
        <div className="flex items-start gap-2.5">
          <span
            aria-hidden
            style={{
              flexShrink: 0,
              width: 18,
              height: 18,
              borderRadius: 5,
              background: "var(--accent-surface)",
              color: "var(--accent-primary)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: 11,
              border:
                "1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)",
              marginTop: 1,
            }}
          >
            i
          </span>
          <div>
            <span style={{ color: "var(--text-default)", fontWeight: 600 }}>
              Preview data shown.
            </span>{" "}
            Your shop hasn&apos;t added any equipment yet. Cards above demonstrate the surface — click <strong style={{ color: "var(--text-default)" }}>Add equipment</strong> to register your first machine.
          </div>
        </div>
      </div>}
    </div>
  );
}

/** Format a duration (ms) as a relative-from-now string. */
function relativeFromNow(ms: number): string {
  const days = Math.round(ms / 86_400_000);
  if (ms < 0) return Math.abs(days) <= 1 ? "Overdue" : `${Math.abs(days)} days overdue`;
  if (days < 1)  return "Today";
  if (days < 2)  return "Tomorrow";
  if (days < 30) return `in ${days} days`;
  const months = Math.round(days / 30);
  return `in ${months} month${months === 1 ? "" : "s"}`;
}

function EquipmentCard({ item }: { item: ExampleEquipment }) {
  const status = STATUS_META[item.status];
  return (
    <div
      className="relative overflow-hidden rounded-xl"
      style={{
        padding: "18px 20px",
        background:
          "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
        border: "1px solid var(--border-subtle)",
        boxShadow:
          "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
          "0 1px 2px 0 rgba(0,0,0,0.18)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 10,
              background:
                "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
              color: "var(--accent-primary)",
              border:
                "1px solid color-mix(in oklab, var(--accent-primary) 22%, transparent)",
              flexShrink: 0,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="6" width="18" height="13" rx="2" />
              <path d="M8 6v-2M16 6v-2M6 19v2M18 19v2M3 11h18" />
            </svg>
          </span>
          <div className="min-w-0">
            <div
              style={{
                color: "var(--text-default)",
                fontSize: 14.5,
                fontWeight: 600,
                letterSpacing: "-0.005em",
                lineHeight: 1.25,
              }}
            >
              {item.name}
            </div>
            <div
              className="mt-0.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 11.5,
                lineHeight: 1.4,
              }}
            >
              {item.kind}
            </div>
          </div>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: status.tone,
            background: `color-mix(in oklab, ${status.tone} 16%, transparent)`,
            border: `1px solid color-mix(in oklab, ${status.tone} 30%, transparent)`,
            padding: "2px 7px",
            borderRadius: 999,
            lineHeight: 1,
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 4,
              height: 4,
              borderRadius: 999,
              background: status.tone,
              boxShadow: `0 0 0 1.5px color-mix(in oklab, ${status.tone} 25%, transparent)`,
            }}
          />
          {status.label}
        </span>
      </div>

      <div
        className="mt-4"
        style={{
          color: "var(--text-faint)",
          fontSize: 10.5,
          fontFeatureSettings: "'tnum' 1",
        }}
      >
        {item.model}
      </div>

      {/* Current assignment. */}
      <div
        className="mt-3 rounded-lg px-3 py-2.5"
        style={{
          background: "color-mix(in oklab, var(--surface-2) 50%, transparent)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {item.currentJob ? (
          <>
            <div
              style={{
                color: "var(--text-faint)",
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Now running
            </div>
            <div
              className="mt-1"
              style={{
                color: "var(--text-default)",
                fontSize: 12.5,
                fontWeight: 500,
                letterSpacing: "-0.005em",
              }}
            >
              {item.currentJob}
            </div>
            {item.operator && (
              <div
                className="mt-1"
                style={{ color: "var(--text-muted)", fontSize: 11 }}
              >
                Operator{" "}
                <span style={{ color: "var(--text-default)", fontWeight: 500 }}>
                  {item.operator}
                </span>
              </div>
            )}
          </>
        ) : (
          <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
            No active job
          </span>
        )}
      </div>

      {/* Utilization. */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-1.5">
          <span
            style={{
              color: "var(--text-muted)",
              fontSize: 10.5,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Utilization (7d)
          </span>
          <span
            style={{
              color: "var(--text-default)",
              fontSize: 11.5,
              fontWeight: 700,
              fontFeatureSettings: "'tnum' 1",
            }}
          >
            {item.utilization}%
          </span>
        </div>
        <div
          style={{
            position: "relative",
            height: 5,
            borderRadius: 999,
            background: "color-mix(in oklab, var(--surface-2) 70%, transparent)",
            border: "1px solid var(--border-subtle)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${item.utilization}%`,
              background: `linear-gradient(90deg, ${status.tone}, color-mix(in oklab, ${status.tone} 70%, white 30%))`,
              borderRadius: 999,
            }}
          />
        </div>
      </div>

      {item.nextService && (
        <div
          className="mt-3"
          style={{
            color: "var(--text-muted)",
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          Next service{" "}
          <span style={{ color: "var(--text-default)", fontWeight: 500 }}>
            {item.nextService}
          </span>
        </div>
      )}
    </div>
  );
}
