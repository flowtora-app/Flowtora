import * as React from "react";
import { cn } from "@/lib/cn";

// Skeleton — shimmer placeholder for loading states. Use in Suspense
// fallbacks and anywhere an async boundary would otherwise show blank
// space. Honors prefers-reduced-motion — shimmer becomes a static pulse.
//
// Common patterns:
//   <Skeleton className="h-8 w-40" />            // single line
//   <SkeletonText lines={3} />                   // paragraph
//   <SkeletonCard />                             // card-shaped block

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rounded?: "sm" | "md" | "lg" | "pill" | "full";
}

const RADIUS: Record<NonNullable<SkeletonProps["rounded"]>, string> = {
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  pill: "var(--radius-pill)",
  full: "9999px",
};

export function Skeleton({
  rounded = "md",
  className,
  style,
  ...rest
}: SkeletonProps) {
  return (
    <>
      <div
        aria-hidden
        className={cn("ts-skeleton", className)}
        style={{
          background: "var(--surface-2)",
          borderRadius: RADIUS[rounded],
          ...style,
        }}
        {...rest}
      />
      <style>{`
        .ts-skeleton {
          position: relative;
          overflow: hidden;
          isolation: isolate;
        }
        .ts-skeleton::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            90deg,
            transparent 0%,
            var(--surface-3) 50%,
            transparent 100%
          );
          animation: ts-skeleton-shimmer 1.4s ease-in-out infinite;
        }
        @keyframes ts-skeleton-shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @media (prefers-reduced-motion: reduce) {
          .ts-skeleton::after {
            animation: ts-skeleton-pulse 1.8s ease-in-out infinite;
            background: var(--surface-3);
            opacity: 0.4;
          }
          @keyframes ts-skeleton-pulse {
            0%, 100% { opacity: 0.2; }
            50% { opacity: 0.5; }
          }
        }
      `}</style>
    </>
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          style={{ width: i === lines - 1 ? "60%" : "100%" }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-lg p-5", className)}
      style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
    >
      <Skeleton className="h-4 w-32" />
      <div className="mt-3">
        <SkeletonText lines={3} />
      </div>
    </div>
  );
}
