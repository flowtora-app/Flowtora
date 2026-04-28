"use server";

import { auth } from "@/auth";
import { requirePermission, requireTenant } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import {
  isStorageConfigured,
  publicUrlFor,
  putFile,
  StorageError,
} from "@/lib/storage";
import { checkStorageQuota } from "@/lib/storage-quota";

// Server-side uploaders for tenant-owned image and file assets. Each
// client component posts a multipart form-data with a `file` field via
// a server-action call; we validate + stream to R2 and hand back a
// stable public URL. The caller persists that URL wherever it belongs
// (tenant.logoUrl, expense.receiptUrl, file.storageUrl, etc.).
//
// All uploads target the public R2 bucket. Random key suffixes (6 hex
// bytes via keyFor()) provide practical unguessability for tenant /
// customer files. Tighten to private + signed URLs later if required.

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_LOGO_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);

const MAX_RECEIPT_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_INSTALL_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_TENANT_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED_IMAGE_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
]);

function notConfigured(): { ok: false; error: string } {
  return {
    ok: false,
    error:
      "Image hosting isn't configured on this deploy. Set the R2_* env vars and redeploy.",
  };
}

export type LogoUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function uploadTenantLogo(
  slug: string,
  formData: FormData,
): Promise<LogoUploadResult> {
  const ctx = await requirePermission(slug, "tenant:manage");

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file selected." };
  }
  if (file.size === 0) {
    return { ok: false, error: "File is empty." };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, error: "Logo must be 2 MB or smaller." };
  }
  if (!ALLOWED_LOGO_MIME.has(file.type)) {
    return {
      ok: false,
      error: "Use PNG, JPEG, WebP, GIF, or SVG.",
    };
  }

  // Plan-level storage cap. Counted as a soft gate — the tenant gets
  // a clear "quota exceeded, upgrade to X" message instead of a vague
  // 500 from the storage layer mid-upload.
  const quota = await checkStorageQuota(ctx.tenant.id, ctx.tenant.plan, file.size);
  if (quota) return { ok: false, error: quota.error };

  // Fail fast with a clear message if R2 isn't configured — otherwise
  // the SDK throws a vague error that surfaces as a 500 in the UI.
  if (!isStorageConfigured()) {
    return {
      ok: false,
      error:
        "Image hosting isn't configured on this deploy. Set the R2_* env vars and redeploy.",
    };
  }

  try {
    const { key, size } = await putFile({
      tenantId: ctx.tenant.id,
      scope: "logos",
      file,
      visibility: "public",
    });
    const url = publicUrlFor(key);
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "tenant.logo.uploaded",
      metadata: { url, key, bytes: size, mime: file.type },
    });
    return { ok: true, url };
  } catch (err) {
    if (err instanceof StorageError) {
      return { ok: false, error: err.message };
    }
    console.error("[uploadTenantLogo] put failed:", err);
    return { ok: false, error: "Upload failed. Try again." };
  }
}

// ── Receipts ──────────────────────────────────────────────────────

export type ReceiptUploadResult =
  | { ok: true; url: string; size: number; mime: string }
  | { ok: false; error: string };

export async function uploadExpenseReceipt(
  slug: string,
  formData: FormData,
): Promise<ReceiptUploadResult> {
  const ctx = await requirePermission(slug, "expenses:manage");

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file selected." };
  if (file.size === 0) return { ok: false, error: "File is empty." };
  if (file.size > MAX_RECEIPT_BYTES) {
    return { ok: false, error: "Receipt must be 8 MB or smaller." };
  }
  // Receipts are usually photos of paper, but PDFs are common too.
  const isPdf = file.type === "application/pdf";
  if (!isPdf && !ALLOWED_IMAGE_MIME.has(file.type)) {
    return { ok: false, error: "Use a PNG/JPEG/WebP image or a PDF." };
  }

  const quota = await checkStorageQuota(ctx.tenant.id, ctx.tenant.plan, file.size);
  if (quota) return { ok: false, error: quota.error };

  if (!isStorageConfigured()) return notConfigured();

  try {
    const { key, size, contentType } = await putFile({
      tenantId: ctx.tenant.id,
      scope: "receipts",
      file,
      visibility: "public",
    });
    const url = publicUrlFor(key);
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "expense.receipt_uploaded",
      metadata: { url, key, bytes: size, mime: contentType },
    });
    return { ok: true, url, size, mime: contentType };
  } catch (err) {
    if (err instanceof StorageError) return { ok: false, error: err.message };
    console.error("[uploadExpenseReceipt] put failed:", err);
    return { ok: false, error: "Upload failed. Try again." };
  }
}

// ── Install photos ───────────────────────────────────────────────

