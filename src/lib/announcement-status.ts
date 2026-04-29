import type { AnnouncementStatus } from "@prisma/client";

// Pure helper for the "is this announcement currently visible?"
// computation. Lives outside actions/announcements.ts because
// Next.js requires every export from a "use server" file to be an
// async function — a sync helper has to live in a plain module.

export type LiveStatus = "draft" | "scheduled" | "live" | "expired" | "archived";

export function liveStatus(
  a: { status: AnnouncementStatus; publishAt: Date | null; expireAt: Date | null },
  now: Date = new Date(),
): LiveStatus {
  if (a.status === "ARCHIVED") return "archived";
  if (a.status === "DRAFT") return "draft";
  if (a.expireAt && a.expireAt.getTime() <= now.getTime()) return "expired";
  if (a.status === "SCHEDULED") {
    return a.publishAt && a.publishAt.getTime() <= now.getTime() ? "live" : "scheduled";
  }
  return "live"; // PUBLISHED + not expired
}
