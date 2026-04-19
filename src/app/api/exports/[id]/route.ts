// Phase 17 Slice E — tenant downloads their completed data export.
//
// The route returns the JSON bundle as an attachment. Authorization is:
//   - the caller must be signed in
//   - the caller must be an ACTIVE member of the tenant the export belongs to
//   - the caller must be the OWNER (same role that requested the export)
// Platform staff can also download for support purposes.
//
// We deliberately don't use a signed-url pattern (HMAC token) — routing
// through an authenticated request is simpler, avoids an expiring-token
// table, and keeps the access check close to the data. expiresAt caps the
// retention window even so.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isPlatformStaff } from "@/lib/rbac";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const req = await db.dataExportRequest.findUnique({
    where: { id },
    select: {
      id: true, tenantId: true, status: true, payload: true,
      expiresAt: true, completedAt: true,
      tenant: { select: { slug: true } },
    },
  });
  if (!req) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (req.status !== "COMPLETED" || !req.payload) {
    return NextResponse.json({ error: "not ready" }, { status: 409 });
  }
  if (req.expiresAt && req.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  // Authorization: tenant owner OR any platform staff.
  const platformRole = session.user.platformRole ?? null;
  let authorized = isPlatformStaff(platformRole);
  if (!authorized) {
    const membership = await db.membership.findFirst({
      where: {
        tenantId: req.tenantId,
        userId: session.user.id,
        status: "ACTIVE",
        role: "OWNER",
      },
      select: { id: true },
    });
    authorized = membership !== null;
  }
  if (!authorized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const filename = `flowtora-export-${req.tenant.slug}-${req.completedAt?.toISOString().slice(0, 10) ?? "bundle"}.json`;
  return new NextResponse(req.payload, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
