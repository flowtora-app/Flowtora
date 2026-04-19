import type {
  BusinessType,
  DefectSeverity,
  ProductionStage,
  ProductionStageStatus,
} from "@prisma/client";

// ────────────────────────────────────────────────────────────
// Production stage statuses — copy + colors for the board UI.
// ────────────────────────────────────────────────────────────
//
// We picked five statuses after listening to what shop-floor staff
// actually say in standups. PENDING is "it's on the list but nobody
// is on it yet", ACTIVE is "Ben is cutting right now", BLOCKED is
// "we need more vinyl before we can keep going", DONE is obvious,
// SKIPPED is "this order didn't need a laminate pass, don't hound
// me for a completion".
//
// Order matters: the board renders PENDING→ACTIVE→BLOCKED→DONE left
// to right, and the next-stage shortcut on a DONE stage advances
// the next-in-sequence to ACTIVE.
export const PRODUCTION_STAGE_STATUSES: {
  value: ProductionStageStatus;
  label: string;
  color: string;
  hint: string;
}[] = [
  { value: "PENDING", label: "Pending", color: "#6b7280", hint: "Queued for a technician to pick up" },
  { value: "ACTIVE",  label: "Active",  color: "#3b82f6", hint: "Someone's on it right now"           },
  { value: "BLOCKED", label: "Blocked", color: "#f59e0b", hint: "Can't proceed — see the reason"     },
  { value: "DONE",    label: "Done",    color: "#10b981", hint: "Finished and ready for the next department" },
  { value: "SKIPPED", label: "Skipped", color: "#8b5cf6", hint: "Not applicable for this order"      },
];

// Statuses that consume floor capacity — used to compute "what's in flight"
// on dashboards and the department swimlanes.
export const ACTIVE_STAGE_STATUSES: ProductionStageStatus[] = ["PENDING", "ACTIVE", "BLOCKED"];

export function stageStatusLabel(s: ProductionStageStatus): string {
  return PRODUCTION_STAGE_STATUSES.find((x) => x.value === s)?.label ?? s;
}

export function stageStatusColor(s: ProductionStageStatus): string {
  return PRODUCTION_STAGE_STATUSES.find((x) => x.value === s)?.color ?? "#6b7280";
}

// Legal transitions. Most state changes happen via dedicated actions
// (start → ACTIVE, complete → DONE, block → BLOCKED) but we keep this
// map so the UI can grey out impossible moves and the server can reject
// anything that leaks through.
// PENDING → DONE and BLOCKED → DONE aren't the happy path, but they're
// the "technician already finished it off-system and just wants to catch
// the board up" escape hatch — a real shop-floor pattern. completeStage()
// backfills startedAt/startedBy in that case so duration math still works.
export const STAGE_TRANSITIONS: Record<ProductionStageStatus, ProductionStageStatus[]> = {
  PENDING: ["ACTIVE", "BLOCKED", "SKIPPED", "DONE"],
  ACTIVE:  ["DONE", "BLOCKED", "PENDING"],
  BLOCKED: ["ACTIVE", "PENDING", "SKIPPED", "DONE"],
  DONE:    ["ACTIVE"], // reopen-to-rework path
  SKIPPED: ["PENDING"],
};

// ────────────────────────────────────────────────────────────
// Defect severities — for the quality control sub-card.
// ────────────────────────────────────────────────────────────

export const DEFECT_SEVERITIES: { value: DefectSeverity; label: string; color: string; hint: string }[] = [
  { value: "MINOR",    label: "Minor",    color: "#f59e0b", hint: "Cosmetic. Noted, no rework needed."       },
  { value: "MAJOR",    label: "Major",    color: "#ef4444", hint: "Rework required before order ships."      },
  { value: "CRITICAL", label: "Critical", color: "#b91c1c", hint: "Scrap the piece; production restarts the stage." },
];

export function defectSeverityLabel(s: DefectSeverity): string {
  return DEFECT_SEVERITIES.find((x) => x.value === s)?.label ?? s;
}

