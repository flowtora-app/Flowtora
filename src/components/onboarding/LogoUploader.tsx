"use client";

import * as React from "react";
import { uploadTenantLogo } from "@/app/actions/uploads";

// LogoUploader — dropzone + file-picker for the tenant logo. Lives
// inside the branding step's existing <form>, writes the resulting
// Blob URL into a hidden `logoUrl` input so the outer submit (which
// runs `saveBrandingStep`) picks it up like any other text field.
//
// The upload itself happens immediately on file selection — we don't
// queue it to the Continue button because:
//   1. Users expect a preview before committing.
//   2. If the upload fails, we want to surface the error before the
//      rest of the form gets submitted.
//
// Previous URL (if any) stays around in Blob even after replacement;
// orphan cleanup isn't worth the complexity at this scale.

type Status =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "error"; message: string };

export function LogoUploader({
  slug,
  initialUrl,
}: {
  slug: string;
  initialUrl: string | null;
}) {
  const [url, setUrl] = React.useState<string | null>(initialUrl);
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  async function upload(file: File) {
    setStatus({ kind: "uploading" });
    const fd = new FormData();
    fd.append("file", file);
    const result = await uploadTenantLogo(slug, fd);
    if (result.ok) {
      setUrl(result.url);
      setStatus({ kind: "idle" });
    } else {
      setStatus({ kind: "error", message: result.error });
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void upload(file);
    // Reset so selecting the same file again still fires change.
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void upload(file);
  }

  function onRemove() {
    setUrl(null);
    setStatus({ kind: "idle" });
  }

  return (
    <div className="space-y-2">
      <label
        className="block text-sm font-medium"
        style={{ color: "var(--text-default)" }}
      >
        Logo
      </label>

      {/* Hidden field carries the current URL into the outer form. */}
      <input type="hidden" name="logoUrl" value={url ?? ""} />

      {url ? (
        <div
          className="flex items-center gap-4 rounded-md p-3"
          style={{
            background: "var(--surface-0)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div
            className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md"
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="Logo preview"
              className="max-h-16 max-w-16 object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              {url}
            </p>
            <div className="mt-1 flex gap-3">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-xs font-medium underline"
                style={{ color: "var(--accent-primary)" }}
              >
                Replace
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="text-xs font-medium underline"
                style={{ color: "var(--danger-fg)" }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className="flex cursor-pointer flex-col items-center justify-center rounded-md px-4 py-8 text-center transition-colors"
          style={{
            background: isDragging
              ? "var(--accent-surface)"
              : "var(--surface-0)",
            border: `1px dashed ${
              isDragging
                ? "var(--accent-primary)"
                : "var(--border-default)"
            }`,
          }}
        >
          <p
            className="text-sm font-medium"
            style={{ color: "var(--text-default)" }}
          >
            {status.kind === "uploading"
              ? "Uploading…"
              : "Drop your logo here or click to browse"}
          </p>
          <p
            className="mt-1 text-xs"
            style={{ color: "var(--text-faint)" }}
          >
            PNG, JPEG, WebP, GIF, or SVG · up to 2 MB
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
        onChange={onPick}
        className="hidden"
      />

      {status.kind === "error" && (
        <p
          role="alert"
          className="text-xs"
          style={{ color: "var(--danger-fg)" }}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
