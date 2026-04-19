"use server";

import { cookies } from "next/headers";
import type { ThemePref } from "@/lib/theme";

// Phase 18 Slice B — UI preference server actions.
//
// Persisted UI preferences that need to survive a reload (and be known
// at SSR time, to avoid flash-of-wrong-chrome) go through cookies. We
// keep them small and non-sensitive.
//
// One cookie per preference. `ts_shell_collapsed`: "1" for collapsed,
// anything else (or absent) for expanded.

const COOKIE_COLLAPSED = "ts_shell_collapsed";
const COOKIE_THEME = "ts_theme";
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function setSidebarCollapsed(collapsed: boolean) {
  const jar = await cookies();
  jar.set(COOKIE_COLLAPSED, collapsed ? "1" : "0", {
    path: "/",
    maxAge: ONE_YEAR,
    httpOnly: false, // the client can read it too for hydration sync
    sameSite: "lax",
  });
}

// Phase 23+ — theme preference. "system" defers to the OS-level
// prefers-color-scheme; "light" / "dark" pin the choice. We validate
// in the action (server) and again in the boot script (client) so a
// tampered cookie never crashes the layout. The ThemePref type itself
// lives in @/lib/theme — a "use server" module can only export async
// functions, so type exports have to live elsewhere.

export async function setThemePref(theme: ThemePref) {
  const valid: ThemePref[] = ["system", "light", "dark"];
  if (!valid.includes(theme)) return;
  const jar = await cookies();
  jar.set(COOKIE_THEME, theme, {
    path: "/",
    maxAge: ONE_YEAR,
    httpOnly: false, // the boot script reads it to avoid FOUC
    sameSite: "lax",
  });
}
