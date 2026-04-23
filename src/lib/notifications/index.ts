// Public surface for the notification system.
//
// Callers should import from this module rather than reaching into
// individual files — the internal layout (registry/render/dispatch)
// may change as M2+ lands admin UI and additional channels.
//
// Two sides coexist here:
//   - Transactional delivery (email today; IN_APP/SMS/PUSH later) via
//     `sendNotification()` + the registry/render/dispatch trio. These
//     are the admin-editable templates that back auth, billing, team,
//     support, etc. messages.
//   - In-app bell notifications (tenant-scoped Notification rows) via
//     `notify`, `notifyMany`, `notifyOnce`, and `unreadCount`. Same
//     directory for co-location but conceptually distinct.
//
// As of M5 the two layers overlap on purpose: a registered kind can
// declare `channels: ["EMAIL", "IN_APP"]` and a single
// sendNotification() call fans out to both with shared wording. The
// standalone `notify`/`notifyMany` helpers remain for the 40+ legacy
// bell-only events that don't belong in the transactional catalog
// (stage.assigned, install.blocker, reminder.*, etc.). New events
// should prefer the dispatcher unless they're truly bell-only.

export { sendNotification } from "./dispatch";
export type {
  SendNotificationOptions,
} from "./dispatch";
export {
  getRegistration,
  listRegistrations,
  GLOBAL_TOKENS,
  type NotificationKind,
} from "./registry";
export { loadBrand, invalidateBrandCache, DEFAULT_BRAND } from "./brand";
export {
  renderTemplate,
  renderInAppTemplate,
  type RenderedEmail,
  type RenderedInApp,
} from "./render";
export type {
  TemplateContent,
  TokenSchema,
  TokenSpec,
  TokenValues,
  NotificationCategory,
  NotificationRegistration,
  DispatchResult,
} from "./types";

// In-app bell surface (migrated from the old notifications.ts).
export {
  notify,
  notifyMany,
  notifyOnce,
  unreadCount,
  notificationLabel,
  notificationColor,
  NOTIFICATION_META,
  type NotificationType,
} from "./in-app";
