// Tiny markdown-lite → HTML renderer for notification template bodies.
//
// Admins edit template bodies as loosely-formatted markdown. We support
// only the narrow subset needed for readable transactional copy:
//
//   paragraphs    — blank line separator
//   line breaks   — single newline within a paragraph → <br />
//   **bold**      — <strong>
//   *italic*      — <em>
//   `inline code` — <code> with inline styling
//   [text](url)   — <a href=…>; javascript:/data: URIs are dropped
//                    (link is replaced with its plaintext)
//
// No headings, no lists, no images, no raw HTML passthrough. Keeps
// the threat model flat: everything is HTML-escaped first, then a
// whitelist of patterns gets upgraded into HTML.

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

// Apply the whitelisted inline transformations to an already-escaped
// chunk of text. Because the input is escape-safe, the regexes can
// match against our own output (e.g. `&lt;` doesn't get mistaken for
// `<`).
function renderInline(escaped: string): string {
  let html = escaped;

  // `code`  — run first so markers inside code can't match bold/italic.
  // The replacement inserts a sentinel we restore at the end so the
  // later regexes can't chew through the code span.
  const codeSpans: string[] = [];
  html = html.replace(/`([^`]+?)`/g, (_m, inner: string) => {
    codeSpans.push(inner);
    return `\u0000CODE${codeSpans.length - 1}\u0000`;
  });

  // **bold**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // *italic* — negative look-arounds exclude the ** marker case.
  html = html.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "<em>$1</em>");

  // [text](url) — only https://, http://, mailto:, tel:, or relative
  // paths are honored. Anything else (javascript:, data:, etc.)
  // collapses to the plaintext so a malicious edit can't exfiltrate.
  html = html.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_m, text: string, url: string) => {
      if (!isSafeUrl(url)) return text;
      return `<a href="${url}" style="color:#4f8cff;text-decoration:underline">${text}</a>`;
    },
  );

  // Restore code spans now that bold/italic have run.
  html = html.replace(/\u0000CODE(\d+)\u0000/g, (_m, idx: string) => {
    const inner = codeSpans[Number(idx)];
    return `<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px">${inner}</code>`;
  });

  return html;
}

function isSafeUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^(javascript|data|vbscript):/i.test(trimmed)) return false;
  if (/^(https?|mailto|tel):/i.test(trimmed)) return true;
  // Relative paths (start with / or #) are OK.
  if (/^[/#?]/.test(trimmed)) return true;
  return false;
}

// Render markdown-lite into HTML paragraphs styled to fit the
// branded email layout. Returns a single string of <p>…</p> blocks
// suitable for inlining as a `kind: "text"` section.
export function renderMarkdownLite(source: string): string {
  if (!source) return "";
  const trimmed = source.trim();
  if (!trimmed) return "";

  // Paragraph split first (before escape) so the blank-line regex is
  // straightforward. Individual paragraphs are escaped as they're
  // rendered.
  const paragraphs = trimmed.split(/\n\s*\n/);
  return paragraphs
    .map((p) => {
      const escaped = escapeHtml(p.trim()).replace(/\n/g, "<br />");
      const inline = renderInline(escaped);
      return `<p style="margin:0 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:16px;line-height:1.6;color:#374151">${inline}</p>`;
    })
    .join("\n");
}

// Strip markdown down to plain text for the text/plain alternative.
// Same whitelist, inverted: markers are removed and links become
// "text (url)".
export function renderMarkdownPlain(source: string): string {
  if (!source) return "";
  let out = source.trim();
  // Drop bold/italic markers.
  out = out.replace(/\*\*(.+?)\*\*/g, "$1");
  out = out.replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/g, "$1");
  // Drop backticks around code.
  out = out.replace(/`([^`]+?)`/g, "$1");
  // [text](url) → "text (url)"
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text: string, url: string) => {
    if (!isSafeUrl(url)) return text;
    return `${text} (${url})`;
  });
  return out;
}
