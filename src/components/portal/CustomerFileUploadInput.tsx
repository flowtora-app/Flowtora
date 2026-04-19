"use client";

import * as React from "react";

// Phase 15 Slice B — customer portal file upload.
//
// Mirrors ReceiptUploadInput (Phase 14) but lets customers upload
// non-image files too: briefs, site photos, existing logo/brand packs,
// reference images. We store in a hidden field as either:
//   • a downscaled JPEG data URL (for photos — most customer uploads
//     are photos from a phone, so we scale to keep uploads reasonable),
//   • or a raw data URL for other mime types up to MAX_RAW_BYTES.
//
// When real blob storage lands this whole thing becomes a signed URL
// + metadata handoff; for now we accept the size trade-off because it
// keeps the portal self-contained.
//
// Upload limits:
//   • Images: downscaled to 1800px wide, ~400KB typical.
//   • Other files: capped hard at 4MB so the form POST doesn't blow
//     past Next.js's default server-action body limit.
//
// The server action expects a single `data` field (data URL) plus a
// `filename` field. The component exposes both via hidden inputs so
// the caller just includes <CustomerFileUploadInput /> inside a form
// pointing at the action.

const MAX_WIDTH = 1800;
const JPEG_QUALITY = 0.85;
const MAX_RAW_BYTES = 4 * 1024 * 1024; // 4 MB

export function CustomerFileUploadInput({
  nameData = "data",
  nameFilename = "filename",
  nameMime = "mimeType",
}: {
  nameData?: string;
  nameFilename?: string;
  nameMime?: string;
}) {
  const [value, setValue] = React.useState<string>("");
  const [filename, setFilename] = React.useState<string>("");
  const [mimeType, setMimeType] = React.useState<string>("");
  const [status, setStatus] = React.useState<"idle" | "reading" | "error" | "too-large">("idle");

  const reset = () => {
    setValue("");
    setFilename("");
    setMimeType("");
    setStatus("idle");
  };

  const onFile = async (file: File) => {
    setFilename(file.name);
    setMimeType(file.type || "application/octet-stream");
    setStatus("reading");
    try {
      if (file.type.startsWith("image/")) {
        const dataUrl = await readFileDownscaled(file);
        setValue(dataUrl);
        setStatus("idle");
        return;
      }
      if (file.size > MAX_RAW_BYTES) {
        setStatus("too-large");
        setValue("");
        return;
      }
      const dataUrl = await readFileRaw(file);
      setValue(dataUrl);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  const isImage = value.startsWith("data:image/");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-default)",
            cursor: "pointer",
          }}
        >
          <span aria-hidden>📎</span>
          <span>{value ? "Replace file" : "Choose file"}</span>
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </label>
        {value && (
          <button
            type="button"
            onClick={reset}
            className="rounded-md px-3 py-2 text-sm"
            style={{
              border: "1px solid var(--border-subtle)",
              color: "var(--text-muted)",
            }}
          >
            Remove
          </button>
        )}
        {status === "reading" && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Processing…</span>
        )}
        {status === "error" && (
          <span className="text-xs" style={{ color: "#ef4444" }}>
            Couldn&apos;t read that file.
          </span>
        )}
        {status === "too-large" && (
          <span className="text-xs" style={{ color: "#ef4444" }}>
            File is too large (4 MB max).
          </span>
        )}
      </div>

      {value && isImage && (
        <div
          className="overflow-hidden rounded-md"
          style={{ border: "1px solid var(--border-subtle)", maxWidth: 280 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Preview"
            style={{ display: "block", width: "100%", height: "auto" }}
          />
        </div>
      )}
      {value && !isImage && (
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          Selected: <span style={{ color: "var(--text-default)" }}>{filename}</span>
        </div>
      )}

      <input type="hidden" name={nameData} value={value} />
      <input type="hidden" name={nameFilename} value={filename} />
      <input type="hidden" name={nameMime} value={mimeType} />
    </div>
  );
}

function readFileDownscaled(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => {
      const src = fr.result as string;
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_WIDTH / img.naturalWidth);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(c.toDataURL("image/jpeg", JPEG_QUALITY));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error("bad image"));
      img.src = src;
    };
    fr.readAsDataURL(file);
  });
}

function readFileRaw(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => resolve(fr.result as string);
    fr.readAsDataURL(file);
  });
}
