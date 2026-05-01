import Link from "next/link";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Breadcrumb,
  Button,
  Card,
  PageHeader,
  Tabs,
} from "@/components/ui";
import {
  loadBuiltInRoles,
  loadCustomRoles,
  loadRolesKpi,
  TENANT_ROLE_TEMPLATES,
} from "@/server/platform/roles-page";
import { permissionCatalog } from "@/lib/rbac";
import { PERMISSION_DESCRIPTIONS } from "@/server/platform/roles-page";
import { PlatformRolesTab } from "./_components/PlatformRolesTab";
import { TenantRolesTab } from "./_components/TenantRolesTab";
import { CustomRolesTab } from "./_components/CustomRolesTab";
import { CatalogTab } from "./_components/CatalogTab";
import { NewRoleButton } from "./_components/NewRoleButton";
import { ImportRoleButton } from "./_components/ImportRoleButton";
import { AuditAssignmentsButton } from "./_components/AuditAssignmentsButton";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const TABS = ["platform", "tenant", "custom", "catalog"] as const;
type Tab = (typeof TABS)[number];

export default async function RolesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const ctx = await requirePlatformStaff();
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(typeof sp.tab === "string" ? sp.tab : "")
    ? (sp.tab as Tab) : "platform";

  const canEdit = ctx.can("staff.assign_role");

  // Always load both — they're tiny (< 30 rows) and the header
  // Clone-from button needs the full list regardless of which tab is
  // active.
  const [kpi, platformRoles, customRoles] = await Promise.all([
    loadRolesKpi(),
    loadBuiltInRoles(),
    loadCustomRoles(),
  ]);

  const catalog = permissionCatalog();

  const tabHref = (id: Tab) =>
    `/platform/access/roles${id === "platform" ? "" : `?tab=${id}`}`;

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Access" },
          { label: "Roles & Permissions" },
        ]} />
        <div className="mt-3">
          <PageHeader
            title="Roles & Permissions"
            description="Built-in and custom roles, with permission matrices."
            actions={
              <>
                {canEdit && <NewRoleButton catalog={catalog} />}
                {canEdit && (
                  <CloneFromButton platformRoles={platformRoles} customRoles={customRoles} />
                )}
                {canEdit && <ImportRoleButton />}
                {ctx.can("audit.read") && <AuditAssignmentsButton />}
              </>
            }
          />
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard label="Built-in roles" value={kpi.builtinRoles.toString()} />
        <KpiCard label="Custom · Active"   value={kpi.customActive.toString()} />
        <KpiCard label="Custom · Drafts"   value={kpi.customDraft.toString()} />
        <KpiCard label="Custom · Archived" value={kpi.customArchived.toString()} />
        <KpiCard label="Staff on custom"   value={kpi.staffOnCustomRole.toString()} />
        <KpiCard label="Permissions"       value={kpi.permissionCount.toString()} />
      </div>

      {/* Tabs */}
      <Tabs
        variant="pill"
        activeHref={tabHref(tab)}
        items={(TABS as readonly Tab[]).map((id) => ({
          label: id === "platform" ? "Platform admin roles"
              : id === "tenant" ? "Tenant default roles"
              : id === "custom" ? "Custom roles"
              : "Permission catalog",
          href: tabHref(id),
          badge: id === "platform" ? kpi.builtinRoles
              : id === "custom" ? kpi.customActive + kpi.customDraft
              : id === "catalog" ? kpi.permissionCount
              : undefined,
        }))}
      />

      {tab === "platform" && (
        <PlatformRolesTab roles={platformRoles} customRoles={customRoles} />
      )}
      {tab === "tenant" && (
        <TenantRolesTab templates={TENANT_ROLE_TEMPLATES} />
      )}
      {tab === "custom" && (
        <CustomRolesTab roles={customRoles} canEdit={canEdit} />
      )}
      {tab === "catalog" && (
        <CatalogTab
          catalog={catalog}
          descriptions={PERMISSION_DESCRIPTIONS}
        />
      )}
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card padding="md" className="h-full">
      <div className="flex h-full flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
        <div className="text-[24px] font-semibold leading-none tabular-nums" style={{ color: "var(--text-default)" }}>
          {value}
        </div>
      </div>
    </Card>
  );
}

// Clone-from button — opens a modal where the admin picks any role
// (built-in or custom) and gives the new draft a name.
import { CloneRoleButton } from "./_components/CloneRoleButton";
import type { BuiltInRoleRow, CustomRoleRow } from "@/server/platform/roles-page";

function CloneFromButton({
  platformRoles, customRoles,
}: {
  platformRoles: BuiltInRoleRow[];
  customRoles: CustomRoleRow[];
}) {
  // If the platform tab data isn't pre-loaded (we render this in the
  // header regardless of tab), pull a thin set inline. The simpler
  // path: just point the user at the Platform tab where they can
  // clone any single row.
  return <CloneRoleButton platformRoles={platformRoles} customRoles={customRoles} />;
}
