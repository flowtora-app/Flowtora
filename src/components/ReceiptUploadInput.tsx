"use client";

import * as React from "react";

// Phase 14 — receipt upload.
//
// Mirrors the Phase 13 PhotoCaptureInput pattern: until we have a real
// blob store wired, the user picks a local file and we store it as a
// client-downscaled JPEG data URL in a hidden field. Reversing this to
// a hosted URL later is a single-field swap on the server action.
//
// Receipts want a little more detail than install photos (people squint
// at line items), so we keep them a touch larger — 1800px wide @ q=0.85.
// Typical result: 300–500KB, well under MAX_RECEIPT_BYTES (600KB) on
// the server.
//
// The component also accepts an initial URL so the edit page can show
// whatever receipt is already attached. When present, the user can
// either replace it or remove it.

const MAX_WIDTH = 1800;
const JPEG_QUALITY = 0.85;

export function ReceiptUploadInput({
  name,
  initial,
}: {
  /** Form field name the hidden input will use. */
  name: string;
  /** Existing receipt URL/dataUrl, if any. */
  initial?: string | null;
}) {
  const [value, setValue] = React.useState<string>(initial ?? "");
  const [status, setStatus] = React.useState<"idle" | "reading" | "error">("idle");

  const onFile = async (file: File) => {
    setStatus("reading");
    try {
      const dataUrl = await readFileDownscaled(file);
      setValue(dataUrl);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  const isImage = value.startsWith("data:image/") || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(value);

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
          <span>📎</span>
          <span>{value ? "Replace receipt" : "Attach receipt"}</span>
          <input
            type="file"
            accept="image/*"
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
            onClick={() => setValue("")}
            className="rounded-md px-3 py-2 text-sm"
            style={{ border: "1px solid var(--border)", color: "var(--muted)" }}
          >
            Remove
          </button>
        )}
        {status === "reading" && (
          <span className="text-xs" style={{ color: "var(--muted)" }}>Processing…</span>
        )}
        {status === "error" && (
          <span className="text-xs" style={{ color: "#ef4444" }}>Couldn&apos;t read that file.</span>
        )}
      </div>

      {value && isImage && (
        <div
          className="overflow-hidden rounded-md"
          style={{ border: "1px solid var(--border)", maxWidth: 280 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Receipt preview" style={{ display: "block", width: "100%", height: "auto" }} />
        </div>
      )}
      {value && !isImage && (
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          Linked: <span style={{ color: "var(--text)" }}>{value.length > 80 ? value.slice(0, 80) + "…" : value}</span>
        </div>
      )}

      <input type="hidden" name={name} value={value} />
    </div>
  );
}

/** Read a File into a canvas scaled to MAX_WIDTH, return JPEG data URL. */
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
