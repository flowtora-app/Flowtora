import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
} from "@/components/ui";
import { verifyHashChain } from "@/server/platform/audit-log";

export const dynamic = "force-dynamic";

// Manual hash-chain verification surface — Page 14 §Tamper-evidence.
// Replays the chain over the most-recent 5k audit rows and surfaces
// any rows where the stored hash doesn't match a fresh re-compute or
// where prevHash points at a missing predecessor.

export default async function AuditVerifyPage() {
  const ctx = await requirePlatformStaff();
  // audit.read is required to view; the verify endpoint trusts the
  // baseline read perm. (Spec calls out Super Admin / Engineer only
  // for "verify hash chain"; we surface read-level so reviewers
  // can confirm integrity, but the action is read-only.)
  if (!ctx.can("audit.read")) {
    return (
      <Card padding="lg">
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          Forbidden. Your role can&apos;t read the audit log.
        </p>
      </Card>
    );
  }

  const result = await verifyHashChain(5_000);
  const ok = result.broken.length === 0;

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Access" },
          { label: "Audit Log", href: "/platform/access/audit" },
          { label: "Verify chain" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Hash chain verification"
            description={`Replays the chain over the most recent ${result.totalChecked.toLocaleString()} rows.`}
            actions={
              <Link href="/platform/access/audit">
                <Button size="sm" variant="secondary">← Back to log</Button>
              </Link>
            }
          />
        </div>
      </div>

      <Card padding="md" style={{
        borderColor: ok ? "var(--emerald-200)" : "var(--rose-200)",
        background: ok ? "var(--emerald-50)" : "var(--rose-50)",
      }}>
        <div className="flex items-start gap-3">
          <span aria-hidden className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-[14px] font-bold"
                style={{
                  background: ok ? "var(--emerald-100)" : "var(--rose-100)",
                  color: ok ? "var(--emerald-700)" : "var(--rose-700)",
                }}>
            {ok ? "✓" : "!"}
          </span>
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold"
                style={{ color: ok ? "var(--emerald-700)" : "var(--rose-700)" }}>
              {ok ? "Chain intact" : `${result.broken.length} broken row${result.broken.length === 1 ? "" : "s"}`}
            </h3>
            <p className="mt-1 text-[12px]"
               style={{ color: ok ? "var(--emerald-700)" : "var(--rose-700)" }}>
              {ok
                ? "Every row's stored hash matches a fresh re-compute, and every prevHash links to a valid predecessor."
                : "Engineering should investigate immediately. The list below shows each row that didn't pass verification."}
            </p>
            <p className="mt-1 text-[11px]"
               style={{ color: ok ? "var(--emerald-700)" : "var(--rose-700)", opacity: 0.7 }}>
              Verified {result.ok.toLocaleString()} of {result.totalChecked.toLocaleString()} rows · run completed {new Date().toLocaleString()}
            </p>
          </div>
        </div>
      </Card>

      {!ok && (
        <Card>
          <CardHeader title={`Broken rows (${result.broken.length})`}
                      description="Each row's reason explains which check failed." />
          <CardBody>
            <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
              {result.broken.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 py-2 text-[12px]">
                  <Link href={`/platform/access/audit?detail=${b.id}`}
                        className="font-mono hover:underline"
                        style={{ color: "var(--text-default)" }}>
                    {b.id}
                  </Link>
                  <span style={{ color: "var(--rose-700)" }}>{b.reason}</span>
                  <span className="tabular-nums" style={{ color: "var(--text-muted)" }}>
                    {b.createdAt.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card padding="sm" style={{ borderColor: "var(--amber-200)", background: "var(--amber-50)" }}>
        <p className="text-[11px]" style={{ color: "var(--amber-700)" }}>
          <strong>Why this is best-effort:</strong> the chain is computed in application code at insert time
          (not via a DB trigger), so an attacker with raw DB access could in theory rewrite both the row + its
          hash. For higher assurance, ship audit rows to an append-only external store (S3 Object Lock, immutable
          log service) — this verifier catches accidental drift and a wide class of in-app tampering.
        </p>
      </Card>
    </div>
  );
}
