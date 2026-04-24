"use client";

import * as React from "react";

// Shared client-side building blocks for the "rich file upload" UX used on
// BOTH the new-version form and the proof detail page.
//
// What lives here:
//   • StagedFile type — an in-memory File + per-item id + image preview URL.
//   • useStagedFiles — hook owning the staged File[] + dedupe + size guards.
//   • StagingDropzone — dropzone UI (drag & drop, click-to-browse, a11y).
//   • StagedFileGrid — responsive grid of preview tiles.
//   • StagedFileLightbox — modal for image files; new-tab for everything else.
//   • fileChip / formatSize — type-chip colors and size formatter.
//
// Deliberately headless about "what happens on submit" — callers compose
// their own form/server-action around this. Keeps both the create-version
// and the attach-to-existing flows aligned visually without coupling them.

export type StagedFile = {
  id: string;
  file: File;
  previewUrl: string;  // objectURL for images, empty otherwise
};

// ── Hook ──────────────────────────────────────────────────────────

export function useStagedFiles({
  maxFiles,
  maxBytesPerFile,
}: {
  maxFiles: number;
  maxBytesPerFile: number;
}) {
  const [files, setFiles] = React.useState<StagedFile[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const lastAddedIdsRef = React.useRef<string[]>([]);

  // Revoke object URLs on unmount so long-lived forms don't leak blob
  // references. React's cleanup runs once for the whole component.
  React.useEffect(() => {
    return () => {
      setFiles((current) => {
        current.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
        return current;
      });
    };
  }, []);

  const addFiles = React.useCallback((incoming: FileList | File[]) => {
    setError(null);
    const arr = Array.from(incoming);
    if (arr.length === 0) return;

    setFiles((prev) => {
      // Dedupe by name + size against both the existing staged set and the
      // current drop — a user dragging the same file twice in one gesture
      // should still land a single tile.
      const existingKeys = new Set(prev.map((f) => `${f.file.name}:${f.file.size}`));
      const staged: StagedFile[] = [];
      for (const f of arr) {
        if (f.size > maxBytesPerFile) {
          setError(`"${f.name}" is larger than ${formatSize(maxBytesPerFile)}.`);
          continue;
        }
        const key = `${f.name}:${f.size}`;
        if (existingKeys.has(key)) continue;
        existingKeys.add(key);
        staged.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file: f,
          previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : "",
        });
      }

      if (prev.length + staged.length > maxFiles) {
        setError(`Max ${maxFiles} files per upload.`);
        staged.forEach((s) => s.previewUrl && URL.revokeObjectURL(s.previewUrl));
        return prev;
      }

      lastAddedIdsRef.current = staged.map((s) => s.id);
      return [...prev, ...staged];
    });
  }, [maxBytesPerFile, maxFiles]);

  const removeFile = React.useCallback((id: string) => {
    setFiles((prev) => {
      const hit = prev.find((f) => f.id === id);
      if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const clearAll = React.useCallback(() => {
    setFiles((prev) => {
      prev.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
      return [];
    });
    lastAddedIdsRef.current = [];
  }, []);

  return {
    files,
    error,
    setError,
    addFiles,
    removeFile,
    clearAll,
    lastAddedIds: lastAddedIdsRef.current,
  };
}

// ── Dropzone ──────────────────────────────────────────────────────

export function StagingDropzone({
  onAdd,
  accept = "image/*,application/pdf,application/postscript,.ai,.eps,.svg,.psd,.cdr,.tif,.tiff",
  maxBytesPerFile,
  compact = false,
}: {
  onAdd: (files: FileList | File[]) => void;
  accept?: string;
  maxBytesPerFile: number;
  compact?: boolean;
}) {
  const [dragOver, setDragOver] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAdd(e.dataTransfer.files);
    }
  };

  return (
    <div
      onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={`ts-focus cursor-pointer rounded-lg text-center transition-colors ${compact ? "px-4 py-5" : "px-5 py-8"}`}
      style={{
        background: dragOver ? "var(--accent-surface)" : "var(--surface-1)",
        border: dragOver
          ? "2px dashed var(--accent-primary)"
          : "2px dashed var(--border-subtle)",
      }}
    >
      <div className={`flex ${compact ? "flex-row items-center gap-3" : "flex-col items-center gap-2"}`}>
        <div
          aria-hidden
          className={`flex items-center justify-center rounded-full ${compact ? "h-8 w-8 text-base" : "h-10 w-10 text-lg"}`}
          style={{
            background: dragOver ? "var(--accent-primary)" : "var(--surface-2)",
            color: dragOver ? "white" : "var(--text-muted)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          ⤴
        </div>
        <div className={compact ? "text-left" : "text-center"}>
          <div className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
            {dragOver ? "Drop to add" : "Drag & drop files here"}
          </div>
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            or <span className="underline">click to browse</span> — images, PDFs, and design files up to {formatSize(maxBytesPerFile)} each
          </div>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        accept={accept}
        onChange={(e) => {
          if (e.target.files) onAdd(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ── Grid + tile ───────────────────────────────────────────────────

export function StagedFileGrid({
  files,
  lastAddedIds,
  onRemove,
  onPreview,
}: {
  files: StagedFile[];
  lastAddedIds: string[];
  onRemove: (id: string) => void;
  onPreview: (sf: StagedFile) => void;
}) {
  if (files.length === 0) return null;
  return (
    <ul
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}
    >
      {files.map((sf) => (
        <StagedFileTile
          key={sf.id}
          staged={sf}
          isNew={lastAddedIds.includes(sf.id)}
          onRemove={() => onRemove(sf.id)}
          onPreview={() => onPreview(sf)}
        />
      ))}
    </ul>
  );
}

function StagedFileTile({
  staged,
  isNew,
  onRemove,
  onPreview,
}: {
  staged: StagedFile;
  isNew: boolean;
  onRemove: () => void;
  onPreview: () => void;
}) {
  const isImage = staged.file.type.startsWith("image/") && staged.previewUrl;
  const chip = fileChip(staged.file);

  return (
    <li
      className="group relative overflow-hidden rounded-lg"
      style={{
        background: "var(--surface-0)",
        border: "1px solid var(--border-subtle)",
        animation: isNew ? "ts-tile-pop 400ms ease-out" : undefined,
      }}
    >
      <button
        type="button"
        onClick={onPreview}
        className="block w-full"
        style={{ background: "var(--surface-2)", aspectRatio: "1 / 1" }}
        title={`Preview ${staged.file.name}`}
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={staged.previewUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            <div
              aria-hidden
              className="flex h-12 w-12 items-center justify-center rounded-md text-sm font-bold text-white"
              style={{ background: chip.bg }}
            >
              {chip.label}
            </div>
            <span className="px-2 text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              {chip.caption}
            </span>
          </div>
        )}
      </button>

      <div className="px-3 py-2">
        <div
          className="truncate text-xs font-medium"
          style={{ color: "var(--text-default)" }}
          title={staged.file.name}
        >
          {staged.file.name}
        </div>
        <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {formatSize(staged.file.size)}
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        title="Remove"
        aria-label={`Remove ${staged.file.name}`}
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100"
        style={{ background: "rgba(0,0,0,0.7)", color: "white" }}
      >
        ✕
      </button>
    </li>
  );
}

// ── Lightbox ──────────────────────────────────────────────────────

export function StagedFileLightbox({
  staged,
  onClose,
}: {
  staged: StagedFile;
  onClose: () => void;
}) {
  const isImage = staged.file.type.startsWith("image/") && staged.previewUrl;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Non-image → open in a new tab via transient blob URL, then close.
  React.useEffect(() => {
    if (isImage) return;
    const url = URL.createObjectURL(staged.file);
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (w) {
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      onClose();
      return;
    }
    return () => URL.revokeObjectURL(url);
  }, [isImage, staged.file, onClose]);

  if (!isImage) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.8)" }}
        onClick={onClose}
      >
        <div
          className="max-w-sm rounded-lg p-5"
          style={{ background: "var(--surface-0)", border: "1px solid var(--border-subtle)" }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
            {staged.file.name}
          </div>
          <div className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            Preview blocked — click below to open in a new tab.
          </div>
          <a
            href={URL.createObjectURL(staged.file)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block rounded-md px-3 py-1.5 text-sm"
            style={{ background: "var(--accent-primary)", color: "white" }}
            onClick={onClose}
          >
            Open file
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.85)" }}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-lg"
        style={{ background: "rgba(255,255,255,0.15)", color: "white" }}
      >
        ✕
      </button>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[90vh] max-w-[90vw]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={staged.previewUrl}
          alt={staged.file.name}
          style={{ maxHeight: "90vh", maxWidth: "90vw", objectFit: "contain", display: "block", borderRadius: 8 }}
        />
        <div className="mt-2 text-center text-xs" style={{ color: "rgba(255,255,255,0.85)" }}>
          {staged.file.name} · {formatSize(staged.file.size)}
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

// Type-colored badges for non-image files. Same palette used across the
// proof uploader; mirrored here so callers can render chips themselves
// (e.g. a mini "uploading N PDFs" summary) without re-exporting privates.
export function fileChip(file: File): { label: string; caption: string; bg: string } {
  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const mime = file.type.toLowerCase();

  if (mime === "application/pdf" || ext === "pdf") {
    return { label: "PDF", caption: "Document", bg: "#dc2626" };
  }
  if (ext === "ai" || mime === "application/postscript" || ext === "eps") {
    return { label: "AI", caption: "Vector source", bg: "#f59e0b" };
  }
  if (ext === "svg" || mime === "image/svg+xml") {
    return { label: "SVG", caption: "Vector", bg: "#8b5cf6" };
  }
  if (ext === "psd") {
    return { label: "PSD", caption: "Photoshop", bg: "#2563eb" };
  }
  if (ext === "cdr") {
    return { label: "CDR", caption: "CorelDraw", bg: "#16a34a" };
  }
  if (ext === "doc" || ext === "docx") {
    return { label: "DOC", caption: "Document", bg: "#2563eb" };
  }
  if (ext === "zip" || ext === "rar") {
    return { label: "ZIP", caption: "Archive", bg: "#475569" };
  }
  return {
    label: (ext || "FILE").slice(0, 4).toUpperCase(),
    caption: mime.split("/")[0] || "File",
    bg: "#64748b",
  };
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
