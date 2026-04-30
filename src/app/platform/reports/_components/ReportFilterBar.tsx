"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import type { ReportDimension } from "@/server/platform/reports/registry";

// ReportFilterBar — Page 3 §Filter bar.
//
// Date range + comparison toggle + per-report dimension pickers.
// Pure URL-driven so deep-links round-trip the filter state.

export interface ReportFilterBarProps {
  initial: {
    since: string;
    until: string;
    compareTo: "previous" | "year" | "off";
    dimensions: Record<string, string>;
  };
  /** Where the form should submit. Defaults to the current pathname. */
  basePath?: string;
  dimensions: ReportDimension[];
}

export function ReportFilterBar({ initial, basePath, dimensions }: ReportFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [since, setSince] = React.useState(initial.since);
  const [until, setUntil] = React.useState(initial.until);
  const [compareTo, setCompareTo] = React.useState<"previous" | "year" | "off">(initial.compareTo);
  const [dimValues, setDimValues] = React.useState<Record<string, string>>(initial.dimensions);

  const buildHref = (override?: Partial<{ since: string; until: string; compareTo: string; dimensions: Record<string, string> }>) => {
    const u = new URLSearchParams();
    const s = override?.since ?? since;
    const e = override?.until ?? until;
    const c = override?.compareTo ?? compareTo;
    const d = override?.dimensions ?? dimValues;
    if (s) u.set("since", s);
    if (e) u.set("until", e);
    if (c && c !== "off") u.set("compareTo", c);
    for (const [k, v] of Object.entries(d)) {
      if (v && v !== "off") u.set(`dim_${k}`, v);
    }
    return `${basePath ?? pathname}${u.toString() ? `?${u.toString()}` : ""}`;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    router.push(buildHref());
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
      <Input label="Since" type="date" size="sm" value={since}
        onChange={(e) => setSince(e.currentTarget.value)} />
      <Input label="Until" type="date" size="sm" value={until}
        onChange={(e) => setUntil(e.currentTarget.value)} />
      <Select
        label="Compare to"
        size="sm"
        value={compareTo}
        onChange={(e) => setCompareTo(e.currentTarget.value as typeof compareTo)}
        options={[
          { value: "off",      label: "Off" },
          { value: "previous", label: "Previous period" },
          { value: "year",     label: "Year ago" },
        ]}
      />
      {dimensions.map((d) => (
        <Select
          key={d.key}
          label={d.label}
          size="sm"
          value={dimValues[d.key] ?? d.options[0]?.value ?? ""}
          onChange={(e) => setDimValues((prev) => ({ ...prev, [d.key]: e.currentTarget.value }))}
          options={d.options}
        />
      ))}
      <Button type="submit" size="sm">Run now</Button>
      {(since || until || compareTo !== "off" || Object.values(dimValues).some((v) => v && v !== "off")) && (
        <Link href={basePath ?? pathname} className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          Reset
        </Link>
      )}
    </form>
  );
}
