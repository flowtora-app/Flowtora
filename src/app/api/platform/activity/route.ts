// GET /api/platform/activity
//
// Paged + filtered activity events for live polling and infinite
// scroll. Same filter querystring as the page URL.
//
// Cursor params:
//   `before` — strict-less-than (older-than) for infinite scroll
//   `after`  — strict-greater-than (newer-than) for live poll
//
// Response shape: { rows: ActivityRow[], cursor: string | null }
// `cursor` is the createdAt of the last (oldest) row — pass to
// `before` for the next page.

import { NextResponse } from "next/server";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadActivityPage,
  parseActivityFilters,
  countActivity,
} from "@/server/platform/activity-feed";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await requirePlatformStaff();
  const url = new URL(req.url);
  const sp = url.searchParams;
  const filters = parseActivityFilters(sp);

  const before = sp.get("before");
  const after  = sp.get("after");
  const take = Math.min(200, Math.max(1, Number(sp.get("take")) || 50));
  const onlyCount = sp.get("onlyCount") === "1";

  if (onlyCount && after) {
    const since = new Date(after);
    if (Number.isNaN(since.getTime())) {
      return NextResponse.json({ count: 0 }, { status: 400 });
    }
    const count = await countActivity(filters, since);
    return NextResponse.json({ count });
  }

  const rows = await loadActivityPage({
    filters,
    take,
    before: before ? safeDate(before) : undefined,
    after:  after  ? safeDate(after)  : undefined,
  });

  const cursor = rows.length === take ? rows[rows.length - 1]!.createdAtIso : null;
  return NextResponse.json({ rows, cursor });
}

function safeDate(s: string): Date | undefined {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
