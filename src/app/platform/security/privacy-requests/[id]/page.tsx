// Page 52 — Privacy Request detail.
//
// Sections: Subject info · Verification · Scope discovery · Action workflow
//           (export / deletion / rectification) · Communication thread · Audit trail.

import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import {
  loadRequestDetail,
  TYPE_LABEL, JURISDICTION_LABEL, SOURCE_LABEL,
  VERIFICATION_METHOD_LABEL, SCOPE_SYSTEM_LABEL,
  shortDate, relativeFromNow,
} from "@/server/platform/privacy-requests";
import {
  setRequestStatus,
  assignRequest,
  recordVerification,
  runScopeDiscovery,
  sendMessage,
  generateExport,
  generateFinalReport,
  toggleLegalHold,
  executeDeletion,
} from "@/app/actions/platform-privacy";
import {
  StatusPill, VerificationPill, ScopeStatusPill, TypeChip,
  JurisdictionChip, SourceChip, SlaCell, FormError, FormOk,
} from "../_shared";
import type {
  PrivacyVerificationMethod,
  PrivacyVerificationStatus,
  PrivacyScopeSystem,
  PrivacyMessageChannel,
  PrivacyRequestStatus,
} from "@prisma/client";

export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const asString = (v: string | string[] | undefined): string | undefined =>
  typeof v === "string" && v.length > 0 ? v : undefined;

const VERIFICATION_METHODS: PrivacyVerificationMethod[] = [
  "ID_UPLOAD", "EMAIL_LINK", "MFA_CHALLENGE", "SECURITY_QUESTIONS", "VIDEO_CALL", "KNOWN_AUTH_SESSION",
];
const SCOPE_SYSTEMS: PrivacyScopeSystem[] = [
  "POSTGRES", "S3", "STRIPE", "RESEND", "SENTRY",
  "AUDIT_LOG", "TENANT_CACHE", "SUPPORT_INBOX", "ANALYTICS", "WEBHOOKS",
];

const STATUSES: PrivacyRequestStatus[] = [
  "RECEIVED", "AWAITING_VERIFICATION", "VERIFIED", "IN_PROGRESS",
  "AWAITING_LEGAL_HOLD_REVIEW", "AWAITING_SUBJECT_INFO",
  "COMPLETED", "REJECTED", "WITHDRAWN",
];

