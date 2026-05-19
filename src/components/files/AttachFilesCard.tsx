"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  StagingDropzone,
  StagedFileGrid,
  StagedFileLightbox,
  formatSize,
  useStagedFiles,
  type StagedFile,
} from "@/components/proofs/ProofFileStaging";
import { attachFilesToParent } from "@/app/actions/file-attach";

// Reusable drag-and-drop file attach card.
//
// Mirrors the look + behavior of `AttachProofFilesForm` but works
// against any of the supported File parents (customer / quote / order)
// via the generic `attachFilesToParent` server action. Mount this
// component above a FilesCard on any detail page and the page gets
// drag-and-drop + multi-file uploads with image previews and a
// kind picker.

const MAX_FILES = 10;
const MAX_BYTES_PER_FILE = 25 * 1024 * 1024; // 25 MB

// Same kinds the server action accepts. Listed manually so the picker
// renders in a sensible order and the user-facing labels are friendly.
const KIND_OPTIONS = [
  { value: "ATTACHMENT",        label: "Attachment" },
  { value: "REFERENCE",         label: "Reference" },
  { value: "DESIGN_SOURCE",     label: "Design source" },
  { value: "PRODUCTION_READY",  label: "Production-ready" },
  { value: "MOCKUP",            label: "Mockup" },
  { value: "INVOICE",           label: "Invoice / receipt" },
  { value: "CUSTOMER_UPLOAD",   label: "From customer" },
  { value: "OTHER",             label: "Other" },
] as const;

type Parent =
  | { kind: "customer"; id: string }
  | { kind: "quote";    id: string }
  | { kind: "order";    id: string };

export function AttachFilesCard({
  slug,
  parent,
  defaultKind = "ATTACHMENT",
  title,
  description,
}: {
  slug: string;
  parent: Parent;
  defaultKind?: (typeof KIND_OPTIONS)[number]["value"];
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<StagedFile | null>(null);
  const [kind, setKind] = React.useState<string>(defaultKind);

  const staging = useStagedFiles({
    maxFiles: MAX_FILES,
    maxBytesPerFile: MAX_BYTES_PER_FILE,
  });

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting || staging.files.length === 0) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      // Parent id under the matching field name — the server action
      // demands exactly one of customerId / quoteId / orderId.
      fd.append(`${parent.kind}Id`, parent.id);
      fd.append("kind", kind);
      // Pull any "notes" textarea from the form, if rendered. We don't
      // expose one in this minimal v1 surface — kept here for future
      // extension.
      staging.files.forEach((sf) => fd.append("files", sf.file, sf.file.name));
      await attachFilesToParent(slug, fd);
      staging.clearAll();
      setSubmitting(false);
      router.refresh();
    } catch (err) {
      if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
      console.error("[AttachFilesCard] submit failed:", err);
      setSubmitError("Upload failed. Please try again.");
      setSubmitting(false);
    }
  };

  const totalBytes = staging.files.reduce((n, f) => n + f.file.size, 0);
  const visibleError = submitError ?? staging.error;

  return (
    <>
      <section
        className="relative overflow-hidden rounded-xl"
        style={{
          padding: "20px 22px",
          background:
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <header className="mb-3">
          <h2
            style={{
              color: "var(--text-default)",
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: "-0.005em",
            }}
          >
            {title ?? "Attach files"}
          </h2>
          {description && (
            <p
              className="mt-0.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12,
                lineHeight: 1.45,
              }}
            >
              {description}
            </p>
          )}
        </header>

        <form onSubmit={onSubmit} className="space-y-3">
          {visibleError && (
            <div
              className="rounded-md px-3 py-2"
              style={{
                background: "color-mix(in oklab, var(--rose-500) 12%, transparent)",
                color: "var(--rose-500)",
                border: "1px solid color-mix(in oklab, var(--rose-500) 30%, transparent)",
                fontSize: 12.5,
              }}
            >
              {visibleError}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <label className="block min-w-[160px]">
              <span
                style={{
                  display: "block",
                  marginBottom: 6,
                  color: "var(--text-default)",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "-0.005em",
                }}
              >
                File type
              </span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                style={{
                  width: "100%",
                  height: 36,
                  padding: "0 10px",
                  borderRadius: 8,
                  background: "var(--surface-1)",
                  border: "1px solid var(--border-subtle)",
                  color: "var(--text-default)",
                  fontSize: 12.5,
                }}
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <StagingDropzone
            onAdd={staging.addFiles}
            maxBytesPerFile={MAX_BYTES_PER_FILE}
            compact
          />

          {staging.files.length > 0 && (
            <>
              <div
                className="flex items-baseline justify-between pt-1"
                style={{ color: "var(--text-muted)", fontSize: 11.5 }}
              >
                <span>
                  {staging.files.length} {staging.files.length === 1 ? "file" : "files"} staged · {formatSize(totalBytes)}
                </span>
                <button
                  type="button"
                  onClick={staging.clearAll}
                  className="underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Clear all
                </button>
              </div>
              <StagedFileGrid
                files={staging.files}
                lastAddedIds={staging.lastAddedIds}
                onRemove={staging.removeFile}
                onPreview={setPreview}
              />
              <div className="flex items-center justify-end pt-1">
                <button
                  type="submit"
                  disabled={submitting}
                  className="ts-focus inline-flex h-9 items-center gap-1.5 rounded-lg font-semibold transition-transform disabled:opacity-50"
                  style={{
                    padding: "0 14px",
                    background:
                      "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
                    color: "var(--accent-fg)",
                    border:
                      "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
                    boxShadow:
                      "0 1px 0 0 rgba(255,255,255,0.15) inset, " +
                      "0 1px 2px 0 rgba(0,0,0,0.35)",
                    fontSize: 12.5,
                    letterSpacing: "-0.005em",
                  }}
                >
                  {submitting
                    ? "Uploading…"
                    : `Upload ${staging.files.length} ${staging.files.length === 1 ? "file" : "files"}`}
                </button>
              </div>
            </>
          )}
        </form>
      </section>

      {preview && (
        <StagedFileLightbox staged={preview} onClose={() => setPreview(null)} />
      )}
    </>
  );
}
