import * as React from "react";
import { Container } from "./Container";

// LogoCloud — "trusted by" strip. Until we have real customer logos,
// this renders brand names in muted typography. Swap to <img> tags
// once we're allowed to show real logos.

export interface LogoCloudProps {
  label?: React.ReactNode;
  logos: string[];
}

export function LogoCloud({ label, logos }: LogoCloudProps) {
  return (
    <section className="py-14" style={{ borderTop: "1px solid var(--border-subtle)", borderBottom: "1px solid var(--border-subtle)" }}>
      <Container size="lg">
        {label && (
          <div
            className="mb-6 text-center text-xs font-medium uppercase tracking-wider"
            style={{ color: "var(--text-faint)" }}
          >
            {label}
          </div>
        )}
        <div
          className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4"
          style={{ color: "var(--text-muted)" }}
        >
          {logos.map((logo, i) => (
            <span
              key={i}
              className="text-base font-semibold tracking-wide opacity-80"
              style={{ letterSpacing: "0.02em" }}
            >
              {logo}
            </span>
          ))}
        </div>
      </Container>
    </section>
  );
}
