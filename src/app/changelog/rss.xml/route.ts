// Page 35 §Public changelog RSS feed.
//
// Renders all PUBLISHED announcements with the CHANGELOG channel as
// an RSS 2.0 feed. Customers-only entries are filtered out (RSS is
// public). Cache headers keep this snappy without hammering the DB.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const escapeXml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

export async function GET(req: Request) {
  const baseUrl = new URL(req.url).origin;

  const items = await db.platformAnnouncement.findMany({
    where: {
      status: "PUBLISHED",
      channels: { has: "CHANGELOG" },
      audienceCustomersOnly: false,
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  const lastBuild = items[0]?.publishedAt ?? new Date();
  const itemsXml = items.map((a) => {
    const link = a.ctaUrl
      ? a.ctaUrl
      : `${baseUrl}/changelog#${a.id.slice(0, 8)}`;
    const pubDate = (a.publishedAt ?? a.createdAt).toUTCString();
    const cat = a.changelogCategory ?? a.type;
    return `
    <item>
      <title>${escapeXml(a.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">flowtora-announcement-${a.id}</guid>
      <category>${escapeXml(cat)}</category>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${a.body}]]></description>
    </item>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Flowtora — Changelog</title>
    <link>${baseUrl}/changelog</link>
    <atom:link href="${baseUrl}/changelog/rss.xml" rel="self" type="application/rss+xml" />
    <description>What we shipped, fixed, deprecated, and the security work behind the scenes.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>
${itemsXml}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=600",
    },
  });
}
