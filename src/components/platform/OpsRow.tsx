import Link from "next/link";
import { fmtNumber } from "@/lib/platform-format";

// Operational vitals strip — a row of compact cards showing the signals
// that should be green in a normal week: emails flowing, no lingering
// impersonations, exports caught up, payments settling. Anything that
// isn't boring here is a lead. Each tile links into the relevant admin
// surface.

type Tone = "success" | "warning" | "danger" | "info" | "neutral";

type TileProps = {
  label: string;
  value: React.ReactNode;
  sub: string;
  tone: Tone;
  href?: string;
  icon: string;
};

const TONE_STYLES: Record<Tone, { fg: string; bg: string; dot: string }> = {
  success: { fg: "var(--success-fg)", bg: "var(--success-surface)", dot: "var(--success)" },
  warning: { fg: "var(--warning-fg)", bg: "var(--warning-surface)", dot: "var(--warning)" },
  danger:  { fg: "var(--danger-fg)",  bg: "var(--danger-surface)",  dot: "var(--danger)"  },
  info:    { fg: "var(--info-fg)",    bg: "var(--info-surface)",    dot: "var(--info)"    },
  neutral: { fg: "var(--text-muted)", bg: "var(--surface-2)",       dot: "var(--text-muted)" },
};

function Tile({ label, value, sub, tone, href, icon }: TileProps) {
  const palette = TONE_STYLES[tone];
  const content = (
    <div
      className="flex h-full items-start gap-3 rounded-xl px-4 py-3 transition-colors hover:brightness-110"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <span
        aria-hidden
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base"
        style={{ background: palette.bg, color: palette.fg }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          {label}
        </div>
        <div
          className="mt-0.5 text-xl font-semibold tabular-nums"
          style={{ color: "var(--text-default)" }}
        >
          {value}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: palette.dot }}
          />
          <span className="truncate">{sub}</span>
        </div>
      </div>
    </div>
  );
  if (href) return <Link href={href} className="block h-full">{content}</Link>;
  return content;
}

type Props = {
  emailsOut24h: number;
  activeImpersonations: number;
  pendingExports: number;
  dueExportsOld: number;
  paymentSuccessPct30d: number;
  paymentsFailed30d: number;
};

export function OpsRow({
  emailsOut24h,
  activeImpersonations,
  pendingExports,
  dueExportsOld,
  paymentSuccessPct30d,
  paymentsFailed30d,
}: Props) {
  const impersonationTone: Tone = activeImpersonations > 0 ? "info" : "neutral";
  const exportsTone: Tone = dueExportsOld > 0 ? "warning" : pendingExports > 0 ? "info" : "success";
  const paymentsTone: Tone =
    paymentSuccessPct30d >= 98 ? "success" :
    paymentSuccessPct30d >= 90 ? "info"    :
    paymentSuccessPct30d >= 75 ? "warning" :
    "danger";

  return (
    <section aria-label="Operational vitals" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        label="Email (24h)"
        value={fmtNumber(emailsOut24h)}
        sub={emailsOut24h > 0 ? "Outbound flowing" : "No mail sent today"}
        tone={emailsOut24h > 0 ? "success" : "neutral"}
        icon="✉"
        href="/platform/communications"
      />
      <Tile
        label="Impersonations"
        value={fmtNumber(activeImpersonations)}
        sub={activeImpersonations === 0 ? "None active" : "Active sessions — review"}
        tone={impersonationTone}
        icon="⎆"
        href="/platform/security"
      />
      <Tile
        label="Data exports"
        value={fmtNumber(pendingExports)}
        sub={
          pendingExports === 0
            ? "Queue clear"
            : dueExportsOld > 0
              ? `${dueExportsOld} older than 24h`
              : "Queued — working"
        }
        tone={exportsTone}
        icon="⤓"
        href="/platform/legal"
      />
      <Tile
        label="Payment success (30d)"
        value={`${paymentSuccessPct30d}%`}
        sub={
          paymentsFailed30d === 0
            ? "No failures in 30d"
            : `${paymentsFailed30d} failed in 30d`
        }
        tone={paymentsTone}
        icon="✓"
        href="/platform/billing"
      />
    </section>
  );
}
