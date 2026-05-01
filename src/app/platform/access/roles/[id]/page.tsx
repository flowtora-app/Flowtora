import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformStaff } from "@/lib/platform";
import {
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
} from "@/components/ui";
import {
  loadRoleAudit,
  loadRoleDetail,
  PERMISSION_DESCRIPTIONS,
} from "@/server/platform/roles-page";
import { permissionCatalog } from "@/lib/rbac";
import { PermissionMatrixEditor } from "../_components/PermissionMatrixEditor";
import { RoleHeaderActions } from "../_components/RoleHeaderActions";
import { RoleMembersList } from "../_components/RoleMembersList";

export const dynamic = "force-dynamic";

export default async function RoleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requirePlatformStaff();
  const { id } = await params;
  const detail = await loadRoleDetail(id);
  if (!detail) notFound();

  const canEdit = ctx.can("staff.assign_role");
  const isCustom = detail.kind === "custom";
  const catalog = permissionCatalog();

  // Audit history applies only to custom roles.
  const audit = isCustom ? await loadRoleAudit(detail.id) : [];

  return (
    <div className="min-w-0 space-y-5">
      <div>
        <Breadcrumb items={[
          { label: "Platform", href: "/platform" },
          { label: "Access" },
          { label: "Roles", href: "/platform/access/roles" },
          { label: detail.name },
        ]} />
        <div className="mt-3">
          <PageHeader
            title={
              <span className="flex items-center gap-2">
                <span>{detail.name}</span>
                <Badge size="xs" color={isCustom ? "warning" : "brand"}>
                  {isCustom ? `Custom · ${detail.status?.toLowerCase()}` : "Built-in"}
                </Badge>
              </span>
            }
            description={detail.description ?? ""}
            actions={
              <RoleHeaderActions
                role={detail}
                canEdit={canEdit}
              />
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr]">
        {/* Permission matrix */}
        <div className="space-y-3">
          <Card>
            <CardHeader
              title="Permission matrix"
              description={isCustom
                ? "Toggle permissions; Save persists changes for every staff member assigned to this role."
                : "Read-only — built-in role permissions live in code. Clone to edit."}
            />
            <CardBody>
              <PermissionMatrixEditor
                roleId={detail.id}
                roleKind={detail.kind}
                catalog={catalog}
                descriptions={PERMISSION_DESCRIPTIONS}
                initialPermissions={detail.permissions}
                initialDescription={detail.description ?? ""}
                canEdit={canEdit && isCustom}
              />
            </CardBody>
          </Card>

          {isCustom && (
            <Card>
              <CardHeader title="Audit history" description="Recent changes to this role." />
              <CardBody>
                {audit.length === 0 ? (
                  <div className="rounded-md border border-dashed py-6 text-center text-[12px]"
                       style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
                    No audit rows yet.
                  </div>
                ) : (
                  <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
                    {audit.map((a) => (
                      <li key={a.id} className="flex items-start justify-between gap-3 py-1.5 text-[12px]">
                        <div className="min-w-0 flex-1">
                          <div className="font-mono" style={{ color: "var(--text-default)" }}>{a.action}</div>
                          {a.actorEmail && (
                            <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                              by {a.actorEmail}
                            </div>
                          )}
                        </div>
                        <span className="shrink-0 tabular-nums" style={{ color: "var(--text-muted)" }}>
                          {a.createdAt.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          )}
        </div>

        {/* Members + meta */}
        <div className="space-y-3">
          <Card>
            <CardHeader title={`Assigned (${detail.assignedCount})`}
                        description="Staff members currently assigned to this role." />
            <CardBody>
              {detail.members.length === 0 ? (
                <div className="rounded-md border border-dashed py-6 text-center text-[12px]"
                     style={{ borderColor: "var(--border-subtle)", color: "var(--text-faint)" }}>
                  No assignees.
                </div>
              ) : (
                <RoleMembersList
                  roleId={detail.id}
                  members={detail.members}
                  canEdit={canEdit && isCustom}
                />
              )}
            </CardBody>
          </Card>

          {isCustom && (
            <Card>
              <CardHeader title="Conditions"
                          description="Per-permission conditions (e.g. only own team's tenants, only when MFA active)." />
              <CardBody>
                <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                  Conditional permissions are deferred — today, every grant is unconditional. When we ship the
                  conditions DSL, the editor lands here without changing the matrix layout.
                </p>
              </CardBody>
            </Card>
          )}

          <Card padding="sm">
            <Link href="/platform/access/roles"
                  className="text-[12px] hover:underline"
                  style={{ color: "var(--accent-primary)" }}>
              ← Back to roles
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
