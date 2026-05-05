// Page 38 — Landing-page block schema + renderer.
//
// Blocks are stored as a JSON array on LandingPage.blocks. Each block
// has a `kind` discriminator and a typed `props` object. The renderer
// produces server-safe HTML; the admin builder uses the same types
// to render a live preview and to drive form fields per block.

export type LpBlockKind =
  | "header"
  | "hero"
  | "features"
  | "testimonials"
  | "pricing"
  | "cta"
  | "faq"
  | "footer"
  | "image"
  | "raw_html";

export interface HeaderBlock {
  id: string;
  kind: "header";
  props: {
    logoText: string;
    logoUrl?: string;
    links: { label: string; href: string }[];
    primaryLabel?: string;
    primaryHref?: string;
  };
}

export interface HeroBlock {
  id: string;
  kind: "hero";
  props: {
    eyebrow?: string;
    headline: string;
    subheadline?: string;
    primaryLabel?: string;
    primaryHref?: string;
    secondaryLabel?: string;
    secondaryHref?: string;
    imageUrl?: string;
    align?: "left" | "center";
  };
}

export interface FeaturesBlock {
  id: string;
  kind: "features";
  props: {
    headline?: string;
    subheadline?: string;
    items: { icon?: string; title: string; body: string }[];
    columns?: 2 | 3 | 4;
  };
}

export interface TestimonialsBlock {
  id: string;
  kind: "testimonials";
  props: {
    headline?: string;
    items: { quote: string; author: string; role?: string; avatarUrl?: string }[];
  };
}

export interface PricingBlock {
  id: string;
  kind: "pricing";
  props: {
    headline?: string;
    subheadline?: string;
    plans: {
      name: string;
      price: string;       // "$49/mo" — free-form
      tagline?: string;
      bullets: string[];
      ctaLabel: string;
      ctaHref: string;
      featured?: boolean;
    }[];
  };
}

export interface CtaBlock {
  id: string;
  kind: "cta";
  props: {
    headline: string;
    subheadline?: string;
    primaryLabel: string;
    primaryHref: string;
    /** When true, renders an inline email-capture form posting to /api/lp/submit. */
    formCapture?: boolean;
  };
}

export interface FaqBlock {
  id: string;
  kind: "faq";
  props: {
    headline?: string;
    items: { question: string; answer: string }[];
  };
}

export interface FooterBlock {
  id: string;
  kind: "footer";
  props: {
    text: string;
    links?: { label: string; href: string }[];
  };
}

export interface ImageBlock {
  id: string;
  kind: "image";
  props: {
    url: string;
    alt: string;
    caption?: string;
    fullBleed?: boolean;
  };
}

export interface RawHtmlBlock {
  id: string;
  kind: "raw_html";
  props: {
    html: string;
  };
}

export type LpBlock =
  | HeaderBlock | HeroBlock | FeaturesBlock | TestimonialsBlock
  | PricingBlock | CtaBlock | FaqBlock | FooterBlock
  | ImageBlock | RawHtmlBlock;

export const BLOCK_LABELS: Record<LpBlockKind, string> = {
  header:       "Header",
  hero:         "Hero",
  features:     "Feature grid",
  testimonials: "Testimonials",
  pricing:      "Pricing card",
  cta:          "Call to action",
  faq:          "FAQ",
  footer:       "Footer",
  image:        "Image",
  raw_html:     "Raw HTML",
};

export const BLOCK_DESCRIPTIONS: Record<LpBlockKind, string> = {
  header:       "Top nav with logo + links",
  hero:         "Headline + subheadline + CTAs + optional image",
  features:     "2-4 column feature grid",
  testimonials: "Customer quotes",
  pricing:      "Plan comparison cards",
  cta:          "Centered call-to-action band, optional email capture",
  faq:          "Collapsible Q&A list",
  footer:       "Bottom band with copy + links",
  image:        "Single image, optionally full-bleed",
  raw_html:     "Escape hatch — paste arbitrary HTML",
};

