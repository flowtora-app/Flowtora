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
// The two layers overlap today (support.staff_reply kicks both an
// in-app notify and an email) and will converge in a later milestone
// when IN_APP becomes a first-class channel of the transactional
// dispatcher. Until then, callers generally pick the side they need.

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
export { renderTemplate, type RenderedEmail } from "./render";
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
