import type { MetadataRoute } from "next";

// Phase 18 Slice C — sitemap.xml via Next's file convention.
//
// Lists every public-crawlable marketing route. Keep this in sync
// when new marketing pages land. Tenant / portal / platform routes
// are intentionally excluded (also blocked in robots.ts).

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.APP_URL ??
  "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const pages: {
    path: string;
    changeFrequency: NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;
    priority: number;
  }[] = [
    { path: "/",                changeFrequency: "weekly",  priority: 1.0 },
    { path: "/pricing",         changeFrequency: "monthly", priority: 0.9 },
    { path: "/features",        changeFrequency: "monthly", priority: 0.9 },
    { path: "/for-sign-shops",  changeFrequency: "monthly", priority: 0.8 },
    { path: "/for-print-shops", changeFrequency: "monthly", priority: 0.8 },
    // Phase 5 — conversion + trust routes.
    { path: "/book-demo",       changeFrequency: "monthly", priority: 0.85 },
    { path: "/about",           changeFrequency: "monthly", priority: 0.6 },
    { path: "/security",        changeFrequency: "monthly", priority: 0.6 },
    { path: "/changelog",       changeFrequency: "weekly",  priority: 0.5 },
    { path: "/contact",         changeFrequency: "yearly",  priority: 0.6 },
    { path: "/legal/privacy",   changeFrequency: "yearly",  priority: 0.3 },
    { path: "/legal/terms",     changeFrequency: "yearly",  priority: 0.3 },
    // Auth entry — low-priority but crawlable so "flowtora login"
    // queries land somewhere legitimate.
    { path: "/login",  changeFrequency: "yearly", priority: 0.3 },
    { path: "/signup", changeFrequency: "yearly", priority: 0.5 },
  ];

  return pages.map((p) => ({
    url: `${siteUrl}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));
}
