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
import { TenantsCsvImport } from "../_components/TenantsCsvImport";

export const dynamic = "force-dynamic";

// /platform/tenants/import — Page 4 §"Import CSV".
//
// Three-stage flow: upload → preview (dry-run) → commit. The client
// component holds the parsed rows in memory between stages so we
// don't have to round-trip the file through the server.

export default async function ImportTenantsPage() {
  const ctx = await requirePlatformStaff();
  if (!ctx.can("staff.invite")) {
    return (
      <div className="space-y-5">
        <Breadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Tenants", href: "/platform/tenants" }, { label: "Import" }]} />
        <PageHeader title="Import tenants" description="Your role doesn't have permission to provision tenants." />
        <Card padding="lg">
          <CardBody>
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              The <code>staff.invite</code> permission is required for bulk tenant import.
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
            { label: "Import CSV" },
          ]}
        />
        <div className="mt-3">
          <PageHeader
            eyebrow="Bulk provisioning"
            title="Import tenants from CSV"
            description="Upload a CSV with one row per tenant. We'll show a dry-run preview before any rows commit."
            actions={
              <Link href="/platform/tenants">
                <Button size="sm" variant="secondary">Cancel</Button>
              </Link>
            }
          />
        </div>
      </div>

      <Card padding="md">
        <CardHeader title="Required columns" />
        <CardBody>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            The CSV must include a header row. Recognised columns (case-insensitive):
          </p>
          <ul className="mt-2 grid grid-cols-1 gap-1 text-[12px] md:grid-cols-2 lg:grid-cols-3" style={{ color: "var(--text-default)" }}>
            <li><code>shopName</code> <span style={{ color: "var(--text-muted)" }}>(required)</span></li>
            <li><code>slug</code> <span style={{ color: "var(--text-muted)" }}>(required)</span></li>
            <li><code>ownerName</code> <span style={{ color: "var(--text-muted)" }}>(required)</span></li>
            <li><code>ownerEmail</code> <span style={{ color: "var(--text-muted)" }}>(required)</span></li>
            <li><code>plan</code> <span style={{ color: "var(--text-muted)" }}>(STARTER / GROWTH / PRO / ENTERPRISE)</span></li>
            <li><code>status</code> <span style={{ color: "var(--text-muted)" }}>(TRIAL / ACTIVE)</span></li>
            <li><code>trialDays</code></li>
            <li><code>country</code></li>
            <li><code>industry</code></li>
            <li><code>source</code></li>
            <li><code>notes</code></li>
          </ul>
          <p className="mt-3 text-[12px]" style={{ color: "var(--text-faint)" }}>
            Capped at 5,000 rows per file. Slug collisions are skipped (not overwritten).
            Owner emails that already exist on Flowtora get attached as an additional
            OWNER membership instead of creating a duplicate User row.
          </p>
        </CardBody>
      </Card>

      <Card padding="md">
        <CardHeader title="Upload" />
        <CardBody>
          <TenantsCsvImport />
        </CardBody>
      </Card>
    </div>
  );
}