export function defectSeverityColor(s: DefectSeverity): string {
  return DEFECT_SEVERITIES.find((x) => x.value === s)?.color ?? "#6b7280";
}

// ────────────────────────────────────────────────────────────
// Department palette — hex colors the settings UI cycles through when
// the owner hits "add department" without specifying a color. Ten
// options so a shop with eight departments isn't stuck with ugly
// collisions on the board.
// ────────────────────────────────────────────────────────────

export const DEPARTMENT_COLOR_PALETTE: string[] = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#ef4444", // red
  "#6366f1", // indigo
  "#84cc16", // lime
  "#f97316", // orange
];

// ────────────────────────────────────────────────────────────
// Business-type seed departments. When a tenant first hits the
// production settings page with zero departments configured we offer
// a one-click "start with recommended defaults" button that creates
// these. No auto-seed on tenant create — the opt-in keeps the
// department list intentional.
// ────────────────────────────────────────────────────────────

export type SeedDept = { name: string; icon: string; color: string };

const SIGN_SHOP_DEPARTMENTS: SeedDept[] = [
  { name: "Design",          icon: "🎨", color: "#8b5cf6" },
  { name: "Print",           icon: "🖨️", color: "#3b82f6" },
  { name: "Vinyl",           icon: "✂️", color: "#10b981" },
  { name: "CNC",             icon: "⚙️", color: "#f59e0b" },
  { name: "Channel letters", icon: "🔠", color: "#ec4899" },
  { name: "LED assembly",    icon: "💡", color: "#14b8a6" },
  { name: "Acrylic",         icon: "🔷", color: "#6366f1" },
  { name: "Finishing",       icon: "🧰", color: "#84cc16" },
  { name: "Packaging",       icon: "📦", color: "#f97316" },
];

const PRINT_SHOP_DEPARTMENTS: SeedDept[] = [
  { name: "Pre-press",       icon: "🖥️", color: "#8b5cf6" },
  { name: "Digital print",   icon: "🖨️", color: "#3b82f6" },
  { name: "Wide format",     icon: "📐", color: "#10b981" },
  { name: "Bindery",         icon: "📚", color: "#f59e0b" },
  { name: "Finishing",       icon: "🧰", color: "#84cc16" },
  { name: "Packaging",       icon: "📦", color: "#f97316" },
];

// Hybrid = superset with de-duped names preserving sign-shop ordering.
const HYBRID_DEPARTMENTS: SeedDept[] = (() => {
  const seen = new Set<string>();
  const out: SeedDept[] = [];
  for (const d of [...SIGN_SHOP_DEPARTMENTS, ...PRINT_SHOP_DEPARTMENTS]) {
    if (seen.has(d.name)) continue;
    seen.add(d.name);
    out.push(d);
  }
  return out;
})();

export function seedDepartmentsFor(type: BusinessType | null): SeedDept[] {
  switch (type) {
    case "SIGN_SHOP":  return SIGN_SHOP_DEPARTMENTS;
    case "PRINT_SHOP": return PRINT_SHOP_DEPARTMENTS;
    case "HYBRID":     return HYBRID_DEPARTMENTS;
    default:           return SIGN_SHOP_DEPARTMENTS; // conservative fallback
  }
}

// ────────────────────────────────────────────────────────────
// Stage template presets — when an order enters production, these are
// the canonical chains the tenant can one-click apply. We keep templates
// as data (not DB rows) for now; the settings UI for customising per
// shop comes in a follow-on phase.
// ────────────────────────────────────────────────────────────

export type StageTemplateStep = { title: string; deptName: string; estimatedMinutes?: number };
export type StageTemplate = { key: string; label: string; hint: string; steps: StageTemplateStep[] };

