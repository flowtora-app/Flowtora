import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/Card";
import { createProofWithFiles } from "@/app/actions/proofs";
import { NewProofVersionForm } from "@/components/proofs/NewProofVersionForm";
import { proofStatusColor, proofStatusLabel } from "@/lib/proofs";
import { formatDate } from "@/lib/format";

export default async function NewProofVersionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, id: orderId } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "proofs:manage");

  const order = await db.order.findFirst({
    where: { id: orderId, tenantId: ctx.tenant.id },
    select: {
      id: true,
      number: true,
      locationId: true,
      customer: { select: { id: true, name: true } },
      proofs: {
        orderBy: { version: "desc" },
        take: 3,
        select: {
          id: true,
          version: true,
          status: true,
          title: true,
          sentAt: true,
          respondedAt: true,
        },
      },
    },
  });
  if (!order) notFound();
  ctx.assertBranchAccess(order.locationId);

  const latest = order.proofs[0];
  const nextVersion = (latest?.version ?? 0) + 1;
  const suggestedTitle = latest?.title
    ? `${stripVersionSuffix(latest.title)} — v${nextVersion}`
    : "";

  const action = createProofWithFiles.bind(null, slug);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <Link
          href={`/t/${slug}/orders/${order.id}?tab=proofs`}
          className="text-sm underline"
          style={{ color: "var(--text-muted)" }}
        >
          ← Back to order {order.number}
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-semibold">
          Start proof version {nextVersion}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          For{" "}
          <Link
            href={`/t/${slug}/customers/${order.customer.id}`}
            className="underline"
            style={{ color: "var(--text-default)" }}
          >
            {order.customer.name}
          </Link>
          {" · "}Order{" "}
          <Link
            href={`/t/${slug}/orders/${order.id}`}
            className="underline"
            style={{ color: "var(--text-default)" }}
          >
            {order.number}
          </Link>
        </p>
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
          {decodeURIComponent(sp.error)}
        </div>
      )}

      {/* Recent versions recap — so the designer can see what came before
          without tabbing away from the form. */}
      {order.proofs.length > 0 && (
        <Card>
          <div
            className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}
          >
            Previous versions
          </div>
          <ul>
            {order.proofs.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between px-5 py-2.5 text-sm"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <div className="flex items-center gap-2">
                  <Link
                    href={`/t/${slug}/orders/${order.id}/proofs/${p.id}`}
                    className="font-medium underline"
                    style={{ color: "var(--text-default)" }}
                  >
                    Version {p.version}
                  </Link>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ background: proofStatusColor(p.status), color: "white" }}
                  >
                    {proofStatusLabel(p.status)}
                  </span>
                  {p.title && (
                    <span style={{ color: "var(--text-muted)" }}>{p.title}</span>
                  )}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {p.respondedAt
                    ? `Responded ${formatDate(p.respondedAt)}`
                    : p.sentAt
                    ? `Sent ${formatDate(p.sentAt)}`
                    : "Not sent"}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <NewProofVersionForm
          slug={slug}
          orderId={order.id}
          suggestedTitle={suggestedTitle}
          nextVersion={nextVersion}
          hasPrevious={Boolean(latest)}
          action={action}
        />
      </Card>
    </div>
  );
}

// Strip a trailing "— vN" so we can suggest a clean "— v(N+1)" without stacking.
function stripVersionSuffix(s: string): string {
  return s.replace(/\s*[—-]\s*v\d+\s*$/i, "").trim();
}