/* ── Defaults for new blocks ──────────────────────────── */

let counter = 0;
const nextId = () => `b_${Date.now().toString(36)}_${(++counter).toString(36)}`;

export function defaultBlock(kind: LpBlockKind): LpBlock {
  switch (kind) {
    case "header": return {
      id: nextId(), kind: "header",
      props: {
        logoText: "Flowtora",
        links: [
          { label: "Features", href: "#features" },
          { label: "Pricing",  href: "#pricing"  },
          { label: "Contact",  href: "/contact"  },
        ],
        primaryLabel: "Sign up",
        primaryHref: "/signup",
      },
    };
    case "hero": return {
      id: nextId(), kind: "hero",
      props: {
        eyebrow: "New",
        headline: "The operating system for sign + print shops",
        subheadline: "Stop juggling spreadsheets. Run quotes, jobs, proofs, invoices, and installs from one place.",
        primaryLabel: "Start free trial",
        primaryHref: "/signup",
        secondaryLabel: "Watch demo",
        secondaryHref: "#demo",
        align: "center",
      },
    };
    case "features": return {
      id: nextId(), kind: "features",
      props: {
        headline: "Built for the way shops actually run",
        items: [
          { icon: "📐", title: "Quotes that close",   body: "Pre-built templates, options, and approval links your customers actually use." },
          { icon: "🖨", title: "Production board",    body: "Drag jobs through Cut, Print, Laminate, Ship." },
          { icon: "💳", title: "Invoicing + payments", body: "Stripe-connected, dunning included." },
          { icon: "📦", title: "Materials + costing", body: "Track consumption to compute real margin." },
        ],
        columns: 4,
      },
    };
    case "testimonials": return {
      id: nextId(), kind: "testimonials",
      props: {
        headline: "Shops we love",
        items: [
          { quote: "We replaced four tools with Flowtora.", author: "Maria S.", role: "Owner, Bright Light Signs" },
        ],
      },
    };
    case "pricing": return {
      id: nextId(), kind: "pricing",
      props: {
        headline: "Plans that scale with the shop",
        plans: [
          { name: "Starter",    price: "$49/mo",   tagline: "Solo + side gigs",       bullets: ["Unlimited quotes", "1 user"], ctaLabel: "Start", ctaHref: "/signup" },
          { name: "Growth",     price: "$149/mo",  tagline: "Most popular",           bullets: ["5 users", "Production board"], ctaLabel: "Start", ctaHref: "/signup", featured: true },
          { name: "Pro",        price: "$349/mo",  tagline: "Multi-location",         bullets: ["Unlimited users", "Locations", "API"], ctaLabel: "Start", ctaHref: "/signup" },
          { name: "Enterprise", price: "Contact",  tagline: "SSO + dedicated CSM",    bullets: ["SSO", "Audit log export", "Dedicated support"], ctaLabel: "Talk to sales", ctaHref: "/contact" },
        ],
      },
    };
    case "cta": return {
      id: nextId(), kind: "cta",
      props: {
        headline: "Ready to ship better proofs?",
        subheadline: "Join shops running their entire operation on Flowtora.",
        primaryLabel: "Start free trial",
        primaryHref: "/signup",
        formCapture: false,
      },
    };
    case "faq": return {
      id: nextId(), kind: "faq",
      props: {
        headline: "FAQ",
        items: [
          { question: "How long is the trial?", answer: "30 days, no credit card." },
          { question: "Can I import my customer list?", answer: "Yes — CSV import from the customers page." },
        ],
      },
    };
    case "footer": return {
      id: nextId(), kind: "footer",
      props: {
        text: "© Flowtora — All rights reserved",
        links: [
          { label: "Terms",   href: "/terms" },
          { label: "Privacy", href: "/privacy" },
        ],
      },
    };
    case "image": return {
      id: nextId(), kind: "image",
      props: { url: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=1600", alt: "Workshop floor" },
    };
    case "raw_html": return {
      id: nextId(), kind: "raw_html",
      props: { html: "<div>Custom block — replace me</div>" },
    };
  }
}

/* ── Renderer (HTML strings, server-safe) ─────────────── */

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: string | undefined | null) => (s ?? "").replace(/[&<>"']/g, (c) => ESC[c] ?? c);
const safeHref = (s: string | undefined): string => {
  if (!s) return "#";
  if (/^(https?:\/\/|\/|#|mailto:|tel:)/i.test(s)) return esc(s);
  return "#";
};

export function renderBlocks(blocks: LpBlock[]): string {
  return blocks.map(renderBlock).join("\n");
}

function renderBlock(b: LpBlock): string {
  switch (b.kind) {
    case "header":       return renderHeader(b);
    case "hero":         return renderHero(b);
    case "features":     return renderFeatures(b);
    case "testimonials": return renderTestimonials(b);
    case "pricing":      return renderPricing(b);
    case "cta":          return renderCta(b);
    case "faq":          return renderFaq(b);
    case "footer":       return renderFooter(b);
    case "image":        return renderImage(b);
    case "raw_html":     return b.props.html ?? "";
  }
}

function renderHeader(b: HeaderBlock): string {
  const logo = b.props.logoUrl
    ? `<img src="${safeHref(b.props.logoUrl)}" alt="${esc(b.props.logoText)}" class="lp-logo" />`
    : `<span class="lp-logo lp-logo-text">${esc(b.props.logoText)}</span>`;
  return `
<header class="lp-header">
  <div class="lp-container lp-header-inner">
    ${logo}
    <nav class="lp-nav">
      ${b.props.links.map((l) => `<a href="${safeHref(l.href)}">${esc(l.label)}</a>`).join("")}
    </nav>
    ${b.props.primaryLabel
      ? `<a class="lp-btn lp-btn-primary" href="${safeHref(b.props.primaryHref)}">${esc(b.props.primaryLabel)}</a>`
      : ""}
  </div>
</header>`;
}

function renderHero(b: HeroBlock): string {
  const align = b.props.align === "left" ? "lp-hero--left" : "lp-hero--center";
  return `
<section class="lp-hero ${align}">
  <div class="lp-container">
    ${b.props.eyebrow ? `<div class="lp-eyebrow">${esc(b.props.eyebrow)}</div>` : ""}
    <h1 class="lp-h1">${esc(b.props.headline)}</h1>
    ${b.props.subheadline ? `<p class="lp-sub">${esc(b.props.subheadline)}</p>` : ""}
    <div class="lp-cta-row">
      ${b.props.primaryLabel
        ? `<a class="lp-btn lp-btn-primary" href="${safeHref(b.props.primaryHref)}">${esc(b.props.primaryLabel)}</a>`
        : ""}
      ${b.props.secondaryLabel
        ? `<a class="lp-btn lp-btn-secondary" href="${safeHref(b.props.secondaryHref)}">${esc(b.props.secondaryLabel)}</a>`
        : ""}
    </div>
    ${b.props.imageUrl
      ? `<img class="lp-hero-img" src="${safeHref(b.props.imageUrl)}" alt="" loading="lazy" />`
      : ""}
  </div>
</section>`;
}

function renderFeatures(b: FeaturesBlock): string {
  const cols = b.props.columns ?? 3;
  return `
<section class="lp-features" id="features">
  <div class="lp-container">
    ${b.props.headline ? `<h2 class="lp-h2">${esc(b.props.headline)}</h2>` : ""}
    ${b.props.subheadline ? `<p class="lp-sub">${esc(b.props.subheadline)}</p>` : ""}
    <div class="lp-grid lp-grid-${cols}">
      ${b.props.items.map((it) => `
        <div class="lp-feature">
          ${it.icon ? `<div class="lp-feature-icon">${esc(it.icon)}</div>` : ""}
          <h3 class="lp-h3">${esc(it.title)}</h3>
          <p class="lp-p">${esc(it.body)}</p>
        </div>`).join("")}
    </div>
  </div>
</section>`;
}

function renderTestimonials(b: TestimonialsBlock): string {
  return `
<section class="lp-testimonials">
  <div class="lp-container">
    ${b.props.headline ? `<h2 class="lp-h2">${esc(b.props.headline)}</h2>` : ""}
    <div class="lp-quotes">
      ${b.props.items.map((q) => `
        <figure class="lp-quote">
          <blockquote>"${esc(q.quote)}"</blockquote>
          <figcaption>
            ${q.avatarUrl ? `<img src="${safeHref(q.avatarUrl)}" alt="" class="lp-avatar" />` : ""}
            <strong>${esc(q.author)}</strong>${q.role ? ` <span class="lp-faint">— ${esc(q.role)}</span>` : ""}
          </figcaption>
        </figure>`).join("")}
    </div>
  </div>
</section>`;
}

function renderPricing(b: PricingBlock): string {
  return `
<section class="lp-pricing" id="pricing">
  <div class="lp-container">
    ${b.props.headline ? `<h2 class="lp-h2">${esc(b.props.headline)}</h2>` : ""}
    ${b.props.subheadline ? `<p class="lp-sub">${esc(b.props.subheadline)}</p>` : ""}
    <div class="lp-plans">
      ${b.props.plans.map((p) => `
        <div class="lp-plan ${p.featured ? "lp-plan--featured" : ""}">
          ${p.featured ? `<div class="lp-plan-badge">Most popular</div>` : ""}
          <h3 class="lp-h3">${esc(p.name)}</h3>
          <div class="lp-price">${esc(p.price)}</div>
          ${p.tagline ? `<div class="lp-faint">${esc(p.tagline)}</div>` : ""}
          <ul class="lp-bullets">
            ${p.bullets.map((bp) => `<li>${esc(bp)}</li>`).join("")}
          </ul>
          <a class="lp-btn ${p.featured ? "lp-btn-primary" : "lp-btn-secondary"}" href="${safeHref(p.ctaHref)}">${esc(p.ctaLabel)}</a>
        </div>`).join("")}
    </div>
  </div>
</section>`;
}

function renderCta(b: CtaBlock): string {
  const form = b.props.formCapture
    ? `<form class="lp-form" data-lp-capture method="post" action="/api/lp/submit">
         <input type="email" name="email" placeholder="you@company.com" required />
         <button type="submit" class="lp-btn lp-btn-primary">${esc(b.props.primaryLabel)}</button>
       </form>`
    : `<a class="lp-btn lp-btn-primary" href="${safeHref(b.props.primaryHref)}" data-lp-cta>${esc(b.props.primaryLabel)}</a>`;
  return `
<section class="lp-cta">
  <div class="lp-container">
    <h2 class="lp-h2">${esc(b.props.headline)}</h2>
    ${b.props.subheadline ? `<p class="lp-sub">${esc(b.props.subheadline)}</p>` : ""}
    ${form}
  </div>
</section>`;
}

function renderFaq(b: FaqBlock): string {
  return `
<section class="lp-faq" id="faq">
  <div class="lp-container">
    ${b.props.headline ? `<h2 class="lp-h2">${esc(b.props.headline)}</h2>` : ""}
    <ul class="lp-faq-list">
      ${b.props.items.map((it) => `
        <li>
          <details>
            <summary>${esc(it.question)}</summary>
            <div class="lp-p">${esc(it.answer)}</div>
          </details>
        </li>`).join("")}
    </ul>
  </div>
</section>`;
}

function renderFooter(b: FooterBlock): string {
  return `
<footer class="lp-footer">
  <div class="lp-container lp-footer-inner">
    <span>${esc(b.props.text)}</span>
    ${b.props.links?.length
      ? `<nav>${b.props.links.map((l) => `<a href="${safeHref(l.href)}">${esc(l.label)}</a>`).join("")}</nav>`
      : ""}
  </div>
</footer>`;
}

function renderImage(b: ImageBlock): string {
  const cls = b.props.fullBleed ? "lp-image-full" : "lp-image";
  return `
<section class="${cls}">
  ${b.props.fullBleed ? "" : `<div class="lp-container">`}
    <img src="${safeHref(b.props.url)}" alt="${esc(b.props.alt)}" loading="lazy" />
    ${b.props.caption ? `<p class="lp-faint lp-caption">${esc(b.props.caption)}</p>` : ""}
  ${b.props.fullBleed ? "" : `</div>`}
</section>`;
}

/* ── Type guards used by the editor + renderer ────────── */

export function isLpBlock(v: unknown): v is LpBlock {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.kind === "string" && typeof o.props === "object";
}

export function parseBlocks(json: unknown): LpBlock[] {
  if (!Array.isArray(json)) return [];
  return json.filter(isLpBlock);
}

/* ── Default styles bundled with every public LP render ── */

export const LP_BASE_CSS = `
:root {
  --lp-fg: #0f172a;
  --lp-muted: #475569;
  --lp-faint: #94a3b8;
  --lp-bg: #ffffff;
  --lp-surface: #f8fafc;
  --lp-border: #e2e8f0;
  --lp-accent: #2563eb;
  --lp-accent-fg: #ffffff;
}
* { box-sizing: border-box; }
body.lp-body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: var(--lp-fg); background: var(--lp-bg); line-height: 1.55; }
.lp-container { max-width: 1080px; margin: 0 auto; padding: 0 24px; }
.lp-header { padding: 16px 0; border-bottom: 1px solid var(--lp-border); position: sticky; top: 0; background: rgba(255,255,255,0.92); backdrop-filter: blur(8px); }
.lp-header-inner { display: flex; align-items: center; gap: 24px; }
.lp-logo { font-weight: 700; font-size: 18px; }
.lp-logo-text { color: var(--lp-fg); }
.lp-nav { display: flex; gap: 16px; flex: 1; }
.lp-nav a { color: var(--lp-muted); text-decoration: none; font-size: 14px; }
.lp-nav a:hover { color: var(--lp-fg); }
.lp-btn { display: inline-flex; align-items: center; padding: 10px 18px; border-radius: 9999px; font-weight: 600; text-decoration: none; font-size: 14px; transition: opacity 150ms; }
.lp-btn:hover { opacity: 0.9; }
.lp-btn-primary { background: var(--lp-accent); color: var(--lp-accent-fg); }
.lp-btn-secondary { background: var(--lp-surface); color: var(--lp-fg); border: 1px solid var(--lp-border); }
.lp-hero { padding: 80px 0; }
.lp-hero--center { text-align: center; }
.lp-eyebrow { display: inline-block; padding: 4px 10px; border-radius: 9999px; background: var(--lp-surface); color: var(--lp-accent); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 16px; }
.lp-h1 { font-size: 56px; line-height: 1.1; margin: 0 0 16px; }
.lp-h2 { font-size: 36px; line-height: 1.2; margin: 0 0 16px; }
.lp-h3 { font-size: 18px; line-height: 1.4; margin: 0 0 8px; font-weight: 600; }
.lp-sub { font-size: 18px; color: var(--lp-muted); max-width: 56ch; margin: 0 auto 24px; }
.lp-hero--left .lp-sub { margin-left: 0; }
.lp-cta-row { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.lp-hero--left .lp-cta-row { justify-content: flex-start; }
.lp-hero-img { display: block; max-width: 100%; margin: 32px auto 0; border-radius: 12px; box-shadow: 0 24px 60px rgba(0,0,0,0.12); }
.lp-features { padding: 64px 0; }
.lp-grid { display: grid; gap: 24px; margin-top: 32px; }
.lp-grid-2 { grid-template-columns: repeat(2, 1fr); }
.lp-grid-3 { grid-template-columns: repeat(3, 1fr); }
.lp-grid-4 { grid-template-columns: repeat(4, 1fr); }
@media (max-width: 800px) { .lp-grid-2, .lp-grid-3, .lp-grid-4 { grid-template-columns: 1fr; } }
.lp-feature { padding: 24px; background: var(--lp-surface); border-radius: 12px; }
.lp-feature-icon { font-size: 28px; margin-bottom: 8px; }
.lp-p { color: var(--lp-muted); margin: 0; font-size: 14px; }
.lp-faint { color: var(--lp-faint); }
.lp-testimonials { padding: 64px 0; background: var(--lp-surface); }
.lp-quotes { display: grid; gap: 24px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); margin-top: 24px; }
.lp-quote { margin: 0; padding: 24px; background: var(--lp-bg); border-radius: 12px; border: 1px solid var(--lp-border); }
.lp-quote blockquote { margin: 0; font-size: 16px; color: var(--lp-fg); }
.lp-quote figcaption { margin-top: 12px; font-size: 13px; color: var(--lp-muted); display: flex; align-items: center; gap: 8px; }
.lp-avatar { width: 28px; height: 28px; border-radius: 9999px; }
.lp-pricing { padding: 64px 0; }
.lp-plans { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); margin-top: 32px; }
.lp-plan { padding: 24px; border-radius: 12px; border: 1px solid var(--lp-border); background: var(--lp-bg); position: relative; }
.lp-plan--featured { border-color: var(--lp-accent); box-shadow: 0 8px 32px rgba(37, 99, 235, 0.1); }
.lp-plan-badge { position: absolute; top: -12px; right: 24px; background: var(--lp-accent); color: var(--lp-accent-fg); padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; }
.lp-price { font-size: 28px; font-weight: 700; margin-top: 8px; }
.lp-bullets { list-style: none; padding: 0; margin: 16px 0 24px; }
.lp-bullets li { padding: 6px 0; color: var(--lp-muted); font-size: 14px; }
.lp-bullets li:before { content: "✓ "; color: var(--lp-accent); font-weight: 700; }
.lp-cta { padding: 64px 0; background: var(--lp-fg); color: var(--lp-bg); text-align: center; }
.lp-cta .lp-h2 { color: var(--lp-bg); }
.lp-cta .lp-sub { color: rgba(255,255,255,0.8); }
.lp-form { display: flex; gap: 8px; max-width: 480px; margin: 16px auto 0; }
.lp-form input { flex: 1; padding: 12px 16px; border-radius: 9999px; border: 1px solid var(--lp-border); font-size: 14px; }
.lp-faq { padding: 64px 0; }
.lp-faq-list { list-style: none; padding: 0; margin: 24px 0 0; }
.lp-faq-list li { border-bottom: 1px solid var(--lp-border); }
.lp-faq-list summary { padding: 16px 0; cursor: pointer; font-weight: 600; }
.lp-faq-list details[open] summary { color: var(--lp-accent); }
.lp-faq-list details > div { padding: 0 0 16px; color: var(--lp-muted); }
.lp-footer { padding: 32px 0; border-top: 1px solid var(--lp-border); color: var(--lp-muted); font-size: 13px; }
.lp-footer-inner { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.lp-footer nav { display: flex; gap: 16px; }
.lp-footer a { color: var(--lp-muted); text-decoration: none; }
.lp-image { padding: 32px 0; text-align: center; }
.lp-image img { max-width: 100%; border-radius: 12px; }
.lp-image-full img { width: 100%; display: block; }
.lp-caption { margin-top: 8px; font-size: 12px; }
`;
