"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button, Field, TextArea } from "@/components/Field";
import {
  StagingDropzone,
  StagedFileGrid,
  StagedFileLightbox,
  formatSize,
  useStagedFiles,
  type StagedFile,
} from "@/components/proofs/ProofFileStaging";

// NewProofVersionForm — client shell wrapping the full "start a new proof
// version" flow. Owns title + description state; delegates file staging
// to the shared useStagedFiles hook so the detail page's attach-files
// flow renders the same dropzone + grid + lightbox without duplication.
//
// On submit we build a fresh FormData (not tied to the DOM <form>), append
// every staged File as a `files` entry, and hand the batch to the server
// action which creates the proof + uploads to R2 + redirects.

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
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<StagedFile | null>(null);

  const staging = useStagedFiles({
    maxFiles: MAX_FILES,
    maxBytesPerFile: MAX_BYTES_PER_FILE,
  });

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.set("orderId", orderId);
      fd.set("title", title.trim());
      fd.set("description", description.trim());
      staging.files.forEach((sf) => fd.append("files", sf.file, sf.file.name));
      await action(fd);
      router.refresh();
    } catch (err) {
      if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
      console.error("[NewProofVersionForm] submit failed:", err);
      setSubmitError("Upload failed. Please try again.");
      setSubmitting(false);
    }
  };

  const totalBytes = staging.files.reduce((n, f) => n + f.file.size, 0);
  const visibleError = submitError ?? staging.error;

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-6 px-5 py-5">
        {visibleError && (
          <div
            className="rounded-md px-3 py-2 text-sm"
            style={{
              background: "var(--danger-surface)",
              color: "var(--danger-fg)",
              border: "1px solid var(--danger-fg)",
            }}
          >
            {visibleError}
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

          <StagingDropzone
            onAdd={staging.addFiles}
            maxBytesPerFile={MAX_BYTES_PER_FILE}
          />

          {staging.files.length > 0 && (
            <>
              <div className="flex items-baseline justify-between pt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                <span>
                  {staging.files.length} {staging.files.length === 1 ? "file" : "files"} · {formatSize(totalBytes)}
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
              : staging.files.length > 0
              ? `Create version & upload ${staging.files.length} ${staging.files.length === 1 ? "file" : "files"}`
              : "Create draft version"}
          </Button>
        </div>
      </form>

      {preview && (
        <StagedFileLightbox staged={preview} onClose={() => setPreview(null)} />
      )}
    </>
  );
}

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
