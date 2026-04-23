import Link from "next/link";
import { SectionCard } from "@/components/platform/SectionCard";
import type { PlatformActivityItem } from "@/server/platform/overview-metrics";
import { ageLabel } from "@/lib/platform-format";

// Recent platform activity: new sign-ups, impersonations, deletion
// requests, and audit-log events. Shows the last ~72h in a single
// chronological list so an admin can scan for anything unexpected.

const TONE_COLOR: Record<PlatformActivityItem["tone"], string> = {
  neutral: "var(--text-muted)",
  success: "var(--success-fg)",
  warning: "var(--warning-fg)",
  danger:  "var(--danger-fg)",
  info:    "var(--info-fg)",
};

const KIND_ICON: Record<PlatformActivityItem["kind"], string> = {
  audit:          "•",
  tenant:         "＋",
  impersonation:  "⎆",
  deletion:       "−",
};

type Props = {
  items: PlatformActivityItem[];
};

export function PlatformActivityFeed({ items }: Props) {
  return (
    <SectionCard
      title="Recent activity"
      subtitle="Sign-ups, impersonations, deletions, and audited events (last 72h)"
      action={
        <Link
          href="/platform/audit"
          className="text-xs"
          style={{ color: "var(--accent-primary)" }}
        >
          Open audit log →
        </Link>
      }
    >
      {items.length === 0 ? (
        <div
          className="rounded-lg px-4 py-10 text-center text-sm"
          style={{
            background: "var(--surface-0)",
            border: "1px dashed var(--border-subtle)",
            color: "var(--text-muted)",
          }}
        >
          Nothing has happened on the platform in the last 72 hours.
        </div>
      ) : (
        <ol className="relative">
          <span
            aria-hidden
            className="absolute left-[15px] top-1 bottom-1 w-px"
            style={{ background: "var(--border-subtle)" }}
          />
          {items.map((it) => {
            const row = (
              <div className="flex items-start gap-3 py-2.5">
                <span
                  aria-hidden
                  className="relative z-[1] mt-0.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-[13px]"
                  style={{
                    background: "var(--surface-2)",
                    color: TONE_COLOR[it.tone],
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  {KIND_ICON[it.kind]}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className="line-clamp-1 text-sm"
                    style={{ color: "var(--text-default)" }}
                  >
                    {it.title}
                  </div>
                  <div
                    className="mt-0.5 line-clamp-1 text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {it.subtitle}
                  </div>
                </div>
                <span
                  className="mt-1 whitespace-nowrap text-xs tabular-nums"
                  style={{ color: "var(--text-faint)" }}
                >
                  {ageLabel(it.occurredAt)}
                </span>
              </div>
            );
            return (
              <li key={it.id}>
                {it.href ? (
                  <Link
                    href={it.href}
                    className="block rounded-md px-1 transition-colors hover:brightness-110"
                  >
                    {row}
                  </Link>
                ) : (
                  <div className="px-1">{row}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </SectionCard>
  );
}
