"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { FileKind, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import {
  isStorageConfigured,
  publicUrlFor,
  putFile,
  StorageError,
  type StorageScope,
} from "@/lib/storage";
import { checkStorageQuota } from "@/lib/storage-quota";
import { maybeSendStorageWarning } from "@/lib/storage-warning-email";

// Generic multi-file attach action.
//
// Companion to the proof-specific `attachProofFiles` — same UX, but
// usable on customer / quote / order parents. Each picked file goes
// straight to R2 via the existing storage layer, then we create one
// File row per upload.
//
// The flow:
//   client drops files into a <FileDropzone>      → FormData[ files[] ]
//   client invokes attachFilesToParent(slug, ...) → uploads + DB rows
//   server revalidates the parent page; client refreshes.

const MAX_FILES_PER_BATCH = 10;
const MAX_BYTES_PER_FILE  = 25 * 1024 * 1024; // 25 MB — matches uploadTenantFile

// The file kinds a user can pick from this generic uploader. We exclude
// PROOF (handled by the proof flow) and the deprecated ARTWORK value.
const PICKABLE_KINDS: readonly FileKind[] = [
  "ATTACHMENT",
  "REFERENCE",
  "DESIGN_SOURCE",
  "PRODUCTION_READY",
  "MOCKUP",
  "INVOICE",
  "CUSTOMER_UPLOAD",
  "OTHER",
];

const parentSchema = z
  .object({
    customerId: z.string().optional().nullable(),
    quoteId:    z.string().optional().nullable(),
    orderId:    z.string().optional().nullable(),
  })
  .refine(
    (p) => [p.customerId, p.quoteId, p.orderId].filter(Boolean).length === 1,
    { message: "Attach files to exactly one parent." },
  );

type Parent =
  | { kind: "customer"; id: string }
  | { kind: "quote";    id: string }
  | { kind: "order";    id: string };

/** Compute the back-URL + revalidate path for a given parent. */
function paths(slug: string, parent: Parent): { redirect: string; revalidate: string } {
  const base = `/t/${slug}/${parent.kind}s/${parent.id}`;
  return { redirect: base, revalidate: base };
}

/** Pick the storage scope to use for an upload. We keep scope close to
 *  the parent kind so R2 listings stay organized by feature. */
function scopeForParent(parent: Parent): StorageScope {
  switch (parent.kind) {
    case "customer": return "customer-files";
    case "quote":    return "customer-files"; // colocate with customer
    case "order":    return "customer-files"; // ditto — keys are already tenant + owner-scoped
  }
}