export const STAGE_TEMPLATES: StageTemplate[] = [
  {
    key:   "vinyl-simple",
    label: "Vinyl decal (simple)",
    hint:  "Cut → weed → laminate → pack",
    steps: [
      { title: "Cut vinyl",     deptName: "Vinyl",     estimatedMinutes: 30 },
      { title: "Weed & mask",   deptName: "Vinyl",     estimatedMinutes: 20 },
      { title: "Laminate",      deptName: "Finishing", estimatedMinutes: 15 },
      { title: "Pack & label",  deptName: "Packaging", estimatedMinutes: 10 },
    ],
  },
  {
    key:   "channel-letters",
    label: "Channel letters",
    hint:  "CNC → assemble → LED → finish",
    steps: [
      { title: "Route faces",         deptName: "CNC",             estimatedMinutes: 90 },
      { title: "Fabricate returns",   deptName: "Channel letters", estimatedMinutes: 120 },
      { title: "LED assembly",        deptName: "LED assembly",    estimatedMinutes: 60 },
      { title: "Finish & paint",      deptName: "Finishing",       estimatedMinutes: 90 },
      { title: "QC + crate",          deptName: "Packaging",       estimatedMinutes: 30 },
    ],
  },
  {
    key:   "wide-format-print",
    label: "Wide-format print",
    hint:  "Pre-press → print → trim → pack",
    steps: [
      { title: "Pre-press / RIP", deptName: "Pre-press",   estimatedMinutes: 20 },
      { title: "Print",           deptName: "Wide format", estimatedMinutes: 40 },
      { title: "Trim & hem",      deptName: "Finishing",   estimatedMinutes: 20 },
      { title: "Pack",            deptName: "Packaging",   estimatedMinutes: 10 },
    ],
  },
  {
    key:   "digital-print-short",
    label: "Digital print — short run",
    hint:  "Pre-press → print → cut → pack",
    steps: [
      { title: "Pre-press",    deptName: "Pre-press",     estimatedMinutes: 15 },
      { title: "Print",        deptName: "Digital print", estimatedMinutes: 30 },
      { title: "Cut & finish", deptName: "Bindery",       estimatedMinutes: 15 },
      { title: "Pack",         deptName: "Packaging",     estimatedMinutes: 10 },
    ],
  },
  {
    key:   "acrylic-signage",
    label: "Acrylic sign",
    hint:  "Cut → print → assemble → finish",
    steps: [
      { title: "Laser-cut acrylic", deptName: "Acrylic",   estimatedMinutes: 60 },
      { title: "Print graphics",    deptName: "Print",     estimatedMinutes: 45 },
      { title: "Assemble",          deptName: "Finishing", estimatedMinutes: 45 },
      { title: "Pack",              deptName: "Packaging", estimatedMinutes: 10 },
    ],
  },
];

// ────────────────────────────────────────────────────────────
// Formatting helpers
// ────────────────────────────────────────────────────────────

export function formatMinutes(mins: number | null | undefined): string {
  if (mins == null || mins <= 0) return "—";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// "How long has this stage been in this status?" — shown on the stage
// card to catch stages that have sat too long. Returns null when no
// relevant timestamp exists (e.g., a PENDING stage with no createdAt).
export function stageDwellMinutes(s: Pick<ProductionStage, "status" | "createdAt" | "startedAt" | "blockedAt" | "updatedAt">): number | null {
  const now = Date.now();
  const pick =
    s.status === "ACTIVE"  ? s.startedAt  :
    s.status === "BLOCKED" ? s.blockedAt  :
    s.status === "PENDING" ? s.createdAt  :
    null;
  if (!pick) return null;
  return Math.max(0, Math.round((now - pick.getTime()) / 60000));
}

// Is this stage overdue (past its own dueAt)? Falls back to false when
// dueAt is null — callers that want order-level fallback should OR this
// with their own logic.
export function isStageOverdue(s: Pick<ProductionStage, "dueAt" | "status">): boolean {
  if (!s.dueAt) return false;
  if (s.status === "DONE" || s.status === "SKIPPED") return false;
  return s.dueAt.getTime() < Date.now();
}
