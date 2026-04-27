"use client";

import * as React from "react";
import { uploadTenantFile } from "@/app/actions/uploads";

// File picker for the FilesCard upload form. Uploads the picked file
// to R2 via `uploadTenantFile` immediately, then writes the resulting
// URL + metadata into hidden form fields so the outer <form action=
// {createFile}> picks them up on submit.
//
// The createFile server action expects: filename, storageUrl, mimeType,
// sizeBytes, thumbnailUrl (optional). We populate all of those.

type Status =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "ready" }
  | { kind: "error"; message: string };

export function TenantFileUploadField({
  slug,
}: {
  slug: string;
}) {
  const [filename, setFilename] = React.useState<string>("");
  const [url, setUrl] = React.useState<string>("");
  const [mime, setMime] = React.useState<string>("");
  const [size, setSize] = React.useState<number | null>(null);
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });

  const onFile = async (file: File) => {
    setStatus({ kind: "uploading" });
    const fd = new FormData();
    fd.append("file", file);
    const result = await uploadTenantFile(slug, fd);
    if (result.ok) {
      setFilename(result.filename);
      setUrl(result.url);
      setMime(result.mime);
      setSize(result.size);
      setStatus({ kind: "ready" });
    } else {
      setStatus({ kind: "error", message: result.error });
    }
  };

  const reset = () => {
    setFilename("");
    setUrl("");
    setMime("");
    setSize(null);
    setStatus({ kind: "idle" });
  };

  const isImage = mime.startsWith("image/");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          <span aria-hidden>📎</span>
          <span>{url ? "Replace file" : "Choose file"}</span>
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {url && (
          <button
            type="button"
            onClick={reset}
            className="rounded-md px-3 py-2 text-sm"
            style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
          >
            Remove
          </button>
        )}
        {status.kind === "uploading" && (
          <span className="text-xs" style={{ color: "var(--muted)" }}>Uploading…</span>
        )}
        {status.kind === "error" && (
          <span className="text-xs" style={{ color: "#ef4444" }}>{status.message}</span>
        )}
        {status.kind === "ready" && (
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {filename}{size ? ` · ${formatBytes(size)}` : ""}
          </span>
        )}
      </div>

      {url && isImage && (
        <div
          className="overflow-hidden rounded-md"
          style={{ border: "1px solid var(--border)", maxWidth: 280 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Preview" style={{ display: "block", width: "100%", height: "auto" }} />
        </div>
      )}

      {/* Hidden inputs feed the outer createFile form. */}
      <input type="hidden" name="filename"   value={filename} />
      <input type="hidden" name="storageUrl" value={url} />
      <input type="hidden" name="mimeType"   value={mime} />
      <input type="hidden" name="sizeBytes"  value={size ?? ""} />
      {isImage && (
        <input type="hidden" name="thumbnailUrl" value={url} />
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
