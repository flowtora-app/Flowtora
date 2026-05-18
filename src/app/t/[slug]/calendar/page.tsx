import Link from "next/link";
import { requirePermission } from "@/lib/tenant";

// Production calendar (T-7).
//
// Job-scheduling calendar - week view with day columns + production
// chips per job. Drag-drop reassignment + conflict detection ship in
// a future update.

export const dynamic = "force-dynamic";

type ExampleChip = {
  id: string;
  title: string;
  customer: string;
  size: string;
  due: string;
  status: "production" | "ready" | "hold" | "delivered";
  startHour: number; // 8-18 24h
  durationH: number;
};

const STATUS_TONE: Record<ExampleChip["status"], string> = {
  production: "#7c3aed",
  ready:      "#10b981",
  hold:       "#f59e0b",
  delivered:  "#06b6d4",
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const EXAMPLES: Record<number, ExampleChip[]> = {
  0: [
    { id: "j1", title: "O-1042 · Storefront sign", customer: "Bright Coffee", size: "12'×4'",  due: "Today", status: "production", startHour: 9,  durationH: 4 },
    { id: "j2", title: "O-1038 · Polo shirts ×24", customer: "Acme Corp",     size: "—",       due: "Today", status: "production", startHour: 13, durationH: 3 },
  ],
  1: [
    { id: "j3", title: "O-1041 · Vehicle decals",  customer: "Hayden Roofing", size: "set",     due: "Tue",  status: "production", startHour: 8,  durationH: 6 },
  ],
  2: [
    { id: "j4", title: "O-1044 · Yard signs ×50",  customer: "Greene Realty",  size: "18×24",   due: "Wed",  status: "hold",       startHour: 10, durationH: 4 },
    { id: "j5", title: "O-1040 · Business cards",  customer: "Bright Coffee",  size: "500 ea",  due: "Wed",  status: "ready",      startHour: 14, durationH: 2 },
  ],
  3: [
    { id: "j6", title: "O-1045 · Banner",          customer: "Crossfit Park",  size: "3'×8'",   due: "Thu",  status: "production", startHour: 9,  durationH: 5 },
  ],
  4: [
    { id: "j7", title: "O-1039 · Embroidered hats",customer: "Field Trip Co.", size: "×36",     due: "Fri",  status: "production", startHour: 9,  durationH: 4 },
    { id: "j8", title: "O-1043 · Coroplast signs", customer: "Open House Tour",size: "24×18",   due: "Fri",  status: "ready",      startHour: 14, durationH: 3 },
  ],
  5: [],
};

export default async function ProductionCalendarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requirePermission(slug, "customers:view");

  const totalJobs = Object.values(EXAMPLES).flat().length;

  return (
    <div className="space-y-5">
      {/* Header. */}
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
                Production calendar
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
                {totalJobs}
              </span>
              <span
                style={{
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
            </div>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              This week&apos;s production schedule. Drag-drop reassignment and conflict detection arrive in a future update.
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            {[
              { label: "Day"   },
              { label: "Week", active: true },
              { label: "Month" },
            ].map((v) => (
              <button
                key={v.label}
                type="button"
                style={{
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 8,
                  background: v.active
                    ? "var(--accent-surface)"
                    : "color-mix(in oklab, var(--surface-2) 75%, transparent)",
                  border: v.active
                    ? "1px solid color-mix(in oklab, var(--accent-primary) 28%, transparent)"
                    : "1px solid var(--border-subtle)",
                  color: v.active ? "var(--accent-primary)" : "var(--text-default)",
                  fontSize: 12.5,
                  fontWeight: v.active ? 700 : 500,
                  letterSpacing: "-0.005em",
                  cursor: "pointer",
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Week grid. */}
      <div
        className="overflow-hidden rounded-xl"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="grid grid-cols-6 divide-x" style={{ borderColor: "var(--border-subtle)" }}>
          {DAYS.map((day, idx) => (
            <div key={day} style={{ borderRight: idx < DAYS.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
              {/* Day header. */}
              <div
                className="px-3 py-3"
                style={{
                  borderBottom: "1px solid var(--border-subtle)",
                  background:
                    "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 60%, transparent) 0%, transparent 100%)",
                }}
              >
                <div
                  style={{
                    color: "var(--text-faint)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  {day}
                </div>
                <div
                  className="mt-0.5"
                  style={{
                    color: "var(--text-default)",
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: "-0.015em",
                    fontFeatureSettings: "'tnum' 1",
                  }}
                >
                  {idx + 18}
                </div>
              </div>
              {/* Chips. */}
              <div className="flex min-h-[400px] flex-col gap-1.5 p-2">
                {(EXAMPLES[idx] ?? []).map((c) => {
                  const tone = STATUS_TONE[c.status];
                  return (
                    <div
                      key={c.id}
                      className="relative cursor-pointer transition-transform hover:-translate-y-px"
                      style={{
                        padding: "8px 10px 8px 12px",
                        borderRadius: 8,
                        background: `color-mix(in oklab, ${tone} 10%, var(--surface-2))`,
                        border: `1px solid color-mix(in oklab, ${tone} 22%, transparent)`,
                        position: "relative",
                      }}
                    >
                      {/* Status bar. */}
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 5,
                          bottom: 5,
                          width: 3,
                          borderRadius: 999,
                          background: tone,
                          boxShadow: `0 0 6px color-mix(in oklab, ${tone} 50%, transparent)`,
                        }}
                      />
                      <div
                        style={{
                          color: "var(--text-default)",
                          fontSize: 11.5,
                          fontWeight: 600,
                          letterSpacing: "-0.005em",
                          lineHeight: 1.25,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {c.title}
                      </div>
                      <div
                        className="mt-0.5"
                        style={{
                          color: "var(--text-muted)",
                          fontSize: 10,
                          lineHeight: 1.3,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {c.customer} · {c.size}
                      </div>
                      <div
                        className="mt-1 inline-flex items-center gap-1"
                        style={{
                          fontSize: 9.5,
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          color: tone,
                          fontFeatureSettings: "'tnum' 1",
                        }}
                      >
                        {c.startHour > 12 ? `${c.startHour - 12}p` : `${c.startHour}a`}
                        <span style={{ color: "var(--text-faint)" }}>·</span>
                        {c.durationH}h
                      </div>
                    </div>
                  );
                })}
                {(EXAMPLES[idx] ?? []).length === 0 && (
                  <div
                    className="flex flex-1 items-center justify-center"
                    style={{
                      color: "var(--text-faint)",
                      fontSize: 11,
                      fontWeight: 500,
                    }}
                  >
                    No jobs scheduled
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
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
            The production calendar ships in a future update with: drag-drop chip reassignment, conflict detection across equipment bookings, resource view (by operator or by machine), and 2-way Google Calendar / iCal sync.
          </div>
        </div>
      </div>
    </div>
  );
}