export default async function PrivacyRequestDetail({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SP>;
}) {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("privacy.read")) {
    return (
      <main className="mx-auto max-w-2xl py-12 text-center">
        <h1 className="text-xl font-semibold">Access denied</h1>
      </main>
    );
  }
  const canTriage  = ctx.can("privacy.triage");
  const canProcess = ctx.can("privacy.process");
  const canDelete  = ctx.can("privacy.delete");

  const { id } = await params;
  const sp = await searchParams;
  const ok = asString(sp.ok);
  const error = asString(sp.error);

  const r = await loadRequestDetail(id);
  if (!r) notFound();

  const staff = await db.user.findMany({
    where: { platformRole: { not: null } },
    select: { id: true, email: true, name: true },
    orderBy: { email: "asc" },
    take: 50,
  });

  const ranScopes = new Set(r.scopeResults.map((s) => s.system));
  const remainingScopes = SCOPE_SYSTEMS.filter((s) => !ranScopes.has(s));
  const totalRecords = r.scopeResults.reduce((s, x) => s + x.resultCount, 0);
  const totalBytes   = r.scopeResults.reduce((s, x) => s + (x.resultBytes ?? 0), 0);

  return (
    <main className="mx-auto w-full max-w-[1480px] px-6 py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/platform/security/privacy-requests"
                  className="text-[12px] underline" style={{ color: "var(--text-muted)" }}>
              ← Privacy Requests
            </Link>
          </div>
          <h1 className="mt-1 flex items-center gap-2 text-[22px] font-semibold" style={{ color: "var(--text-default)" }}>
            <span className="tabular-nums">{r.externalId}</span>
            <StatusPill status={r.status} />
            {r.legalHold && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ background: "var(--rose-100)", color: "var(--rose-700)" }}>
                Legal hold
              </span>
            )}
          </h1>
          <p className="mt-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
            {TYPE_LABEL[r.type]} · {JURISDICTION_LABEL[r.jurisdiction]} · {SOURCE_LABEL[r.source]} · received {relativeFromNow(r.receivedAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <FormOk msg={ok} />
          <FormError msg={error} />
          <SlaCell remainingHours={r.slaRemainingHours} />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left rail — subject + verification + actions + danger */}
        <aside className="space-y-4 lg:col-span-4">
          <section className="rounded-xl border p-4"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Subject info</h3>
            <dl className="mt-2 space-y-1.5 text-[12px]">
              <Row label="Name"  value={r.subjectName} />
              <Row label="Email" value={r.subjectEmail} />
              <Row label="Other identifier" value={r.subjectIdentifier ?? "—"} />
              <Row label="Tenant" value={r.tenant ? `${r.tenant.name} (${r.tenant.slug})` : "—"} />
              <Row label="SLA deadline" value={shortDate(r.slaDeadline)} />
              <Row label="Received" value={shortDate(r.receivedAt)} />
              {r.verifiedAt   && <Row label="Verified"  value={shortDate(r.verifiedAt)} />}
              {r.completedAt  && <Row label="Completed" value={shortDate(r.completedAt)} />}
              {r.rejectedAt   && <Row label="Rejected"  value={shortDate(r.rejectedAt)} />}
            </dl>
            {r.intakeNotes && (
              <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Intake notes</div>
                <div className="mt-1 whitespace-pre-wrap text-[12px]" style={{ color: "var(--text-default)" }}>{r.intakeNotes}</div>
              </div>
            )}
            {r.internalNotes && (
              <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>Internal notes</div>
                <div className="mt-1 whitespace-pre-wrap text-[12px]" style={{ color: "var(--text-default)" }}>{r.internalNotes}</div>
              </div>
            )}
          </section>

          {/* Verification card */}
          <section className="rounded-xl border p-4"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Verification</h3>
              <VerificationPill status={r.verificationStatus} />
            </div>
            {r.verifications.length === 0 ? (
              <p className="mt-2 text-[12px]" style={{ color: "var(--text-muted)" }}>No verification attempts recorded.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {r.verifications.map((v) => (
                  <li key={v.id} className="rounded-md border px-2 py-1.5"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium" style={{ color: "var(--text-default)" }}>
                        {VERIFICATION_METHOD_LABEL[v.method]}
                      </span>
                      <VerificationPill status={v.status} />
                    </div>
                    {v.notes && <div className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>{v.notes}</div>}
                    {v.fileUrl && (
                      <a href={v.fileUrl} target="_blank" rel="noopener noreferrer"
                         className="mt-1 inline-block text-[11px] underline" style={{ color: "var(--accent-default)" }}>
                        View document
                      </a>
                    )}
                    <div className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {relativeFromNow(v.verifiedAt ?? v.createdAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {canTriage && (
              <form action={recordVerification} className="mt-3 grid grid-cols-2 gap-2">
                <input type="hidden" name="id" value={r.id} />
                <Select name="method" label="Method"
                        options={VERIFICATION_METHODS.map((m) => ({ value: m, label: VERIFICATION_METHOD_LABEL[m] }))} />
                <Select name="status" label="Result"
                        options={[
                          { value: "VERIFIED", label: "Verified" },
                          { value: "FAILED",   label: "Failed" },
                          { value: "WAIVED",   label: "Waived" },
                        ]} />
                <Input name="fileUrl" label="File URL" type="url" defaultValue="" />
                <Input name="notes" label="Notes" defaultValue="" />
                <div className="col-span-2 flex justify-end">
                  <button type="submit" className="inline-flex h-7 items-center rounded-md px-2 text-[11px] font-medium"
                          style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                    Record verification
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* Workflow controls */}
          {canProcess && (
            <section className="rounded-xl border p-4"
                     style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Workflow</h3>
              <div className="mt-3 space-y-3">
                <form action={setRequestStatus} className="flex items-end gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <div className="flex-1">
                    <label className="block">
                      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Set status</span>
                      <select name="status" defaultValue={r.status}
                              className="w-full rounded-md border px-2 py-1 text-[12px]"
                              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                        {STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase().replace(/_/g, " ")}</option>)}
                      </select>
                    </label>
                  </div>
                  <button type="submit" className="inline-flex h-7 items-center rounded-md px-2 text-[11px] font-medium"
                          style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}>
                    Apply
                  </button>
                </form>
                {canTriage && (
                  <form action={assignRequest} className="flex items-end gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <div className="flex-1">
                      <label className="block">
                        <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Assignee</span>
                        <select name="userId" defaultValue={r.assignedTo?.id ?? ""}
                                className="w-full rounded-md border px-2 py-1 text-[12px]"
                                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                          <option value="">—</option>
                          {staff.map((s) => <option key={s.id} value={s.id}>{s.email}</option>)}
                        </select>
                      </label>
                    </div>
                    <button type="submit" className="inline-flex h-7 items-center rounded-md px-2 text-[11px] font-medium"
                            style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}>
                      Assign
                    </button>
                  </form>
                )}
                <form action={generateExport}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit"
                          disabled={r.legalHold}
                          className="inline-flex h-7 w-full items-center justify-center rounded-md px-2 text-[11px] font-medium"
                          style={{
                            background: r.legalHold ? "var(--surface-2)" : "var(--accent-default)",
                            color: r.legalHold ? "var(--text-muted)" : "var(--accent-fg)",
                          }}>
                    {r.exportGenerated ? "Regenerate export bundle" : "Generate export bundle (ZIP)"}
                  </button>
                </form>
                {r.exportBundleUrl && (
                  <div className="rounded-md border px-2 py-1.5"
                       style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
                    <a href={r.exportBundleUrl} target="_blank" rel="noopener noreferrer"
                       className="text-[11px] underline" style={{ color: "var(--accent-default)" }}>
                      Download export bundle
                    </a>
                    <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      Link expires {shortDate(r.exportBundleExpiresAt)}
                    </div>
                  </div>
                )}
                <form action={generateFinalReport}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit"
                          className="inline-flex h-7 w-full items-center justify-center rounded-md border px-2 text-[11px] font-medium"
                          style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                    Generate final-report PDF + mark complete
                  </button>
                </form>
                {r.finalReportUrl && (
                  <a href={r.finalReportUrl} target="_blank" rel="noopener noreferrer"
                     className="block rounded-md border px-2 py-1.5 text-[11px] underline"
                     style={{ background: "var(--emerald-50, var(--surface-2))", borderColor: "var(--emerald-200)", color: "var(--emerald-700)" }}>
                    View final report PDF
                  </a>
                )}
                <form action={toggleLegalHold} className="rounded-md border px-2 py-2"
                      style={{ borderColor: "var(--border-subtle)", background: "var(--surface-2)" }}>
                  <input type="hidden" name="id" value={r.id} />
                  <label className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-default)" }}>
                    <input type="checkbox" name="hold" defaultChecked={r.legalHold} />
                    Legal hold (blocks deletion)
                  </label>
                  <input name="reason" defaultValue={r.legalHoldReason ?? ""}
                         placeholder="Hold reason"
                         className="mt-1 w-full rounded-md border px-2 py-1 text-[11px]"
                         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                  <div className="mt-1 flex justify-end">
                    <button type="submit" className="text-[11px] font-medium underline" style={{ color: "var(--accent-default)" }}>
                      Save
                    </button>
                  </div>
                </form>
              </div>
            </section>
          )}

          {/* Danger zone for deletion */}
          {canDelete && r.type === "DELETION" && (
            <section className="rounded-xl border p-4"
                     style={{ background: "var(--surface-1)", borderColor: "var(--rose-200)" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--rose-700)" }}>Execute deletion</h3>
              <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                Type the phrase below to confirm hard-deletion. Cannot be undone.
              </p>
              <form action={executeDeletion} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="expected" value={`DELETE-${r.subjectEmail}`} />
                <code className="block rounded-md border px-2 py-1 text-[11px]"
                      style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                  DELETE-{r.subjectEmail}
                </code>
                <input name="confirm"
                       placeholder="Type the phrase exactly"
                       className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                       style={{ background: "var(--surface-1)", borderColor: "var(--rose-200)", color: "var(--text-default)" }} />
                <button type="submit"
                        disabled={r.legalHold}
                        className="inline-flex h-8 w-full items-center justify-center rounded-md px-3 text-[12px] font-semibold"
                        style={{
                          background: r.legalHold ? "var(--surface-2)" : "var(--rose-600, var(--rose-500))",
                          color: r.legalHold ? "var(--text-muted)" : "white",
                        }}>
                  Execute hard-deletion
                </button>
              </form>
            </section>
          )}
        </aside>

        {/* Main column */}
        <section className="space-y-4 lg:col-span-8">
          {/* Scope discovery */}
          <section className="rounded-xl border"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Scope discovery</h3>
                  <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {r.scopeResults.length}/{SCOPE_SYSTEMS.length} systems queried
                    {r.scopeResults.length > 0 && (
                      <> · {totalRecords.toLocaleString()} records · {(totalBytes / 1024).toFixed(1)} KB</>
                    )}
                  </p>
                </div>
              </div>
            </header>
            <div className="overflow-x-auto p-4">
              {r.scopeResults.length === 0 ? (
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                  No systems queried yet. {canProcess && "Use the controls below to discover scope."}
                </p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ color: "var(--text-muted)" }}>
                      <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">System</th>
                      <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">Status</th>
                      <th className="pb-2 text-right text-[11px] font-medium uppercase tracking-wide">Records</th>
                      <th className="pb-2 text-right text-[11px] font-medium uppercase tracking-wide">Bytes</th>
                      <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">Last run</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.scopeResults.map((s) => (
                      <tr key={s.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                        <td className="py-2 pr-3"><span className="text-[12px] font-medium" style={{ color: "var(--text-default)" }}>{SCOPE_SYSTEM_LABEL[s.system]}</span></td>
                        <td className="py-2 pr-3"><ScopeStatusPill status={s.status} /></td>
                        <td className="py-2 pr-3 text-right text-[11px] tabular-nums" style={{ color: "var(--text-default)" }}>{s.resultCount.toLocaleString()}</td>
                        <td className="py-2 pr-3 text-right text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                          {s.resultBytes ? `${(s.resultBytes / 1024).toFixed(1)} KB` : "—"}
                        </td>
                        <td className="py-2 pr-3 text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(s.lastRunAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {canProcess && remainingScopes.length > 0 && (
              <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Run discovery against:</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {remainingScopes.map((s) => (
                    <form key={s} action={runScopeDiscovery} className="inline-flex">
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="system" value={s} />
                      <button type="submit" className="inline-flex h-7 items-center rounded-md border px-2 text-[11px] font-medium"
                              style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}>
                        + {SCOPE_SYSTEM_LABEL[s]}
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Communication thread */}
          <section className="rounded-xl border"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Communication thread</h3>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{r.messages.length} messages</p>
            </header>
            <div className="space-y-2 p-4">
              {r.messages.length === 0 ? (
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No messages yet.</p>
              ) : (
                r.messages.map((m) => (
                  <div key={m.id} className="rounded-md border px-3 py-2"
                       style={{
                         background: m.direction === "OUTBOUND" ? "var(--surface-2)" : "var(--surface-1)",
                         borderColor: "var(--border-subtle)",
                       }}>
                    <div className="flex items-baseline justify-between">
                      <div className="text-[11px] font-medium" style={{ color: "var(--text-default)" }}>
                        {m.direction === "OUTBOUND" ? "→ " : "← "}
                        {m.senderName ?? m.senderEmail ?? "(system)"}
                        <span className="ml-2 text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                          {m.channel.toLowerCase()}
                        </span>
                      </div>
                      <div className="text-[10px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                        {relativeFromNow(m.occurredAt)}
                      </div>
                    </div>
                    {m.subject && <div className="mt-0.5 text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>{m.subject}</div>}
                    <div className="mt-1 whitespace-pre-wrap text-[12px]" style={{ color: "var(--text-default)" }}>{m.body}</div>
                  </div>
                ))
              )}
            </div>
            {canTriage && (
              <div className="border-t px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
                <details>
                  <summary className="cursor-pointer text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>
                    + New outbound message
                  </summary>
                  <form action={sendMessage} className="mt-2 space-y-2">
                    <input type="hidden" name="id" value={r.id} />
                    <div className="grid grid-cols-2 gap-2">
                      <Select name="channel" label="Channel"
                              options={[
                                { value: "EMAIL",  label: "Email" },
                                { value: "PORTAL", label: "Tenant portal" },
                                { value: "PHONE",  label: "Phone log" },
                                { value: "IN_APP", label: "In-app" },
                              ]} />
                      <Input name="subject" label="Subject" defaultValue="" />
                    </div>
                    <label className="block">
                      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Body</span>
                      <textarea name="body" rows={4} className="w-full rounded-md border px-2 py-1.5 text-[12px]"
                                style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }} />
                    </label>
                    <div className="flex justify-end">
                      <button type="submit" className="inline-flex h-7 items-center rounded-md px-2 text-[11px] font-medium"
                              style={{ background: "var(--accent-default)", color: "var(--accent-fg)" }}>
                        Send
                      </button>
                    </div>
                  </form>
                </details>
              </div>
            )}
          </section>

          {/* Audit trail */}
          <section className="rounded-xl border"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <header className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
              <h3 className="text-[13px] font-semibold" style={{ color: "var(--text-default)" }}>Audit trail</h3>
              <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Immutable per-request log</p>
            </header>
            <div className="overflow-x-auto p-4">
              {r.auditEntries.length === 0 ? (
                <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>No audit entries yet.</p>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr style={{ color: "var(--text-muted)" }}>
                      <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">When</th>
                      <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">Action</th>
                      <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">Actor</th>
                      <th className="pb-2 text-left text-[11px] font-medium uppercase tracking-wide">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.auditEntries.map((a) => (
                      <tr key={a.id} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
                        <td className="py-1.5 pr-3 text-[11px] tabular-nums" style={{ color: "var(--text-muted)" }}>{relativeFromNow(a.occurredAt)}</td>
                        <td className="py-1.5 pr-3"><code className="text-[11px]" style={{ color: "var(--text-default)" }}>{a.action}</code></td>
                        <td className="py-1.5 pr-3 text-[11px]" style={{ color: "var(--text-default)" }}>{a.actorEmail ?? "—"}</td>
                        <td className="py-1.5 pr-3 text-[11px]" style={{ color: "var(--text-muted)" }}>{a.details ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="text-[12px] text-right" style={{ color: "var(--text-default)" }}>{value}</span>
    </div>
  );
}

function Input({
  name, label, type, defaultValue,
}: { name: string; label: string; type?: string; defaultValue: string }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      <input
        type={type ?? "text"}
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-md border px-2 py-1.5 text-[12px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
      />
    </label>
  );
}

function Select({
  name, label, options, defaultValue,
}: {
  name: string; label: string;
  options: { value: string; label: string }[];
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="w-full rounded-md border px-2 py-1.5 text-[12px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
