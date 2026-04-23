"use server";

import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";
import {
  isStorageConfigured,
  publicUrlFor,
  putFile,
  StorageError,
} from "@/lib/storage";

// Server-side uploader for tenant-owned image assets (logo for now,
// room to grow). Client component posts a multipart form-data with a
// `file` field via a server-action call; we validate + stream to R2
// and hand back a stable public URL. The caller persists that URL
// wherever it belongs (usually tenant.logoUrl).
//
// Why public storage for the logo specifically: logos are embedded in
// outbound email, invoice PDFs, and the public-facing customer portal.
// Signed URLs would expire and break every cached email render. For
// anything tenant-private (receipts, mockups, install photos) use the
// private half of `src/lib/storage.ts` instead.

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_LOGO_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);

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
