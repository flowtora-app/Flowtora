// Left rail of the Support Tickets page — saved views + channel folders.
//
// Each view is a Link that drops a `view=` query param; channel
// folders set a `channel=` filter on top of the active view.

import Link from "next/link";
import type { SavedViewKey } from "@/server/platform/support-tickets";
import type { SupportTicketChannel } from "@prisma/client";
import { CHANNEL_ICON, CHANNEL_LABEL } from "./shared";

interface ViewRow {
  key: SavedViewKey;
  label: string;
  count: number;
  tone?: "default" | "accent" | "warning" | "danger";
}

const CHANNELS: SupportTicketChannel[] = ["EMAIL", "CHAT", "IN_APP", "PHONE", "FORUM"];

export function ViewsRail({
  active,
  counts,
  channelCounts,
  activeChannel,
  buildHref,
}: {
  active: SavedViewKey;
  counts: {
    unassigned: number;
    mine: number;
    open: number;
    pending: number;
    solvedToday: number;
    slaBreach: number;
    urgentHigh: number;
    allActive: number;
  };
  channelCounts: Record<SupportTicketChannel, number>;
  activeChannel: SupportTicketChannel | null;
  buildHref: (overrides: Record<string, string | undefined>) => string;
}) {
  const views: ViewRow[] = [
    { key: "unassigned",   label: "Unassigned",     count: counts.unassigned, tone: counts.unassigned > 0 ? "warning" : "default" },
    { key: "mine",         label: "Mine",           count: counts.mine,       tone: counts.mine > 0 ? "accent"   : "default" },
    { key: "open",         label: "Open",           count: counts.open,       tone: "accent"  },
    { key: "pending",      label: "Pending customer", count: counts.pending,  tone: "default" },
    { key: "solved_today", label: "Solved today",   count: counts.solvedToday, tone: "default" },
    { key: "sla_breach",   label: "Breaching SLA",  count: counts.slaBreach, tone: counts.slaBreach > 0 ? "danger"  : "default" },
    { key: "urgent_high",  label: "Urgent / High",  count: counts.urgentHigh, tone: counts.urgentHigh > 0 ? "warning" : "default" },
    { key: "all_active",   label: "All active",     count: counts.allActive, tone: "default" },
  ];

  return (
    <aside
      className="flex flex-col gap-4 rounded-lg border p-3"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      <div>
        <div
          className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-faint)" }}
        >
          Saved views
        </div>
        <ul className="flex flex-col gap-0.5">
          {views.map((v) => (
            <li key={v.key}>
              <ViewLink
                href={buildHref({ view: v.key, page: undefined })}
                label={v.label}
                count={v.count}
                tone={v.tone}
                selected={active === v.key}
              />
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div
          className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-faint)" }}
        >
          Channels
        </div>
        <ul className="flex flex-col gap-0.5">
          <li>
            <ViewLink
              href={buildHref({ channel: undefined, page: undefined })}
              label="All channels"
              count={undefined}
              selected={activeChannel === null}
            />
          </li>
          {CHANNELS.map((c) => (
            <li key={c}>
              <ViewLink
                href={buildHref({ channel: c, page: undefined })}
                label={`${CHANNEL_ICON[c]}  ${CHANNEL_LABEL[c]}`}
                count={channelCounts[c]}
                selected={activeChannel === c}
              />
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div
          className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-faint)" }}
        >
          All tickets
        </div>
        <ul className="flex flex-col gap-0.5">
          <li>
            <ViewLink
              href={buildHref({ view: "all", page: undefined })}
              label="All (incl. closed)"
              count={undefined}
              selected={active === "all"}
            />
          </li>
        </ul>
      </div>
    </aside>
  );
}

function ViewLink({
  href, label, count, tone, selected,
}: {
  href: string;
  label: string;
  count?: number;
  tone?: "default" | "accent" | "warning" | "danger";
  selected: boolean;
}) {
  const countTone =
    tone === "accent"  ? "var(--accent-primary)" :
    tone === "warning" ? "var(--warning-fg)"     :
    tone === "danger"  ? "var(--danger-fg)"      :
                         "var(--text-muted)";
  return (
    <Link
      href={href}
      className="ts-focus flex items-center justify-between rounded-md px-2 py-1.5 text-[12px] transition-colors"
      style={{
        background: selected ? "var(--surface-2)" : "transparent",
        color: selected ? "var(--text-default)" : "var(--text-muted)",
        fontWeight: selected ? 600 : 500,
      }}
    >
      <span className="truncate">{label}</span>
      {count !== undefined && (
        <span
          className="ml-2 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
          style={{
            color: countTone,
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {count}
        </span>
      )}
    </Link>
  );
}
