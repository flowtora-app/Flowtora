// Page 38 — Public landing-page renderer.
//
// Reads a LandingPage by `path` (URL is /lp/<path>), picks an A/B
// variant deterministically per session, and renders the block-based
// content with the bundled stylesheet.

import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  loadPublicLandingPage,
  pickVariant,
} from "@/server/platform/landing-pages";
import { renderBlocks, LP_BASE_CSS } from "@/lib/lp-blocks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SESSION_COOKIE = "lp_session";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  const fullPath = "/" + path.join("/");
  const page = await loadPublicLandingPage(fullPath);
  if (!page) return { title: "Not found" };
  return {
    title: page.metaTitle ?? page.title,
    description: page.metaDescription,
    openGraph: page.ogImageUrl ? { images: [page.ogImageUrl] } : undefined,
    alternates: page.canonicalUrl ? { canonical: page.canonicalUrl } : undefined,
  };
}

export default async function PublicLandingPage({
  params,
}: {
  params: Promise<{ path: string[] }>;
}) {
  const { path } = await params;
  const fullPath = "/" + path.join("/");
  const page = await loadPublicLandingPage(fullPath);
  if (!page) notFound();

  // Resolve A/B variant by session cookie.
  const cookieJar = await cookies();
  const sessionId = cookieJar.get(SESSION_COOKIE)?.value
    ?? Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  // Note: cookies().set is restricted in some Next contexts during render —
  // the page render still works without persistence; the tracking POST
  // (below) sets the cookie if missing.
  const picked = pickVariant(page.variants, sessionId);

  const blocks = picked ? picked.blocks : page.blocks;
  const customHtml = picked?.customHtml ?? page.customHtml;
  const html = customHtml && customHtml.trim().length > 0
    ? customHtml
    : renderBlocks(blocks);
  const inlineCss = (page.customCss ?? "").trim();
  const inlineJs = (page.customJs ?? "").trim();

  // Pick up the request URL to record source.
  const headerStore = await headers();
  const referer = headerStore.get("referer") ?? "";
  const ua = headerStore.get("user-agent") ?? "";
  const device = /Mobi|Android|iPhone/i.test(ua) ? "MOBILE"
              : /iPad|Tablet/i.test(ua) ? "TABLET"
              : "DESKTOP";

  const trackingScript = `
    (function() {
      var sid = "${sessionId}";
      try {
        if (!document.cookie.split("; ").some(function(c){return c.startsWith("${SESSION_COOKIE}=")})) {
          document.cookie = "${SESSION_COOKIE}=" + sid + "; path=/; max-age=2592000; samesite=lax";
        }
      } catch (e) {}
      var deepest = 0;
      var converted = false;
      var startedAt = Date.now();
      function pct() {
        var h = document.documentElement;
        var max = (h.scrollHeight - h.clientHeight) || 1;
        return Math.min(100, Math.round((window.scrollY / max) * 100));
      }
      window.addEventListener("scroll", function() {
        var p = pct();
        if (p > deepest) deepest = p;
      }, { passive: true });
      document.addEventListener("click", function(e) {
        var t = e.target;
        while (t && t !== document) {
          if (t.matches && (t.matches("[data-lp-cta]") || (t.matches && t.matches(".lp-btn-primary")))) {
            converted = true;
            send(true);
            return;
          }
          t = t.parentNode;
        }
      });
      function send(viaCta) {
        try {
          fetch("/api/lp/track", {
            method: "POST",
            headers: { "content-type": "application/json" },
            keepalive: true,
            body: JSON.stringify({
              pageId: "${page.id}",
              variantId: ${picked ? `"${picked.id}"` : "null"},
              sessionId: sid,
              source: ${JSON.stringify(referer || "direct")},
              device: "${device}",
              utm: parseUtm(),
              scrollDepth: deepest,
              timeOnPage: Math.round((Date.now() - startedAt) / 1000),
              converted: viaCta || converted,
            }),
          });
        } catch (e) {}
      }
      function parseUtm() {
        var p = new URLSearchParams(window.location.search);
        return {
          source: p.get("utm_source"),
          medium: p.get("utm_medium"),
          campaign: p.get("utm_campaign"),
        };
      }
      window.addEventListener("beforeunload", function() { send(false); });
      // First impression beacon.
      setTimeout(function() { send(false); }, 1500);
    })();
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: LP_BASE_CSS }} />
      {inlineCss && <style dangerouslySetInnerHTML={{ __html: inlineCss }} />}
      <div className="lp-body">
        <main dangerouslySetInnerHTML={{ __html: html }} />
      </div>
      <script dangerouslySetInnerHTML={{ __html: trackingScript }} />
      {inlineJs && <script dangerouslySetInnerHTML={{ __html: inlineJs }} />}
    </>
  );
}
