import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button, Field, SelectField, TextArea } from "@/components/Field";
import { listActiveMembers, memberLookup } from "@/lib/members";
import { SendMessageWidget } from "@/components/SendMessageWidget";
import { loadSendContext } from "@/app/actions/message-templates";
import { getGroupContext } from "@/lib/franchise";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  INSTALL_KINDS,
  INSTALL_TRANSITIONS,
  INSTALL_ISSUE_SEVERITIES,
  INSTALL_ISSUE_STATUSES,
  INSTALL_SIGNER_ROLES,
  PERMIT_STATUSES,
  PHOTO_PHASES,
  installKindColor,
  installKindLabel,
  installStatusColor,
  installStatusLabel,
  issueSeverityMeta,
  issueStatusMeta,
  permitStatusMeta,
  photoPhaseLabel,
  durationMinutes,
  formatTimeRange,
  formatAddress,
  mapsHref,
  computeReadiness,
  toLocalInputValue,
} from "@/lib/installs";
import {
  updateInstallEvent,
  changeInstallStatus,
  deleteInstallEvent,
  updateInstallLogistics,
  addInstallPhoto,
  deleteInstallPhoto,
  captureInstallSignature,
  deleteInstallSignature,
  reportInstallIssue,
  updateInstallIssue,
  deleteInstallIssue,
  saveSiteSurvey,
  deleteSiteSurvey,
  setEvidenceWaiver,
  completeInstallWithEvidence,
} from "@/app/actions/installs";
import { ChecklistCard } from "@/components/ChecklistCard";
import { CommentThread } from "@/components/CommentThread";
import { SignaturePad } from "@/components/installs/SignaturePad";
import { PhotoCaptureInput } from "@/components/installs/PhotoCaptureInput";
import { loadApprovalRules, orderHasDeposit } from "@/lib/approvals";

const TRANSITION_LABELS: Partial<Record<string, string>> = {
  CONFIRMED:   "Confirm with customer",
  SCHEDULED:   "Back to scheduled",
  IN_PROGRESS: "On site now",
  COMPLETED:   "Mark completed",
  CANCELED:    "Cancel",
  NO_SHOW:     "Record no-show",
};

