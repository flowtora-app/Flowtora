import Link from "next/link";
import { requirePortalToken, portalPath } from "@/lib/portal";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { formatDate } from "@/lib/format";
import { proofStatusColor, proofStatusLabel } from "@/lib/proofs";

export default async function PortalProofsPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const ctx = await requirePortalToken(token);

  // DRAFT proofs are hidden — only show ones that have actually been shared.
  const proofs = await db.proof.findMany({
    where: {
      tenantId: ctx.tenant.id,
      status:   { not: "DRAFT" },
      order:    { customerId: ctx.customer.id },
    },
    select: {
      id: true, title: true, version: true, status: true,
      sentAt: true, respondedAt: true, updatedAt: true,
      order: { select: { id: true, number: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Proofs</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Design proofs we&apos;ve sent for your review.
        </p>
      </div>

      <Card>
        <CardHeader title={`${proofs.length} total`} />
        <ul>
          {proofs.length === 0 && (
            <li className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
              No proofs yet.
            </li>
          )}
          {proofs.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between px-5 py-3"
              style={{ borderTop: "1px solid var(--border-subtle)" }}
            >
              <div className="flex items-center gap-3">
                <Link href={portalPath(token, `proofs/${p.id}`)} className="text-sm font-medium underline">
                  {p.title ?? `Proof v${p.version}`}
                </Link>
                <span
                  className="rounded-full px-2 py-0.5 text-xs"
                  style={{ background: proofStatusColor(p.status), color: "white" }}
                >
                  {proofStatusLabel(p.status)}
                </span>
                <Link
                  href={portalPath(token, `orders/${p.order.id}`)}
                  className="text-xs underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Order {p.order.number} · v{p.version}
                </Link>
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                {p.sentAt && <>sent {formatDate(p.sentAt, ctx.tenant.dateFormat)}</>}
                {p.respondedAt && <> · responded {formatDate(p.respondedAt, ctx.tenant.dateFormat)}</>}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
