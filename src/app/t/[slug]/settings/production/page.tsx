import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button, Field, SelectField, TextArea } from "@/components/Field";
import { EmptyState } from "@/components/ui/EmptyState";
import { DEPARTMENT_COLOR_PALETTE } from "@/lib/production";
import {
  createDepartment,
  updateDepartment,
  deleteDepartment,
  seedDefaultDepartments,
  createWorkStation,
  updateWorkStation,
  deleteWorkStation,
} from "@/app/actions/departments";

// Phase 12 Slice E — production settings.
//
// Two concerns on one page:
//   1. Departments — the swimlanes on the production board + the "home
//      department" on a stage. Required for the board to work at all.
//   2. Work stations — the individual machines/benches inside a department.
//      Optional. Only matters when a department has >1 piece of equipment
//      and scheduling which Roland ran the job matters.
//
// We keep both on the same page because they're conceptually linked:
// a work station lives inside a department. The form-edit flow uses
// ?editDept / ?editStation query params (matching the other settings
// pages) so a single inline panel handles both create and edit paths
// without needing a separate route.

export default async function ProductionSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    error?:       string;
    ok?:          string;
    editDept?:    string;
    editStation?: string;
  }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "production:manage");

  // Pull departments + workstations in one go. Including the station
  // counts per dept lets the UI show "3 machines" next to a dept name
  // without a separate query.
  const [departments, workStations, stageCounts, stationStageCounts] = await Promise.all([
    db.department.findMany({
      where:   { tenantId: ctx.tenant.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: { select: { workStations: true, stages: true } },
      },
    }),
    db.workStation.findMany({
      where:   { tenantId: ctx.tenant.id },
      orderBy: [{ name: "asc" }],
      include: { department: { select: { id: true, name: true, color: true } } },
    }),
    // Cheap rollup: how many stages are "active" right now per department.
    // Used as a warning on the delete button ("11 stages using this").
    db.productionStage.groupBy({
      by: ["departmentId"],
      where: { tenantId: ctx.tenant.id },
      _count: { _all: true },
    }),
    db.productionStage.groupBy({
      by: ["workStationId"],
      where: { tenantId: ctx.tenant.id, workStationId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const editingDept = sp.editDept
    ? departments.find((d) => d.id === sp.editDept) ?? null
    : null;
  const editingStation = sp.editStation
    ? workStations.find((w) => w.id === sp.editStation) ?? null
    : null;

  // Group workstations by department for the list rendering.
  const stationsByDept = new Map<string, typeof workStations>();
  for (const w of workStations) {
    const arr = stationsByDept.get(w.departmentId) ?? [];
    arr.push(w);
    stationsByDept.set(w.departmentId, arr);
  }

  const stageCountByDept = new Map(stageCounts.map((s) => [s.departmentId ?? "__none__", s._count._all]));
  const stageCountByStation = new Map(stationStageCounts.map((s) => [s.workStationId!, s._count._all]));

  return (
    <div className="space-y-6">
      {sp.error && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{
            background: "var(--danger-surface)",
            color:       "var(--danger-fg)",
            border:      "1px solid var(--danger-fg)",
          }}
        >
          {sp.error}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────── */}
      {/* Departments                                                  */}
      {/* ──────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Departments"
          description="Each department is a swimlane on the production board. Stages are typed by department so the shop floor can filter to just their own work."
          right={
            <Link
              href={`/t/${slug}/production`}
              className="rounded-md px-3 py-1.5 text-xs"
              style={{ border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
            >
              View board →
            </Link>
          }
        />

        {departments.length === 0 ? (
          <div className="px-5 py-6">
            <EmptyState
              title="No departments yet"
              description="Seed a starter list tailored to your shop type (sign shop, print shop, or hybrid), then tweak from there. Or add them one at a time below."
              actionHref=""
              actionLabel=""
            />
            <form action={seedDefaultDepartments.bind(null, slug)} className="mt-4 flex justify-center">
              <Button type="submit">Seed default departments</Button>
            </form>
            <p className="mt-3 text-center text-xs" style={{ color: "var(--text-muted)" }}>
              We&apos;ll pick a list based on your tenant&apos;s business type. You can rename, reorder, or delete any of them afterward.
            </p>
          </div>
        ) : (
          <ul>
            {departments.map((d) => {
              const stageCount   = stageCountByDept.get(d.id) ?? 0;
              const stationCount = d._count.workStations;
              const isEditing    = editingDept?.id === d.id;
              const del          = deleteDepartment.bind(null, slug, d.id);
              return (
                <li
                  key={d.id}
                  className="px-5 py-3"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-4 w-4 rounded-sm"
                        style={{ background: d.color, border: "1px solid var(--border-subtle)" }}
                        title={d.color}
                      />
                      {d.icon && <span className="text-base">{d.icon}</span>}
                      <div>
                        <div className="font-medium">
                          {d.name}
                          {!d.active && (
                            <span
                              className="ml-2 rounded-full px-1.5 py-0.5 text-[10px]"
                              style={{ background: "var(--surface-3)", color: "var(--text-muted)" }}
                            >
                              inactive
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                          {stationCount === 0 ? "0 stations" : `${stationCount} station${stationCount === 1 ? "" : "s"}`}
                          {" · "}
                          {stageCount === 0 ? "no stages yet" : `${stageCount} lifetime stage${stageCount === 1 ? "" : "s"}`}
                          {" · sort "}{d.sortOrder}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <Link
                          href={`/t/${slug}/settings/production`}
                          className="text-xs underline"
                          style={{ color: "var(--text-muted)" }}
                        >
                          Cancel
                        </Link>
                      ) : (
                        <Link
                          href={`/t/${slug}/settings/production?editDept=${d.id}`}
                          className="rounded-md px-2 py-1 text-xs"
                          style={{ border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
                        >
                          Edit
                        </Link>
                      )}
                      <form action={del}>
                        <Button
                          type="submit"
                          variant="danger"
                          className="!px-2 !py-1 !text-xs"
                          disabled={stationCount > 0 || stageCount > 0}
                          title={
                            stageCount > 0 || stationCount > 0
                              ? "In use — deactivate instead (edit → uncheck Active)."
                              : "Delete this department"
                          }
                        >
                          Delete
                        </Button>
                      </form>
                    </div>
                  </div>

                  {isEditing && editingDept && (
                    <form
                      action={updateDepartment.bind(null, slug, d.id)}
                      className="mt-3 grid grid-cols-2 gap-3 rounded-md p-3"
                      style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
                    >
                      <div className="col-span-2">
                        <Field label="Name" name="name" required defaultValue={editingDept.name} />
                      </div>
                      <Field
                        label="Color (hex)"
                        name="color"
                        defaultValue={editingDept.color}
                        hint={`Suggested: ${DEPARTMENT_COLOR_PALETTE.slice(0, 5).join(", ")}`}
                      />
                      <Field label="Icon (emoji)" name="icon" defaultValue={editingDept.icon ?? ""} />
                      <Field
                        label="Sort order"
                        name="sortOrder"
                        type="number"
                        defaultValue={editingDept.sortOrder.toString()}
                        hint="Lower numbers render first on the board."
                      />
                      <label className="mt-5 flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="active"
                          defaultChecked={editingDept.active}
                        />
                        Active
                      </label>
                      <div className="col-span-2">
                        <Button type="submit">Save department</Button>
                      </div>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Add-department fold. Always available (even when list is empty)
            so the seed button isn't the only entry point. */}
        <details style={{ borderTop: departments.length > 0 ? "1px solid var(--border-subtle)" : undefined }}>
          <summary
            className="cursor-pointer list-none px-5 py-3 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            + Add a department
          </summary>
          <form
            action={createDepartment.bind(null, slug)}
            className="grid grid-cols-2 gap-3 px-5 pb-4"
          >
            <div className="col-span-2">
              <Field label="Name" name="name" required placeholder="e.g. Vinyl" />
            </div>
            <Field
              label="Color (hex, optional)"
              name="color"
              placeholder="#3b82f6"
              hint={`Leave blank to auto-pick from the palette.`}
            />
            <Field label="Icon (emoji, optional)" name="icon" placeholder="✂️" />
            <div className="col-span-2">
              <Button type="submit">Add department</Button>
            </div>
          </form>
        </details>
      </Card>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* Work stations                                                */}
      {/* ──────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Work stations"
          description="Optional — the physical machines inside a department. Useful when you run multiple concurrent pieces of equipment (two Rolands, a CNC and a laser) and need to know which ran a specific job."
        />

        {workStations.length === 0 && departments.length === 0 ? (
          <div className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
            Add a department first — work stations live inside a department.
          </div>
        ) : workStations.length === 0 ? (
          <div className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
            No work stations yet. Add one below if you want to track which
            machine ran which stage.
          </div>
        ) : (
          <div>
            {departments.map((d) => {
              const stations = stationsByDept.get(d.id) ?? [];
              if (stations.length === 0) return null;
              return (
                <div key={d.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <div
                    className="px-5 py-2 text-xs font-medium uppercase tracking-wide"
                    style={{ color: "var(--text-muted)", borderLeft: `3px solid ${d.color}` }}
                  >
                    {d.icon ? `${d.icon} ` : ""}{d.name}
                  </div>
                  <ul>
                    {stations.map((w) => {
                      const stageCount = stageCountByStation.get(w.id) ?? 0;
                      const isEditing  = editingStation?.id === w.id;
                      const del        = deleteWorkStation.bind(null, slug, w.id);
                      return (
                        <li
                          key={w.id}
                          className="px-5 py-3"
                          style={{ borderTop: "1px solid var(--border-subtle)" }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-sm font-medium">
                                {w.name}
                                {!w.active && (
                                  <span
                                    className="ml-2 rounded-full px-1.5 py-0.5 text-[10px]"
                                    style={{ background: "var(--surface-3)", color: "var(--text-muted)" }}
                                  >
                                    inactive
                                  </span>
                                )}
                              </div>
                              {w.notes && (
                                <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                                  {w.notes}
                                </div>
                              )}
                              <div className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                                {stageCount === 0 ? "no stages yet" : `${stageCount} lifetime stage${stageCount === 1 ? "" : "s"}`}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isEditing ? (
                                <Link
                                  href={`/t/${slug}/settings/production`}
                                  className="text-xs underline"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  Cancel
                                </Link>
                              ) : (
                                <Link
                                  href={`/t/${slug}/settings/production?editStation=${w.id}`}
                                  className="rounded-md px-2 py-1 text-xs"
                                  style={{ border: "1px solid var(--border-subtle)", color: "var(--text-default)" }}
                                >
                                  Edit
                                </Link>
                              )}
                              <form action={del}>
                                <Button
                                  type="submit"
                                  variant="danger"
                                  className="!px-2 !py-1 !text-xs"
                                  disabled={stageCount > 0}
                                  title={
                                    stageCount > 0
                                      ? "In use on at least one stage — deactivate instead."
                                      : "Delete this work station"
                                  }
                                >
                                  Delete
                                </Button>
                              </form>
                            </div>
                          </div>

                          {isEditing && editingStation && (
                            <form
                              action={updateWorkStation.bind(null, slug, w.id)}
                              className="mt-3 grid grid-cols-2 gap-3 rounded-md p-3"
                              style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
                            >
                              <div className="col-span-2">
                                <Field label="Name" name="name" required defaultValue={editingStation.name} />
                              </div>
                              <SelectField
                                label="Department"
                                name="departmentId"
                                required
                                defaultValue={editingStation.departmentId}
                                options={departments.map((dd) => ({ value: dd.id, label: dd.name }))}
                              />
                              <label className="mt-5 flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  name="active"
                                  defaultChecked={editingStation.active}
                                />
                                Active
                              </label>
                              <div className="col-span-2">
                                <TextArea label="Notes" name="notes" rows={2} defaultValue={editingStation.notes ?? ""} />
                              </div>
                              <div className="col-span-2">
                                <Button type="submit">Save station</Button>
                              </div>
                            </form>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        )}

        {departments.length > 0 && (
          <details style={{ borderTop: "1px solid var(--border-subtle)" }}>
            <summary
              className="cursor-pointer list-none px-5 py-3 text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              + Add a work station
            </summary>
            <form
              action={createWorkStation.bind(null, slug)}
              className="grid grid-cols-2 gap-3 px-5 pb-4"
            >
              <SelectField
                label="Department"
                name="departmentId"
                required
                defaultValue=""
                options={[
                  { value: "", label: "Select department…" },
                  ...departments.map((d) => ({ value: d.id, label: d.name })),
                ]}
              />
              <Field label="Name" name="name" required placeholder="e.g. Roland VG-640" />
              <div className="col-span-2">
                <TextArea label="Notes" name="notes" rows={2} placeholder="Serial #, throughput notes, anything helpful." />
              </div>
              <div className="col-span-2">
                <Button type="submit">Add work station</Button>
              </div>
            </form>
          </details>
        )}
      </Card>
    </div>
  );
}
