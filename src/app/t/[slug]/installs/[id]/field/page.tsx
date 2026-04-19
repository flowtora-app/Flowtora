import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { memberLookup } from "@/lib/members";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  INSTALL_ISSUE_SEVERITIES,
  INSTALL_SIGNER_ROLES,
  PHOTO_PHASES,
  computeReadiness,
  formatAddress,
  formatTimeRange,
  installKindLabel,
  installStatusColor,
  installStatusLabel,
  issueSeverityMeta,
  mapsHref,
  photoPhaseLabel,
} from "@/lib/installs";
import {
  addInstallPhoto,
  captureInstallSignature,
  changeInstallStatus,
  completeInstallWithEvidence,
  reportInstallIssue,
} from "@/app/actions/installs";
import { SignaturePad } from "@/components/installs/SignaturePad";
import { PhotoCaptureInput } from "@/components/installs/PhotoCaptureInput";
import { loadApprovalRules, orderHasDeposit } from "@/lib/approvals";

// Phase 13 Slice E — FIELD MODE.
//
// This is the one page we deliberately optimize for a phone held in one
// hand while the other is holding a drill. Key design choices:
//
//   • Single vertical column. No tables, no side-by-side layouts.
//   • Big tap targets (≥44px). Every action is a whole-row button, not
//     a tiny chip in the corner.
//   • The next realistic action is at the *top* — "I just arrived",
//     "I'm done". Everything else (photos, issues, signature) lives
//     under the action bar.
//   • Photos use <PhotoCaptureInput> which downscales before upload so
//     a 4G connection isn't a problem.
//   • The header carries address + "open in Maps", because after "what
//     time" the next question in the truck is "where am I going".
//   • Status banners use a traffic-light palette because you're reading
//     at arm's length, often outside in bright sun.
//
// The page still renders as a regular tenant-scoped Next page inside the
// AppShell. A future slice can strip the shell for a full-bleed PWA
// experience; for now the shell's TopBar gives crew a way back out.

