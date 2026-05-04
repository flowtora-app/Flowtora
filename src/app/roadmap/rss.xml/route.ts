// Page 36 — Public roadmap RSS feed.
//
// Renders public feature requests in PLANNED/IN_PROGRESS/BETA/SHIPPED
// as RSS 2.0 items. Customers/devs can subscribe to follow along.

import { NextResponse } from "next/server";
import {
  loadPublicRoadmap,
} from "@/server/platform/feature-requests";

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
  const items = await loadPublicRoadmap();
  const lastBuild = items[0]?.shippedAt ?? new Date();

  const itemsXml = items.map((i) => {
    const link = `${baseUrl}/roadmap#${i.id.slice(0, 8)}`;
    const pubDate = (i.shippedAt ?? new Date()).toUTCString();
    return `
    <item>
      <title>${escapeXml(`[${i.status}] ${i.title}`)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">flowtora-roadmap-${i.id}</guid>
      <category>${escapeXml(i.status)}</category>
      ${i.plannedRelease ? `<category>${escapeXml(i.plannedRelease)}</category>` : ""}
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${i.description}]]></description>
    </item>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Flowtora — Roadmap</title>
    <link>${baseUrl}/roadmap</link>
    <atom:link href="${baseUrl}/roadmap/rss.xml" rel="self" type="application/rss+xml" />
    <description>Live roadmap — what's in flight, in beta, and shipped.</description>
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
