import { requirePermission } from "@/lib/tenant";
import { db } from "@/lib/db";
import { Card, CardHeader } from "@/components/Card";
import { Button, Checkbox, Field } from "@/components/Field";
import { listAllLocations, ensureDefaultLocation } from "@/lib/locations";
import {
  createLocation,
  updateLocation,
  deleteLocation,
  setDefaultLocation,
} from "@/app/actions/locations";

export default async function LocationsSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; ok?: string; edit?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await requirePermission(slug, "locations:manage");

  // Self-healing: guarantee the tenant has a default location before we
  // render the list so the settings page is never empty.
  await ensureDefaultLocation(ctx.tenant.id);
  const locations = await listAllLocations(ctx.tenant.id);

  const editingFull = sp.edit
    ? await db.location.findFirst({ where: { id: sp.edit, tenantId: ctx.tenant.id } })
    : null;

  const create = createLocation.bind(null, slug);

  return (
    <div className="space-y-6">
      {sp.error && (
        <div
          className="rounded-md px-4 py-2 text-sm"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-fg)",
          }}
        >
          {sp.error}
        </div>
      )}

      <Card>
        <CardHeader
          title="Locations"
          description="Each branch, showroom, or fulfillment site. Customers, quotes, orders, and invoices can be scoped to a location. The default location is used when a new record has no explicit branch."
        />
        <ul>
          {locations.map((l) => {
            const del = deleteLocation.bind(null, slug, l.id);
            const promote = setDefaultLocation.bind(null, slug, l.id);
            return (
              <li
                key={l.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
                style={{ borderTop: "1px solid var(--border-subtle)" }}
              >
                <div>
                  <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-default)" }}>
                    <span className="font-medium">{l.name}</span>
                    {l.code && (
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        ({l.code})
                      </span>
                    )}
                    {l.isDefault && (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{
                          background: "var(--accent-primary)",
                          color: "var(--accent-fg)",
                        }}
                      >
                        Default
                      </span>
                    )}
                    {!l.active && (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{
                          background: "var(--surface-2)",
                          color: "var(--text-muted)",
                          border: "1px solid var(--border-subtle)",
                        }}
                      >
                        Inactive
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {!l.isDefault && l.active && (
                    <form action={promote}>
                      <button type="submit" className="underline" style={{ color: "var(--text-muted)" }}>
                        Make default
                      </button>
                    </form>
                  )}
                  <a
                    href={`/t/${slug}/settings/locations?edit=${l.id}`}
                    className="underline"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Edit
                  </a>
                  {!l.isDefault && (
                    <form action={del}>
                      <button type="submit" className="underline" style={{ color: "var(--danger-fg)" }}>
                        Delete
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {editingFull ? (
        <Card>
          <CardHeader title={`Edit ${editingFull.name}`} />
          <form
            action={updateLocation.bind(null, slug, editingFull.id)}
            className="space-y-3 px-5 py-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" name="name" defaultValue={editingFull.name} required />
              <Field label="Short code" name="code" defaultValue={editingFull.code ?? ""} hint="Optional — e.g. DTS for Downtown Showroom" />
            </div>
            <Field label="Address line 1" name="addressLine1" defaultValue={editingFull.addressLine1 ?? ""} />
            <Field label="Address line 2" name="addressLine2" defaultValue={editingFull.addressLine2 ?? ""} />
            <div className="grid grid-cols-4 gap-3">
              <Field label="City" name="city" defaultValue={editingFull.city ?? ""} />
              <Field label="Region" name="region" defaultValue={editingFull.region ?? ""} />
              <Field label="Postal code" name="postalCode" defaultValue={editingFull.postalCode ?? ""} />
              <Field label="Country" name="country" defaultValue={editingFull.country ?? ""} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Phone" name="phone" defaultValue={editingFull.phone ?? ""} />
              <Field label="Email" name="email" type="email" defaultValue={editingFull.email ?? ""} />
              <Field label="Timezone" name="timezone" defaultValue={editingFull.timezone ?? ""} hint="e.g. America/Chicago" />
            </div>
            <div className="flex items-center gap-4">
              <Checkbox label="Default location" name="isDefault" defaultChecked={editingFull.isDefault} />
              <Checkbox label="Active" name="active" defaultChecked={editingFull.active} />
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit">Save</Button>
              <a
                href={`/t/${slug}/settings/locations`}
                className="text-xs underline"
                style={{ color: "var(--text-muted)" }}
              >
                Cancel
              </a>
            </div>
          </form>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Add a location" />
          <form action={create} className="space-y-3 px-5 py-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name" name="name" placeholder="Downtown Showroom" required />
              <Field label="Short code" name="code" placeholder="DTS" hint="Optional — used in UI chips" />
            </div>
            <Field label="Address line 1" name="addressLine1" />
            <Field label="Address line 2" name="addressLine2" />
            <div className="grid grid-cols-4 gap-3">
              <Field label="City" name="city" />
              <Field label="Region" name="region" />
              <Field label="Postal code" name="postalCode" />
              <Field label="Country" name="country" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Phone" name="phone" />
              <Field label="Email" name="email" type="email" />
              <Field label="Timezone" name="timezone" placeholder="America/Chicago" />
            </div>
            <Checkbox label="Make this the default location" name="isDefault" />
            <Button type="submit">Add location</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
