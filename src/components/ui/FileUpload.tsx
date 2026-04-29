"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

// FileUpload — Spec Page 0 §0.5.8.
//
// Variants: button (default), drop (drag-drop zone), avatar (circle),
// gallery (multi-file with previews).
// States: idle, drag-over (brand-100 bg, brand-600 border solid),
// uploading (per-file progress), success (green check), error (red icon
// + retry), partial (some failed).
// Constraints: maxSize, accept (mime types + extensions), maxFiles.
// Preview: image thumbnail 64px, document icon for non-images, file
// name truncated, size, remove X.
//
// Chunked upload spec is deferred — caller drives async upload via
// `onUpload(file)` returning Promise<void>; component manages display
// state. For now uploads are sequential; chunked + resumable can layer
// on top by replacing the upload runtime.

type Variant = "button" | "drop" | "avatar" | "gallery";
type FileState = "idle" | "uploading" | "success" | "error";

export interface UploadedFile {
  id: string;
  file: File;
  state: FileState;
  /** 0..100 */
  progress: number;
  /** Result URL when caller has uploaded successfully. */
  url?: string;
  /** Error message when state === "error". */
  error?: string;
}

export interface FileUploadProps {
  variant?: Variant;
  /** Allow multiple file selection. */
  multiple?: boolean;
  /** Accept attribute — mime types or extensions, comma-separated. */
  accept?: string;
  /** Bytes. Files exceeding the cap are rejected with an error. */
  maxSize?: number;
  /** Cap total selected files. Beyond this, additional drops are ignored. */
  maxFiles?: number;
  /** Optional async upload runtime. Called per file; receives a
   *  progress callback. When omitted the component just collects files
   *  for the caller to upload elsewhere. */
  onUpload?: (file: File, onProgress: (p: number) => void) => Promise<{ url?: string }>;
  /** Caller hook on selection change. */
  onChange?: (files: UploadedFile[]) => void;
  className?: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  disabled?: boolean;
}

let nextId = 1;

export function FileUpload({
  variant = "drop",
  multiple,
  accept,
  maxSize,
  maxFiles,
  onUpload,
  onChange,
  className,
  label,
  hint,
  disabled,
}: FileUploadProps) {
  const [files, setFiles] = React.useState<UploadedFile[]>([]);
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const update = React.useCallback((updater: (prev: UploadedFile[]) => UploadedFile[]) => {
    setFiles((prev) => {
      const next = updater(prev);
      onChange?.(next);
      return next;
    });
  }, [onChange]);

  const handleSelect = (selected: FileList | null) => {
    if (!selected || disabled) return;
    let toAdd: UploadedFile[] = [];
    for (const f of Array.from(selected)) {
      if (maxSize && f.size > maxSize) {
        toAdd.push({ id: String(nextId++), file: f, state: "error", progress: 0, error: `File exceeds ${humanSize(maxSize)}` });
        continue;
      }
      toAdd.push({ id: String(nextId++), file: f, state: onUpload ? "uploading" : "idle", progress: 0 });
    }
    if (maxFiles) {
      const room = Math.max(0, maxFiles - files.length);
      toAdd = toAdd.slice(0, room);
    }
    if (toAdd.length === 0) return;
    update((prev) => [...prev, ...toAdd]);

    if (onUpload) {
      for (const item of toAdd) {
        if (item.state === "error") continue;
        const onProg = (p: number) => {
          update((prev) => prev.map((x) => x.id === item.id ? { ...x, progress: p } : x));
        };
        onUpload(item.file, onProg)
          .then((res) => {
            update((prev) => prev.map((x) => x.id === item.id ? { ...x, state: "success", progress: 100, url: res.url } : x));
          })
          .catch((err: Error) => {
            update((prev) => prev.map((x) => x.id === item.id ? { ...x, state: "error", error: err.message } : x));
          });
      }
    }
  };

  const remove = (id: string) => update((prev) => prev.filter((x) => x.id !== id));

  if (variant === "avatar") {
    const item = files[0];
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="ts-focus relative inline-flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-2 border-dashed disabled:cursor-not-allowed"
          style={{ borderColor: dragOver ? "var(--brand-600)" : "var(--border-default)", background: dragOver ? "var(--brand-50)" : "var(--surface-1)" }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleSelect(e.dataTransfer.files); }}
        >
          {item?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span aria-hidden style={{ color: "var(--text-muted)" }}>+</span>
          )}
        </button>
        <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          {label && <div style={{ color: "var(--text-default)" }}>{label}</div>}
          {hint && <div className="mt-0.5">{hint}</div>}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={(e) => handleSelect(e.target.files)}
          className="hidden"
        />
      </div>
    );
  }

  if (variant === "button") {
    return (
      <div className={cn("inline-flex flex-col items-start gap-2", className)}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="ts-focus inline-flex h-9 items-center gap-2 rounded-md border px-3 text-[13px] font-medium"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", color: "var(--text-default)" }}
        >
          <UploadIcon /> {label ?? "Upload file"}
        </button>
        <FileList files={files} onRemove={remove} />
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={(e) => handleSelect(e.target.files)}
          className="hidden"
        />
      </div>
    );
  }

  // drop / gallery — same drop zone, gallery just shows thumbs
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleSelect(e.dataTransfer.files); }}
        className="ts-focus flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center disabled:cursor-not-allowed"
        style={{
          borderColor: dragOver ? "var(--brand-600)" : "var(--border-default)",
          background: dragOver ? "var(--brand-50)" : "var(--surface-1)",
          color: "var(--text-muted)",
          minHeight: 96,
        }}
      >
        <UploadIcon />
        <div className="text-[13px] font-medium" style={{ color: "var(--text-default)" }}>
          {label ?? (multiple ? "Drop files here or click to browse" : "Drop a file here or click to browse")}
        </div>
        {hint && <div className="text-[11px]">{hint}</div>}
        {accept && <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>{accept}</div>}
      </button>
      <FileList files={files} onRemove={remove} variant={variant} />
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => handleSelect(e.target.files)}
        className="hidden"
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────── */

