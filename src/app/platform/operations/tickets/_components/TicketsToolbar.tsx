// Toolbar above the ticket list. Plain GET form so it works with RSC
// — no client state. Drops query params; selecting a saved view in
// the left rail is preserved via a hidden input.

import type {
  SupportTicketStatus,
  SupportTicketPriority,
  SupportTicketCategory,
  SupportTicketModule,
} from "@prisma/client";
import type {
  SavedViewKey,
  TicketFilterOptions,
} from "@/server/platform/support-tickets";

const STATUSES: SupportTicketStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"];
const PRIORITIES: SupportTicketPriority[] = ["URGENT", "HIGH", "NORMAL", "LOW"];
const CATEGORIES: SupportTicketCategory[] = ["BILLING", "BUG", "FEATURE_REQUEST", "QUESTION", "OTHER"];
const MODULES: SupportTicketModule[] = [
  "BILLING", "AUTH", "PROOFS", "ORDERS", "INVOICES", "QUOTES",
  "PRODUCTS", "REPORTS", "INTEGRATIONS", "PORTAL", "EMAIL", "ADMIN", "OTHER",
];

export function TicketsToolbar({
  view,
  q, status, priority, category, mod, tenantId, assignedTo,
  options,
  resetHref,
  hasFiltersApplied,
}: {
  view: SavedViewKey;
  q?: string;
  status?: SupportTicketStatus;
  priority?: SupportTicketPriority;
  category?: SupportTicketCategory;
  mod?: SupportTicketModule;
  tenantId?: string;
  assignedTo?: string;
  options: TicketFilterOptions;
  resetHref: string;
  hasFiltersApplied: boolean;
}) {
  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-2 rounded-lg border p-3"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      {/* Preserve the active view across submit. */}
      <input type="hidden" name="view" value={view} />

      <Field label="Search">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Subject, ticket id, tenant…"
          className="ts-focus w-[260px] rounded-md px-2 py-1.5 text-[12px] outline-none"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-default)",
            color: "var(--text-default)",
          }}
        />
      </Field>

      <Field label="Priority">
        <Select name="priority" defaultValue={priority ?? ""}>
          <option value="">Any</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
        </Select>
      </Field>

      <Field label="Status">
        <Select name="status" defaultValue={status ?? ""}>
          <option value="">Any</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
        </Select>
      </Field>

      <Field label="Category">
        <Select name="category" defaultValue={category ?? ""}>
          <option value="">Any</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
        </Select>
      </Field>

      <Field label="Module">
        <Select name="module" defaultValue={mod ?? ""}>
          <option value="">Any</option>
          {MODULES.map((m) => <option key={m} value={m}>{m}</option>)}
        </Select>
      </Field>

      <Field label="Tenant">
        <Select name="tenant" defaultValue={tenantId ?? ""}>
          <option value="">All tenants</option>
          {options.tenants.slice(0, 200).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>
      </Field>

      <Field label="Assignee">
        <Select name="assignedTo" defaultValue={assignedTo ?? ""}>
          <option value="">Anyone</option>
          <option value="unassigned">Unassigned</option>
          {options.staff.map((u) => (
            <option key={u.id} value={u.id}>{u.label}</option>
          ))}
        </Select>
      </Field>

      <button
        type="submit"
        className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-medium"
        style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
      >
        Apply
      </button>
      {hasFiltersApplied && (
        <a
          href={resetHref}
          className="self-center text-[11px] underline"
          style={{ color: "var(--text-muted)" }}
        >
          Clear filters
        </a>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({
  name, defaultValue, children,
}: {
  name: string;
  defaultValue: string;
  children: React.ReactNode;
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-default)",
        color: "var(--text-default)",
      }}
    >
      {children}
    </select>
  );
}
