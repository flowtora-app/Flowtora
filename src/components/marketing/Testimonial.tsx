import * as React from "react";

// Testimonial — pull-quote with attribution. One row of the marketing
// trust layer. Until a signed real-customer quote is ready, consumers
// of this component should pass a positioning-statement attribution
// (e.g. `author="Our promise"`) rather than fabricating a customer —
// see docs/transformation-plan.md §Phase 1.

export interface TestimonialProps {
  quote: React.ReactNode;
  author: string;
  role?: string;
  company?: string;
}

export function Testimonial({ quote, author, role, company }: TestimonialProps) {
  return (
    <figure
      className="rounded-2xl p-8 md:p-10"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <blockquote
        className="text-xl leading-relaxed md:text-2xl"
        style={{ color: "var(--text-default)" }}
      >
        <span style={{ color: "var(--accent-primary)" }}>&ldquo;</span>
        {quote}
        <span style={{ color: "var(--accent-primary)" }}>&rdquo;</span>
      </blockquote>
      <figcaption className="mt-6 flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold"
          style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
        >
          {author.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            {author}
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            {role}
            {role && company && " · "}
            {company}
          </div>
        </div>
      </figcaption>
    </figure>
  );
}
