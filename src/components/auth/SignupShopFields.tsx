"use client";

import { useEffect, useRef, useState } from "react";
import { slugify, isReservedSlug } from "@/lib/slug";

// Client-side companion to the signup form's "Shop name" and
// "Shop URL" inputs. Two behaviours the old server-rendered pair
// couldn't provide:
//
//   1. Slug auto-fill — as the user types the shop name the slug
//      auto-derives via the shared `slugify` helper. A `dirty`
//      flag latches on the first time the user touches the slug,
//      stopping auto-fill so their manual edits aren't overwritten.
//      Clearing the slug un-latches so they can go back to auto.
//
//   2. Live availability check — 350ms debounce, hits
//      /api/signup/slug-check, renders an inline status line
//      under the URL field. The server action at submit time runs
//      the same three checks (length, reserved, collision) so this
//      is pure UX; the form still validates on POST.
//
// Styling matches the inline `<Field>` helper in signup/page.tsx.
// We reimplement the markup here (rather than reuse that helper)
// because we need local state, which server components can't hold.

type Availability =
  | { state: "idle" }
  | { state: "too_short" }
  | { state: "reserved" }
  | { state: "checking" }
  | { state: "available"; slug: string }
  | { state: "taken" };

export function SignupShopFields({
  defaultShopName = "",
  defaultSlug = "",
}: {
  defaultShopName?: string;
  defaultSlug?: string;
}) {
  const [shopName, setShopName] = useState(defaultShopName);
  const [slug, setSlug] = useState(defaultSlug);
  // Latches true the first time the user edits the slug input so
  // auto-fill from shopName doesn't clobber their choice.
  const [slugDirty, setSlugDirty] = useState(defaultSlug.length > 0);
  const [avail, setAvail] = useState<Availability>({ state: "idle" });
  const abortRef = useRef<AbortController | null>(null);

  // Keep the slug in lockstep with the shop name while the user
  // hasn't taken ownership of the slug input.
  useEffect(() => {
    if (!slugDirty) {
      setSlug(slugify(shopName));
    }
  }, [shopName, slugDirty]);

  // Debounced availability check. Runs every time the slug value
  // changes; returns early for states we can decide client-side
  // (too short, reserved) to avoid a useless round-trip.
  useEffect(() => {
    const s = slug.trim();

    if (s.length === 0) {
      setAvail({ state: "idle" });
      return;
    }
    if (s.length < 2) {
      setAvail({ state: "too_short" });
      return;
    }
    if (isReservedSlug(s)) {
      setAvail({ state: "reserved" });
      return;
    }

    setAvail({ state: "checking" });
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      try {
        const res = await fetch(
          `/api/signup/slug-check?slug=${encodeURIComponent(s)}`,
          { signal: ctl.signal, cache: "no-store" },
        );
        const data = (await res.json()) as
          | { ok: true }
          | { ok: false; reason: "too_short" | "reserved" | "taken" };

        if (data.ok) {
          setAvail({ state: "available", slug: s });
        } else if (data.reason === "taken") {
          setAvail({ state: "taken" });
        } else if (data.reason === "reserved") {
          setAvail({ state: "reserved" });
        } else {
          setAvail({ state: "too_short" });
        }
      } catch {
        // Aborted (superseded by newer keystroke) or network blip.
        // Leave state alone — the next effect run will replace it.
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [slug]);

  const onSlugChange = (raw: string) => {
    const normalized = slugify(raw);
    // If the user clears the field, re-enable auto-fill so typing
    // into shopName starts populating the slug again.
    setSlugDirty(normalized.length > 0);
    setSlug(normalized);
  };

  const status = renderStatus(avail);

  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
      {/* Shop name */}
      <label className="block">
        <span
          className="mb-1 block text-sm font-medium"
          style={{ color: "var(--text-default)" }}
        >
          Shop name
          <span
            aria-hidden
            className="ml-1"
            style={{ color: "var(--accent-primary)" }}
          >
            *
          </span>
        </span>
        <input
          name="shopName"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          placeholder="Acme Sign Co."
          required
          autoComplete="organization"
          className="ts-focus w-full rounded-md px-3 py-2.5 text-sm outline-none transition-colors"
          style={{
            background: "var(--surface-0)",
            border: "1px solid var(--border-default)",
            color: "var(--text-default)",
          }}
        />
      </label>

      {/* Shop URL (slug) */}
      <label className="block">
        <span
          className="mb-1 block text-sm font-medium"
          style={{ color: "var(--text-default)" }}
        >
          Shop URL
          <span
            aria-hidden
            className="ml-1"
            style={{ color: "var(--accent-primary)" }}
          >
            *
          </span>
        </span>
        <input
          name="slug"
          value={slug}
          onChange={(e) => onSlugChange(e.target.value)}
          placeholder="acme-sign"
          required
          pattern="[a-z0-9-]+"
          autoComplete="off"
          className="ts-focus w-full rounded-md px-3 py-2.5 text-sm outline-none transition-colors"
          style={{
            background: "var(--surface-0)",
            border: `1px solid ${status.borderColor ?? "var(--border-default)"}`,
            color: "var(--text-default)",
          }}
        />
        <span
          aria-live="polite"
          className="mt-1 block text-xs"
          style={{ color: status.color }}
        >
          {status.text}
        </span>
      </label>
    </div>
  );
}

// Map the internal availability state to the user-facing status
// line (copy + color + optional border). Kept inline so the
// component stays self-contained.
function renderStatus(a: Availability): {
  text: string;
  color: string;
  borderColor?: string;
} {
  switch (a.state) {
    case "idle":
      return {
        text: "Lowercase letters, numbers, and hyphens.",
        color: "var(--text-faint)",
      };
    case "too_short":
      return {
        text: "Pick a URL with at least 2 characters.",
        color: "var(--text-faint)",
      };
    case "reserved":
      return {
        text: "That URL is reserved. Pick another.",
        color: "var(--danger-fg)",
        borderColor: "var(--danger-fg)",
      };
    case "checking":
      return {
        text: "Checking availability…",
        color: "var(--text-muted)",
      };
    case "available":
      return {
        text: `✓ ${a.slug} is available`,
        color: "var(--success-fg)",
      };
    case "taken":
      return {
        text: "That URL is taken. Try another.",
        color: "var(--danger-fg)",
        borderColor: "var(--danger-fg)",
      };
  }
}
