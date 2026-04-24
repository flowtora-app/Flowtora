"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Field, TextArea } from "@/components/Field";

// NewProofVersionForm — client shell wrapping the full "start a new proof
// version" flow. Owns three pieces of ephemeral state:
//
//   1. title + description (bound to <input>/<textarea>)
//   2. the staged File[] (drag-and-dropped or picked)
//   3. the lightbox preview target (for image files)
//
// On submit, the client builds a FormData from its local state (not from
// the DOM) and hands it to the server action, which uploads every file
// to R2, creates the proof + File rows, and redirects to the detail page.
//
// Why client state instead of a native <form>: the file picker UI is a
// grid of rich preview tiles (thumbnails, type chips, remove buttons,
// lightbox). Keeping a hidden <input type="file" multiple> in sync via
// DataTransfer works but doesn't let us dedupe across drops, show mime
// type chips, or preview images without re-reading. Straight state is
// simpler.

type StagedFile = {
  id: string;          // local uid for keying + dedup
  file: File;
  previewUrl: string;  // objectURL for images, empty otherwise
};

// Kept in sync with the server action's limits in src/app/actions/proofs.ts.
// The request as a whole also has a Next.js body-size cap set in next.config.ts.
const MAX_FILES = 10;
const MAX_BYTES_PER_FILE = 20 * 1024 * 1024; // 20 MB