export default async function InstallFieldPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string; tab?: "photos" | "issue" | "sign" | "overview" }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "installs:view");
  const canManage = ctx.can("installs:manage");

  const ev = await db.installEvent.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true } },
      order:    { select: { id: true, number: true, status: true } },
      checklistItems: { orderBy: { sortOrder: "asc" } },
      photos:     { orderBy: { capturedAt: "desc" }, take: 60 },
      signatures: { orderBy: { capturedAt: "desc" } },
      issues:     { orderBy: [{ status: "asc" }, { severity: "desc" }, { reportedAt: "desc" }] },
      siteSurvey: true,
    },
  });
  if (!ev) notFound();
  ctx.assertBranchAccess(ev.locationId);

  const memberMap = await memberLookup(ctx.tenant.id);

  // Readiness (same computation as detail page — deduped via shared helper).
  const stageCounts = await db.productionStage.groupBy({
    by: ["status"],
    where: { tenantId: ctx.tenant.id, orderId: ev.orderId },
    _count: { _all: true },
  });
  const totalStages = stageCounts.reduce((s, r) => s + r._count._all, 0);
  const doneStages  = stageCounts
    .filter((r) => r.status === "DONE" || r.status === "SKIPPED")
    .reduce((s, r) => s + r._count._all, 0);
  const productionCompleteRatio = totalStages > 0 ? doneStages / totalStages : null;
  const rules = await loadApprovalRules(ctx.tenant.id);
  const depositGap = ev.kind === "INSTALL"
    ? await orderHasDeposit(ctx.tenant.id, ev.orderId, rules)
    : null;
  const orderHasDepositOk: boolean | null =
    ev.kind === "INSTALL" && rules.requireDepositBeforeInstall
      ? depositGap === null
      : null;

  const openIssues   = ev.issues.filter((i) => i.status !== "RESOLVED");
  const openBlockers = openIssues.filter((i) => i.blocksCompletion);
  const beforePhotos = ev.photos.filter((p) => p.phase === "BEFORE").length;
  const afterPhotos  = ev.photos.filter((p) => p.phase === "AFTER").length;
  const readiness = computeReadiness({
    kind:              ev.kind,
    status:            ev.status,
    hasInstaller:      !!ev.installerId,
    crewCount:         ev.crewIds.length,
    hasAddress:        !!(ev.addressLine1 || ev.city),
    hasGps:            ev.gpsLat != null && ev.gpsLng != null,
    orderStatus:       ev.order.status,
    productionCompleteRatio,
    photoCount:        ev.photos.length,
    beforePhotoCount:  beforePhotos,
    afterPhotoCount:   afterPhotos,
    signatureCount:    ev.signatures.length,
    orderHasDeposit:   orderHasDepositOk,
    hasSurvey:         !!ev.siteSurvey,
    permitStatus:      ev.siteSurvey?.permitStatus ?? null,
    openBlockerCount:  openBlockers.length,
    openIssueCount:    openIssues.length - openBlockers.length,
    evidenceWaived:    ev.evidenceWaived,
  });

  const addressLine = formatAddress({
    addressLine1: ev.addressLine1,
    addressLine2: ev.addressLine2,
    city:         ev.city,
    region:       ev.region,
    postalCode:   ev.postalCode,
    country:      ev.country,
  });
  const mapHref = mapsHref({
    gpsLat:       ev.gpsLat,
    gpsLng:       ev.gpsLng,
    addressLine1: ev.addressLine1,
    addressLine2: ev.addressLine2,
    city:         ev.city,
    region:       ev.region,
    postalCode:   ev.postalCode,
    country:      ev.country,
  });

  // Tab model: four tabs, defaulting to "overview". We drive this with
  // URL query strings so Next's router-level scroll-to-top keeps the
  // user at the top when they switch — useful on phones.
  const tab = sp.tab ?? "overview";
  const tabHref = (t: "overview" | "photos" | "issue" | "sign") =>
    `/t/${slug}/installs/${ev.id}/field${t === "overview" ? "" : `?tab=${t}`}`;

  const statusTransitions = {
    SCHEDULED:   ["CONFIRMED", "IN_PROGRESS"],
    CONFIRMED:   ["IN_PROGRESS"],
    IN_PROGRESS: [] as string[], // handled by "Complete with evidence"
    COMPLETED:   [] as string[],
    CANCELED:    [] as string[],
    NO_SHOW:     [] as string[],
  }[ev.status];

  // Display the "next best action" prominently.
  const nextAction =
    ev.status === "SCHEDULED" || ev.status === "CONFIRMED" ? "arrive" :
    ev.status === "IN_PROGRESS" ? "complete" :
    "done";

  // Primary CTA label + server action.
  const primary = (() => {
    if (nextAction === "arrive") {
      return {
        label: "I'm on site",
        sub:   "Start the visit",
        form:  <form action={changeInstallStatus.bind(null, slug, ev.id)}>
                 <input type="hidden" name="status" value="IN_PROGRESS" />
                 <button type="submit" style={primaryButtonStyle}>I&apos;m on site</button>
               </form>,
      };
    }
    if (nextAction === "complete") {
      return {
        label: "Done",
        sub:   openBlockers.length > 0 ? "Resolve blockers first" : "Complete with evidence",
        form:  openBlockers.length > 0 ? (
          <button disabled style={{ ...primaryButtonStyle, opacity: 0.5, cursor: "not-allowed" }}>
            Resolve {openBlockers.length} blocker{openBlockers.length === 1 ? "" : "s"}
          </button>
        ) : (
          <form action={completeInstallWithEvidence.bind(null, slug, ev.id)}>
            <button type="submit" style={primaryButtonStyle}>Done</button>
          </form>
        ),
      };
    }
    return {
      label: "Already wrapped up",
      sub:   installStatusLabel(ev.status),
      form:  null,
    };
  })();

  return (
    <div className="mx-auto w-full max-w-lg space-y-4 pb-24 pt-2" style={{ minHeight: "100dvh" }}>
      {/* Back + exit-field-mode link */}
      <div className="flex items-center justify-between text-xs">
        <Link
          href={`/t/${slug}/installs/${ev.id}`}
          className="rounded-md px-2 py-1.5"
          style={{ border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
        >
          ← Full detail
        </Link>
        <span style={{ color: "var(--text-muted)" }}>Field mode</span>
      </div>

      {sp.error && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          {sp.error}
        </div>
      )}

      {/* Header card — the three questions the driver needs:
          WHAT: title + kind/status
          WHEN: date + time
          WHERE: address + map link */}
      <section
        className="rounded-xl px-5 py-4"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium"
            style={{ background: installStatusColor(ev.status), color: "white" }}
          >
            {installStatusLabel(ev.status)}
          </span>
          <span className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            {installKindLabel(ev.kind)}
          </span>
        </div>
        <h1 className="mt-2 text-xl font-semibold">
          {ev.title || `${installKindLabel(ev.kind)} for ${ev.order.number}`}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {formatDate(ev.scheduledStart)} · {formatTimeRange(ev.scheduledStart, ev.scheduledEnd)}
        </p>
        <div className="mt-3 space-y-1 text-sm">
          <div>
            <Link
              href={`/t/${slug}/customers/${ev.customer.id}`}
              className="font-medium underline"
            >
              {ev.customer.name}
            </Link>
          </div>
          {ev.customer.phone && (
            <a
              href={`tel:${ev.customer.phone}`}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
            >
              📞 Call {ev.customer.phone}
            </a>
          )}
        </div>
        {addressLine && (
          <div className="mt-3 space-y-2">
            <div className="text-sm">{addressLine}</div>
            {mapHref && (
              <a
                href={mapHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-3 text-sm font-medium"
                style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
              >
                🧭 Open in Maps
              </a>
            )}
          </div>
        )}
      </section>

      {/* Readiness chips — only show what's not OK. Crew doesn't need to
          see green checkmarks; they need to see what's wrong. */}
      {readiness.overall !== "ok" && (
        <section
          className="rounded-xl px-4 py-3"
          style={{
            background: readiness.overall === "fail" ? "var(--danger-surface)" : "#3a2a15",
            border: `1px solid ${readiness.overall === "fail" ? "var(--danger-fg)" : "#5b4b20"}`,
            color: readiness.overall === "fail" ? "var(--danger-fg)" : "#ffc98b",
          }}
        >
          <div className="text-xs font-semibold">
            {readiness.overall === "fail" ? "Not ready" : "Proceed with caution"}
          </div>
          <ul className="mt-1 space-y-0.5 text-xs">
            {readiness.checks
              .filter((c) => c.level === "fail" || c.level === "warn")
              .map((c) => (
                <li key={c.id}>
                  {c.level === "fail" ? "✗" : "⚠"} {c.label}{c.detail ? ` — ${c.detail}` : ""}
                </li>
              ))}
          </ul>
        </section>
      )}

      {/* Primary action */}
      {primary.form && (
        <section className="space-y-1">
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>{primary.sub}</div>
          {primary.form}
          {statusTransitions.includes("CONFIRMED") && (
            <form action={changeInstallStatus.bind(null, slug, ev.id)} className="mt-2">
              <input type="hidden" name="status" value="CONFIRMED" />
              <button type="submit" style={secondaryButtonStyle}>Confirmed with customer</button>
            </form>
          )}
        </section>
      )}

      {/* Tab switcher */}
      <nav
        className="grid grid-cols-4 gap-1 rounded-lg p-1"
        style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
      >
        {(["overview", "photos", "issue", "sign"] as const).map((t) => (
          <Link
            key={t}
            href={tabHref(t)}
            className="rounded-md py-2 text-center text-xs font-medium"
            style={{
              background: tab === t ? "var(--accent-primary)" : "transparent",
              color:      tab === t ? "var(--accent-fg)" : "var(--text-muted)",
            }}
          >
            {t === "overview" ? "Brief" : t === "photos" ? `Photos${ev.photos.length ? ` (${ev.photos.length})` : ""}` : t === "issue" ? `Issues${openIssues.length ? ` (${openIssues.length})` : ""}` : "Sign"}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <OverviewPanel ev={ev} />
      )}

      {tab === "photos" && (
        <PhotosPanel
          slug={slug}
          eventId={ev.id}
          photos={ev.photos}
          memberMap={memberMap}
          canManage={canManage}
        />
      )}

      {tab === "issue" && (
        <IssuesPanel
          slug={slug}
          eventId={ev.id}
          issues={ev.issues}
          memberMap={memberMap}
        />
      )}

      {tab === "sign" && (
        <SignPanel
          slug={slug}
          eventId={ev.id}
          orderNumber={ev.order.number}
          signatures={ev.signatures}
          memberMap={memberMap}
          canManage={canManage}
        />
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Panels
// ────────────────────────────────────────────────────────────

function OverviewPanel({
  ev,
}: {
  ev: {
    toolsList: string | null;
    materialsList: string | null;
    accessNotes: string | null;
    hazardsNotes: string | null;
    notes: string | null;
    checklistItems: { id: string; title: string; completedAt: Date | null }[];
    siteSurvey: {
      widthMm: number | null;
      heightMm: number | null;
      depthMm: number | null;
      mountingSurface: string | null;
      powerAvailable: boolean;
      electricalNotes: string | null;
    } | null;
  };
}) {
  const hasAny =
    ev.toolsList || ev.materialsList || ev.accessNotes || ev.hazardsNotes || ev.notes ||
    ev.siteSurvey || ev.checklistItems.length > 0;
  if (!hasAny) {
    return (
      <section className="rounded-xl px-4 py-4 text-sm" style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}>
        No logistics notes or checklist items on this event yet.
      </section>
    );
  }
  return (
    <section className="space-y-3">
      {ev.hazardsNotes && (
        <PanelBlock title="⚠ Hazards" emphasize>
          <p className="whitespace-pre-line">{ev.hazardsNotes}</p>
        </PanelBlock>
      )}
      {ev.accessNotes && (
        <PanelBlock title="How to get in">
          <p className="whitespace-pre-line">{ev.accessNotes}</p>
        </PanelBlock>
      )}
      {ev.toolsList && (
        <PanelBlock title="Tools to bring">
          <p className="whitespace-pre-line">{ev.toolsList}</p>
        </PanelBlock>
      )}
      {ev.materialsList && (
        <PanelBlock title="Materials loaded">
          <p className="whitespace-pre-line">{ev.materialsList}</p>
        </PanelBlock>
      )}
      {ev.siteSurvey && (
        <PanelBlock title="Site survey notes">
          <ul className="space-y-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            {ev.siteSurvey.widthMm != null && (
              <li>Size: {ev.siteSurvey.widthMm} × {ev.siteSurvey.heightMm ?? "?"} × {ev.siteSurvey.depthMm ?? "?"} mm</li>
            )}
            {ev.siteSurvey.mountingSurface && <li>Surface: {ev.siteSurvey.mountingSurface}</li>}
            <li>Power on site: {ev.siteSurvey.powerAvailable ? "yes" : "no"}</li>
            {ev.siteSurvey.electricalNotes && <li>Electrical: {ev.siteSurvey.electricalNotes}</li>}
          </ul>
        </PanelBlock>
      )}
      {ev.checklistItems.length > 0 && (
        <PanelBlock title="Checklist">
          <ul className="space-y-1 text-sm">
            {ev.checklistItems.map((i) => (
              <li key={i.id} className="flex items-center gap-2">
                <span style={{ color: i.completedAt ? "#10b981" : "var(--text-muted)" }}>
                  {i.completedAt ? "✓" : "○"}
                </span>
                <span style={{ textDecoration: i.completedAt ? "line-through" : "none", color: i.completedAt ? "var(--text-muted)" : "var(--text-default)" }}>
                  {i.title}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
            Tap items on the full detail page to check them off.
          </p>
        </PanelBlock>
      )}
      {ev.notes && (
        <PanelBlock title="Install notes">
          <p className="whitespace-pre-line text-sm">{ev.notes}</p>
        </PanelBlock>
      )}
    </section>
  );
}

function PhotosPanel({
  slug,
  eventId,
  photos,
  memberMap,
  canManage,
}: {
  slug: string;
  eventId: string;
  photos: {
    id: string;
    url: string;
    caption: string | null;
    phase: "BEFORE" | "DURING" | "AFTER" | "ISSUE" | "SURVEY";
    capturedAt: Date;
    capturedBy: string;
  }[];
  memberMap: Map<string, { name: string }>;
  canManage: boolean;
}) {
  return (
    <section className="space-y-3">
      {canManage && (
        <PanelBlock title="Capture photo">
          <form action={addInstallPhoto.bind(null, slug, eventId)} className="space-y-2">
            <input type="hidden" name="redirectTo" value={`/t/${slug}/installs/${eventId}/field?tab=photos`} />
            <PhotoCaptureInput
              nameUrl="url"
              nameWidth="widthPx"
              nameHeight="heightPx"
              capture="environment"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="mb-1 block">Phase</span>
                <select
                  name="phase"
                  defaultValue="DURING"
                  className="w-full rounded-md px-3 py-2 text-sm"
                  style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
                >
                  {PHOTO_PHASES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block">Caption</span>
                <input
                  name="caption"
                  placeholder="Optional"
                  className="w-full rounded-md px-3 py-2 text-sm"
                  style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
                />
              </label>
            </div>
            <button type="submit" style={primaryButtonStyle}>Upload</button>
          </form>
        </PanelBlock>
      )}
      {photos.length === 0 ? (
        <section
          className="rounded-xl px-4 py-4 text-sm"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
        >
          No photos yet.
        </section>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {photos.map((p) => (
            <li
              key={p.id}
              className="overflow-hidden rounded-lg"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
            >
              <a href={p.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt={p.caption ?? photoPhaseLabel(p.phase)} style={{ display: "block", width: "100%", height: "auto" }} />
              </a>
              <div className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                <div className="font-medium" style={{ color: "var(--text-default)" }}>
                  {photoPhaseLabel(p.phase)}
                </div>
                {p.caption && <div>{p.caption}</div>}
                <div>
                  {formatDateTime(p.capturedAt)}
                  {memberMap.get(p.capturedBy) && <> · {memberMap.get(p.capturedBy)!.name}</>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function IssuesPanel({
  slug,
  eventId,
  issues,
  memberMap,
}: {
  slug: string;
  eventId: string;
  issues: {
    id: string;
    title: string;
    description: string | null;
    severity: "LOW" | "MEDIUM" | "HIGH" | "BLOCKER";
    status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
    blocksCompletion: boolean;
    reportedBy: string;
    reportedAt: Date;
  }[];
  memberMap: Map<string, { name: string }>;
}) {
  return (
    <section className="space-y-3">
      <PanelBlock title="Report an issue" emphasize>
        <form action={reportInstallIssue.bind(null, slug, eventId)} className="space-y-2">
          <input type="hidden" name="redirectTo" value={`/t/${slug}/installs/${eventId}/field?tab=issue`} />
          <label className="block text-sm">
            <span className="mb-1 block">What&apos;s wrong?</span>
            <input
              name="title"
              required
              placeholder="Short description"
              className="w-full rounded-md px-3 py-2 text-sm"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Details</span>
            <textarea
              name="description"
              rows={3}
              placeholder="What's going on, what do you need from the office?"
              className="w-full rounded-md px-3 py-2 text-sm"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Severity</span>
            <select
              name="severity"
              defaultValue="MEDIUM"
              className="w-full rounded-md px-3 py-2 text-sm"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
            >
              {INSTALL_ISSUE_SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}{s.blocksByDefault ? " (blocks completion)" : ""}</option>
              ))}
            </select>
          </label>
          <button type="submit" style={primaryButtonStyle}>Page the office</button>
        </form>
      </PanelBlock>

      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        Recent issues
      </div>
      {issues.length === 0 ? (
        <section
          className="rounded-xl px-4 py-4 text-sm"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
        >
          No issues on this event.
        </section>
      ) : (
        <ul className="space-y-2">
          {issues.map((i) => {
            const sev = issueSeverityMeta(i.severity);
            return (
              <li
                key={i.id}
                className="rounded-lg px-3 py-2"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  opacity: i.status === "RESOLVED" ? 0.65 : 1,
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{ background: sev.color, color: "white" }}
                  >
                    {sev.label}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {i.status}
                  </span>
                </div>
                <div className="mt-1 text-sm font-medium">{i.title}</div>
                {i.description && <p className="mt-1 text-xs">{i.description}</p>}
                <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {memberMap.get(i.reportedBy)?.name ?? "unknown"} · {formatDateTime(i.reportedAt)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SignPanel({
  slug,
  eventId,
  orderNumber,
  signatures,
  memberMap,
  canManage,
}: {
  slug: string;
  eventId: string;
  orderNumber: string;
  signatures: { id: string; dataUrl: string; signerName: string; signerRole: string; capturedAt: Date; capturedBy: string }[];
  memberMap: Map<string, { name: string }>;
  canManage: boolean;
}) {
  return (
    <section className="space-y-3">
      {canManage ? (
        <PanelBlock title="Capture customer signature">
          <form action={captureInstallSignature.bind(null, slug, eventId)} className="space-y-3">
            <input type="hidden" name="redirectTo" value={`/t/${slug}/installs/${eventId}/field?tab=sign`} />
            <SignaturePad name="dataUrl" height={220} />
            <label className="block text-sm">
              <span className="mb-1 block">Signer name</span>
              <input
                name="signerName"
                required
                placeholder="Full name"
                className="w-full rounded-md px-3 py-2 text-sm"
                style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block">Role</span>
              <select
                name="signerRole"
                defaultValue="CUSTOMER"
                className="w-full rounded-md px-3 py-2 text-sm"
                style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
              >
                {INSTALL_SIGNER_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
            <input
              type="hidden"
              name="disclaimer"
              value={`I confirm the work described on order ${orderNumber} was completed to my satisfaction and acknowledge final acceptance.`}
            />
            <button type="submit" style={primaryButtonStyle}>Save signature</button>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Signature gets attached to this event with today&apos;s timestamp. The customer-facing
              acknowledgement is locked to the order number.
            </p>
          </form>
        </PanelBlock>
      ) : (
        <section
          className="rounded-xl px-4 py-4 text-sm"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
        >
          Only the event owner / manager can capture signatures.
        </section>
      )}
      <div className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        Captured so far
      </div>
      {signatures.length === 0 ? (
        <section
          className="rounded-xl px-4 py-4 text-sm"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
        >
          No signatures yet.
        </section>
      ) : (
        <ul className="space-y-2">
          {signatures.map((s) => (
            <li
              key={s.id}
              className="overflow-hidden rounded-lg"
              style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
            >
              <div style={{ background: "#ffffff" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.dataUrl} alt={`Signature of ${s.signerName}`} style={{ display: "block", width: "100%", maxHeight: 180, objectFit: "contain" }} />
              </div>
              <div className="px-3 py-2 text-xs">
                <div className="font-medium" style={{ color: "var(--text-default)" }}>{s.signerName}</div>
                <div style={{ color: "var(--text-muted)" }}>
                  {INSTALL_SIGNER_ROLES.find((r) => r.value === s.signerRole)?.label ?? s.signerRole}
                  {" · "}{formatDateTime(s.capturedAt)}
                  {memberMap.get(s.capturedBy) && <> · by {memberMap.get(s.capturedBy)!.name}</>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// Primitives
// ────────────────────────────────────────────────────────────

function PanelBlock({
  title,
  children,
  emphasize,
}: {
  title: string;
  children: React.ReactNode;
  emphasize?: boolean;
}) {
  return (
    <section
      className="rounded-xl px-4 py-3"
      style={{
        background: emphasize ? "var(--accent-surface)" : "var(--surface-1)",
        border: `1px solid ${emphasize ? "var(--accent-primary)" : "var(--border-subtle)"}`,
      }}
    >
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: emphasize ? "var(--accent-primary)" : "var(--text-muted)" }}>
        {title}
      </div>
      <div className="text-sm">{children}</div>
    </section>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "14px 16px",
  borderRadius: 12,
  background: "var(--accent-primary)",
  color: "var(--accent-fg)",
  fontSize: 16,
  fontWeight: 600,
  border: "1px solid var(--accent-primary)",
  textAlign: "center",
};

const secondaryButtonStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "12px 16px",
  borderRadius: 12,
  background: "var(--surface-1)",
  color: "var(--text-default)",
  fontSize: 14,
  fontWeight: 500,
  border: "1px solid var(--border-subtle)",
  textAlign: "center",
};
