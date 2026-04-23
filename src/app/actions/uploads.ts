"use server";

import { put } from "@vercel/blob";
import { requirePermission } from "@/lib/tenant";
import { logAudit } from "@/lib/audit";

// Server-side uploader used by tenant-owned image inputs (logo, etc.).
// The client component POSTs a multipart/form-data with a `file` field
// via a server-action call; we validate + stream straight to Vercel
// Blob and hand back the public URL. The caller is responsible for
// persisting the URL onto whatever model it belongs to.
//
// Token resolution: `put()` picks up `BLOB_READ_WRITE_TOKEN` from the
// environment automatically. Locally, set it in `.env.local`; on
// Vercel it's injected by the Blob integration.
//
// Why a new blob per upload (instead of overwriting a stable path):
// we don't want browser/email caches to hold a stale logo after the
// tenant re-uploads. Each upload gets a fresh random-suffixed URL;
// `addRandomSuffix: true` is the Blob default but we pass it
// explicitly for clarity. Prior logos leak into Blob storage but the
// volume is trivial (a few KB per tenant per change) and Vercel
// doesn't charge per object.

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

  // Fail fast with a clear message if Blob isn't configured — otherwise
  // `put()` throws a vague SDK error that surfaces as a 500 in the UI.
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return {
      ok: false,
      error:
        "Image hosting isn't configured on this deploy. Set BLOB_READ_WRITE_TOKEN and redeploy.",
    };
  }

  // Extension from the MIME, not the filename — avoids "logo.png.exe"
  // smuggling and normalises whatever the OS picker produced.
  const ext =
    file.type === "image/svg+xml"
      ? "svg"
      : file.type.split("/")[1] ?? "bin";
  const pathname = `tenants/${ctx.tenant.id}/logo.${ext}`;

  try {
    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: true,
      contentType: file.type,
    });
    await logAudit({
      tenantId: ctx.tenant.id,
      userId: ctx.userId,
      action: "tenant.logo.uploaded",
      metadata: { url: blob.url, bytes: file.size, mime: file.type },
    });
    return { ok: true, url: blob.url };
  } catch (err) {
    console.error("[uploadTenantLogo] put failed:", err);
    return { ok: false, error: "Upload failed. Try again." };
  }
}