function FileList({
  files,
  onRemove,
  variant = "drop",
}: {
  files: UploadedFile[];
  onRemove: (id: string) => void;
  variant?: Variant;
}) {
  if (files.length === 0) return null;
  if (variant === "gallery") {
    return (
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
        {files.map((f) => (
          <FileTile key={f.id} item={f} onRemove={onRemove} />
        ))}
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {files.map((f) => (
        <FileRow key={f.id} item={f} onRemove={onRemove} />
      ))}
    </ul>
  );
}

function FileRow({ item, onRemove }: { item: UploadedFile; onRemove: (id: string) => void }) {
  return (
    <li
      className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-[12px]"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}
    >
      <FileIcon file={item.file} />
      <span className="min-w-0 flex-1 truncate" style={{ color: "var(--text-default)" }}>
        {item.file.name}
      </span>
      <span style={{ color: "var(--text-muted)" }}>{humanSize(item.file.size)}</span>
      {item.state === "uploading" && (
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1 w-16 overflow-hidden rounded-full" style={{ background: "var(--surface-3)" }}>
            <span className="block h-full" style={{ width: `${item.progress}%`, background: "var(--brand-600)" }} />
          </span>
          <span style={{ color: "var(--text-muted)" }}>{item.progress}%</span>
        </span>
      )}
      {item.state === "success" && (
        <span aria-label="Uploaded" style={{ color: "var(--emerald-600)" }}>✓</span>
      )}
      {item.state === "error" && (
        <span aria-label="Failed" title={item.error} style={{ color: "var(--rose-600)" }}>!</span>
      )}
      <button type="button" onClick={() => onRemove(item.id)} aria-label="Remove" className="ts-focus" style={{ color: "var(--text-muted)" }}>
        ×
      </button>
    </li>
  );
}

function FileTile({ item, onRemove }: { item: UploadedFile; onRemove: (id: string) => void }) {
  const isImg = item.file.type.startsWith("image/");
  const previewUrl = React.useMemo(() => isImg ? URL.createObjectURL(item.file) : null, [isImg, item.file]);
  React.useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  return (
    <div className="relative overflow-hidden rounded-md border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="flex h-20 w-full items-center justify-center" style={{ background: "var(--surface-2)" }}>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={item.file.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <FileIcon file={item.file} large />
        )}
      </div>
      <div className="px-2 py-1">
        <div className="truncate text-[11px]" style={{ color: "var(--text-default)" }}>{item.file.name}</div>
        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>{humanSize(item.file.size)}</div>
      </div>
      {item.state === "uploading" && (
        <div className="absolute inset-x-0 bottom-0 h-1" style={{ background: "var(--surface-3)" }}>
          <div style={{ width: `${item.progress}%`, height: "100%", background: "var(--brand-600)" }} />
        </div>
      )}
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        aria-label="Remove"
        className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px]"
        style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
      >
        ×
      </button>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13V3M10 3l-4 4M10 3l4 4" />
      <path d="M3 13v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function FileIcon({ file, large }: { file: File; large?: boolean }) {
  const sz = large ? 28 : 16;
  return (
    <svg width={sz} height={sz} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "var(--text-muted)" }}>
      <path d="M3 2h7l3 3v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
      <path d="M10 2v4h3" />
    </svg>
  );
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
