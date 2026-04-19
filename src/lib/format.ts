export function formatMoney(amount: number | string | null | undefined, currency: string): string {
  if (amount == null || amount === "") return "—";
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

// Phase 21 Slice D — optional format override for customer-facing surfaces.
// Internal staff screens keep the default (ISO) because operators working
// across tenants need stable parsing. Portal/email pages pass
// `tenant.dateFormat` ("US" | "EU" | "ISO") to render in the tenant's
// preferred style.
export type DateFormat = "ISO" | "US" | "EU";

export function formatDate(
  d: Date | null | undefined,
  fmt?: string | null,
): string {
  if (!d) return "—";
  const yyyy = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  switch (fmt) {
    case "US":
      return `${mm}/${dd}/${yyyy}`;
    case "EU":
      return `${dd}/${mm}/${yyyy}`;
    default:
      return `${yyyy}-${mm}-${dd}`;
  }
}

// Alias kept so call sites that want an explicit "tenant-aware" signal
// can opt in without worrying whether they passed a format.
export const formatDateFor = formatDate;

export function formatDateTime(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(0, 16).replace("T", " ");
}

export function relativeDays(d: Date | null | undefined): string | null {
  if (!d) return null;
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 0) return `in ${days}d`;
  return `${Math.abs(days)}d ago`;
}

export function humanize(s: string): string {
  return s.replace(/_/g, " ").toLowerCase();
}
