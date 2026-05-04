// Page 34 — rule-based SEO score for the KB editor preview.
//
// Returns a 0..100 score plus a list of remarks (passes / warnings /
// fails) so the SEO tab can render a checklist. No external API
// calls — purely lexical.

export interface SeoCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail?: string;
}

export interface SeoReport {
  /** 0..100. */
  score: number;
  /** "Excellent" / "Good" / "Needs work" / "Poor". */
  band: "excellent" | "good" | "warn" | "poor";
  checks: SeoCheck[];
}

export interface SeoInputs {
  title: string;
  metaTitle: string;
  metaDescription: string;
  summary: string;
  bodyMarkdown: string;
  slug: string;
  canonicalUrl?: string;
  ogImageUrl?: string;
}

const wordCount = (s: string): number => (s.match(/\b[a-z0-9]+\b/gi) ?? []).length;

export function computeSeoScore(inp: SeoInputs): SeoReport {
  const checks: SeoCheck[] = [];

  const effectiveTitle = (inp.metaTitle || inp.title || "").trim();
  const titleLen = effectiveTitle.length;
  if (titleLen >= 30 && titleLen <= 65) {
    checks.push({ id: "title", label: "Title length 30-65 chars", status: "pass", detail: `${titleLen} chars` });
  } else if (titleLen > 0 && titleLen < 30) {
    checks.push({ id: "title", label: "Title length 30-65 chars", status: "warn", detail: `${titleLen} chars — short` });
  } else if (titleLen > 65) {
    checks.push({ id: "title", label: "Title length 30-65 chars", status: "warn", detail: `${titleLen} chars — search engines truncate at ~60` });
  } else {
    checks.push({ id: "title", label: "Title set", status: "fail", detail: "Title is empty" });
  }

  const effectiveDesc = (inp.metaDescription || inp.summary || "").trim();
  const descLen = effectiveDesc.length;
  if (descLen >= 120 && descLen <= 160) {
    checks.push({ id: "desc", label: "Meta description 120-160 chars", status: "pass", detail: `${descLen} chars` });
  } else if (descLen > 0 && descLen < 120) {
    checks.push({ id: "desc", label: "Meta description 120-160 chars", status: "warn", detail: `${descLen} chars — short` });
  } else if (descLen > 160) {
    checks.push({ id: "desc", label: "Meta description 120-160 chars", status: "warn", detail: `${descLen} chars — will be truncated` });
  } else {
    checks.push({ id: "desc", label: "Meta description set", status: "fail", detail: "Description is empty" });
  }

  // Slug shape
  if (inp.slug.length > 0 && /^[a-z0-9-]+$/.test(inp.slug)) {
    if (inp.slug.length <= 80) {
      checks.push({ id: "slug", label: "Slug is lowercase, hyphenated, ≤80", status: "pass", detail: inp.slug });
    } else {
      checks.push({ id: "slug", label: "Slug ≤80 chars", status: "warn", detail: `${inp.slug.length} chars` });
    }
  } else {
    checks.push({ id: "slug", label: "Slug shape", status: "fail", detail: "Slug must be lowercase letters, digits, and hyphens only" });
  }

  // Body word count
  const wc = wordCount(inp.bodyMarkdown);
  if (wc >= 300) {
    checks.push({ id: "body", label: "Body ≥300 words", status: "pass", detail: `${wc} words` });
  } else if (wc >= 150) {
    checks.push({ id: "body", label: "Body ≥300 words", status: "warn", detail: `${wc} words — thin content risk` });
  } else {
    checks.push({ id: "body", label: "Body ≥300 words", status: "fail", detail: `${wc} words — too thin` });
  }

  // Headings present
  const headingCount = (inp.bodyMarkdown.match(/^#{1,6}\s+/gm) ?? []).length;
  if (headingCount >= 2) {
    checks.push({ id: "headings", label: "≥2 headings", status: "pass", detail: `${headingCount} headings` });
  } else if (headingCount === 1) {
    checks.push({ id: "headings", label: "≥2 headings", status: "warn", detail: "Only one heading — break content up" });
  } else {
    checks.push({ id: "headings", label: "≥2 headings", status: "fail", detail: "No headings" });
  }

  // Title appears in body
  const titleWords = effectiveTitle.toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  const body = inp.bodyMarkdown.toLowerCase();
  const titleEcho = titleWords.length === 0
    ? false
    : titleWords.some((w) => body.includes(w));
  checks.push({
    id: "title-echo",
    label: "Title keyword appears in body",
    status: titleEcho ? "pass" : "warn",
    detail: titleEcho ? "Found" : "No title-keyword overlap with body",
  });

  // Canonical URL & OG image
  if (inp.canonicalUrl && inp.canonicalUrl.length > 0) {
    if (/^https?:\/\//.test(inp.canonicalUrl)) {
      checks.push({ id: "canonical", label: "Canonical URL set", status: "pass" });
    } else {
      checks.push({ id: "canonical", label: "Canonical URL valid", status: "warn", detail: "Should start with http(s)://" });
    }
  } else {
    checks.push({ id: "canonical", label: "Canonical URL set", status: "warn", detail: "Optional but recommended" });
  }

  checks.push({
    id: "og",
    label: "Open Graph image",
    status: inp.ogImageUrl && /^https?:\/\//.test(inp.ogImageUrl) ? "pass" : "warn",
    detail: inp.ogImageUrl ? "Set" : "No OG image — link previews fall back to default",
  });

  // Score
  const passes = checks.filter((c) => c.status === "pass").length;
  const warns = checks.filter((c) => c.status === "warn").length;
  // Each check worth 100 / total. Pass = full, warn = half, fail = 0.
  const total = checks.length;
  const raw = total === 0 ? 0 : ((passes + warns * 0.5) / total) * 100;
  const score = Math.round(raw);
  const band: SeoReport["band"] =
    score >= 85 ? "excellent" :
    score >= 70 ? "good"      :
    score >= 50 ? "warn"      :
                  "poor";
  return { score, band, checks };
}