export type InstallPhotoUploadResult =
  | { ok: true; url: string; size: number; mime: string }
  | { ok: false; error: string };

export async function uploadInstallPhoto(
  slug: string,
  formData: FormData,
): Promise<InstallPhotoUploadResult> {
  const ctx = await requirePermission(slug, "installs:manage");

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file selected." };
  if (file.size === 0) return { ok: false, error: "File is empty." };
  if (file.size > MAX_INSTALL_PHOTO_BYTES) {
    return { ok: false, error: "Photo must be 8 MB or smaller." };
  }
  if (!ALLOWED_IMAGE_MIME.has(file.type)) {
    return { ok: false, error: "Use a PNG/JPEG/WebP/HEIC image." };
  }

  const quota = await checkStorageQuota(ctx.tenant.id, ctx.tenant.plan, file.size);
  if (quota) return { ok: false, error: quota.error };

  if (!isStorageConfigured()) return notConfigured();

  try {
    const { key, size, contentType } = await putFile({
      tenantId: ctx.tenant.id,
      scope: "install-photos",
      file,
      visibility: "public",
    });
    const url = publicUrlFor(key);
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "install.photo_uploaded",
      metadata: { url, key, bytes: size, mime: contentType },
    });
    return { ok: true, url, size, mime: contentType };
  } catch (err) {
    if (err instanceof StorageError) return { ok: false, error: err.message };
    console.error("[uploadInstallPhoto] put failed:", err);
    return { ok: false, error: "Upload failed. Try again." };
  }
}

// ── Tenant files (FilesCard) ─────────────────────────────────────

export type TenantFileUploadResult =
  | { ok: true; url: string; filename: string; size: number; mime: string }
  | { ok: false; error: string };

export async function uploadTenantFile(
  slug: string,
  formData: FormData,
): Promise<TenantFileUploadResult> {
  const ctx = await requirePermission(slug, "files:upload");

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file selected." };
  if (file.size === 0) return { ok: false, error: "File is empty." };
  if (file.size > MAX_TENANT_FILE_BYTES) {
    return { ok: false, error: "File must be 25 MB or smaller." };
  }

  const quota = await checkStorageQuota(ctx.tenant.id, ctx.tenant.plan, file.size);
  if (quota) return { ok: false, error: quota.error };

  if (!isStorageConfigured()) return notConfigured();

  try {
    const { key, size, contentType } = await putFile({
      tenantId: ctx.tenant.id,
      scope: "tenant-files",
      file,
      visibility: "public",
    });
    const url = publicUrlFor(key);
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "file.uploaded",
      metadata: { url, key, bytes: size, mime: contentType, filename: file.name },
    });
    return {
      ok: true,
      url,
      filename: file.name,
      size,
      mime: contentType,
    };
  } catch (err) {
    if (err instanceof StorageError) return { ok: false, error: err.message };
    console.error("[uploadTenantFile] put failed:", err);
    return { ok: false, error: "Upload failed. Try again." };
  }
}

// ── User avatar ──────────────────────────────────────────────────
//
// User-scoped, but we path the key under the current tenant so the
// upload lives somewhere coherent in R2's per-tenant tree. The slug
// the request came from is fine — User.image is just a URL string
// downstream consumers don't care which tenant folder owns it.

export type AvatarUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function uploadUserAvatar(
  slug: string,
  formData: FormData,
): Promise<AvatarUploadResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  // Anchor key path to the slug's tenant. requireTenant also enforces
  // membership, so a user can't path-scope avatars under tenants they
  // don't belong to.
  const ctx = await requireTenant(slug);

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file selected." };
  if (file.size === 0) return { ok: false, error: "File is empty." };
  if (file.size > MAX_AVATAR_BYTES) {
    return { ok: false, error: "Avatar must be 2 MB or smaller." };
  }
  if (!ALLOWED_LOGO_MIME.has(file.type)) {
    return { ok: false, error: "Use PNG, JPEG, WebP, GIF, or SVG." };
  }

  const quota = await checkStorageQuota(ctx.tenant.id, ctx.tenant.plan, file.size);
  if (quota) return { ok: false, error: quota.error };

  if (!isStorageConfigured()) return notConfigured();

  try {
    const { key, size, contentType } = await putFile({
      tenantId: ctx.tenant.id,
      scope: "avatars",
      ownerId: session.user.id,
      file,
      visibility: "public",
    });
    const url = publicUrlFor(key);
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: session.user.id,
      action: "account.avatar_uploaded",
      metadata: { url, key, bytes: size, mime: contentType },
    });
    return { ok: true, url };
  } catch (err) {
    if (err instanceof StorageError) return { ok: false, error: err.message };
    console.error("[uploadUserAvatar] put failed:", err);
    return { ok: false, error: "Upload failed. Try again." };
  }
}
