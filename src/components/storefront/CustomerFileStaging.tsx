"use client";

import * as React from "react";

// CustomerFileStaging — light-themed multi-file dropzone for the
// public storefront S-5 checkout form.
//
// Why not reuse `<StagingDropzone />` from the proofs flow? That one
// is styled with the dark workspace CSS variables; the storefront is
// light-themed. Building a small self-contained version keeps the
// storefront visual language consistent without forking the proof
// uploader.
//
// How it submits with the parent form:
// the component renders a hidden `<input type="file" multiple
// name="files">`. Every time the staged files change we synthesize a
// DataTransfer and assign it to `input.files`. When the parent form
// is submitted (server action via React form action prop), browser
// reads the staged files from the input and they land in FormData
// under the same `files` key. No custom submit handler needed.

const MAX_FILES = 6;
const MAX_BYTES_PER_FILE = 25 * 1024 * 1024; // 25 MB

type StagedFile = {
  id: string;
  file: File;
  previewUrl: string; // objectURL for images, empty string for other types
};

export function CustomerFileStaging({ brand }: { brand: string }) {
  const [files, setFiles] = React.useState<StagedFile[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState(false);

  const inputRef     = React.useRef<HTMLInputElement>(null); // hidden submit input
  const pickRef      = React.useRef<HTMLInputElement>(null); // visible click-to-browse input
  const filesRef     = React.useRef(files);
  filesRef.current   = files;

  // Sync the hidden submit input's `.files` to the React state every
  // time `files` changes. `input.files` is settable in modern browsers
  // (Safari 14.1+, Chrome 73+, Firefox 62+). When the parent server-
  // action form submits, the browser reads this list and posts the
  // multipart-form-data; we never need to handle submit ourselves.
  React.useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const dt = new DataTransfer();
    files.forEach((sf) => dt.items.add(sf.file));
    input.files = dt.files;
  }, [files]);

  // Revoke object URLs when the component unmounts so we don't leak
  // blob references on long-lived forms.
  React.useEffect(() => {
    return () => {
      filesRef.current.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
  }, []);

  const addFiles = React.useCallback((incoming: FileList | File[]) => {
    setError(null);
    const arr = Array.from(incoming);
    if (arr.length === 0) return;

    setFiles((prev) => {
      // Dedupe by name+size against the existing set and within the
      // incoming drop (a single gesture with the same file twice
      // should still produce one tile).
      const existingKeys = new Set(prev.map((f) => `${f.file.name}:${f.file.size}`));
      const next: StagedFile[] = [];
      for (const file of arr) {
        const key = `${file.name}:${file.size}`;
        if (existingKeys.has(key)) continue;
        if (file.size > MAX_BYTES_PER_FILE) {
          setError(`"${file.name}" is larger than ${(MAX_BYTES_PER_FILE / (1024 * 1024)).toFixed(0)} MB`);
          continue;
        }
        if (prev.length + next.length >= MAX_FILES) {
          setError(`Max ${MAX_FILES} files per request`);
          break;
        }
        existingKeys.add(key);
        next.push({
          id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          file,
          previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
        });
      }
      return [...prev, ...next];
    });
  }, []);

  const removeFile = React.useCallback((id: string) => {
    setFiles((prev) => {
      const found = prev.find((f) => f.id === id);
      if (found?.previewUrl) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const totalBytes = files.reduce((n, f) => n + f.file.size, 0);

  return (
    <div>
      <div
        style={{
          display: "block",
          marginBottom: 6,
          color: "#0b0d10",
          fontSize: 12.5,
          fontWeight: 600,
          letterSpacing: "-0.005em",
        }}
      >
        Attach files <span style={{ color: "#9ca3af", fontWeight: 400 }}>(optional)</span>
      </div>

      <div
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragOver={(e)  => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={()  => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => pickRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pickRef.current?.click();
          }
        }}
        className="ts-focus cursor-pointer rounded-xl text-center transition-colors"
        style={{
          padding: "20px 16px",
          background: dragOver
            ? `color-mix(in oklab, ${brand} 8%, white)`
            : "#f9fafb",
          border: dragOver
            ? `2px dashed ${brand}`
            : "2px dashed #d1d5db",
        }}
      >
        <div className="flex flex-col items-center gap-2">
          <div
            aria-hidden
            className="flex items-center justify-center rounded-full"
            style={{
              width: 36,
              height: 36,
              background: dragOver ? brand : "white",
              color: dragOver ? "white" : "#6b7280",
              border: "1px solid #e5e7eb",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 16V4M5 11l7-7 7 7M5 20h14" />
            </svg>
          </div>
          <div>
            <div style={{ color: "#0b0d10", fontSize: 13.5, fontWeight: 600 }}>
              {dragOver ? "Drop to attach" : "Drag & drop, or click to browse"}
            </div>
            <div style={{ color: "#6b7280", fontSize: 11.5, marginTop: 2 }}>
              Photos, briefs, design files — up to {(MAX_BYTES_PER_FILE / (1024 * 1024)).toFixed(0)} MB each, {MAX_FILES} max
            </div>
          </div>
        </div>
        <input
          ref={pickRef}
          type="file"
          multiple
          className="hidden"
          accept="image/*,application/pdf,application/postscript,.ai,.eps,.svg,.psd,.cdr,.tif,.tiff,.zip"
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Hidden input bound to the parent form via name="files". The
          DataTransfer effect above keeps its FileList in sync with the
          React state. */}
      <input
        ref={inputRef}
        type="file"
        multiple
        name="files"
        className="hidden"
        tabIndex={-1}
        aria-hidden
      />

      {error && (
        <div
          className="mt-2 rounded-md px-3 py-2"
          style={{
            background: "#fef2f2",
            color: "#b91c1c",
            border: "1px solid #fecaca",
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {files.length > 0 && (
        <>
          <div
            className="mt-3 flex items-baseline justify-between"
            style={{ color: "#6b7280", fontSize: 11.5 }}
          >
            <span>
              {files.length} {files.length === 1 ? "file" : "files"} attached · {formatSize(totalBytes)}
            </span>
            <button
              type="button"
              onClick={() => {
                files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
                setFiles([]);
              }}
              className="underline"
              style={{ color: "#6b7280" }}
            >
              Clear all
            </button>
          </div>
          <ul
            className="mt-2 grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}
          >
            {files.map((sf) => {
              const isImage = sf.file.type.startsWith("image/") && sf.previewUrl;
              return (
                <li
                  key={sf.id}
                  className="group relative overflow-hidden rounded-lg"
                  style={{
                    background: "white",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div style={{ aspectRatio: "1 / 1", background: "#f9fafb" }}>
                    {isImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={sf.previewUrl}
                        alt=""
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-1">
                        <div
                          aria-hidden
                          style={{
                            width: 34,
                            height: 34,
                            borderRadius: 8,
                            background: brand,
                            color: "white",
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {extLabel(sf.file)}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <div
                      className="truncate"
                      style={{ color: "#0b0d10", fontSize: 11.5, fontWeight: 500 }}
                      title={sf.file.name}
                    >
                      {sf.file.name}
                    </div>
                    <div style={{ color: "#9ca3af", fontSize: 10.5, marginTop: 1 }}>
                      {formatSize(sf.file.size)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(sf.id)}
                    aria-label={`Remove ${sf.file.name}`}
                    className="ts-focus absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full transition-opacity opacity-0 group-hover:opacity-100"
                    style={{
                      background: "rgba(15, 23, 42, 0.85)",
                      color: "white",
                      fontSize: 13,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extLabel(file: File): string {
  const name = file.name.toLowerCase();
  const dot  = name.lastIndexOf(".");
  if (dot < 0) return "FILE";
  const ext = name.slice(dot + 1).toUpperCase();
  return ext.length <= 4 ? ext : ext.slice(0, 4);
}
