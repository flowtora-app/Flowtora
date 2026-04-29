import Link from "next/link";
import { Icon, type IconName } from "@/components/shell/icons";

// Shared shell for /platform/* section pages — used by both hub pages
// (which list sub-surfaces as tile cards) and preview stubs (which
// describe what the section will eventually do). Keeps the visual
// language consistent across the 13 new sections without duplicating
// 200 lines of per-page chrome.

export type SectionTile = {
  href: string;
  icon: IconName;
  title: string;
  description: string;
  /** Optional external label, e.g. "↗" for outbound links. */
  meta?: string;
  /** When true, render as a Preview chip instead of an active tile. */
  preview?: boolean;
};

export interface SectionPageProps {
  /** Eyebrow above the title — usually "Phase X · Name" or similar. */
  eyebrow?: string;
  /** Icon for the eyebrow row. */
  eyebrowIcon?: IconName;
  title: string;
  description: string;
  /** Hub tiles linking to existing surfaces. */
  tiles?: SectionTile[];
  /** When this is a preview stub (no real implementation), pass roadmap
   *  bullets to set expectations. */
  roadmap?: { title: string; body: string }[];
  /** Optional sidebar callout — short paragraph + a single CTA. */
  callout?: { title: string; body: string; href?: string; cta?: string } | null;
  /** Show a yellow "Preview" chip in the header to signal stub status. */
  preview?: boolean;
}

export function SectionPage({
  eyebrow,
  eyebrowIcon,
  title,
  description,
  tiles,
  roadmap,
  callout,
  preview,
}: SectionPageProps) {
  const EyebrowIcon = eyebrowIcon ? Icon[eyebrowIcon] : null;
  return (
    <div className="space-y-6">
      <div>
        {eyebrow && (
          <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            {EyebrowIcon ? <EyebrowIcon size={14} /> : null}
            <span>{eyebrow}</span>
          </div>
        )}
        <div className="mt-1 flex items-center gap-2">
          <h1 className="text-[26px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
            {title}
          </h1>
          {preview && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ background: "var(--warning-surface)", color: "var(--warning-fg)", border: "1px solid var(--warning-fg)" }}
              title="Preview — feature is on the roadmap but not yet wired up"
            >
              Preview
            </span>
          )}
        </div>
        <p className="mt-1 max-w-3xl text-[13px]" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      </div>

      {tiles && tiles.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {tiles.map((t) => (
            <SectionTileCard key={t.href + t.title} tile={t} />
          ))}
        </div>
      )}

      {roadmap && roadmap.length > 0 && (
        <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
              On the roadmap
            </h2>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              What this section will become. Order is rough — slices ship as priority + scope shake out.
            </p>
          </div>
          <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
            {roadmap.map((r) => (
              <li key={r.title} className="px-4 py-3 text-[13px]">
                <div className="font-semibold" style={{ color: "var(--text-default)" }}>{r.title}</div>
                <div className="mt-0.5 text-[12px]" style={{ color: "var(--text-muted)" }}>{r.body}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {callout && (
        <section
          className="rounded-lg border p-4"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
        >
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>{callout.title}</h2>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>{callout.body}</p>
          {callout.href && callout.cta && (
            <Link
              href={callout.href}
              className="ts-focus mt-3 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-default)", background: "var(--surface-1)" }}
            >
              {callout.cta} →
            </Link>
          )}
        </section>
      )}
    </div>
  );
}

function SectionTileCard({ tile }: { tile: SectionTile }) {
  const IconCmp = Icon[tile.icon];
  return (
    <Link
      href={tile.href}
      className="ts-focus block rounded-lg border p-4 transition-colors hover:bg-[var(--surface-2)]"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-md"
          style={{ background: "var(--accent-surface)", color: "var(--accent-primary)" }}
        >
          <IconCmp size={16} />
        </span>
        <div className="flex items-center gap-2">
          <div className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            {tile.title}
          </div>
          {tile.preview && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide"
              style={{ background: "var(--surface-2)", color: "var(--text-muted)", border: "1px solid var(--border-subtle)" }}
            >
              Preview
            </span>
          )}
        </div>
        {tile.meta && (
          <span className="ml-auto text-[11px]" style={{ color: "var(--text-muted)" }}>{tile.meta}</span>
        )}
      </div>
      <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>{tile.description}</p>
    </Link>
  );
}
