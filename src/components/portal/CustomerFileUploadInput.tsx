"use client";

import * as React from "react";

// Customer portal file upload input — renders a real <input type="file">
// inside the parent <form>. The parent's server action receives the file
// directly via FormData (Next.js server actions handle multipart natively),
// uploads it to R2, and creates the File row.
//
// Image previews use a local Object URL so the customer can confirm what
// they picked before clicking Upload. We don't downscale here — the
// customer hasn't committed yet, and modern phone photos compressed by
// the browser's image picker are usually small enough.

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export function CustomerFileUploadInput({
  name = "file",
}: {
  name?: string;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [tooLarge, setTooLarge] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const previewUrl = React.useMemo(() => {
    if (!file || !file.type.startsWith("image/")) return null;
    return URL.createObjectURL(file);
  }, [file]);

  React.useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const reset = () => {
    setFile(null);
    setTooLarge(false);
    if (inputRef.current) inputRef.current.value = "";
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
            cursor: "pointer",
          }}
        >
          <span aria-hidden>📎</span>
          <span>{file ? "Replace file" : "Choose file"}</span>
          <input
            ref={inputRef}
            type="file"
            name={name}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > MAX_BYTES) {
                setTooLarge(true);
                setFile(null);
                e.target.value = "";
                return;
              }
              setTooLarge(false);
              setFile(f);
            }}
          />
        </label>
        {file && (
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
        {tooLarge && (
          <span className="text-xs" style={{ color: "#ef4444" }}>
            File is too large (25 MB max).
          </span>
        )}
      </div>

      {previewUrl && (
        <div
          className="overflow-hidden rounded-md"
          style={{ border: "1px solid var(--border-subtle)", maxWidth: 280 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Preview"
            style={{ display: "block", width: "100%", height: "auto" }}
          />
        </div>
      )}
      {file && !previewUrl && (
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          Selected: <span style={{ color: "var(--text-default)" }}>{file.name}</span>
        </div>
      )}
    </div>
  );
}
