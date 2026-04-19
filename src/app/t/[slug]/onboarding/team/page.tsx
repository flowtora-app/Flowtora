import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { inviteMember, revokeInvite } from "@/app/actions/team";
import { Button, Field, SelectField } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";
import { db } from "@/lib/db";

const ROLE_OPTIONS = [
  { value: "ADMIN", label: "Admin" },
  { value: "SALES_REP", label: "Sales rep" },
  { value: "CSR", label: "Customer service" },
  { value: "DESIGNER", label: "Designer" },
  { value: "PRODUCTION_MANAGER", label: "Production manager" },
  { value: "INSTALLER", label: "Installer" },
  { value: "ACCOUNTING", label: "Accounting" },
  { value: "EMPLOYEE", label: "Employee" },
];

export default async function TeamStep({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await requirePermission(slug, "staff:manage");
  const inviteAction = inviteMember.bind(null, slug);

  const pending = await db.invite.findMany({
    where: { tenantId: ctx.tenant.id, acceptedAt: null },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Invite your team" description="Optional. You can do this later from Settings." />
        <form action={inviteAction} className="grid grid-cols-[1fr_180px_auto] gap-3 px-5 py-5">
          <Field label="Email" name="email" type="email" required />
          <SelectField label="Role" name="role" defaultValue="SALES_REP" options={ROLE_OPTIONS} />
          <div className="flex items-end">
            <Button type="submit">Send invite</Button>
          </div>
        </form>

        {pending.length > 0 && (
          <div className="px-5 pb-5">
            <div className="mb-2 text-xs uppercase tracking-wider" style={{ color: "var(--muted)" }}>Pending</div>
            <ul className="space-y-1">
              {pending.map((inv) => {
                const revoke = revokeInvite.bind(null, slug, inv.id);
                return (
                  <li key={inv.id} className="flex items-center justify-between rounded-md px-3 py-2 text-sm" style={{ background: "var(--bg)" }}>
                    <span>{inv.email} · <span style={{ color: "var(--muted)" }}>{inv.role.replace(/_/g, " ").toLowerCase()}</span></span>
                    <form action={revoke}>
                      <button type="submit" className="text-xs underline" style={{ color: "var(--muted)" }}>Revoke</button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/t/${slug}/onboarding/sample`}
          className="text-xs underline"
          style={{ color: "var(--text-muted)" }}
        >
          Skip — continue without inviting
        </Link>
        <Link
          href={`/t/${slug}/onboarding/sample`}
          className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors hover:brightness-110"
          style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}
        >
          Continue
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
