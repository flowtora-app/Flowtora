// Page 75 — Keyboard shortcut registry.
//
// Static catalog of all platform-admin keyboard shortcuts. Per-user
// overrides live in KeyboardShortcutOverride and replace the default
// binding for that action only.

export type ShortcutGroup =
  | "Navigation"
  | "Search"
  | "Create"
  | "Tables"
  | "Detail pages"
  | "Forms"
  | "Notifications"
  | "Help"
  | "Account";

export interface ShortcutDefault {
  key: string;       // stable identity, used as actionKey
  group: ShortcutGroup;
  action: string;    // human-readable
  defaultBinding: string;
  description?: string;
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  "Navigation", "Search", "Create", "Tables", "Detail pages",
  "Forms", "Notifications", "Help", "Account",
];

export const SHORTCUT_REGISTRY: ShortcutDefault[] = [
  // Navigation
  { key: "nav.command-palette",   group: "Navigation",   action: "Open command palette",  defaultBinding: "Cmd/Ctrl+K" },
  { key: "nav.dashboard",         group: "Navigation",   action: "Go to Dashboard",       defaultBinding: "G then D" },
  { key: "nav.tenants",           group: "Navigation",   action: "Go to Tenants",         defaultBinding: "G then T" },
  { key: "nav.users",             group: "Navigation",   action: "Go to Users",           defaultBinding: "G then U" },
  { key: "nav.billing",           group: "Navigation",   action: "Go to Billing",         defaultBinding: "G then B" },
  { key: "nav.audit",             group: "Navigation",   action: "Go to Audit Log",       defaultBinding: "G then A" },
  { key: "nav.settings",          group: "Navigation",   action: "Go to Settings",        defaultBinding: "G then S" },
  { key: "nav.support",           group: "Navigation",   action: "Go to Support Tickets", defaultBinding: "G then I" },
  { key: "nav.toggle-sidebar",    group: "Navigation",   action: "Toggle sidebar",        defaultBinding: "[" },
  { key: "nav.toggle-theme",      group: "Navigation",   action: "Toggle theme",          defaultBinding: "Shift+T" },
  // Search
  { key: "search.focus",          group: "Search",       action: "Focus global search",   defaultBinding: "/" },
  { key: "search.recent",         group: "Search",       action: "Recent searches",       defaultBinding: "Cmd/Ctrl+Shift+K" },
  // Create
  { key: "create.tenant",         group: "Create",       action: "New tenant",            defaultBinding: "C then T" },
  { key: "create.user",           group: "Create",       action: "New user",              defaultBinding: "C then U" },
  { key: "create.ticket",         group: "Create",       action: "New ticket",            defaultBinding: "C then I" },
  { key: "create.announcement",   group: "Create",       action: "New announcement",      defaultBinding: "C then A" },
  { key: "create.flag",           group: "Create",       action: "New feature flag",      defaultBinding: "C then F" },
  { key: "create.coupon",         group: "Create",       action: "New coupon",            defaultBinding: "C then C" },
  // Tables
  { key: "table.next-row",        group: "Tables",       action: "Next row",              defaultBinding: "J" },
  { key: "table.prev-row",        group: "Tables",       action: "Previous row",          defaultBinding: "K" },
  { key: "table.open-row",        group: "Tables",       action: "Open row",              defaultBinding: "Enter" },
  { key: "table.select-row",      group: "Tables",       action: "Select row",            defaultBinding: "X" },
  { key: "table.select-all",      group: "Tables",       action: "Select all",            defaultBinding: "Cmd/Ctrl+A" },
  { key: "table.bulk-action",     group: "Tables",       action: "Bulk action menu",      defaultBinding: "B" },
  { key: "table.refresh",         group: "Tables",       action: "Refresh",               defaultBinding: "R" },
  { key: "table.toggle-filters",  group: "Tables",       action: "Toggle filters",        defaultBinding: "F" },
  { key: "table.toggle-columns",  group: "Tables",       action: "Toggle columns",        defaultBinding: "Shift+C" },
  // Detail pages
  { key: "detail.next-tab",       group: "Detail pages", action: "Next tab",              defaultBinding: "Cmd/Ctrl+Right" },
  { key: "detail.prev-tab",       group: "Detail pages", action: "Previous tab",          defaultBinding: "Cmd/Ctrl+Left" },
  { key: "detail.edit",           group: "Detail pages", action: "Edit",                  defaultBinding: "E" },
  { key: "detail.add-note",       group: "Detail pages", action: "Add note",              defaultBinding: "N" },
  { key: "detail.impersonate",    group: "Detail pages", action: "Impersonate tenant",    defaultBinding: "I" },
  { key: "detail.pin",            group: "Detail pages", action: "Pin to dashboard",      defaultBinding: "P" },
  // Forms
  { key: "form.save",             group: "Forms",        action: "Save",                  defaultBinding: "Cmd/Ctrl+S" },
  { key: "form.save-continue",    group: "Forms",        action: "Save and continue",     defaultBinding: "Cmd/Ctrl+Shift+S" },
  { key: "form.cancel",           group: "Forms",        action: "Cancel",                defaultBinding: "Esc" },
  { key: "form.submit",           group: "Forms",        action: "Submit",                defaultBinding: "Cmd/Ctrl+Enter" },
  // Notifications
  { key: "notif.open-center",     group: "Notifications", action: "Open notification center", defaultBinding: "N" },
  { key: "notif.mark-all-read",   group: "Notifications", action: "Mark all read",            defaultBinding: "Shift+N" },
  // Help
  { key: "help.shortcuts",        group: "Help",         action: "Open shortcut help",    defaultBinding: "?" },
  { key: "help.docs",             group: "Help",         action: "Open documentation",    defaultBinding: "Shift+/" },
  // Account
  { key: "account.sign-out",      group: "Account",      action: "Sign out",              defaultBinding: "Cmd/Ctrl+Shift+Q" },
];

/** Returns the effective binding for an actionKey: override if present, else default. */
export function resolveBinding(
  actionKey: string,
  overrides: Map<string, string>,
): { defaultBinding: string; effective: string; isCustom: boolean } {
  const def = SHORTCUT_REGISTRY.find((s) => s.key === actionKey);
  const defaultBinding = def?.defaultBinding ?? "—";
  const override = overrides.get(actionKey);
  return {
    defaultBinding,
    effective: override ?? defaultBinding,
    isCustom: !!override && override !== defaultBinding,
  };
}
