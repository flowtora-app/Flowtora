// Phase 7 — tenant-wide tag catalogue.
//
// Used in two places:
//   • the list-view filter, so a rep can filter by a tag that actually
//     exists rather than typing a maybe-correct label
//   • the inline-tag editor on the customer detail page, to autocomplete
//     existing tags as the rep types
//
// Customer.tags is a String[] column so Postgres can't give us "distinct
// values" cheaply. We pull all tag arrays for the tenant and flatten —
// at 10k customers with average 2 tags that's 20k short strings, which
// is fine for an in-memory aggregation. If a tenant ever crosses that
// scale we'll switch to a materialised tag table.

import { db } from "@/lib/db";

export type TagSummary = {
  tag: string;
  count: number;
};

export async function loadTenantTags(tenantId: string): Promise<TagSummary[]> {
  const rows = await db.customer.findMany({
    where: { tenantId, tags: { isEmpty: false } },
    select: { tags: true },
    take: 5000, // sanity cap
  });

  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const raw of row.tags) {
      const tag = normalizeTag(raw);
      if (!tag) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}
