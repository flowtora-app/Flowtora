import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button } from "@/components/Field";
import { UpgradeRequired } from "@/components/UpgradeRequired";
import { getGroupContext } from "@/lib/franchise";
import { updateGroupRoot, leaveParentGroup } from "@/app/actions/franchise";
import { isEntitled } from "@/lib/entitlements";
import { getFeatureGateMeta } from "@/lib/feature-gates";

export default async function FranchiseSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "tenant:manage");

  // Defense-in-depth: the settings layout hides this tab when the tenant
  // lacks `franchiseGroup`, but a direct URL must also refuse. Render the
  // shared upgrade paywall so the owner sees the upgrade path inline.
  if (!(await isEntitled(ctx.tenant.id, ctx.tenant.plan, "franchiseGroup"))) {
    const meta = getFeatureGateMeta("franchiseGroup");
    return (
      <UpgradeRequired
        slug={slug}
        featureName={meta.label}
        requiredPlan={meta.requiredPlan}
        reason={meta.reason}
      />
    );
  }

  const group = await getGroupContext(ctx.tenant.id);

  // For a group root, count what we host and how many children + shared rows
  // exist — that's the headline KPI for the "you're a franchisor" card.
  const [childCount, sharedProductCount, sharedChecklistCount, sharedMessageCount] = await Promise.all([
    db.tenant.count({ where: { parentTenantId: ctx.tenant.id } }),
    db.product.count({ where: { tenantId: ctx.tenant.id, shared: true, active: true } }),
    db.checklistTemplate.count({ where: { tenantId: ctx.tenant.id, shared: true, active: true } }),
    db.messageTemplate.count({ where: { tenantId: ctx.tenant.id, shared: true, active: true } }),
  ]);

  const setRoot = updateGroupRoot.bind(null, slug);
  const leave   = leaveParentGroup.bind(null, slug);

  return (
    <div className="space-y-6">
      {sp.error && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{ background: "var(--danger-surface)", color: "var(--danger-fg)", border: "1px solid var(--danger-fg)" }}
        >
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <Card>
        <CardHeader
          title="Franchise group"
          description="Multi-tenant grouping lets a parent (the franchisor) own shared products, checklist templates, and message templates that every member tenant inherits automatically."
        />
        <div className="space-y-4 px-5 py-4 text-sm">
          {group.isGroupRoot && (
            <div className="space-y-3">
              <p>
                <span className="font-medium">This tenant is a group root.</span>{" "}
                It hosts shared assets that {childCount} child tenant{childCount === 1 ? "" : "s"}{" "}
                inherit automatically.
              </p>
              <ul className="space-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
                <li>· {sharedProductCount} shared products</li>
                <li>· {sharedChecklistCount} shared checklist templates</li>
                <li>· {sharedMessageCount} shared message templates</li>
              </ul>
              <form action={setRoot}>
                <Button type="submit" variant="secondary">
                  Step down as group root
                </Button>
              </form>
              {childCount > 0 && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  You can&apos;t step down while child tenants still inherit from you. Have each
                  child leave their parent group first, then come back here.
                </p>
              )}
            </div>
          )}

          {!group.isGroupRoot && !group.parentTenantId && (
            <div className="space-y-3">
              <p>
                This tenant operates standalone — it neither hosts shared assets nor inherits
                them from a parent.
              </p>
              <form action={setRoot}>
                <input type="hidden" name="isGroupRoot" value="on" />
                <Button type="submit">Become a group root</Button>
              </form>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Becoming a group root flips a flag — your existing products and templates stay
                tenant-local until you explicitly mark them as &ldquo;shared&rdquo; from their
                edit pages. To attach a child tenant under you, contact support; we don&apos;t
                expose cross-tenant linking from the UI yet.
              </p>
            </div>
          )}

          {!group.isGroupRoot && group.parentTenantId && (
            <div className="space-y-3">
              <p>
                This tenant inherits shared assets from{" "}
                <span className="font-medium">{group.parentName}</span>. Inherited products and
                templates appear in your lists with a{" "}
                <span style={{ color: "var(--accent-primary)" }}>Shared</span> badge and are read-only
                here.
              </p>
              <form action={leave}>
                <Button type="submit" variant="danger">
                  Leave {group.parentName ?? "parent group"}
                </Button>
              </form>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Leaving the group hides inherited assets immediately. Quotes and orders that
                already snapshotted shared products keep their data — sharing is by reference
                for the picker, but every line item snapshots its source values.
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="How sharing works" />
        <ul className="space-y-2 px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
          <li>
            · A <span className="font-medium">group root</span> hosts the canonical brand
            catalog. Mark a product or template as &ldquo;Shared&rdquo; to publish it to every
            child.
          </li>
          <li>
            · A <span className="font-medium">child tenant</span> sees inherited rows alongside
            its own. Inherited rows can&apos;t be edited locally — the parent is the source of
            truth, and edits propagate live.
          </li>
          <li>
            · Children can still create their own local products and templates. Local rows
            override inherited ones if they share a name.
          </li>
          <li>
            · Quote and order line items <span className="font-medium">snapshot</span> the
            product at add-time, so changes (or leaving the group) don&apos;t reach back into
            in-flight work.
          </li>
        </ul>
      </Card>

      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        Want to invite franchisees or unify multiple existing tenants under one group?{" "}
        <Link href={`/t/${slug}/settings/billing`} className="underline">
          Talk to us
        </Link>{" "}
        — the invite-token flow ships in a follow-up release.
      </div>
    </div>
  );
}
