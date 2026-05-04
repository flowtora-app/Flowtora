// Tiny Markdown → safe-HTML renderer used by the KB editor preview
// pane. Intentionally minimal: handles headings, bold, italic, code,
// inline code, lists, links, paragraphs, and HR. Anything not in the
// grammar passes through as escaped text. We don't want a heavy
// dependency just for the preview.

const ESC_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC_MAP[c] ?? c);

function inline(s: string): string {
  let out = escapeHtml(s);

  // links: [text](url) — only http/https/relative
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, href) => {
    if (!/^(https?:\/\/|\/)/i.test(href)) return `[${text}](${href})`;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });

  // images: ![alt](url)
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, src) => {
    if (!/^(https?:\/\/|\/)/i.test(src)) return `![${alt}](${src})`;
    return `<img src="${src}" alt="${alt}" loading="lazy" />`;
  });

  // inline code
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");

  // bold + italic
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(?<!\*)\*([^*]+)\*/g, "<em>$1</em>");

  return out;
}

interface Block {
  type: "p" | "h" | "ul" | "ol" | "code" | "hr" | "blockquote" | "callout" | "details";
  level?: number;
  content?: string;
  items?: string[];
  language?: string;
  variant?: "info" | "warning" | "danger" | "success";
  summary?: string;
}

export function renderMarkdown(input: string): string {
  if (!input || !input.trim()) {
    return '<p class="md-empty">— No content yet —</p>';
  }
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (!line.trim()) { i += 1; continue; }

    // fenced code
    if (line.trim().startsWith("```")) {
      const fence = line.trim().replace(/^```/, "");
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) {
        buf.push(lines[i] ?? "");
        i += 1;
      }
      i += 1;
      blocks.push({ type: "code", content: buf.join("\n"), language: fence });
      continue;
    }

    // headings
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      blocks.push({ type: "h", level: h[1]!.length, content: h[2]! });
      i += 1; continue;
    }

    // hr
    if (line.match(/^[-_*]{3,}$/)) {
      blocks.push({ type: "hr" });
      i += 1; continue;
    }

    // blockquote
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("> ")) {
        buf.push(lines[i]!.slice(2));
        i += 1;
      }
      blocks.push({ type: "blockquote", content: buf.join(" ") });
      continue;
    }

    // callout — :::info / :::warning / :::danger / :::success ... :::
    const calloutOpen = line.match(/^:::(info|warning|danger|success)\s*$/);
    if (calloutOpen) {
      const variant = calloutOpen[1] as Block["variant"];
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && lines[i]!.trim() !== ":::") {
        buf.push(lines[i] ?? "");
        i += 1;
      }
      i += 1;
      blocks.push({ type: "callout", variant, content: buf.join(" ") });
      continue;
    }

    // details — :::details Summary text
    const detailsOpen = line.match(/^:::details\s+(.+)$/);
    if (detailsOpen) {
      const summary = detailsOpen[1]!;
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && lines[i]!.trim() !== ":::") {
        buf.push(lines[i] ?? "");
        i += 1;
      }
      i += 1;
      blocks.push({ type: "details", summary, content: buf.join(" ") });
      continue;
    }

    // ordered list
    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i] ?? "")) {
        items.push(lines[i]!.replace(/^\d+\.\s/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    // unordered list
    if (/^[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s/.test(lines[i] ?? "")) {
        items.push(lines[i]!.replace(/^[-*+]\s/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    // paragraph: gather contiguous non-empty lines that aren't structural.
    const buf: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !isStructural(lines[i]!)) {
      buf.push(lines[i]!);
      i += 1;
    }
    if (buf.length) blocks.push({ type: "p", content: buf.join(" ") });
  }

  return blocks.map(renderBlock).join("\n");
}

function isStructural(line: string): boolean {
  return (
    line.startsWith("```")
    || /^#{1,6}\s/.test(line)
    || /^[-_*]{3,}$/.test(line)
    || line.startsWith("> ")
    || /^:::(info|warning|danger|success|details)/.test(line)
    || /^\d+\.\s/.test(line)
    || /^[-*+]\s/.test(line)
  );
}

function renderBlock(b: Block): string {
  switch (b.type) {
    case "h":
      return `<h${b.level} class="md-h${b.level}">${inline(b.content!)}</h${b.level}>`;
    case "p":
      return `<p>${inline(b.content!)}</p>`;
    case "ul":
      return `<ul>${(b.items ?? []).map((i) => `<li>${inline(i)}</li>`).join("")}</ul>`;
    case "ol":
      return `<ol>${(b.items ?? []).map((i) => `<li>${inline(i)}</li>`).join("")}</ol>`;
    case "code":
      return `<pre class="md-code"><code>${escapeHtml(b.content ?? "")}</code></pre>`;
    case "hr":
      return `<hr />`;
    case "blockquote":
      return `<blockquote>${inline(b.content ?? "")}</blockquote>`;
    case "callout": {
      const variant = b.variant ?? "info";
      return `<aside class="md-callout md-callout--${variant}">${inline(b.content ?? "")}</aside>`;
    }
    case "details":
      return `<details><summary>${escapeHtml(b.summary ?? "")}</summary><div>${inline(b.content ?? "")}</div></details>`;
  }
}
