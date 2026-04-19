"use client";

import { useState } from "react";

// Phase 15 Slice A — copy-to-clipboard micro-widget used by the staff
// share-link panel. Needs to be a client component because the enclosing
// detail page is a server component.

export function CopyUrlButton({ url, label = "Copy" }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback for older browsers: use a hidden textarea + execCommand.
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Best-effort; we don't want to throw in the clipboard path.
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
      style={{
        background: copied ? "var(--success-surface)" : "var(--surface-2)",
        color: copied ? "var(--success-fg)" : "var(--text-default)",
        border: `1px solid ${copied ? "var(--success-fg)" : "var(--border-subtle)"}`,
      }}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
