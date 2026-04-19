import type { NextConfig } from "next";

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
    serverActions: { bodySizeLimit: "5mb" },
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

export default nextConfig;
