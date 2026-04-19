import type { MetadataRoute } from "next";

// Phase 18 Slice C — robots.txt via Next's file convention.
//
// Allow crawling of public marketing routes; block the tenant
// workspace (/t/*), the portal, the platform console, and the APIs.
// These need to stay un-indexed both for security (leaked tenant URLs)
// and for SEO hygiene (we don't want auth walls in Google's index).

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.APP_URL ??
  "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/t/",
          "/platform/",
          "/portal/",
          "/api/",
          "/select-tenant",
          "/accept-invite",
          "/account-suspended",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
