import type { FileKind, ProofDecisionKind, ProofStatus } from "@prisma/client";

export const PROOF_STATUSES: { value: ProofStatus; label: string; color: string }[] = [
  { value: "DRAFT",             label: "Draft",            color: "#6b7280" },
  { value: "SENT",              label: "Sent",             color: "#3b82f6" },
  { value: "APPROVED",          label: "Approved",         color: "#10b981" },
  { value: "CHANGES_REQUESTED", label: "Changes requested", color: "#f59e0b" },
  { value: "REJECTED",          label: "Rejected",         color: "#ef4444" },
];

export function proofStatusLabel(s: ProofStatus): string {
  return PROOF_STATUSES.find((x) => x.value === s)?.label ?? s;
}
export function proofStatusColor(s: ProofStatus): string {
  return PROOF_STATUSES.find((x) => x.value === s)?.color ?? "#6b7280";
}

// Open proofs — the ones still demanding attention from sales/design.
export const OPEN_PROOF_STATUSES: ProofStatus[] = ["DRAFT", "SENT", "CHANGES_REQUESTED"];

// Manual status transitions. APPROVED and REJECTED are terminal for that version
// — the workflow is to create a new version if further iteration is needed.
export const PROOF_TRANSITIONS: Record<ProofStatus, ProofStatus[]> = {
  DRAFT:             ["SENT"],
  SENT:              ["APPROVED", "CHANGES_REQUESTED", "REJECTED", "DRAFT"],
  CHANGES_REQUESTED: ["SENT", "DRAFT"],
  APPROVED:          [],
  REJECTED:          [],
};

// ────────────────────────────────────────────────────────────
// File kinds
// ────────────────────────────────────────────────────────────

// Phase 11 — the FileKind taxonomy split. Order matters for the picker
// (most common first). ARTWORK is kept for back-compat with any rows that
// predate the Phase 11 split, but we hide it from new-upload pickers via
// ACTIVE_FILE_KINDS below — designers should pick the specific kind.
export const FILE_KINDS: { value: FileKind; label: string; hint: string }[] = [
  { value: "PROOF",            label: "Proof",             hint: "Customer-facing mock-up (what they see on the portal)" },
  { value: "PRODUCTION_READY", label: "Production ready",  hint: "Final file the machine runs — cut-ready PDF, RIP, etc." },
  { value: "DESIGN_SOURCE",    label: "Design source",     hint: "Native editable file (.ai, .psd, .indd) — designer-only" },
  { value: "MOCKUP",           label: "Mockup",            hint: "Rendered visualization on a building/vehicle — internal" },
  { value: "REFERENCE",        label: "Customer reference", hint: "Inspiration/photos the customer sent over" },
  { value: "ATTACHMENT",       label: "Attachment",        hint: "Brief, email thread, anything uncategorized" },
  { value: "INVOICE",          label: "Invoice / PO",      hint: "Scanned purchase order or receipt" },
  { value: "CUSTOMER_UPLOAD",  label: "Customer upload",   hint: "File the customer attached via the portal" },
  { value: "ARTWORK",          label: "Artwork (legacy)",  hint: "Old pre-split value — prefer Proof or Production ready" },
  { value: "OTHER",            label: "Other",             hint: "Doesn't fit the categories above" },
];

// What to show in the new-upload dropdown. We intentionally drop the
// legacy "ARTWORK" here so new files use the Phase 11 split. Existing
// rows with ARTWORK still read/render fine via fileKindLabel.
export const ACTIVE_FILE_KINDS = FILE_KINDS.filter((k) => k.value !== "ARTWORK");

// Phase 11 — file kinds that are customer-visible vs internal-only. Used
// by the portal file list (hide DESIGN_SOURCE, MOCKUP, PRODUCTION_READY
// unless the tenant explicitly exposes them).
export const CUSTOMER_VISIBLE_FILE_KINDS: FileKind[] = ["PROOF", "REFERENCE"];

export function fileKindLabel(k: FileKind): string {
  return FILE_KINDS.find((x) => x.value === k)?.label ?? k;
}

// Phase 11 — grouping for the FilesCard. A single "kind" is too granular
// for humans ("PROOF vs MOCKUP vs PRODUCTION_READY vs DESIGN_SOURCE"); the
// UI groups them into three buckets that actually reflect workflow phases.
export type FileGroup = "customer-facing" | "production" | "reference";
export function fileGroup(k: FileKind): FileGroup {
  switch (k) {
    case "PROOF":
    case "MOCKUP":
      return "customer-facing";
    case "PRODUCTION_READY":
    case "DESIGN_SOURCE":
    case "ARTWORK":
      return "production";
    case "REFERENCE":
    case "ATTACHMENT":
    case "INVOICE":
    case "CUSTOMER_UPLOAD":
    case "OTHER":
    default:
      return "reference";
  }
}

export const FILE_GROUP_META: Record<FileGroup, { label: string; hint: string }> = {
  "customer-facing": { label: "Customer-facing",  hint: "Proofs and mockups the customer sees on the portal."   },
  "production":      { label: "Production files", hint: "Source files and final machine-ready output. Internal." },
  "reference":       { label: "Reference & misc", hint: "Briefs, inspo, scanned POs, random attachments."       },
};

// ────────────────────────────────────────────────────────────
// Proof decision ledger — UI metadata
// ────────────────────────────────────────────────────────────

export const PROOF_DECISION_META: Record<ProofDecisionKind, { label: string; color: string; icon: string }> = {
  CREATED:           { label: "Draft created",      color: "#6b7280", icon: "＋" },
  REVISED:           { label: "Files updated",      color: "#6b7280", icon: "✎" },
  SENT:              { label: "Sent to customer",   color: "#3b82f6", icon: "→" },
  APPROVED:          { label: "Customer approved",  color: "#10b981", icon: "✓" },
  CHANGES_REQUESTED: { label: "Changes requested",  color: "#f59e0b", icon: "↺" },
  REJECTED:          { label: "Customer rejected",  color: "#ef4444", icon: "✕" },
  LOCKED:            { label: "Proof locked",       color: "#10b981", icon: "🔒" },
  REOPENED:          { label: "Reopened to draft",  color: "#6b7280", icon: "⎌" },
  SUPERSEDED:        { label: "Superseded",         color: "#8b5cf6", icon: "⇄" },
};

export function proofDecisionLabel(d: ProofDecisionKind): string {
  return PROOF_DECISION_META[d]?.label ?? d;
}
export function proofDecisionColor(d: ProofDecisionKind): string {
  return PROOF_DECISION_META[d]?.color ?? "#6b7280";
}

// Best-effort image detection for thumbnail rendering.
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif)(\?|#|$)/i;
const IMAGE_MIME_RE = /^image\//i;

export function isImage(file: { mimeType: string | null; storageUrl: string }): boolean {
  if (file.mimeType && IMAGE_MIME_RE.test(file.mimeType)) return true;
  return IMAGE_EXT_RE.test(file.storageUrl);
}

export function formatSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
