"use client";

import * as React from "react";

// Phase 13 — photo capture input.
//
// We don't have an S3 pipeline wired up for install photos yet. Rather
// than block Phase 13 on infrastructure, the field page stores photos as
// inline data URLs (JPEG, aggressively downscaled client-side) in a
// hidden input. The server action accepts data:image URLs for this
// reason. A later phase can add an /api/uploads endpoint and swap the
// hidden `url` field for a storage key — no other code changes needed.
//
// Downsizing matters: a raw 12MP iPhone photo is ~5MB; a 1600px-wide JPEG
// at q=0.82 is ~200KB, which Postgres swallows happily and still looks
// sharp.

const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.82;

export function PhotoCaptureInput({
  nameUrl,
  nameWidth,
  nameHeight,
  /** `environment` opens the back camera on mobile; leave unset for chooser. */
  capture,
  disabled,
}: {
  nameUrl: string;
  nameWidth: string;
  nameHeight: string;
  capture?: "environment" | "user";
  disabled?: boolean;
}) {
  const [preview, setPreview] = React.useState<string>("");
  const [dims, setDims] = React.useState<{ w: number; h: number } | null>(null);
  const [status, setStatus] = React.useState<"idle" | "reading" | "ready" | "error">("idle");

  const onFile = async (file: File) => {
    setStatus("reading");
    try {
      const dataUrl = await readFileDownscaled(file);
      const d = await measure(dataUrl);
      setPreview(dataUrl);
      setDims(d);
      setStatus("ready");
    } catch {
      setPreview("");
      setDims(null);
      setStatus("error");
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
              if (f) onFile(f);
            }}
          />
        </label>
        {status === "reading" && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>Processing…</span>
        )}
        {status === "error" && (
          <span className="text-xs" style={{ color: "var(--danger-fg)" }}>Couldn&apos;t read that file.</span>
        )}
        {status === "ready" && dims && (
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {dims.w}×{dims.h}
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

/** Read a File, render into a canvas scaled to MAX_WIDTH, return JPEG data URL. */
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

function measure(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("bad image"));
    img.src = dataUrl;
  });
}
