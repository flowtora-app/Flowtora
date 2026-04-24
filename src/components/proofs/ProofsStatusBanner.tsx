import type { ProofStatus } from "@prisma/client";
import { formatDate } from "@/lib/format";

type BannerProof = {
  id: string;
  version: number;
  status: ProofStatus;
  sentAt: Date | null;
  respondedAt: Date | null;
  dueAt: Date | null;
  lockedAt: Date | null;
};

export function ProofsStatusBanner({ proofs }: { proofs: BannerProof[] }) {
  if (proofs.length === 0) {
    return (
      <Banner
        tone="info"
        icon="✎"
        title="No proofs yet"
        body="Start the first version to share artwork with the customer for approval."
      />
    );
  }

  const latest = proofs[0];
  const approved = proofs.find((p) => p.status === "APPROVED" && p.lockedAt);

  if (approved && approved.id === latest.id) {
    return (
      <Banner
        tone="success"
        icon="✓"
        title={`Version ${approved.version} approved`}
        body="Customer signed off. The approved version is locked — production can proceed."
      />
    );
  }

  switch (latest.status) {
    case "DRAFT":
      return (
        <Banner
          tone="neutral"
          icon="✎"
          title={`Version ${latest.version} — draft in progress`}
          body="Not yet sent to the customer. Upload files and send when you're ready."
        />
      );
    case "SENT": {
      const dueText = latest.dueAt ? ` · Due ${formatDate(latest.dueAt)}` : "";
      const sentText = latest.sentAt ? `Sent ${formatDate(latest.sentAt)}` : "Awaiting customer response";
      return (
        <Banner
          tone="info"
          icon="→"
          title={`Version ${latest.version} — awaiting customer approval`}
          body={`${sentText}${dueText}. The customer can approve or request changes from their portal.`}
        />
      );
    }
    case "CHANGES_REQUESTED":
      return (
        <Banner
          tone="warning"
          icon="↺"
          title={`Version ${latest.version} — changes requested`}
          body="Customer asked for revisions. Start a new version to iterate, or re-send once you've addressed the feedback."
        />
      );
    case "REJECTED":
      return (
        <Banner
          tone="danger"
          icon="✕"
          title={`Version ${latest.version} — rejected`}
          body="Customer rejected this version. Talk to the customer, then start a fresh version."
        />
      );
    case "APPROVED":
      return (
        <Banner
          tone="success"
          icon="✓"
          title={`Version ${latest.version} approved`}
          body="Customer signed off. Production can proceed."
        />
      );
    default:
      return null;
  }
}

type Tone = "info" | "success" | "warning" | "danger" | "neutral";

const TONE_STYLES: Record<Tone, { bg: string; fg: string; border: string }> = {
  info:    { bg: "rgb(59 130 246 / 0.1)",  fg: "rgb(29 78 216)",   border: "rgb(59 130 246 / 0.3)" },
  success: { bg: "rgb(16 185 129 / 0.1)",  fg: "rgb(6 95 70)",     border: "rgb(16 185 129 / 0.3)" },
  warning: { bg: "rgb(245 158 11 / 0.1)",  fg: "rgb(146 64 14)",   border: "rgb(245 158 11 / 0.3)" },
  danger:  { bg: "var(--danger-surface)",  fg: "var(--danger-fg)", border: "var(--danger-fg)"      },
  neutral: { bg: "var(--surface-1)",       fg: "var(--text-default)", border: "var(--border-subtle)" },
};

function Banner({
  tone,
  icon,
  title,
  body,
}: {
  tone: Tone;
  icon: string;
  title: string;
  body: string;
}) {
  const s = TONE_STYLES[tone];
  return (
    <div
      className="flex items-start gap-3 rounded-lg px-4 py-3"
      style={{ background: s.bg, border: `1px solid ${s.border}` }}
    >
      <div
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
        style={{ background: s.fg, color: "white" }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-semibold" style={{ color: s.fg }}>{title}</div>
        <div className="mt-0.5 text-xs" style={{ color: s.fg, opacity: 0.85 }}>
          {body}
        </div>
      </div>
    </div>
  );
}
