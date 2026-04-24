import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Phase 23 — baseline production security headers.
//
// Scope carved deliberately: we DON'T apply X-Frame-Options to the portal
// surface because customers occasionally embed portal links in their own
// sites, and we DON'T ship a full Content-Security-Policy yet (too much
// inline style in the current design to do without breakage). The rest of
// the headers are cheap wins with no ergonomic cost.

const SECURE_DEFAULTS = [
  // Refuse to be iframed — blocks clickjacking on the internal workspace.
  { key: "X-Frame-Options",        value: "DENY" },
  // MIME sniffing is a stored-XSS vector when a user uploads HTML disguised
  // as an image. Nosniff makes the browser honor our Content-Type.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak full URLs (which can contain tokens) to outbound links.
  { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
  // Disable powerful APIs the app doesn't need. Keeps a rogue library or a
  // compromised tenant's portal from silently asking for mic/camera/geo.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

// HSTS: only meaningful over HTTPS. We emit it everywhere — Vercel's edge
// strips it off plain-HTTP responses, and dev (http://localhost) browsers
// ignore it for non-TLS origins. 1 year, subdomains included, preload-eligible.
const HSTS_HEADER = {
  key:   "Strict-Transport-Security",
  value: "max-age=31536000; includeSubDomains; preload",
};

const nextConfig: NextConfig = {
  experimental: {
    // Bumped to accommodate the proof file uploader (create-version form
    // posts artwork directly via a server action). The client-side cap is
    // 20 MB per file × 10 files; request-level overhead + multipart padding
    // brings the realistic ceiling to ~220 MB. Vercel's platform limit is
    // still the effective ceiling on hosted deployments.
    serverActions: { bodySizeLimit: "220mb" },
  },
  async headers() {
    return [
      {
        // Apply defaults + HSTS to everything except the public portal,
        // which we handle separately so it can be iframed.
        source: "/((?!portal).*)",
        headers: [...SECURE_DEFAULTS, HSTS_HEADER],
      },
      {
        // Portal surface: keep the rest of the defaults but drop the
        // frame-ancestors lockout so customers can embed if they want.
        source: "/portal/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy",        value: "strict-origin-when-cross-origin" },
          HSTS_HEADER,
        ],
      },
    ];
  },
};

// Wrap with Sentry so source maps are uploaded on each Vercel build and
// server errors get auto-instrumented. Requires SENTRY_AUTH_TOKEN at
// build time to upload sourcemaps; without it the build still succeeds
// but uploads are skipped.
export default withSentryConfig(nextConfig, {
  org: "flowtora",
  project: "flowtora",
  // Silence the upload log spam in CI. Flip to true locally if you
  // need to debug the sourcemap step.
  silent: !process.env.CI,
  // Tree-shake the Sentry SDK's logger statements in production.
  disableLogger: true,
  // Route Sentry tunnel through /monitoring so ad-blockers don't
  // swallow client-side errors. Cheap and invisible.
  tunnelRoute: "/monitoring",
});
