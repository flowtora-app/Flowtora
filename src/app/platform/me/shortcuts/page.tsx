// Page 75 — Keyboard Shortcuts.
//
// Reference + customization for every admin shortcut. Default bindings
// live in the static SHORTCUT_REGISTRY; per-user overrides ride in the
// KeyboardShortcutOverride table.

import * as React from "react";
import Link from "next/link";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  saveShortcutOverride, resetShortcutOverride,
} from "@/app/actions/platform-me";
import {
  SHORTCUT_GROUPS, SHORTCUT_REGISTRY, resolveBinding,
  type ShortcutGroup,
} from "@/server/platform/shortcuts";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

export default async function ShortcutsPage({
  searchParams,
}: { searchParams: Promise<SP> }) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);
  const search = asString(sp.q)?.toLowerCase();
  const editing = asString(sp.edit);

  const overrides = await db.keyboardShortcutOverride.findMany({ where: { userId: ctx.userId } });
  const overrideMap = new Map(overrides.map((o) => [o.actionKey, o.binding]));

  // Filter the registry by search term against action label + binding.
  const filtered = SHORTCUT_REGISTRY.filter((s) => {
    if (!search) return true;
    return (
      s.action.toLowerCase().includes(search) ||
      s.defaultBinding.toLowerCase().includes(search) ||
      s.group.toLowerCase().includes(search)
    );
  });

  const byGroup = new Map<ShortcutGroup, typeof SHORTCUT_REGISTRY>();
  for (const g of SHORTCUT_GROUPS) byGroup.set(g, []);
  for (const s of filtered) byGroup.get(s.group)?.push(s);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--text-default)" }}>
          Keyboard shortcuts
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Reference for every shortcut + per-user rebinding. Press <Kbd>?</Kbd> anywhere on the
          admin to pop up a cheat sheet (uses your custom bindings).
        </p>
      </header>

      {ok && <Banner tone="success">{decodeURIComponent(ok)}</Banner>}
      {error && <Banner tone="danger">{decodeURIComponent(error)}</Banner>}

      {/* Search */}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="block flex-1 max-w-md">
          <span className="block text-[10px] uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
            Search
          </span>
          <input
            type="text"
            name="q"
            defaultValue={search ?? ""}
            placeholder="Type to filter by action or binding"
            className="w-full rounded-md px-3 py-2 text-sm outline-none"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-default)", color: "var(--text-default)" }}
          />
        </label>
        <button type="submit" className="rounded-md px-3 py-2 text-xs font-medium"
          style={{ background: "var(--surface-1)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}>
          Apply
        </button>
      </form>

      {SHORTCUT_GROUPS.map((group) => {
        const list = byGroup.get(group) ?? [];
        if (list.length === 0) return null;
        return (
          <section
            key={group}
            className="overflow-hidden rounded-xl"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
          >
            <header className="px-5 py-3" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              <h3 className="text-sm font-semibold">{group}</h3>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {list.length} shortcut{list.length === 1 ? "" : "s"}
              </p>
            </header>
            <ul>
              {list.map((s) => {
                const res = resolveBinding(s.key, overrideMap);
                const isEditing = editing === s.key;
                return (
                  <li
                    key={s.key}
                    className="grid grid-cols-1 gap-3 px-5 py-3 text-sm md:grid-cols-[1fr_160px_140px_120px]"
                    style={{ borderTop: "1px solid var(--border-subtle)" }}
                  >
                    <div>
                      <div className="font-medium" style={{ color: "var(--text-default)" }}>{s.action}</div>
                      <div className="mt-0.5 text-xs font-mono" style={{ color: "var(--text-faint)" }}>{s.key}</div>
                    </div>
                    <div>
                      <Kbd>{res.effective}</Kbd>
                      {res.isCustom && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide" style={{ color: "var(--accent-primary)" }}>
                          custom
                        </span>
                      )}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Default: <span className="font-mono">{res.defaultBinding}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {!isEditing && (
                        <Link
                          href={`/platform/me/shortcuts?edit=${encodeURIComponent(s.key)}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
                          className="text-xs"
                          style={{ color: "var(--accent-primary)" }}
                        >
                          Edit
                        </Link>
                      )}
                      {res.isCustom && (
                        <form action={resetShortcutOverride}>
                          <input type="hidden" name="actionKey" value={s.key} />
                          <button type="submit" className="text-xs" style={{ color: "var(--text-muted)" }}>
                            Reset
                          </button>
                        </form>
                      )}
                    </div>

                    {isEditing && (
                      <form
                        action={saveShortcutOverride}
                        className="col-span-full grid gap-2 rounded-md px-3 py-3 md:grid-cols-[1fr_auto_auto]"
                        style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
                      >
                        <input type="hidden" name="actionKey" value={s.key} />
                        <label className="block">
                          <span className="mb-1 block text-xs" style={{ color: "var(--text-muted)" }}>
                            New binding
                          </span>
                          <input
                            type="text"
                            name="binding"
                            defaultValue={res.effective}
                            required
                            maxLength={40}
                            placeholder='e.g. "Cmd+Shift+P" or "G then D"'
                            className="w-full rounded-md px-3 py-2 text-sm outline-none"
                            style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" }}
                          />
                        </label>
                        <button
                          type="submit"
                          className="self-end rounded-md px-3 py-2 text-xs font-medium"
                          style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
                        >
                          Save
                        </button>
                        <Link
                          href={`/platform/me/shortcuts${search ? `?q=${encodeURIComponent(search)}` : ""}`}
                          className="self-end rounded-md px-3 py-2 text-center text-xs"
                          style={{ background: "var(--surface-1)", color: "var(--text-muted)", border: "1px solid var(--border-default)" }}
                        >
                          Cancel
                        </Link>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {filtered.length === 0 && (
        <div className="rounded-xl px-5 py-8 text-center text-sm"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
          No shortcuts match &ldquo;{search}&rdquo;.
        </div>
      )}
    </div>
  );
}

/* ── UI helpers ───────────────────────────────────────────── */

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      className="inline-block rounded-md px-2 py-0.5 font-mono text-[11px]"
      style={{
        background: "var(--surface-2)",
        color: "var(--text-default)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "inset 0 -1px 0 var(--border-default)",
      }}
    >
      {children}
    </kbd>
  );
}

function Banner({ tone, children }: { tone: "success" | "danger"; children: React.ReactNode }) {
  const palette = tone === "success"
    ? { bg: "var(--emerald-100)", fg: "var(--emerald-700)", border: "var(--emerald-300)" }
    : { bg: "var(--rose-100)", fg: "var(--rose-700)", border: "var(--rose-300)" };
  return (
    <div className="rounded-md px-4 py-3 text-sm"
      style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}` }}>
      {children}
    </div>
  );
}
