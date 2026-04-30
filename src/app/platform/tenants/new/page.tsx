import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
} from "@/components/ui";
import Link from "next/link";
import { ProvisionWizard } from "../_components/ProvisionWizard";

export const dynamic = "force-dynamic";

// /platform/tenants/new — Page 4 §"+ New tenant" manual provisioning
// wizard. Three steps: basics → owner → plan + provision.

export default async function NewTenantPage() {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.invite")) {
    return (
      <div className="space-y-5">
        <Breadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Tenants", href: "/platform/tenants" }, { label: "New" }]} />
        <PageHeader title="Create a tenant" description="Your role doesn't have permission to provision tenants." />
        <Card padding="lg">
          <CardBody>
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              The <code>staff.invite</code> permission is required for manual tenant creation.
              Ask a Super Admin or Site Manager to provision the account.
            </p>
            <div className="mt-4">
              <Link href="/platform/tenants">
                <Button size="sm" variant="secondary">Back to tenants</Button>
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <Breadcrumb
          items={[
            { label: "Platform", href: "/platform" },
            { label: "Tenants", href: "/platform/tenants" },
            { label: "New tenant" },
          ]}
        />
        <div className="mt-3">
          <PageHeader
            eyebrow="Manual provisioning"
            title="Create a new tenant"
            description="Spin up a sign or print shop account on Flowtora — useful for sales-handoff onboarding or migrating an existing customer in."
            actions={
              <Link href="/platform/tenants">
                <Button size="sm" variant="secondary">Cancel</Button>
              </Link>
            }
          />
        </div>
      </div>

      <Card padding="md">
        <CardHeader title="Wizard" description="Step through the form below — every field is editable later from the tenant detail page." />
        <CardBody>
          <ProvisionWizard />
        </CardBody>
      </Card>
    </div>
  );
}