export default async function InstallEventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
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
      // Phase 14 — crew-facing install thread (dispatch notes, etc).
      comments: { orderBy: { createdAt: "asc" }, take: 200 },
      // Phase 13 — evidence + field records. Photos ordered newest-first so
      // the "just captured" one shows up at the top without scrolling.
      photos:      { orderBy: { capturedAt: "desc" } },
      signatures:  { orderBy: { capturedAt: "desc" } },
      issues:      { orderBy: [{ status: "asc" }, { severity: "desc" }, { reportedAt: "desc" }] },
      siteSurvey:  true,
    },
  });
  if (!ev) notFound();
  ctx.assertBranchAccess(ev.locationId);

  // Phase 13 — production completion ratio (for readiness). Non-fatal if we
  // can't count: the check just won't render.
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

  // Phase 13 — deposit gate awareness. We only surface the check when the
  // rule is actually enforced; `orderHasDeposit` returns a reason when NOT
  // satisfied, null when satisfied (or not applicable).
  const rules = await loadApprovalRules(ctx.tenant.id);
  const depositGap = ev.kind === "INSTALL"
    ? await orderHasDeposit(ctx.tenant.id, ev.orderId, rules)
    : null;
  const orderHasDepositOk: boolean | null =
    ev.kind === "INSTALL" && rules.requireDepositBeforeInstall
      ? depositGap === null
      : null;

  // Phase 15 Slice D — also pull inherited shared install templates from the
  // parent group root, so dispatchers can apply the franchisor's canonical
  // install workflow.
  const groupCtx = await getGroupContext(ctx.tenant.id);
  const [members, memberMap, ownInstallTpls, inheritedInstallTpls, sendCtx] = await Promise.all([
    listActiveMembers(ctx.tenant.id),
    memberLookup(ctx.tenant.id),
    db.checklistTemplate.findMany({
      where: { tenantId: ctx.tenant.id, kind: "INSTALL", active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, active: true },
    }),
    groupCtx.parentTenantId
      ? db.checklistTemplate.findMany({
          where: { tenantId: groupCtx.parentTenantId, kind: "INSTALL", active: true, shared: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true, active: true },
        })
      : Promise.resolve([] as { id: string; name: string; active: boolean }[]),
    loadSendContext(ctx.tenant.id, ctx.tenant.currency, {
      customerId:     ev.customerId,
      installEventId: ev.id,
      senderUserId:   ctx.userId,
    }),
  ]);
  const installTemplates = [
    ...ownInstallTpls,
    ...inheritedInstallTpls.map((t) => ({ ...t, name: `[Shared] ${t.name}` })),
  ];

  const save = updateInstallEvent.bind(null, slug, ev.id);
  const del  = deleteInstallEvent.bind(null, slug, ev.id);

  const transitions = INSTALL_TRANSITIONS[ev.status];
  const duration = durationMinutes(ev.scheduledStart, ev.scheduledEnd);
  const durationLabel =
    duration % 60 === 0 ? `${duration / 60}h` :
    duration < 60       ? `${duration}m` :
                          `${Math.floor(duration / 60)}h ${duration % 60}m`;

  const crewNames = ev.crewIds
    .map((uid) => memberMap.get(uid)?.name)
    .filter((n): n is string => !!n);

  // Phase 13 — readiness computation + field-mode deep-link.
  const openIssues     = ev.issues.filter((i) => i.status !== "RESOLVED");
  const openBlockers   = openIssues.filter((i) => i.blocksCompletion);
  const beforePhotos   = ev.photos.filter((p) => p.phase === "BEFORE").length;
  const afterPhotos    = ev.photos.filter((p) => p.phase === "AFTER").length;
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
  const fieldHref = `/t/${slug}/installs/${ev.id}/field`;
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
  const addressLine = formatAddress({
    addressLine1: ev.addressLine1,
    addressLine2: ev.addressLine2,
    city:         ev.city,
    region:       ev.region,
    postalCode:   ev.postalCode,
    country:      ev.country,
  });

  // Phase 18 Slice G — day-of awareness for installers opening this page in
  // the field. We highlight "today" explicitly because the detail page is the
  // one they open first, and the calendar context doesn't survive a direct
  // deep link.
  const now = new Date();
  const startsToday =
    ev.scheduledStart.getFullYear() === now.getFullYear() &&
    ev.scheduledStart.getMonth() === now.getMonth() &&
    ev.scheduledStart.getDate() === now.getDate();
  const isOverdue =
    !startsToday &&
    ev.scheduledStart < now &&
    (ev.status === "SCHEDULED" || ev.status === "CONFIRMED");

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href={`/t/${slug}/installs`} className="underline" style={{ color: "var(--text-muted)" }}>
          ← Install calendar
        </Link>
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

      {/* Phase 18 Slice G — day-of banner. Sits above the header so it's the
          first thing an installer sees when they open a deep link. */}
      {startsToday && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--accent-surface)",
            border: "1px solid var(--accent-primary)",
            color: "var(--accent-primary)",
          }}
        >
          <span className="font-semibold">Today&apos;s install</span>
          <span className="ml-2" style={{ color: "var(--text-default)" }}>
            {formatTimeRange(ev.scheduledStart, ev.scheduledEnd)}
            {(ev.addressLine1 || ev.city) && (
              <> · {[ev.addressLine1, ev.city, ev.region].filter(Boolean).join(", ")}</>
            )}
          </span>
        </div>
      )}
      {isOverdue && (
        <div
          className="rounded-md px-4 py-3 text-sm"
          style={{
            background: "var(--danger-surface)",
            border: "1px solid var(--danger-fg)",
            color: "var(--danger-fg)",
          }}
        >
          <span className="font-semibold">Past due</span>
          <span className="ml-2" style={{ color: "var(--text-default)" }}>
            Scheduled for {formatDate(ev.scheduledStart)} — update the status or reschedule.
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold">
              {ev.title || `${installKindLabel(ev.kind)} for ${ev.order.number}`}
            </h1>
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{ background: installKindColor(ev.kind), color: "white" }}
            >
              {installKindLabel(ev.kind)}
            </span>
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{ background: installStatusColor(ev.status), color: "white" }}
            >
              {installStatusLabel(ev.status)}
            </span>
            {openBlockers.length > 0 && (
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ background: "var(--danger-surface)", color: "var(--danger-fg)", border: "1px solid var(--danger-fg)" }}
              >
                {openBlockers.length} blocker{openBlockers.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            <Link href={`/t/${slug}/orders/${ev.order.id}`} className="underline">
              Order {ev.order.number}
            </Link>
            {" · "}for <Link href={`/t/${slug}/customers/${ev.customer.id}`} className="underline">{ev.customer.name}</Link>
          </div>
          <div className="mt-0.5 text-sm">
            {formatDate(ev.scheduledStart)} · {formatTimeRange(ev.scheduledStart, ev.scheduledEnd)} · {durationLabel}
          </div>
          {addressLine && (
            <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
              {addressLine}
              {mapHref && (
                <>
                  {" · "}
                  <a href={mapHref} target="_blank" rel="noreferrer" className="underline">
                    Open in maps
                  </a>
                </>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* Phase 13 — field-mode deep link. Prominent because crew in the
              field will bookmark it directly. */}
          <Link
            href={fieldHref}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium"
            style={{
              background: "var(--accent-primary)",
              color: "var(--accent-fg)",
              border: "1px solid var(--accent-primary)",
            }}
          >
            📱 Open field mode
          </Link>
          {canManage && (
            <form action={del}>
              <Button type="submit" variant="danger">Delete event</Button>
            </form>
          )}
        </div>
      </div>

      {/* Phase 13 — readiness panel. Shown for everyone (including crew) so
          they can see what's missing before arrival. Chips are color-coded. */}
      <Card>
        <CardHeader
          title="Readiness"
          description={
            readiness.overall === "ok"
              ? "All checks pass."
              : readiness.overall === "warn"
                ? `${readiness.warnCount} warning${readiness.warnCount === 1 ? "" : "s"}, ${readiness.okCount} pass`
                : `${readiness.failCount} blocking, ${readiness.warnCount} warning, ${readiness.okCount} pass`
          }
          right={
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                background: readiness.overall === "ok"
                  ? "var(--accent-surface)"
                  : readiness.overall === "warn"
                    ? "#3a2a15"
                    : "var(--danger-surface)",
                color: readiness.overall === "ok"
                  ? "var(--accent-primary)"
                  : readiness.overall === "warn"
                    ? "#ffc98b"
                    : "var(--danger-fg)",
              }}
            >
              {readiness.overall === "ok" ? "Ready" : readiness.overall === "warn" ? "Proceed with caution" : "Not ready"}
            </span>
          }
        />
        <ul className="flex flex-wrap gap-2 px-5 py-4">
          {readiness.checks.map((c) => {
            const bg =
              c.level === "ok"   ? "var(--accent-surface)" :
              c.level === "warn" ? "#3a2a15" :
              c.level === "fail" ? "var(--danger-surface)" :
              "var(--surface-1)";
            const fg =
              c.level === "ok"   ? "var(--accent-primary)" :
              c.level === "warn" ? "#ffc98b" :
              c.level === "fail" ? "var(--danger-fg)" :
              "var(--text-muted)";
            const mark =
              c.level === "ok"   ? "✓" :
              c.level === "warn" ? "⚠" :
              c.level === "fail" ? "✗" :
              "·";
            return (
              <li
                key={c.id}
                className="rounded-md px-3 py-1.5 text-xs"
                style={{ background: bg, color: fg, border: `1px solid ${fg}` }}
                title={c.detail}
              >
                <span className="mr-1 font-semibold">{mark}</span>
                {c.label}
                {c.detail && (
                  <span className="ml-1 opacity-80">· {c.detail}</span>
                )}
              </li>
            );
          })}
        </ul>
        {ev.evidenceWaived && (
          <div
            className="mx-5 mb-4 rounded-md px-3 py-2 text-xs"
            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
          >
            <span className="font-semibold" style={{ color: "var(--text-default)" }}>Evidence waived.</span>
            {ev.evidenceWaivedNote && <> {ev.evidenceWaivedNote}</>}
            {ev.evidenceWaivedBy && memberMap.get(ev.evidenceWaivedBy) && (
              <> — by {memberMap.get(ev.evidenceWaivedBy)!.name}</>
            )}
          </div>
        )}
      </Card>

      {/* Status transitions */}
      {canManage && transitions.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center gap-2 px-5 py-3">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Actions:</span>
            {transitions.map((to) => {
              const action = changeInstallStatus.bind(null, slug, ev.id);
              const isDanger = to === "CANCELED" || to === "NO_SHOW";
              const needsReason = isDanger;
              return (
                <form key={to} action={action} className="flex items-center gap-2">
                  <input type="hidden" name="status" value={to} />
                  {needsReason && (
                    <input
                      name="cancelReason"
                      placeholder={to === "NO_SHOW" ? "No-show notes (optional)" : "Cancel reason (optional)"}
                      className="rounded-md px-3 py-1.5 text-sm outline-none"
                      style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)", minWidth: 260 }}
                    />
                  )}
                  <Button
                    type="submit"
                    variant={isDanger ? "danger" : (to === "SCHEDULED" ? "secondary" : "primary")}
                  >
                    {TRANSITION_LABELS[to] ?? installStatusLabel(to)}
                  </Button>
                </form>
              );
            })}
          </div>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-4">
        {/* Left: meta form (spans 2) */}
        <Card className="col-span-2">
          <CardHeader title="Event details" />
          <form action={save} className="grid grid-cols-2 gap-3 px-5 py-4">
            <SelectField
              label="Kind"
              name="kind"
              defaultValue={ev.kind}
              options={INSTALL_KINDS.map((k) => ({ value: k.value, label: k.label }))}
              disabled={!canManage}
            />
            <Field
              label="Title"
              name="title"
              defaultValue={ev.title ?? ""}
              disabled={!canManage}
            />
            <Field
              label="Start"
              name="scheduledStart"
              type="datetime-local"
              defaultValue={toLocalInputValue(ev.scheduledStart)}
              required
              disabled={!canManage}
            />
            <Field
              label="End"
              name="scheduledEnd"
              type="datetime-local"
              defaultValue={toLocalInputValue(ev.scheduledEnd)}
              required
              disabled={!canManage}
            />
            <SelectField
              label="Primary installer"
              name="installerId"
              defaultValue={ev.installerId ?? ""}
              disabled={!canManage}
              options={[
                { value: "", label: "Unassigned" },
                ...members.map((m) => ({ value: m.userId, label: m.name })),
              ]}
            />
            <Field
              label="Crew userIds"
              name="crewIds"
              defaultValue={ev.crewIds.join(", ")}
              placeholder="comma-separated userIds"
              disabled={!canManage}
              hint="Temporary until a crew picker lands."
            />
            <div className="col-span-2 mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Address (override — blank pulls from customer next save)
            </div>
            <div className="col-span-2">
              <Field label="Line 1" name="addressLine1" defaultValue={ev.addressLine1 ?? ""} disabled={!canManage} />
            </div>
            <div className="col-span-2">
              <Field label="Line 2" name="addressLine2" defaultValue={ev.addressLine2 ?? ""} disabled={!canManage} />
            </div>
            <Field label="City" name="city" defaultValue={ev.city ?? ""} disabled={!canManage} />
            <Field label="Region" name="region" defaultValue={ev.region ?? ""} disabled={!canManage} />
            <Field label="Postal code" name="postalCode" defaultValue={ev.postalCode ?? ""} disabled={!canManage} />
            <Field label="Country" name="country" defaultValue={ev.country ?? ""} disabled={!canManage} />
            <div className="col-span-2">
              <TextArea label="Install notes" name="notes" rows={3} defaultValue={ev.notes ?? ""} disabled={!canManage} />
            </div>
            {canManage && (
              <div className="col-span-2">
                <Button type="submit">Save</Button>
              </div>
            )}
          </form>
        </Card>

        {/* Right: quick info */}
        <div className="space-y-4">
          <Card>
            <CardHeader title="Customer" />
            <div className="space-y-2 px-5 py-4 text-sm">
              <div>
                <Link href={`/t/${slug}/customers/${ev.customer.id}`} className="font-medium underline">
                  {ev.customer.name}
                </Link>
              </div>
              {ev.customer.phone && <div style={{ color: "var(--text-muted)" }}>{ev.customer.phone}</div>}
              {ev.customer.email && <div style={{ color: "var(--text-muted)" }}>{ev.customer.email}</div>}
            </div>
          </Card>

          <Card>
            <CardHeader title="Order" />
            <div className="space-y-1 px-5 py-4 text-sm">
              <div>
                <Link href={`/t/${slug}/orders/${ev.order.id}`} className="font-medium underline">
                  {ev.order.number}
                </Link>
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>Status: {ev.order.status}</div>
            </div>
          </Card>

          {crewNames.length > 0 && (
            <Card>
              <CardHeader title="Crew" />
              <ul className="px-5 py-4 text-sm">
                {crewNames.map((n, i) => (
                  <li key={i} className="py-0.5">{n}</li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Timeline" />
            <ul className="space-y-1 px-5 py-4 text-xs" style={{ color: "var(--text-muted)" }}>
              <li>Created {formatDateTime(ev.createdAt)}</li>
              {ev.arrivedAt   && <li>Arrived on site {formatDateTime(ev.arrivedAt)}</li>}
              {ev.completedAt && <li>Completed {formatDateTime(ev.completedAt)}</li>}
              {ev.canceledAt  && (
                <li>
                  {ev.status === "NO_SHOW" ? "No-show" : "Canceled"} {formatDateTime(ev.canceledAt)}
                  {ev.cancelReason && <> — {ev.cancelReason}</>}
                </li>
              )}
            </ul>
          </Card>
        </div>
      </div>

      {/* Phase 13 — install checklist */}
      <ChecklistCard
        slug={slug}
        scope={{ kind: "install", installId: ev.id }}
        items={ev.checklistItems}
        templates={installTemplates}
        memberMap={memberMap}
        canManage={canManage}
      />

      {/* Phase 13 — logistics: tools/materials/access/hazards/GPS/odometer.
          Separate form so it's savable without touching the schedule. */}
      {canManage && (
        <Card>
          <CardHeader
            title="Logistics"
            description="What the crew needs to bring, where to park, how to reach the site. Populates the field page."
          />
          <form action={updateInstallLogistics.bind(null, slug, ev.id)} className="grid grid-cols-2 gap-3 px-5 py-4">
            <div className="col-span-2">
              <TextArea
                label="Tools to bring"
                name="toolsList"
                rows={2}
                defaultValue={ev.toolsList ?? ""}
                placeholder="e.g. 40' bucket truck, cordless drills (2×), core bit kit, levels"
              />
            </div>
            <div className="col-span-2">
              <TextArea
                label="Materials to load"
                name="materialsList"
                rows={2}
                defaultValue={ev.materialsList ?? ""}
                placeholder="e.g. channel letter set (25 pcs), hardware pack A, anti-bird spikes"
              />
            </div>
            <div className="col-span-2">
              <TextArea
                label="Access notes"
                name="accessNotes"
                rows={2}
                defaultValue={ev.accessNotes ?? ""}
                placeholder="Gate code, loading dock, who to ask for on arrival"
              />
            </div>
            <div className="col-span-2">
              <TextArea
                label="Hazards"
                name="hazardsNotes"
                rows={2}
                defaultValue={ev.hazardsNotes ?? ""}
                placeholder="Overhead lines, sloped roof, traffic control, electrical"
              />
            </div>
            <Field
              label="GPS latitude"
              name="gpsLat"
              defaultValue={ev.gpsLat != null ? String(ev.gpsLat) : ""}
              placeholder="e.g. 40.7128"
            />
            <Field
              label="GPS longitude"
              name="gpsLng"
              defaultValue={ev.gpsLng != null ? String(ev.gpsLng) : ""}
              placeholder="e.g. -74.0060"
            />
            <Field
              label="Odometer start"
              name="odometerStart"
              defaultValue={ev.odometerStart != null ? String(ev.odometerStart) : ""}
            />
            <Field
              label="Odometer end"
              name="odometerEnd"
              defaultValue={ev.odometerEnd != null ? String(ev.odometerEnd) : ""}
            />
            <div className="col-span-2">
              <Button type="submit">Save logistics</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Phase 13 — site survey card. Shown always when a survey exists; for
          SURVEY-kind events, a manager sees the blank form to fill in. */}
      {(ev.siteSurvey || canManage) && (
        <Card>
          <CardHeader
            title="Site survey"
            description={
              ev.siteSurvey
                ? `Saved${ev.siteSurvey.surveyedBy && memberMap.get(ev.siteSurvey.surveyedBy) ? ` by ${memberMap.get(ev.siteSurvey.surveyedBy)!.name}` : ""}${ev.siteSurvey.surveyedAt ? ` on ${formatDate(ev.siteSurvey.surveyedAt)}` : ""}.`
                : "Dimensions, access, and permit context. Required for INSTALL readiness."
            }
            right={
              ev.siteSurvey && canManage ? (
                <form action={deleteSiteSurvey.bind(null, slug, ev.id)}>
                  <button
                    type="submit"
                    className="rounded-md px-2 py-1 text-xs"
                    style={{ border: "1px solid var(--border-subtle)", color: "var(--danger-fg)" }}
                  >
                    Delete survey
                  </button>
                </form>
              ) : null
            }
          />
          {canManage ? (
            <form action={saveSiteSurvey.bind(null, slug, ev.id)} className="grid grid-cols-3 gap-3 px-5 py-4">
              <Field label="Width (mm)"  name="widthMm"  defaultValue={ev.siteSurvey?.widthMm != null ? String(ev.siteSurvey.widthMm) : ""} />
              <Field label="Height (mm)" name="heightMm" defaultValue={ev.siteSurvey?.heightMm != null ? String(ev.siteSurvey.heightMm) : ""} />
              <Field label="Depth (mm)"  name="depthMm"  defaultValue={ev.siteSurvey?.depthMm != null ? String(ev.siteSurvey.depthMm) : ""} />
              <Field label="Mounting surface" name="mountingSurface" defaultValue={ev.siteSurvey?.mountingSurface ?? ""} placeholder="brick / metal / EIFS / drywall" />
              <Field label="Mounting method"  name="mountingMethod"  defaultValue={ev.siteSurvey?.mountingMethod ?? ""}  placeholder="lag bolts / welded frame / magnet" />
              <SelectField
                label="Permit status"
                name="permitStatus"
                defaultValue={ev.siteSurvey?.permitStatus ?? "NONE"}
                options={PERMIT_STATUSES.map((p) => ({ value: p.value, label: p.label }))}
              />
              <label className="col-span-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="powerAvailable"
                  value="1"
                  defaultChecked={ev.siteSurvey?.powerAvailable ?? false}
                />
                Power available on site
              </label>
              <div className="col-span-3">
                <TextArea label="Power notes" name="powerNotes" rows={2} defaultValue={ev.siteSurvey?.powerNotes ?? ""} placeholder="Circuit, breaker location, needs-new-run, etc." />
              </div>
              <div className="col-span-3">
                <TextArea label="Electrical notes" name="electricalNotes" rows={2} defaultValue={ev.siteSurvey?.electricalNotes ?? ""} placeholder="Gauge, conduit path, licensed electrician needed" />
              </div>
              <div className="col-span-3">
                <TextArea label="Access notes" name="accessNotes" rows={2} defaultValue={ev.siteSurvey?.accessNotes ?? ""} placeholder="Parking, dock, freight elevator, gate codes" />
              </div>
              <div className="col-span-3">
                <TextArea label="Clearance notes" name="clearanceNotes" rows={2} defaultValue={ev.siteSurvey?.clearanceNotes ?? ""} placeholder="Ceiling height, overhangs, line-of-sight" />
              </div>
              <Field label="Site contact name"  name="siteContactName"  defaultValue={ev.siteSurvey?.siteContactName ?? ""} />
              <Field label="Site contact phone" name="siteContactPhone" defaultValue={ev.siteSurvey?.siteContactPhone ?? ""} />
              <div />
              <Field label="Permit #"         name="permitNumber"   defaultValue={ev.siteSurvey?.permitNumber ?? ""} />
              <Field
                label="Applied"
                name="permitAppliedAt"
                type="date"
                defaultValue={ev.siteSurvey?.permitAppliedAt ? toLocalInputValue(ev.siteSurvey.permitAppliedAt).slice(0, 10) : ""}
              />
              <Field
                label="Approved"
                name="permitApprovedAt"
                type="date"
                defaultValue={ev.siteSurvey?.permitApprovedAt ? toLocalInputValue(ev.siteSurvey.permitApprovedAt).slice(0, 10) : ""}
              />
              <div className="col-span-3">
                <TextArea label="Permit notes" name="permitNotes" rows={2} defaultValue={ev.siteSurvey?.permitNotes ?? ""} />
              </div>
              <div className="col-span-3">
                <TextArea label="Summary" name="summary" rows={2} defaultValue={ev.siteSurvey?.summary ?? ""} placeholder="Freeform summary for the shop." />
              </div>
              <label className="col-span-3 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="blocked"
                  value="1"
                  defaultChecked={ev.siteSurvey?.blocked ?? false}
                />
                Site blocked — installation not currently feasible
              </label>
              <div className="col-span-3">
                <TextArea label="Blocked reason" name="blockedReason" rows={2} defaultValue={ev.siteSurvey?.blockedReason ?? ""} />
              </div>
              <label className="col-span-3 flex items-center gap-2 text-sm">
                <input type="checkbox" name="markSurveyed" value="1" />
                Mark as surveyed by me now
              </label>
              <div className="col-span-3">
                <Button type="submit">{ev.siteSurvey ? "Save survey" : "Create survey"}</Button>
              </div>
            </form>
          ) : (
            <div className="space-y-2 px-5 py-4 text-sm">
              {ev.siteSurvey?.summary && <p>{ev.siteSurvey.summary}</p>}
              <ul className="text-xs" style={{ color: "var(--text-muted)" }}>
                {ev.siteSurvey?.widthMm != null && (
                  <li>{ev.siteSurvey.widthMm}×{ev.siteSurvey.heightMm ?? "?"}×{ev.siteSurvey.depthMm ?? "?"} mm</li>
                )}
                {ev.siteSurvey?.mountingSurface && <li>Surface: {ev.siteSurvey.mountingSurface}</li>}
                {ev.siteSurvey?.mountingMethod  && <li>Method: {ev.siteSurvey.mountingMethod}</li>}
                {ev.siteSurvey && ev.siteSurvey.permitStatus !== "NONE" && (
                  <li>Permit: {permitStatusMeta(ev.siteSurvey.permitStatus).label}{ev.siteSurvey.permitNumber && ` (#${ev.siteSurvey.permitNumber})`}</li>
                )}
                {ev.siteSurvey?.blocked && (
                  <li style={{ color: "var(--danger-fg)" }}>Blocked: {ev.siteSurvey.blockedReason ?? "no reason given"}</li>
                )}
              </ul>
            </div>
          )}
        </Card>
      )}

      {/* Phase 13 — issues: field-side escalation. Everyone can see; managers
          can ack/resolve. Reporting is open to all installs:view. */}
      <Card>
        <CardHeader
          title="Issues"
          description={
            openIssues.length === 0
              ? "No open issues."
              : `${openBlockers.length} blocking, ${openIssues.length - openBlockers.length} other open`
          }
          right={
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {ev.issues.length} total
            </span>
          }
        />
        <ul>
          {ev.issues.length === 0 && (
            <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
              No issues reported on this event.
            </li>
          )}
          {ev.issues.map((i) => {
            const sev = issueSeverityMeta(i.severity);
            const st  = issueStatusMeta(i.status);
            return (
              <li
                key={i.id}
                className="px-5 py-3"
                style={{ borderTop: "1px solid var(--border-subtle)", opacity: i.status === "RESOLVED" ? 0.7 : 1 }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{ background: sev.color, color: "white" }}
                      >
                        {sev.label}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                        style={{ background: st.color, color: "white" }}
                      >
                        {st.label}
                      </span>
                      {i.blocksCompletion && i.status !== "RESOLVED" && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                          style={{ background: "var(--danger-surface)", color: "var(--danger-fg)", border: "1px solid var(--danger-fg)" }}
                        >
                          Blocks completion
                        </span>
                      )}
                      <span className="font-medium">{i.title}</span>
                    </div>
                    {i.description && (
                      <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                        {i.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                      Reported by {memberMap.get(i.reportedBy)?.name ?? "unknown"} · {formatDateTime(i.reportedAt)}
                      {i.resolvedAt && (
                        <> · resolved {formatDateTime(i.resolvedAt)}{i.resolvedBy && memberMap.get(i.resolvedBy) && ` by ${memberMap.get(i.resolvedBy)!.name}`}</>
                      )}
                    </p>
                    {i.resolution && (
                      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        Resolution: {i.resolution}
                      </p>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex flex-shrink-0 flex-col items-end gap-1">
                      {i.status === "OPEN" && (
                        <form action={updateInstallIssue.bind(null, slug, ev.id, i.id)} className="flex items-center gap-1">
                          <input type="hidden" name="status" value="ACKNOWLEDGED" />
                          <button
                            type="submit"
                            className="rounded-md px-2 py-1 text-xs"
                            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
                          >
                            Acknowledge
                          </button>
                        </form>
                      )}
                      {i.status !== "RESOLVED" && (
                        <details>
                          <summary className="cursor-pointer rounded-md px-2 py-1 text-xs" style={{ background: "var(--accent-surface)", color: "var(--accent-primary)", border: "1px solid var(--accent-primary)" }}>
                            Resolve
                          </summary>
                          <form action={updateInstallIssue.bind(null, slug, ev.id, i.id)} className="mt-2 space-y-2" style={{ minWidth: 260 }}>
                            <input type="hidden" name="status" value="RESOLVED" />
                            <TextArea label="Resolution notes" name="resolution" rows={2} />
                            <Button type="submit">Mark resolved</Button>
                          </form>
                        </details>
                      )}
                      {i.status === "RESOLVED" && (
                        <form action={updateInstallIssue.bind(null, slug, ev.id, i.id)}>
                          <input type="hidden" name="status" value="OPEN" />
                          <button
                            type="submit"
                            className="rounded-md px-2 py-1 text-xs"
                            style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)", color: "var(--text-muted)" }}
                          >
                            Reopen
                          </button>
                        </form>
                      )}
                      <form action={deleteInstallIssue.bind(null, slug, ev.id, i.id)}>
                        <button
                          type="submit"
                          className="rounded-md px-2 py-1 text-xs"
                          style={{ color: "var(--danger-fg)" }}
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="px-5 py-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <details>
            <summary className="cursor-pointer text-sm font-medium">Report issue</summary>
            <form
              action={reportInstallIssue.bind(null, slug, ev.id)}
              className="mt-3 grid grid-cols-2 gap-3"
            >
              <div className="col-span-2">
                <Field label="Title" name="title" required placeholder="What's wrong?" />
              </div>
              <div className="col-span-2">
                <TextArea label="Details" name="description" rows={3} placeholder="Context the office needs to act on this." />
              </div>
              <SelectField
                label="Severity"
                name="severity"
                defaultValue="MEDIUM"
                options={INSTALL_ISSUE_SEVERITIES.map((s) => ({ value: s.value, label: s.label }))}
              />
              <div />
              <div className="col-span-2">
                <Button type="submit">Submit issue</Button>
                <span className="ml-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  BLOCKER severity stops completion until resolved.
                </span>
              </div>
            </form>
          </details>
        </div>
      </Card>

      {/* Phase 13 — photos. Grouped by phase so the "before/after" story
          reads at a glance. Anyone with view permission sees; only managers
          can upload/delete. */}
      <Card>
        <CardHeader
          title="Photos"
          description={`${ev.photos.length} on file · ${beforePhotos} before · ${afterPhotos} after`}
        />
        <div className="space-y-6 px-5 py-4">
          {PHOTO_PHASES.map((phase) => {
            const bucket = ev.photos.filter((p) => p.phase === phase.value);
            if (bucket.length === 0 && !canManage) return null;
            return (
              <div key={phase.value}>
                <div className="mb-2 flex items-baseline justify-between">
                  <div className="text-sm font-semibold">{phase.label}</div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>{phase.hint}</div>
                </div>
                {bucket.length === 0 ? (
                  <div className="rounded-md px-3 py-4 text-xs" style={{ background: "var(--surface-1)", border: "1px dashed var(--border-subtle)", color: "var(--text-muted)" }}>
                    No {phase.label.toLowerCase()} photos yet.
                  </div>
                ) : (
                  <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {bucket.map((p) => (
                      <li key={p.id} className="overflow-hidden rounded-md" style={{ border: "1px solid var(--border-subtle)", background: "var(--surface-1)" }}>
                        <a href={p.url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.url}
                            alt={p.caption ?? phase.label}
                            style={{ display: "block", width: "100%", height: "auto" }}
                          />
                        </a>
                        <div className="px-2 py-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {p.caption && <div style={{ color: "var(--text-default)" }}>{p.caption}</div>}
                          <div>
                            {formatDateTime(p.capturedAt)}
                            {memberMap.get(p.capturedBy) && <> · {memberMap.get(p.capturedBy)!.name}</>}
                          </div>
                          {canManage && (
                            <form action={deleteInstallPhoto.bind(null, slug, ev.id, p.id)} className="mt-1">
                              <button type="submit" className="text-[11px]" style={{ color: "var(--danger-fg)" }}>
                                Delete
                              </button>
                            </form>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          {canManage && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">Add photo</summary>
              <form action={addInstallPhoto.bind(null, slug, ev.id)} className="mt-3 grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <div className="mb-1 text-sm">Photo</div>
                  <PhotoCaptureInput
                    nameUrl="url"
                    nameWidth="widthPx"
                    nameHeight="heightPx"
                    capture="environment"
                  />
                </div>
                <SelectField
                  label="Phase"
                  name="phase"
                  defaultValue="DURING"
                  options={PHOTO_PHASES.map((p) => ({ value: p.value, label: p.label }))}
                />
                <Field label="Caption" name="caption" placeholder="What's the photo showing?" />
                <div className="col-span-2">
                  <Button type="submit">Save photo</Button>
                  <span className="ml-3 text-xs" style={{ color: "var(--text-muted)" }}>
                    Photos stored inline. Large images auto-downsized to 1600px wide.
                  </span>
                </div>
              </form>
            </details>
          )}
        </div>
      </Card>

      {/* Phase 13 — signatures. Thin PNGs kept inline in the DB. */}
      <Card>
        <CardHeader
          title="Signatures"
          description={ev.signatures.length === 0 ? "No signatures captured." : `${ev.signatures.length} on file`}
        />
        <ul>
          {ev.signatures.map((sig) => (
            <li key={sig.id} className="px-5 py-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
              <div className="flex items-start gap-4">
                <div
                  className="overflow-hidden rounded-md"
                  style={{ border: "1px solid var(--border-subtle)", background: "#ffffff", width: 240 }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sig.dataUrl} alt={`Signature of ${sig.signerName}`} style={{ display: "block", width: "100%", height: "auto" }} />
                </div>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium">{sig.signerName}</div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {INSTALL_SIGNER_ROLES.find((r) => r.value === sig.signerRole)?.label ?? sig.signerRole}
                    {sig.signerTitle && <> · {sig.signerTitle}</>}
                  </div>
                  <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    Captured {formatDateTime(sig.capturedAt)}
                    {memberMap.get(sig.capturedBy) && <> by {memberMap.get(sig.capturedBy)!.name}</>}
                  </div>
                  {sig.disclaimer && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs" style={{ color: "var(--text-muted)" }}>
                        View disclaimer text
                      </summary>
                      <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>{sig.disclaimer}</p>
                    </details>
                  )}
                  {sig.notes && <p className="mt-1 text-xs">{sig.notes}</p>}
                  {canManage && (
                    <form action={deleteInstallSignature.bind(null, slug, ev.id, sig.id)} className="mt-2">
                      <button type="submit" className="text-xs" style={{ color: "var(--danger-fg)" }}>
                        Delete signature
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
        {canManage && (
          <div className="px-5 py-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <details>
              <summary className="cursor-pointer text-sm font-medium">Capture signature</summary>
              <form
                action={captureInstallSignature.bind(null, slug, ev.id)}
                className="mt-3 grid grid-cols-2 gap-3"
              >
                <div className="col-span-2">
                  <div className="mb-1 text-sm">Signature</div>
                  <SignaturePad name="dataUrl" />
                </div>
                <Field label="Signer name" name="signerName" required />
                <SelectField
                  label="Signer role"
                  name="signerRole"
                  defaultValue="CUSTOMER"
                  options={INSTALL_SIGNER_ROLES.map((r) => ({ value: r.value, label: r.label }))}
                />
                <Field label="Signer title (optional)" name="signerTitle" placeholder="Facilities manager, etc." />
                <div />
                <div className="col-span-2">
                  <TextArea
                    label="Disclaimer / agreement text"
                    name="disclaimer"
                    rows={3}
                    defaultValue={`I confirm the work described on order ${ev.order.number} was completed to my satisfaction and acknowledge final acceptance.`}
                  />
                </div>
                <div className="col-span-2">
                  <TextArea label="Notes" name="notes" rows={2} />
                </div>
                <div className="col-span-2">
                  <Button type="submit">Save signature</Button>
                </div>
              </form>
            </details>
          </div>
        )}
      </Card>

      {/* Phase 13 — evidence-aware completion + evidence waiver. Manager-only. */}
      {canManage && (ev.status === "IN_PROGRESS" || ev.status === "SCHEDULED" || ev.status === "CONFIRMED") && (
        <Card>
          <CardHeader
            title="Wrap up"
            description="Complete the event with evidence, or explicitly waive it."
          />
          <div className="flex flex-wrap items-start gap-4 px-5 py-4">
            <form action={completeInstallWithEvidence.bind(null, slug, ev.id)}>
              <Button type="submit">Complete with evidence</Button>
            </form>
            {!ev.evidenceWaived ? (
              <details>
                <summary className="cursor-pointer rounded-md px-3 py-2 text-sm" style={{ border: "1px solid var(--border-subtle)" }}>
                  Waive evidence requirement
                </summary>
                <form action={setEvidenceWaiver.bind(null, slug, ev.id)} className="mt-2 space-y-2" style={{ minWidth: 320 }}>
                  <input type="hidden" name="waived" value="1" />
                  <TextArea label="Why are we waiving?" name="note" rows={2} placeholder="Quick dropoff, supplier pickup, etc." />
                  <Button type="submit" variant="secondary">Waive</Button>
                </form>
              </details>
            ) : (
              <form action={setEvidenceWaiver.bind(null, slug, ev.id)}>
                <input type="hidden" name="waived" value="0" />
                <Button type="submit" variant="secondary">Un-waive evidence</Button>
              </form>
            )}
          </div>
        </Card>
      )}

      {/* Phase 14 — customer-facing send. */}
      {canManage && (
        <Card>
          <CardHeader
            title="Send update"
            description="Crew confirmations, on-my-way notes, day-of reminders. Logged on the customer timeline."
          />
          <SendMessageWidget
            slug={slug}
            customerId={ev.customerId}
            customerEmail={ev.customer.email}
            installEventId={ev.id}
            returnTo={`/t/${slug}/installs/${ev.id}`}
            templates={sendCtx.templates}
            bag={sendCtx.bag}
          />
        </Card>
      )}

      {/* Phase 14 — install-level internal thread. */}
      <CommentThread
        slug={slug}
        parentKind="install"
        parentId={ev.id}
        comments={ev.comments}
        currentUserId={ctx.userId}
        memberMap={memberMap}
        canModerate={ctx.can("staff:manage")}
      />
    </div>
  );
}
