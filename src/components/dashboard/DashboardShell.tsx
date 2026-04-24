import * as React from "react";

// Phase 2 (transformation) — persona-constant dashboard frame.
//
// Every persona's dashboard now has the same shape, read top-to-bottom:
//
//   1. Greeting + branch selector                ← `greeting` slot
//   2. Activation / onboarding widget            ← `activation` slot (optional)
//   3. 4-tile hero band (Revenue / Pipeline / AR / 7d cash)
//                                                ← `hero` slot (optional
//                                                    — hidden for personas
//                                                    that shouldn't see $)
//   4. "Needs your attention" widget             ← `attention` slot
//   5. Persona-variable content (tile grid, trend
//      charts, focus areas)                      ← `children`
//   6. Activity feed                             ← `activity` slot
//   7. Trial banner / CTAs                       ← `footer` slot (optional)
//
// The shell's job is to enforce consistent spacing, ordering, and the
// "story" feel of the page — not to decide what goes in each slot. The
// page-level dashboard composer picks which widgets actually populate
// each slot for the current persona.
//
// Why named slots (not children with structural assumptions)?
//   - Personas omit certain slots. The "employee" persona skips the
//     financial hero band entirely; an optional `hero` prop is clearer
//     than a magic `if (hasHero)` branch inside the shell.
//   - Conditional ordering is easier to reason about than conditional
//     className tricks on a generic children list.

export type DashboardShellProps = {
  greeting: React.ReactNode;
  activation?: React.ReactNode;
  hero?: React.ReactNode;
  attention: React.ReactNode;
  children: React.ReactNode;
  activity?: React.ReactNode;
  footer?: React.ReactNode;
};

export function DashboardShell({
  greeting,
  activation,
  hero,
  attention,
  children,
  activity,
  footer,
}: DashboardShellProps) {
  return (
    <div className="space-y-6">
      {greeting}
      {activation && <div>{activation}</div>}
      {hero}
      {attention}
      {/*
        Persona-specific content. Historically this was the whole
        dashboard; now it's the "your focus" section beneath the hero
        band. Persona views are still responsible for their own section
        headings + tile grids.
      */}
      <div className="space-y-5">{children}</div>
      {activity}
      {footer}
    </div>
  );
}
