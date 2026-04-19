import type { Tenant } from "@prisma/client";

// Phase 15 Slice D — per-tenant brand accent on the customer-facing surfaces.
//
// Every portal page + every share-link page wraps its root in a <div style={...}>
// that injects a handful of CSS custom-property overrides. Because we only
// override variables the portal/share chrome reads (accent family), the rest
// of the neutral theme (surface / border / text) stays intact.
//
// Why just the accent? Two reasons:
//   1. Customers are not designers; overriding the full palette invites
//      accidental contrast failures ("dark green on dark green" logos).
//      We keep surface + text locked so legibility is never at risk.
//   2. The accent shows up in exactly the spots that benefit from branding:
//      primary buttons, active nav highlight, linked file names on proofs,
//      amount-paid chips. A single color goes a long way.
//
// `brandPrimaryColor` is expected to be a 3/6-digit hex (#RRGGBB). We validate
// lightly — anything that doesn't match the shape is ignored rather than
// silently colouring the portal with an attacker-controlled `url(javascript:…)`
// string. The actual injection is via style attribute which is safe from that
// class of attack anyway, but defence-in-depth is cheap here.

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Return a CSSProperties object with accent overrides when the tenant has a
 * valid brand color set. When the tenant hasn't configured one (or the value
 * is invalid) we return an empty object and the portal falls back to the
 * default dark-mode accent from globals.css.
 */
export function portalBrandVars(
  tenant: Pick<Tenant, "brandPrimaryColor">,
): React.CSSProperties {
  const raw = tenant.brandPrimaryColor?.trim();
  if (!raw || !HEX_RE.test(raw)) return {};

  const hex = normalizeHex(raw);

  // A light-tint the portal uses behind "active" states. We synthesize it
  // from the base color at 14% alpha rather than making the tenant pick a
  // second value — fewer knobs, harder to misconfigure.
  const tint = hexToRgba(hex, 0.14);

  return {
    // Consumed by buttons, hover/active states, and link-heavy text.
    ["--accent-primary" as unknown as string]: hex,
    ["--accent-primary-strong" as unknown as string]: hex,
    ["--accent-surface" as unknown as string]: tint,
  } as React.CSSProperties;
}

function normalizeHex(raw: string): string {
  // Expand #abc → #aabbcc for consistency.
  if (raw.length === 4) {
    return (
      "#" +
      raw[1] + raw[1] +
      raw[2] + raw[2] +
      raw[3] + raw[3]
    );
  }
  return raw;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Light guard used by the settings form + server action to round-trip safely. */
export function isValidBrandColor(raw: string | null | undefined): boolean {
  if (!raw) return false;
  return HEX_RE.test(raw.trim());
}
