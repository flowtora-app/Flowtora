import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card } from "@/components/Card";
import { Button, Field, TextArea } from "@/components/Field";
import { createProof } from "@/app/actions/proofs";
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

  const action = createProof.bind(null, slug);

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
        <form action={action} className="space-y-6 px-5 py-5">
          <input type="hidden" name="orderId" value={order.id} />

          <section className="space-y-4">
            <SectionHeader
              step={1}
              title="Version info"
              description="Name the version and summarize what the customer is looking at."
            />
            <Field
              label="Version name"
              name="title"
              defaultValue={suggestedTitle}
              placeholder={`e.g. Storefront channel letters — v${nextVersion}`}
              hint="Shown to the customer on their portal. Optional."
            />
            <div>
              <TextArea
                label="What changed in this version?"
                name="description"
                rows={4}
                placeholder={
                  latest
                    ? "e.g. Adjusted logo size, changed color to black, updated layout per customer request"
                    : "A short summary of what's in this proof, or what to look at."
                }
              />
              <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
                Customer sees this with the proof — keep it short and client-friendly.
              </span>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader
              step={2}
              title="Upload files (next step)"
              description="On the next screen you'll upload the artwork files for this version. We create the shell first so every change you make — uploads, edits, and the send — is tracked on the version timeline."
            />
            <div
              className="rounded-md px-4 py-3 text-xs"
              style={{
                background: "var(--surface-1)",
                border: "1px dashed var(--border-subtle)",
                color: "var(--text-muted)",
              }}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg leading-none" aria-hidden>📎</span>
                <div>
                  <div className="font-medium" style={{ color: "var(--text-default)" }}>
                    Images and PDFs supported
                  </div>
                  <div className="mt-0.5">
                    The version stays a draft — invisible to the customer — until you
                    click <strong>Send to customer</strong> from the version page.
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div
            className="flex items-center justify-end gap-2 pt-4"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <Link
              href={`/t/${slug}/orders/${order.id}?tab=proofs`}
              className="ts-focus rounded-md px-3 py-1.5 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              Cancel
            </Link>
            <Button type="submit">Create draft version</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function SectionHeader({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        aria-hidden
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        {step}
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
          {title}
        </h3>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      </div>
    </div>
  );
}

// Strip a trailing "— vN" so we can suggest a clean "— v(N+1)" without stacking.
function stripVersionSuffix(s: string): string {
  return s.replace(/\s*[—-]\s*v\d+\s*$/i, "").trim();
}
