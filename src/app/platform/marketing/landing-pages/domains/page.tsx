// Page 38 §Domains — manage LandingPageDomain rows.

import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import { loadDomains } from "@/server/platform/landing-pages";
import {
  createLandingPageDomain,
  removeLandingPageDomain,
  verifyLandingPageDomain,
} from "@/app/actions/platform-landing-pages";
import { FormError, FormOk, relativeFromNow } from "../_components/shared";
import type { LandingPageDomainStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<LandingPageDomainStatus, { bg: string; fg: string }> = {
  PENDING_VERIFICATION: { bg: "var(--warning-surface)", fg: "var(--warning-fg)" },
  VERIFIED:             { bg: "var(--success-surface)", fg: "var(--success-fg)" },
  ERROR:                { bg: "var(--rose-50, var(--surface-2))", fg: "var(--danger-fg)" },
};

export default async function DomainsPage({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const canWrite = ctx.can("announcement.write");
  const domains = await loadDomains();

  return (
    <div className="space-y-5">
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        <Link href="/platform/marketing/landing-pages" className="underline" style={{ color: "var(--text-muted)" }}>
          Landing pages
        </Link>
        <span className="mx-1.5">/</span>
        <span style={{ color: "var(--text-default)" }}>Domains</span>
      </div>

      <h1 className="text-[22px] font-semibold leading-tight" style={{ color: "var(--text-default)" }}>
        Custom domains
      </h1>
      <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        Verify additional hostnames so landing pages can serve at <code>https://yourhost/lp/&lt;path&gt;</code>{" "}
        instead of the default <code>flowtora.com</code> path.
      </p>

      <FormOk msg={sp.ok} />
      <FormError msg={sp.error} />

      {canWrite && (
        <form
          action={createLandingPageDomain}
          className="flex flex-wrap items-end gap-2 rounded-lg border p-4"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
        >
          <Field label="Hostname">
            <input
              name="hostname"
              required
              placeholder="lp.example.com"
              maxLength={120}
              className="ts-focus w-[280px] rounded-md px-2 py-1.5 text-[12px] outline-none"
              style={inputStyle()}
            />
          </Field>
          <button
            type="submit"
            className="ts-focus rounded-md px-3 py-1.5 text-[12px] font-semibold"
            style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
          >
            + Add domain
          </button>
        </form>
      )}

      {domains.length === 0 ? (
        <div
          className="rounded-lg border p-10 text-center text-[12px]"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
        >
          <div className="mb-1 text-2xl" aria-hidden>🌐</div>
          <div className="font-medium" style={{ color: "var(--text-default)" }}>
            No custom domains yet.
          </div>
        </div>
      ) : (
        <ul
          className="overflow-hidden rounded-lg"
          style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
        >
          {domains.map((d, idx) => {
            const tone = STATUS_TONE[d.status];
            return (
              <li
                key={d.id}
                className="px-4 py-3"
                style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[14px]" style={{ color: "var(--text-default)" }}>
                        {d.hostname}
                      </span>
                      <span
                        className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        style={{ background: tone.bg, color: tone.fg }}
                      >
                        {d.status.replace(/_/g, " ").toLowerCase()}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                      {d._count.pages} page{d._count.pages === 1 ? "" : "s"} attached · added {relativeFromNow(d.createdAt)}
                      {d.verifiedAt && ` · verified ${relativeFromNow(d.verifiedAt)}`}
                    </p>
                    {d.status === "PENDING_VERIFICATION" && (
                      <div
                        className="mt-2 rounded-md border p-2 text-[11px]"
                        style={{
                          background: "var(--warning-surface)",
                          borderColor: "var(--amber-200, var(--border-default))",
                          color: "var(--warning-fg)",
                        }}
                      >
                        Add this TXT record to verify ownership:
                        <div className="mt-1 font-mono text-[10px]">
                          _flowtora-verify.{d.hostname}  TXT  {d.verificationToken}
                        </div>
                      </div>
                    )}
                    {d.errorMessage && (
                      <div className="mt-2 text-[11px]" style={{ color: "var(--danger-fg)" }}>
                        {d.errorMessage}
                      </div>
                    )}
                  </div>
                  {canWrite && (
                    <div className="flex items-center gap-2">
                      {d.status !== "VERIFIED" && (
                        <form action={verifyLandingPageDomain}>
                          <input type="hidden" name="id" value={d.id} />
                          <button type="submit"
                                  className="ts-focus rounded-md px-3 py-1.5 text-[11px] font-semibold"
                                  style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
                            Verify
                          </button>
                        </form>
                      )}
                      <form action={removeLandingPageDomain}>
                        <input type="hidden" name="id" value={d.id} />
                        <button type="submit"
                                className="text-[11px] underline"
                                style={{ color: "var(--danger-fg)" }}>
                          Remove
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-default)",
  };
}
