import * as React from "react";
import Link from "next/link";
import { Container } from "./Container";

// CTA — the bottom-of-page conversion block. Used across landing,
// features, pricing, industry pages. One primary action, optional
// secondary link. Large and hard to miss.

export interface CTAProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string };
}

export function CTA({ eyebrow, title, description, primary, secondary }: CTAProps) {
  return (
    <section className="py-20 md:py-24">
      <Container size="lg">
        <div
          className="overflow-hidden rounded-2xl px-6 py-14 text-center md:px-12"
          style={{
            background:
              "linear-gradient(135deg, var(--accent-surface-strong) 0%, var(--surface-2) 100%)",
            border: "1px solid var(--accent-surface-strong)",
          }}
        >
          {eyebrow && (
            <div
              className="mb-3 text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--accent-primary)" }}
            >
              {eyebrow}
            </div>
          )}
          <h2
            className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight md:text-4xl"
            style={{ color: "var(--text-default)" }}
          >
            {title}
          </h2>
          {description && (
            <p
              className="mx-auto mt-4 max-w-xl text-base leading-relaxed md:text-lg"
              style={{ color: "var(--text-muted)" }}
            >
              {description}
            </p>
          )}
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href={primary.href}
              className="ts-focus inline-flex h-11 items-center justify-center rounded-md px-6 text-sm font-medium transition-colors hover:brightness-110"
              style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
            >
              {primary.label}
            </Link>
            {secondary && (
              <Link
                href={secondary.href}
                className="ts-focus inline-flex h-11 items-center justify-center rounded-md px-6 text-sm font-medium transition-colors hover:brightness-110"
                style={{
                  background: "var(--surface-1)",
                  color: "var(--text-default)",
                  border: "1px solid var(--border-default)",
                }}
              >
                {secondary.label}
              </Link>
            )}
          </div>
        </div>
      </Container>
    </section>
  );
}