export function NewProofVersionForm({
  slug,
  orderId,
  suggestedTitle,
  nextVersion,
  hasPrevious,
  action,
}: {
  slug: string;
  orderId: string;
  suggestedTitle: string;
  nextVersion: number;
  hasPrevious: boolean;
  action: (formData: FormData) => Promise<void>;
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState(suggestedTitle);
  const [description, setDescription] = React.useState("");
  const [files, setFiles] = React.useState<StagedFile[]>([]);
  const [dragOver, setDragOver] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [localError, setLocalError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<StagedFile | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const lastAddedIdsRef = React.useRef<string[]>([]);

  // Revoke object URLs on unmount / replacement to keep memory clean.
  React.useEffect(() => {
    return () => {
      files.forEach((f) => {
        if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (incoming: FileList | File[]) => {
    setLocalError(null);
    const arr = Array.from(incoming);
    if (arr.length === 0) return;

    // Dedupe by name + size — most collisions are "selected the same
    // file twice by accident" rather than genuinely distinct payloads.
    const existingKeys = new Set(files.map((f) => `${f.file.name}:${f.file.size}`));
    const staged: StagedFile[] = [];
    for (const f of arr) {
      if (f.size > MAX_BYTES_PER_FILE) {
        setLocalError(`"${f.name}" is larger than ${formatSize(MAX_BYTES_PER_FILE)}.`);
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

    if (files.length + staged.length > MAX_FILES) {
      setLocalError(`Max ${MAX_FILES} files per upload.`);
      // Revoke any URLs we created for files we're about to drop.
      staged.forEach((s) => s.previewUrl && URL.revokeObjectURL(s.previewUrl));
      return;
    }

    lastAddedIdsRef.current = staged.map((s) => s.id);
    setFiles((prev) => [...prev, ...staged]);
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const hit = prev.find((f) => f.id === id);
      if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setLocalError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("orderId", orderId);
      fd.set("title", title.trim());
      fd.set("description", description.trim());
      files.forEach((sf) => fd.append("files", sf.file, sf.file.name));
      await action(fd);
      // If the server action redirects (it does on success), we never get
      // here. If it returns without redirecting it means validation failed
      // and we should refresh to pick up the ?error= qs the server set.
      router.refresh();
    } catch (err) {
      // Next.js wraps successful redirects as thrown digests — rethrow so
      // the client transition completes. Anything else is a real failure.
      if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
      console.error("[NewProofVersionForm] submit failed:", err);
      setLocalError("Upload failed. Please try again.");
      setSubmitting(false);
    }
  };

  const totalBytes = files.reduce((n, f) => n + f.file.size, 0);

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-6 px-5 py-5">
        {localError && (
          <div
            className="rounded-md px-3 py-2 text-sm"
            style={{
              background: "var(--danger-surface)",
              color: "var(--danger-fg)",
              border: "1px solid var(--danger-fg)",
            }}
          >
            {localError}
          </div>
        )}

        <section className="space-y-4">
          <SectionHeader
            step={1}
            title="Version info"
            description="Name the version and summarize what the customer is looking at."
          />
          <Field
            label="Version name"
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`e.g. Storefront channel letters — v${nextVersion}`}
            hint="Shown to the customer on their portal. Optional."
          />
          <div>
            <TextArea
              label="What changed in this version?"
              name="description"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                hasPrevious
                  ? "e.g. Adjusted logo size, changed color to black, updated layout per customer request"
                  : "A short summary of what's in this proof, or what to look at."
              }
            />
            <span className="mt-1 block text-xs" style={{ color: "var(--text-muted)" }}>
              Customer sees this with the proof — keep it short and client-friendly.
            </span>
          </div>
        </section>

        <section className="space-y-3">
          <SectionHeader
            step={2}
            title="Upload proof files"
            description="Drag & drop artwork, mockups, or PDFs. Images preview instantly. Files stay private to your team until you send the version."
          />

          {/* Dropzone */}
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
            className="ts-focus cursor-pointer rounded-lg px-5 py-8 text-center transition-colors"
            style={{
              background: dragOver ? "var(--accent-surface)" : "var(--surface-1)",
              border: dragOver
                ? "2px dashed var(--accent-primary)"
                : "2px dashed var(--border-subtle)",
            }}
          >
            <div className="flex flex-col items-center gap-2">
              <div
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-full text-lg"
                style={{
                  background: dragOver ? "var(--accent-primary)" : "var(--surface-2)",
                  color: dragOver ? "white" : "var(--text-muted)",
                  border: "1px solid var(--border-subtle)",
                }}
              >
                ⤴
              </div>
              <div className="text-sm font-medium" style={{ color: "var(--text-default)" }}>
                {dragOver ? "Drop to add to this version" : "Drag & drop files here"}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                or <span className="underline">click to browse</span> — images, PDFs, and design files up to {formatSize(MAX_BYTES_PER_FILE)} each
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              accept="image/*,application/pdf,application/postscript,.ai,.eps,.svg,.psd,.cdr,.tif,.tiff"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                // Allow re-picking the same file name later
                e.target.value = "";
              }}
            />
          </div>

          {files.length > 0 && (
            <>
              <div className="flex items-baseline justify-between pt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                <span>
                  {files.length} {files.length === 1 ? "file" : "files"} · {formatSize(totalBytes)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    files.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
                    setFiles([]);
                    lastAddedIdsRef.current = [];
                  }}
                  className="underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Clear all
                </button>
              </div>
              <ul
                className="grid gap-3"
                style={{ gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))" }}
              >
                {files.map((sf) => (
                  <FileTile
                    key={sf.id}
                    staged={sf}
                    isNew={lastAddedIdsRef.current.includes(sf.id)}
                    onRemove={() => removeFile(sf.id)}
                    onPreview={() => setPreview(sf)}
                  />
                ))}
              </ul>
            </>
          )}
        </section>

        <div
          className="flex items-center justify-end gap-2 pt-4"
          style={{ borderTop: "1px solid var(--border-subtle)" }}
        >
          <Link
            href={`/t/${slug}/orders/${orderId}?tab=proofs`}
            className="ts-focus rounded-md px-3 py-1.5 text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            Cancel
          </Link>
          <Button type="submit" disabled={submitting}>
            {submitting
              ? "Creating…"
              : files.length > 0
              ? `Create version & upload ${files.length} ${files.length === 1 ? "file" : "files"}`
              : "Create draft version"}
          </Button>
        </div>
      </form>

      {preview && (
        <Lightbox staged={preview} onClose={() => setPreview(null)} />
      )}
    </>
  );
}

// ── Preview tile ──────────────────────────────────────────────────

function FileTile({
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
        // Flash a subtle ring on newly-added tiles so the user can visually
        // confirm the drop/select landed.
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
        style={{
          background: "rgba(0,0,0,0.7)",
          color: "white",
        }}
      >
        ✕
      </button>
    </li>
  );
}

// ── Lightbox preview ──────────────────────────────────────────────

function Lightbox({ staged, onClose }: { staged: StagedFile; onClose: () => void }) {
  const isImage = staged.file.type.startsWith("image/") && staged.previewUrl;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Non-image: open the file in a new tab via a temporary object URL, then
  // close the lightbox. Browsers render PDFs natively; everything else
  // prompts a download, which is still the right affordance.
  React.useEffect(() => {
    if (isImage) return;
    const url = URL.createObjectURL(staged.file);
    const w = window.open(url, "_blank", "noopener,noreferrer");
    // If popup blocked, fall through — the modal will show a download link.
    if (w) {
      // Revoke after the tab has had a chance to load. 60s is excessive
      // but safely covers slow PDF renders.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      onClose();
      return;
    }
    return () => URL.revokeObjectURL(url);
  }, [isImage, staged.file, onClose]);

  if (!isImage) {
    // Popup-blocked fallback — render a link the user can click themselves.
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

function SectionHeader({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div
        aria-hidden
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border-subtle)",
          color: "var(--text-muted)",
        }}
      >
        {step}
      </div>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-default)" }}>
          {title}
        </h3>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      </div>
    </div>
  );
}

// Type-colored badges for non-image files. Keeps the grid visually
// distinguishable at a glance — designers can tell "this PDF is the
// spec, this AI is the source art" from across the room.
function fileChip(file: File): { label: string; caption: string; bg: string } {
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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
