import * as React from "react";
import Link from "next/link";
import { Container } from "./Container";

// Hero — the top-of-page header block on marketing routes.
//
// A big title, a subhead, two CTAs, an optional "trusted by" strip.
// Deliberately opinionated on typography so every marketing route
// leads with the same voice.

export interface HeroAction {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
}

export interface HeroProps {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  primary?: HeroAction;
  secondary?: HeroAction;
  footnote?: React.ReactNode;
  visual?: React.ReactNode;
  align?: "left" | "center";
}

export function Hero({
  eyebrow,
  title,
  description,
  primary,
  secondary,
  footnote,
  visual,
  align = "center",
}: HeroProps) {
  return (
    <section className="relative overflow-hidden pb-16 pt-20 md:pb-24 md:pt-28">
      {/* Decorative top gradient — subtle brand color wash. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, var(--accent-surface) 0%, transparent 60%)",
        }}
      />
      <Container size="lg" className="relative">
        <div
          className={`flex flex-col gap-6 ${align === "center" ? "items-center text-center" : "items-start"}`}
        >
          {eyebrow && (
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
              style={{
                background: "var(--accent-surface)",
                color: "var(--accent-primary)",
                border: "1px solid var(--accent-surface-strong)",
              }}
            >
              {eyebrow}
            </span>
          )}
          <h1
            className={`max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight md:text-6xl ${align === "center" ? "mx-auto" : ""}`}
            style={{ color: "var(--text-default)" }}
          >
            {title}
          </h1>
          {description && (
            <p
              className={`max-w-2xl text-lg leading-relaxed md:text-xl ${align === "center" ? "mx-auto" : ""}`}
              style={{ color: "var(--text-muted)" }}
            >
              {description}
            </p>
          )}
          {(primary || secondary) && (
            <div className={`flex flex-wrap gap-3 ${align === "center" ? "justify-center" : ""}`}>
              {primary && <HeroButton action={primary} />}
              {secondary && <HeroButton action={{ variant: "secondary", ...secondary }} />}
            </div>
          )}
          {footnote && (
            <div className="text-xs" style={{ color: "var(--text-faint)" }}>
              {footnote}
            </div>
          )}
          {visual && <div className="mt-8 w-full">{visual}</div>}
        </div>
      </Container>
    </section>
  );
}

function HeroButton({ action }: { action: HeroAction }) {
  const isPrimary = action.variant !== "secondary";
  return (
    <Link
      href={action.href}
      className="ts-focus inline-flex h-11 items-center justify-center rounded-md px-6 text-sm font-medium transition-colors hover:brightness-110"
      style={
        isPrimary
          ? { background: "var(--accent-primary)", color: "var(--accent-fg)", border: "1px solid var(--accent-primary)" }
          : { background: "var(--surface-1)", color: "var(--text-default)", border: "1px solid var(--border-default)" }
      }
    >
      {action.label}
    </Link>
  );
}
