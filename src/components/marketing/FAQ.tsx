import * as React from "react";

// FAQ — collapsible Q/A rows for pre-conversion objection handling.
//
// We use native <details>/<summary> on purpose: no JS, keyboard
// accessible, works without hydration, and the open-state is
// per-item (so multiple can be expanded at once, which is what
// buyers actually do when comparing tools).
//
// Answers accept ReactNode so a question can link out to /features,
// /security, or /pricing without needing separate markup.

export interface FaqItem {
  q: string;
  a: React.ReactNode;
}

export function FAQ({ items }: { items: FaqItem[] }) {
  return (
    <ul
      className="divide-y rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        // divide color via CSS variable so it matches the border
        // (Tailwind's `divide-*` doesn't cooperate with custom
        // properties cleanly).
        borderColor: "var(--border-subtle)",
      }}
    >
      {items.map((item, idx) => (
        <li
          key={idx}
          style={{
            borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)",
          }}
        >
          <details className="group">
            <summary
              className="flex cursor-pointer list-none items-start justify-between gap-4 px-6 py-5 text-left"
              style={{ color: "var(--text-default)" }}
            >
              <span className="text-base font-medium leading-snug">
                {item.q}
              </span>
              <svg
                aria-hidden
                width="18"
                height="18"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                className="mt-0.5 flex-shrink-0 transition-transform group-open:rotate-180"
                style={{ color: "var(--text-muted)" }}
              >
                <path d="M5 7l5 5 5-5" />
              </svg>
            </summary>
            <div
              className="px-6 pb-6 text-sm leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              {item.a}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
