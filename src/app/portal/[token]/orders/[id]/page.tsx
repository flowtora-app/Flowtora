import Link from "next/link";
import { requirePortalToken, portalPath, assertBelongsToPortal } from "@/lib/portal";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { TextArea } from "@/components/Field";
import { formatMoney, formatDate, formatDateTime } from "@/lib/format";
import { statusColor, statusLabel } from "@/lib/orders";
import { proofStatusColor, proofStatusLabel } from "@/lib/proofs";
import {
  installStatusColor,
  installStatusLabel,
  installKindLabel,
  formatTimeRange,
} from "@/lib/installs";
import { parseSelectedOptions } from "@/lib/quotes";
import { CustomerFileUploadInput } from "@/components/portal/CustomerFileUploadInput";
import { uploadPortalFile, deletePortalFile } from "@/app/actions/portal-public";

export default async function PortalOrderDetail({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; id: string }>;
  searchParams: Promise<{ error?: string; uploaded?: string; removed?: string }>;
}) {
  const { token, id } = await params;
  const sp = await searchParams;
  const ctx = await requirePortalToken(token);

  const order = await db.order.findFirst({
    where: { id, tenantId: ctx.tenant.id },
    include: {
      items:         { orderBy: { sortOrder: "asc" } },
      proofs:        { where: { status: { not: "DRAFT" } }, orderBy: { version: "desc" } },
      installEvents: { orderBy: { scheduledStart: "asc" } },
      invoices:      { orderBy: { createdAt: "desc" } },
      // Phase 15 Slice B — files attached to this order. We only surface
      // customer-visible categories + the customer's own CUSTOMER_UPLOAD
      // rows; everything else (DESIGN_SOURCE, PRODUCTION_READY, etc.) is
      // internal and must not leak to the portal.
      files: {
        where: {
          archivedAt: null,
          kind: { in: ["REFERENCE", "ATTACHMENT", "CUSTOMER_UPLOAD"] },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  assertBelongsToPortal(ctx, order);
  if (!order) return null;

  const upload = uploadPortalFile.bind(null, token, order.id);

  const currency = ctx.tenant.currency;

  return (
    <div className="space-y-6">
      <div className="text-sm">
        <Link href={portalPath(token, "orders")} className="underline" style={{ color: "var(--text-muted)" }}>
          ← Orders
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{order.number}</h1>
            <span
              className="rounded-full px-2 py-0.5 text-xs"
              style={{ background: statusColor(order.status), color: "white" }}
            >
              {statusLabel(order.status)}
            </span>
          </div>
          <div className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
            From {ctx.tenant.name}
            {order.dueDate && <> · Due {formatDate(order.dueDate, ctx.tenant.dateFormat)}</>}
            {order.completedAt && <> · Completed {formatDate(order.completedAt, ctx.tenant.dateFormat)}</>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>Total</div>
          <div className="text-2xl font-semibold">{formatMoney(Number(order.total), currency)}</div>
        </div>
      </div>

      {order.customerNote && (
        <Card>
          <CardHeader title="Note from us" />
          <div className="whitespace-pre-wrap px-5 py-4 text-sm">{order.customerNote}</div>
        </Card>
      )}

      <Card>
        <CardHeader title="Line items" description={`${order.items.length} item${order.items.length === 1 ? "" : "s"}`} />
        <ul>
          {order.items.map((item) => {
            const options = parseSelectedOptions(item.selectedOptions as unknown);
            return (
              <li key={item.id} className="px-5 py-4" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="text-sm font-medium">{item.name}</div>
                    {item.description && (
                      <div className="mt-1 whitespace-pre-wrap text-xs" style={{ color: "var(--text-muted)" }}>
                        {item.description}
                      </div>
                    )}
                    {options.length > 0 && (
                      <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        {options.map((o) => `${o.groupName}: ${o.label}`).join(" · ")}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-sm font-semibold">
                    {formatMoney(Number(item.subtotal), currency)}
                  </div>
                </div>
              </li>
            );
          })}
          {order.items.length === 0 && (
            <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>No items.</li>
          )}
        </ul>
        <div className="px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <div className="flex items-center justify-between text-sm">
            <span style={{ color: "var(--text-muted)" }}>Subtotal</span>
            <span>{formatMoney(Number(order.subtotal), currency)}</span>
          </div>
          {Number(order.discountAmount) > 0 && (
            <div className="mt-1 flex items-center justify-between text-sm">
              <span style={{ color: "var(--text-muted)" }}>Discount</span>
              <span>− {formatMoney(Number(order.discountAmount), currency)}</span>
            </div>
          )}
          {Number(order.taxAmount) > 0 && (
            <div className="mt-1 flex items-center justify-between text-sm">
              <span style={{ color: "var(--text-muted)" }}>Tax</span>
              <span>{formatMoney(Number(order.taxAmount), currency)}</span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between text-base font-semibold">
            <span>Total</span>
            <span>{formatMoney(Number(order.total), currency)}</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader title="Proofs" description={`${order.proofs.length} published`} />
          <ul>
            {order.proofs.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>No proofs yet.</li>
            )}
            {order.proofs.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <div className="flex items-center gap-3">
                  <Link href={portalPath(token, `proofs/${p.id}`)} className="text-sm font-medium underline">
                    {p.title ?? `Proof v${p.version}`}
                  </Link>
                  <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: proofStatusColor(p.status), color: "white" }}>
                    {proofStatusLabel(p.status)}
                  </span>
                </div>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>v{p.version}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader title="Scheduled visits" description={`${order.installEvents.length} on the calendar`} />
          <ul>
            {order.installEvents.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>Nothing scheduled.</li>
            )}
            {order.installEvents.map((ev) => (
              <li key={ev.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                <div>
                  <div className="text-sm font-medium">
                    {ev.title ?? installKindLabel(ev.kind)}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {formatDate(ev.scheduledStart, ctx.tenant.dateFormat)} · {formatTimeRange(ev.scheduledStart, ev.scheduledEnd)}
                  </div>
                </div>
                <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: installStatusColor(ev.status), color: "white" }}>
                  {installStatusLabel(ev.status)}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader title="Invoices" description={`${order.invoices.length} issued`} />
          <ul>
            {order.invoices.length === 0 && (
              <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>No invoices yet.</li>
            )}
            {order.invoices.map((inv) => {
              const balance = Math.max(0, Number(inv.total) - Number(inv.amountPaid));
              return (
                <li key={inv.id} className="flex items-center justify-between px-5 py-3" style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <Link href={portalPath(token, `invoices/${inv.id}`)} className="text-sm font-medium underline">
                    {inv.number}
                  </Link>
                  <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {inv.status.replace(/_/g, " ")}
                    {inv.dueDate && <> · due {formatDate(inv.dueDate, ctx.tenant.dateFormat)}</>}
                    {" · "}
                    <span style={{ color: "var(--text-default)" }}>{formatMoney(balance, currency)}</span> balance
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {/* Phase 15 Slice B — customer file attachment. Briefs, site photos,
          logos, whatever they want to share. Visible to staff immediately;
          customers can self-revoke within 24 h of upload. */}
      <Card>
        <CardHeader
          title="Files"
          description="Attach photos, briefs, or any reference material — we'll see it right away."
        />

        {sp.uploaded === "1" && (
          <div
            className="mx-5 mt-4 rounded-md px-3 py-2 text-sm"
            style={{
              background: "var(--success-surface)",
              color: "var(--success-fg)",
              border: "1px solid var(--success-fg)",
            }}
          >
            Thanks — your file has been attached.
          </div>
        )}
        {sp.removed === "1" && (
          <div
            className="mx-5 mt-4 rounded-md px-3 py-2 text-sm"
            style={{
              background: "var(--surface-1)",
              color: "var(--text-default)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            File removed.
          </div>
        )}
        {sp.error && (
          <div
            className="mx-5 mt-4 rounded-md px-3 py-2 text-sm"
            style={{
              background: "var(--danger-surface)",
              color: "var(--danger-fg)",
              border: "1px solid var(--danger-fg)",
            }}
          >
            {sp.error}
          </div>
        )}

        <form action={upload} className="space-y-3 px-5 py-4">
          <CustomerFileUploadInput />
          <TextArea
            label="Note (optional)"
            name="notes"
            rows={2}
            placeholder="A sentence about what this file is — helps us match it to your project faster."
          />
          <div>
            <button
              type="submit"
              className="rounded-md px-4 py-2 text-sm font-medium"
              style={{
                background: "var(--accent-primary)",
                color: "var(--surface-0)",
              }}
            >
              Upload file
            </button>
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            Max 6 MB per file. Images are resized automatically.
          </div>
        </form>

        {order.files.length > 0 && (
          <ul>
            {order.files.map((f) => {
              // Self-uploaded files from *this* portal token are removable
              // within 24 h. Everything else is view-only from the portal
              // side.
              const mine = f.kind === "CUSTOMER_UPLOAD" && f.uploaderId === `portal:${ctx.token.id}`;
              const ageMs = Date.now() - f.createdAt.getTime();
              const removable = mine && ageMs <= 24 * 3600_000;
              const isImage = (f.mimeType?.startsWith("image/") ?? false) || !!f.thumbnailUrl;
              const remove = deletePortalFile.bind(null, token, f.id);
              return (
                <li
                  key={f.id}
                  className="flex flex-wrap items-start gap-3 px-5 py-3"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  {isImage && f.thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={f.thumbnailUrl}
                      alt={f.filename}
                      className="h-14 w-14 flex-shrink-0 rounded object-cover"
                      style={{ background: "var(--surface-2)" }}
                    />
                  ) : (
                    <div
                      className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded text-lg"
                      style={{
                        background: "var(--surface-2)",
                        color: "var(--text-muted)",
                        border: "1px solid var(--border-subtle)",
                      }}
                      aria-hidden
                    >
                      📄
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <a
                      href={f.storageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-sm font-medium underline"
                      style={{ color: "var(--accent-primary)" }}
                    >
                      {f.filename}
                    </a>
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {f.kind === "CUSTOMER_UPLOAD" ? "Uploaded by you" : "Shared by us"}
                      {" · "}
                      {formatDateTime(f.createdAt)}
                    </div>
                    {f.notes && (
                      <div
                        className="mt-1 whitespace-pre-wrap text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {f.notes}
                      </div>
                    )}
                  </div>
                  {removable && (
                    <form action={remove}>
                      <button
                        type="submit"
                        className="rounded-md px-3 py-1.5 text-xs"
                        style={{
                          border: "1px solid var(--border-subtle)",
                          color: "var(--text-muted)",
                        }}
                        title="Remove file (allowed within 24 hours of upload)"
                      >
                        Remove
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
