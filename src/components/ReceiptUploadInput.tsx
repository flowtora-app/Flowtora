"use client";

import * as React from "react";
import { uploadExpenseReceipt } from "@/app/actions/uploads";

// Receipt upload — picks a file and uploads to R2 immediately, writing
// the resulting public URL into a hidden `receiptUrl` field so the
// outer expense form persists it on submit.
//
// Image receipts get a client-side downscale before the upload to keep
// payloads small (a raw 12MP iPhone photo is ~5MB; 1800px JPEG @0.85
// is ~300–500KB). PDFs are uploaded as-is.

const MAX_WIDTH = 1800;
const JPEG_QUALITY = 0.85;

type Status =
  | { kind: "idle" }
  | { kind: "processing" }
  | { kind: "uploading" }
  | { kind: "error"; message: string };

export function ReceiptUploadInput({
  slug,
  name,
  initial,
}: {
  /** Tenant slug — needed by the server action for permission scope. */
  slug: string;
  /** Form field name for the hidden URL input. */
  name: string;
  /** Existing receipt URL, if any. */
  initial?: string | null;
}) {
  const [value, setValue] = React.useState<string>(initial ?? "");
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });

  const onFile = async (file: File) => {
    try {
      let upload: File = file;
      if (file.type.startsWith("image/")) {
        setStatus({ kind: "processing" });
        upload = await downscaleImage(file);
      }
      setStatus({ kind: "uploading" });
      const fd = new FormData();
      fd.append("file", upload);
      const result = await uploadExpenseReceipt(slug, fd);
      if (result.ok) {
        setValue(result.url);
        setStatus({ kind: "idle" });
      } else {
        setStatus({ kind: "error", message: result.error });
      }
    } catch {
      setStatus({ kind: "error", message: "Couldn't read that file." });
    }
  };

  const isImage = /\.(png|jpe?g|gif|webp)(\?|$)/i.test(value);

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
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.target.value = "";
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
        {status.kind === "processing" && (
          <span className="text-xs" style={{ color: "var(--muted)" }}>Processing…</span>
        )}
        {status.kind === "uploading" && (
          <span className="text-xs" style={{ color: "var(--muted)" }}>Uploading…</span>
        )}
        {status.kind === "error" && (
          <span className="text-xs" style={{ color: "#ef4444" }}>{status.message}</span>
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
          Linked: <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text)" }}>{value.length > 80 ? value.slice(0, 80) + "…" : value}</a>
        </div>
      )}

      <input type="hidden" name={name} value={value} />
    </div>
  );
}

/** Downscale an image File to a JPEG within MAX_WIDTH; preserves the original filename stem. */
function downscaleImage(file: File): Promise<File> {
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
        c.toBlob((blob) => {
          if (!blob) {
            reject(new Error("encode failed"));
            return;
          }
          const stem = file.name.replace(/\.[^.]+$/, "") || "receipt";
          resolve(new File([blob], `${stem}.jpg`, { type: "image/jpeg" }));
        }, "image/jpeg", JPEG_QUALITY);
      };
      img.onerror = () => reject(new Error("bad image"));
      img.src = fr.result as string;
    };
    fr.readAsDataURL(file);
  });
}
