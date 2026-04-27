"use client";

import * as React from "react";
import { uploadInstallPhoto } from "@/app/actions/uploads";

// Photo capture input — picks a file (or shoots one with the back
// camera on mobile), downscales client-side, and uploads to R2 via the
// `uploadInstallPhoto` server action. The resulting public URL plus
// dimensions land in hidden inputs so the outer install form persists
// them on submit.
//
// Downsizing matters: a raw 12MP iPhone photo is ~5MB; 1600px wide JPEG
// at q=0.82 is ~200KB and still looks sharp.

const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.82;

type Status =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "uploading" }
  | { kind: "ready"; w: number; h: number }
  | { kind: "error"; message: string };

export function PhotoCaptureInput({
  slug,
  nameUrl,
  nameWidth,
  nameHeight,
  /** `environment` opens the back camera on mobile; leave unset for chooser. */
  capture,
  disabled,
}: {
  slug: string;
  nameUrl: string;
  nameWidth: string;
  nameHeight: string;
  capture?: "environment" | "user";
  disabled?: boolean;
}) {
  const [preview, setPreview] = React.useState<string>("");
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null);
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });

  const onFile = async (file: File) => {
    try {
      setStatus({ kind: "processing" });
      const { blob, w, h } = await downscaleToJpeg(file);
      const stem = file.name.replace(/\.[^.]+$/, "") || "photo";
      const upload = new File([blob], `${stem}.jpg`, { type: "image/jpeg" });

      setStatus({ kind: "uploading" });
      const fd = new FormData();
      fd.append("file", upload);
      const result = await uploadInstallPhoto(slug, fd);
      if (result.ok) {
        setPreview(result.url);
        setDims({ w, h });
        setStatus({ kind: "ready", w, h });
      } else {
        setPreview("");
        setDims(null);
        setStatus({ kind: "error", message: result.error });
      }
    } catch {
      setPreview("");
      setDims(null);
      setStatus({ kind: "error", message: "Couldn't read that file." });
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label
          className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-default)",
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <span>📷</span>
          <span>Choose photo</span>
          <input
            type="file"
            accept="image/*"
            capture={capture}
            disabled={disabled}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {status.kind === "processing" && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Processing…</span>
        )}
        {status.kind === "uploading" && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Uploading…</span>
        )}
        {status.kind === "error" && (
          <span className="text-xs" style={{ color: "var(--danger-fg)" }}>{status.message}</span>
        )}
        {status.kind === "ready" && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {status.w}×{status.h}
          </span>
        )}
      </div>

      {preview && (
        <div
          className="overflow-hidden rounded-md"
          style={{ border: "1px solid var(--border-subtle)", maxWidth: 280 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="Preview" style={{ display: "block", width: "100%", height: "auto" }} />
        </div>
      )}

      <input type="hidden" name={nameUrl}    value={preview} />
      <input type="hidden" name={nameWidth}  value={dims?.w ?? ""} />
      <input type="hidden" name={nameHeight} value={dims?.h ?? ""} />
    </div>
  );
}

/** Downscale to JPEG via canvas; returns the blob and final dimensions. */
function downscaleToJpeg(file: File): Promise<{ blob: Blob; w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error);
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_WIDTH / img.naturalWidth);
        const w = Math.round(img.naturalWidth * scale);
        const h = Math.round(img.naturalHeight * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        c.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("encode failed"));
              return;
            }
            resolve({ blob, w, h });
          },
          "image/jpeg",
          JPEG_QUALITY,
        );
      };
      img.onerror = () => reject(new Error("bad image"));
      img.src = fr.result as string;
    };
    fr.readAsDataURL(file);
  });
}