export async function attachFilesToParent(
  slug: string,
  formData: FormData,
): Promise<void> {
  const ctx = await requirePermission(slug, "files:upload");

  const parentParsed = parentSchema.safeParse({
    customerId: formData.get("customerId") || null,
    quoteId:    formData.get("quoteId")    || null,
    orderId:    formData.get("orderId")    || null,
  });
  if (!parentParsed.success) {
    redirect(`/t/${slug}/dashboard?error=${encodeURIComponent("Invalid file parent.")}`);
  }

  // Pick whichever id was set. The refine() guarantees exactly one is non-null.
  let parent: Parent;
  if (parentParsed.data.customerId) {
    parent = { kind: "customer", id: parentParsed.data.customerId };
    const found = await db.customer.findFirst({
      where: { id: parent.id, tenantId: ctx.tenant.id },
      select: { id: true },
    });
    if (!found) redirect(`/t/${slug}/customers?error=${encodeURIComponent("Customer not found.")}`);
  } else if (parentParsed.data.quoteId) {
    parent = { kind: "quote", id: parentParsed.data.quoteId };
    const found = await db.quote.findFirst({
      where: { id: parent.id, tenantId: ctx.tenant.id },
      select: { id: true },
    });
    if (!found) redirect(`/t/${slug}/quotes?error=${encodeURIComponent("Quote not found.")}`);
  } else {
    parent = { kind: "order", id: parentParsed.data.orderId! };
    const found = await db.order.findFirst({
      where: { id: parent.id, tenantId: ctx.tenant.id },
      select: { id: true },
    });
    if (!found) redirect(`/t/${slug}/orders?error=${encodeURIComponent("Order not found.")}`);
  }

  const { redirect: back, revalidate } = paths(slug, parent);

  // Kind picker — defaults to ATTACHMENT (catch-all).
  const rawKind = String(formData.get("kind") || "ATTACHMENT");
  const kind: FileKind = (PICKABLE_KINDS as string[]).includes(rawKind)
    ? (rawKind as FileKind)
    : "ATTACHMENT";

  // Optional free-form note attached to the whole batch.
  const notes = (() => {
    const raw = String(formData.get("notes") || "").trim();
    return raw.length > 0 ? raw.slice(0, 2000) : null;
  })();

  const rawFiles = formData
    .getAll("files")
    .filter((v): v is File => v instanceof File && v.size > 0);

  if (rawFiles.length === 0) {
    redirect(`${back}?error=${encodeURIComponent("Pick at least one file.")}`);
  }
  if (rawFiles.length > MAX_FILES_PER_BATCH) {
    redirect(`${back}?error=${encodeURIComponent(`Too many files — max ${MAX_FILES_PER_BATCH} per upload.`)}`);
  }
  const oversized = rawFiles.find((f) => f.size > MAX_BYTES_PER_FILE);
  if (oversized) {
    redirect(
      `${back}?error=${encodeURIComponent(
        `"${oversized.name}" exceeds ${MAX_BYTES_PER_FILE / (1024 * 1024)} MB.`,
      )}`,
    );
  }

  // Plan-level storage cap — sum the batch and decide before we upload
  // anything. Avoids a half-uploaded batch when the user is over.
  const totalIncoming = rawFiles.reduce((n, f) => n + f.size, 0);
  const quota = await checkStorageQuota(ctx.tenant.id, ctx.tenant.plan, totalIncoming);
  if (quota) redirect(`${back}?error=${encodeURIComponent(quota.error)}`);

  if (!isStorageConfigured()) {
    redirect(`${back}?error=${encodeURIComponent("File storage isn't configured on this deploy.")}`);
  }

  // Per-file upload. We push best-effort: if one file fails, the rest
  // still land. A summary audit row at the end tells the admin how many
  // made it.
  let uploaded = 0;
  let totalBytes = 0;
  for (const file of rawFiles) {
    try {
      const { key, size, contentType } = await putFile({
        tenantId:   ctx.tenant.id,
        scope:      scopeForParent(parent),
        ownerId:    parent.id,
        file,
        visibility: "public",
      });
      const url = publicUrlFor(key);
      const isImage = contentType.startsWith("image/");
      const data: Prisma.FileUncheckedCreateInput = {
        tenantId:     ctx.tenant.id,
        uploaderId:   ctx.userId,
        filename:     file.name,
        storageUrl:   url,
        thumbnailUrl: isImage ? url : null,
        mimeType:     contentType,
        sizeBytes:    size,
        kind,
        notes,
        customerId:   parent.kind === "customer" ? parent.id : null,
        quoteId:      parent.kind === "quote"    ? parent.id : null,
        orderId:      parent.kind === "order"    ? parent.id : null,
      };
      await db.file.create({ data });
      uploaded += 1;
      totalBytes += size;
    } catch (err) {
      if (err instanceof StorageError) {
        console.error("[attachFilesToParent] storage error", file.name, err.message);
      } else {
        console.error("[attachFilesToParent] upload failed", file.name, err);
      }
    }
  }

  await logAudit({
    tenantId:   ctx.tenant.id,
    userId:     ctx.userId,
    action:     "files.attached",
    entityType: parent.kind === "customer" ? "Customer" : parent.kind === "quote" ? "Quote" : "Order",
    entityId:   parent.id,
    metadata:   { kind, uploaded, totalBytes },
  });

  await maybeSendStorageWarning({ tenantId: ctx.tenant.id, plan: ctx.tenant.plan });

  revalidatePath(revalidate);

  if (uploaded === 0) {
    redirect(`${back}?error=${encodeURIComponent("Upload failed. Try again.")}`);
  }
  redirect(`${back}?uploaded=${uploaded}`);
}
