import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePlatformStaff } from "@/lib/platform";
import { PLAN_ENTITLEMENTS } from "@/lib/entitlements";
import { getFeatureGateMeta, FEATURE_GATE_META } from "@/lib/feature-gates";
import { upsertFeatureFlag, deleteFeatureFlag } from "@/app/actions/platform";

// /platform/feature-flags/[key] — per-feature override management.
//
// Three sections:
//   1. Header — feature label, key, gate / marketing pill, plan-default
//      grid, hierarchy explainer
//   2. Global override — single-row card with current state + edit form
//   3. Per-tenant overrides — table of every tenantId override for this
//      key with edit / clear inline; "+ Add tenant override" form

export const dynamic = "force-dynamic";

export default async function FeatureFlagDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { key: rawKey } = await params;
  const sp = await searchParams;
  const ctx = await requirePlatformStaff();

  const key = decodeURIComponent(rawKey);

  // Validate the key exists in the master list. If not, 404.
  const ALL_KEYS = Object.keys(PLAN_ENTITLEMENTS.STARTER.features);
  if (!ALL_KEYS.includes(key)) notFound();

  const meta = getFeatureGateMeta(key);
  const isGated = Boolean(FEATURE_GATE_META[key]);

  // ── Pull every override row for this key in one query.
  const flagRows = await db.featureFlag.findMany({
    where: { key },
    orderBy: { tenantId: "asc" },
  });

  const tenantIds = Array.from(
    new Set(flagRows.map((f) => f.tenantId).filter((x): x is string => Boolean(x))),
  );
  const tenants = tenantIds.length
    ? await db.tenant.findMany({
        where: { id: { in: tenantIds } },
        select: { id: true, name: true, slug: true, plan: true, status: true },
      })
    : [];
  const tenantById = new Map(tenants.map((t) => [t.id, t]));

  const userIds = Array.from(
    new Set(flagRows.map((f) => f.updatedBy).filter((x): x is string => Boolean(x))),
  );
  const users = userIds.length
    ? await db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, email: true, name: true },
      })
    : [];
  const userById = new Map(users.map((u) => [u.id, u]));

  const globalRow = flagRows.find((f) => f.tenantId === null) ?? null;
  const tenantRows = flagRows.filter((f) => f.tenantId !== null);

  // ── Audit history for this key.
  const audits = await db.auditLog.findMany({
    where: {
      action: { in: ["platform.feature_flag_set", "platform.feature_flag_cleared"] },
      // Filter via metadata JSON `key` — Prisma's path-based filter on
      // JSON columns. Fallback path scan if the key column is unindexed.
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const filteredAudits = audits.filter((a) => {
    const meta = a.metadata as Record<string, unknown> | null;
    return meta && typeof meta === "object" && "key" in meta && (meta as { key: unknown }).key === key;
  });
  const auditUserIds = Array.from(new Set(filteredAudits.map((a) => a.userId).filter((x): x is string => Boolean(x))));
  const auditTenantIds = Array.from(new Set(filteredAudits.map((a) => a.tenantId).filter((x): x is string => Boolean(x))));
  const [auditUsers, auditTenants] = await Promise.all([
    auditUserIds.length
      ? db.user.findMany({ where: { id: { in: auditUserIds } }, select: { id: true, email: true, name: true } })
      : Promise.resolve([] as { id: string; email: string; name: string | null }[]),
    auditTenantIds.length
      ? db.tenant.findMany({ where: { id: { in: auditTenantIds } }, select: { id: true, name: true } })
      : Promise.resolve([] as { id: string; name: string }[]),
  ]);
  const auditUserById = new Map(auditUsers.map((u) => [u.id, u]));
  const auditTenantById = new Map(auditTenants.map((t) => [t.id, t]));

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────── */}
      <header>
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          <Link href="/platform/feature-flags" className="hover:underline">
            Feature flags
          </Link>
          <span className="mx-1.5">/</span>
          <span className="font-mono">{key}</span>
        </div>
        <div className="mt-1 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1
              className="text-2xl font-semibold tracking-tight"
              style={{ color: "var(--text-default)" }}
            >
              {meta.label}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Chip
                label={isGated ? "Gated" : "Marketing"}
                bg={isGated ? "var(--warning-surface)" : "var(--surface-2)"}
                fg={isGated ? "var(--warning-fg)" : "var(--text-muted)"}
                title={isGated ? "Code-enforced via hasFeature(tenant, key)" : "Display-only — no runtime enforcement"}
              />
              <Chip
                label={`min plan: ${meta.requiredPlan}`}
                bg="var(--surface-2)"
                fg="var(--text-default)"
                title="Lowest plan that includes this feature by default"
              />
              <Chip
                label={`${tenantRows.length} tenant override${tenantRows.length === 1 ? "" : "s"}`}
                bg="var(--accent-surface)"
                fg="var(--accent-primary)"
              />
            </div>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
              {meta.reason}
            </p>
          </div>
        </div>
      </header>

      {/* Banners */}
      {sp.ok && <Banner tone="success" title="Saved" body="Override applied." />}
      {sp.error && <Banner tone="danger" title="Action failed" body={decodeURIComponent(sp.error)} />}

      {/* ── Plan default mini-matrix ───────────────────── */}
      <Section title="Plan defaults" description="The starting point — overrides below win.">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {Object.entries(PLAN_ENTITLEMENTS).map(([plan, entitlements]) => {
            const enabled = (entitlements as { features: Record<string, boolean> }).features[key];
            return (
              <div
                key={plan}
                className="rounded-lg p-3"
                style={{
                  background: enabled ? "var(--success-surface)" : "var(--surface-2)",
                  border: `1px solid ${enabled ? "var(--success-fg)" : "var(--border-subtle)"}`,
                }}
              >
                <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  {plan}
                </div>
                <div
                  className="mt-1 text-sm font-semibold"
                  style={{ color: enabled ? "var(--success-fg)" : "var(--text-faint)" }}
                >
                  {enabled ? "✓ Included" : "—  Not included"}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── Global override ────────────────────────────── */}
      <Section
        title="Global override"
        description="Wins over every plan default. Use sparingly — affects every tenant at once."
        right={
          globalRow && ctx.canWrite ? (
            <form action={deleteFeatureFlag.bind(null, globalRow.id)}>
              <button
                type="submit"
                className="ts-focus rounded-md px-3 py-1.5 text-xs font-medium"
                style={{
                  background: "var(--danger-surface)",
                  color: "var(--danger-fg)",
                  border: "1px solid var(--danger-fg)",
                }}
              >
                Clear override
              </button>
            </form>
          ) : null
        }
      >
        {globalRow && (
          <div
            className="mb-4 grid grid-cols-2 gap-3 rounded-lg p-3 md:grid-cols-4"
            style={{
              background: globalRow.enabled ? "var(--success-surface)" : "var(--danger-surface)",
              border: `1px solid ${globalRow.enabled ? "var(--success-fg)" : "var(--danger-fg)"}`,
            }}
          >
            <KV label="State" value={globalRow.enabled ? "ON" : "OFF"} fg={globalRow.enabled ? "var(--success-fg)" : "var(--danger-fg)"} />
            <KV label="Rollout" value={globalRow.rolloutPct == null ? "Full" : `${globalRow.rolloutPct}%`} />
            <KV label="Expires" value={globalRow.expiresAt ? globalRow.expiresAt.toISOString().slice(0, 10) : "Never"} />
            <KV label="Updated" value={globalRow.updatedAt.toISOString().slice(0, 10)} />
          </div>
        )}

        {ctx.canWrite ? (
          <OverrideForm
            keyName={key}
            existing={globalRow}
            scope="global"
          />
        ) : (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Read-only — admin role required to set overrides.
          </p>
        )}
      </Section>

      {/* ── Per-tenant overrides ───────────────────────── */}
      <Section
        title={`Per-tenant overrides (${tenantRows.length})`}
        description="Highest precedence. Use for surgical access — beta enrollment, comp'd customers, churn-save offers."
      >
        {tenantRows.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No tenant-specific overrides for this feature.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-5 mb-5">
            <table className="w-full text-sm">
              <thead style={{ color: "var(--text-muted)", background: "var(--surface-2)" }}>
                <tr className="text-left">
                  <Th>Tenant</Th>
                  <Th>State</Th>
                  <Th>Rollout</Th>
                  <Th>Expires</Th>
                  <Th>Note</Th>
                  <Th>Last update</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {tenantRows.map((row, idx) => {
                  const t = row.tenantId ? tenantById.get(row.tenantId) : null;
                  const u = row.updatedBy ? userById.get(row.updatedBy) : null;
                  return (
                    <tr
                      key={row.id}
                      style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                    >
                      <Td>
                        {t ? (
                          <Link href={`/platform/tenants/${t.id}`} className="text-sm font-medium hover:underline" style={{ color: "var(--text-default)" }}>
                            {t.name}
                          </Link>
                        ) : <span className="text-xs" style={{ color: "var(--text-faint)" }}>deleted tenant</span>}
                        {t && (
                          <div className="mt-0.5 text-[10px]" style={{ color: "var(--text-faint)" }}>
                            {t.plan} · {t.status}
                          </div>
                        )}
                      </Td>
                      <Td>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                          style={{
                            background: row.enabled ? "var(--success-surface)" : "var(--danger-surface)",
                            color:      row.enabled ? "var(--success-fg)"      : "var(--danger-fg)",
                            border: `1px solid ${row.enabled ? "var(--success-fg)" : "var(--danger-fg)"}`,
                          }}
                        >
                          {row.enabled ? "ON" : "OFF"}
                        </span>
                      </Td>
                      <Td className="text-xs">
                        {row.rolloutPct == null ? <span style={{ color: "var(--text-muted)" }}>Full</span> : <b style={{ color: "var(--text-default)" }}>{row.rolloutPct}%</b>}
                      </Td>
                      <Td className="text-xs">
                        {row.expiresAt
                          ? <span style={{ color: row.expiresAt.getTime() < Date.now() ? "var(--text-faint)" : "var(--warning-fg)" }}>{row.expiresAt.toISOString().slice(0, 10)}</span>
                          : <span style={{ color: "var(--text-faint)" }}>Never</span>}
                      </Td>
                      <Td className="text-xs italic" style={{ color: "var(--text-muted)" }}>
                        {row.note ?? "—"}
                      </Td>
                      <Td className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {row.updatedAt.toISOString().slice(0, 10)}
                        {u && <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>by {u.name ?? u.email}</div>}
                      </Td>
                      <Td>
                        {ctx.canWrite && (
                          <form action={deleteFeatureFlag.bind(null, row.id)}>
                            <button
                              type="submit"
                              className="ts-focus rounded-md px-2 py-1 text-xs font-medium"
                              style={{
                                background: "var(--surface-2)",
                                color: "var(--danger-fg)",
                                border: "1px solid var(--danger-fg)",
                              }}
                            >
                              Clear
                            </button>
                          </form>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {ctx.canWrite && (
          <div
            className="rounded-lg p-4"
            style={{ background: "var(--surface-2)", border: "1px solid var(--border-subtle)" }}
          >
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Add tenant override
            </div>
            <OverrideForm
              keyName={key}
              existing={null}
              scope="tenant"
              showTenantInput
            />
          </div>
        )}
      </Section>

      {/* ── Audit history ──────────────────────────────── */}
      <Section
        title={`Change history (${filteredAudits.length})`}
        description="Every set / clear for this key."
      >
        {filteredAudits.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            No changes yet — overrides will show up here once created.
          </p>
        ) : (
          <ol className="-mx-5 -mb-5">
            {filteredAudits.map((a, idx) => {
              const t = a.tenantId ? auditTenantById.get(a.tenantId) : null;
              const u = a.userId ? auditUserById.get(a.userId) : null;
              const meta = a.metadata as Record<string, unknown> | null;
              const enabled = meta && typeof meta.enabled === "boolean" ? meta.enabled : null;
              const tone =
                a.action === "platform.feature_flag_cleared" ? { fg: "var(--text-muted)", label: "Cleared" } :
                enabled === true ? { fg: "var(--success-fg)", label: "Set ON" } :
                enabled === false ? { fg: "var(--danger-fg)", label: "Set OFF" } :
                { fg: "var(--text-muted)", label: "Set" };
              return (
                <li
                  key={a.id}
                  className="grid grid-cols-[16px_1fr] gap-3 px-5 py-2.5"
                  style={{ borderTop: idx === 0 ? "none" : "1px solid var(--border-subtle)" }}
                >
                  <span aria-hidden className="mt-1.5 inline-block h-2.5 w-2.5 rounded-full" style={{ background: tone.fg }} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-2 text-xs">
                      <span className="font-semibold" style={{ color: tone.fg }}>{tone.label}</span>
                      <span style={{ color: "var(--text-muted)" }}>
                        {t ? <>· {t.name}</> : <>· global</>}
                      </span>
                      <span className="ml-auto whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                        {a.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      {u ? `by ${u.name ?? u.email}` : "by system"}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function OverrideForm({
  keyName,
  existing,
  scope,
  showTenantInput,
}: {
  keyName: string;
  existing: { id: string; enabled: boolean; note: string | null; rolloutPct: number | null; expiresAt: Date | null; tenantId: string | null } | null;
  scope: "global" | "tenant";
  showTenantInput?: boolean;
}) {
  const expiresValue = existing?.expiresAt
    ? toLocalInput(existing.expiresAt)
    : "";
  return (
    <form action={upsertFeatureFlag} className="space-y-3">
      <input type="hidden" name="key" value={keyName} />
      {scope === "global" && <input type="hidden" name="tenantId" value="" />}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {showTenantInput && (
          <FormInput
            label="Tenant ID"
            name="tenantId"
            placeholder="cuid"
            mono
          />
        )}
        <FormSelect
          label="State"
          name="enabled"
          defaultValue={existing?.enabled ? "on" : "off"}
          options={[
            { value: "on", label: "Enabled" },
            { value: "off", label: "Disabled" },
          ]}
        />
        <FormInput
          label="Rollout %"
          name="rolloutPct"
          type="number"
          placeholder="100"
          defaultValue={existing?.rolloutPct == null ? "" : String(existing.rolloutPct)}
          hint="0–100. Empty = full."
        />
        <FormInput
          label="Expires (UTC)"
          name="expiresAt"
          type="datetime-local"
          defaultValue={expiresValue}
          hint="Auto-clears the override."
        />
      </div>
      <FormInput
        label="Note"
        name="note"
        defaultValue={existing?.note ?? ""}
        placeholder='e.g. "Beta rollout week of 2026-04-20"'
      />
      <div className="flex items-center justify-end gap-2">
        <button
          type="submit"
          className="ts-focus rounded-md px-4 py-2 text-sm font-medium"
          style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
        >
          {existing ? "Update override" : "Create override"}
        </button>
      </div>
    </form>
  );
}

function FormInput({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  mono,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  placeholder?: string;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className={`ts-focus w-full rounded-md px-3 py-2 text-sm outline-none ${mono ? "font-mono text-xs" : ""}`}
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          color: "var(--text-default)",
        }}
      />
      {hint && <span className="mt-1 block text-[10px]" style={{ color: "var(--text-faint)" }}>{hint}</span>}
    </label>
  );
}

function FormSelect({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="ts-focus w-full rounded-md px-3 py-2 text-sm outline-none"
        style={{
          background: "var(--surface-1)",
          border: "1px solid var(--border-default)",
          color: "var(--text-default)",
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function Section({
  title,
  description,
  right,
  children,
}: {
  title: string;
  description?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="overflow-hidden rounded-xl"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border-subtle)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <header
        className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-4"
        style={{ borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>{description}</p>
          )}
        </div>
        {right}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Banner({
  tone,
  title,
  body,
}: {
  tone: "danger" | "success";
  title: string;
  body: string;
}) {
  const palette =
    tone === "danger"
      ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",  border: "var(--danger-fg)"  }
      : { bg: "var(--success-surface)", fg: "var(--success-fg)", border: "var(--success-fg)" };
  return (
    <div
      className="rounded-md px-4 py-3 text-sm"
      style={{ background: palette.bg, border: `1px solid ${palette.border}`, color: palette.fg }}
    >
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5 text-xs" style={{ opacity: 0.85 }}>{body}</div>
    </div>
  );
}

function Chip({
  bg,
  fg,
  label,
  title,
}: {
  bg: string;
  fg: string;
  label: string;
  title?: string;
}) {
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: bg, color: fg, border: `1px solid ${fg}` }}
      title={title}
    >
      {label}
    </span>
  );
}

function KV({ label, value, fg }: { label: string; value: string; fg?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums" style={{ color: fg ?? "var(--text-default)" }}>
        {value}
      </div>
    </div>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return <th className="px-5 py-2.5 text-[10px] font-semibold uppercase tracking-wide">{children}</th>;
}

function Td({
  children,
  className,
  style,
}: {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return <td className={`px-5 py-3 align-top ${className ?? ""}`} style={style}>{children}</td>;
}

// Convert a Date to YYYY-MM-DDTHH:mm — what <input type="datetime-local"> wants.
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  );
}
