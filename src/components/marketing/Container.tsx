import * as React from "react";
import { cn } from "@/lib/cn";

// Container — horizontal content constraint for marketing pages.
//
// All marketing layouts pass through one of these. Using a single
// primitive keeps line-length and gutters consistent; changing the
// max-width here reflows every page.

export interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg";
}

const MAX: Record<NonNullable<ContainerProps["size"]>, string> = {
  sm: "max-w-3xl",  // narrow copy (FAQ, forms)
  md: "max-w-5xl",  // default marketing width
  lg: "max-w-6xl",  // feature grids, pricing tables
};

export function Container({ size = "md", className, ...rest }: ContainerProps) {
  return <div className={cn("mx-auto w-full px-6", MAX[size], className)} {...rest} />;
}
