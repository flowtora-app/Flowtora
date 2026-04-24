"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Field";
import { Card, CardHeader } from "@/components/Card";
import {
  StagingDropzone,
  StagedFileGrid,
  StagedFileLightbox,
  formatSize,
  useStagedFiles,
  type StagedFile,
} from "@/components/proofs/ProofFileStaging";

// AttachProofFilesForm — the editable-proof surface's counterpart to the
// NewProofVersionForm dropzone. Used inside an existing proof's detail
// page when the designer wants to add/replace artwork without starting
// a fresh version. Shares the staging hook + UI so the feel is identical.
//
// On submit we call the bound attachProofFiles server action with a fresh
// FormData containing only the file batch — the action already knows the
// slug and proofId via closure.

const MAX_FILES = 10;
const MAX_BYTES_PER_FILE = 20 * 1024 * 1024; // 20 MB

export function AttachProofFilesForm({
  action,
  existingFileCount,
}: {
  action: (formData: FormData) => Promise<void>;
  existingFileCount: number;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<StagedFile | null>(null);

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
      staging.files.forEach((sf) => fd.append("files", sf.file, sf.file.name));
      await action(fd);
      // Server revalidates + stays on page — clear local state so the
      // uploader is ready for another batch without a manual reset.
      staging.clearAll();
      setSubmitting(false);
      router.refresh();
    } catch (err) {
      if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
      console.error("[AttachProofFilesForm] submit failed:", err);
      setSubmitError("Upload failed. Please try again.");
      setSubmitting(false);
    }
  };

  const totalBytes = staging.files.reduce((n, f) => n + f.file.size, 0);
  const visibleError = submitError ?? staging.error;

  return (
    <>
      <Card>
        <CardHeader
          title={existingFileCount === 0 ? "Upload proof files" : "Add more files"}
          description={
            existingFileCount === 0
              ? "Drag & drop the artwork for this version. Images preview instantly; design files show their type."
              : "Attach additional artwork — replacements, reference, or mockups — to this version."
          }
        />
        <form onSubmit={onSubmit} className="space-y-3 px-5 py-4">
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

          <StagingDropzone
            onAdd={staging.addFiles}
            maxBytesPerFile={MAX_BYTES_PER_FILE}
            compact
          />

          {staging.files.length > 0 && (
            <>
              <div className="flex items-baseline justify-between pt-1 text-xs" style={{ color: "var(--text-muted)" }}>
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
                <Button type="submit" disabled={submitting}>
                  {submitting
                    ? "Uploading…"
                    : `Upload ${staging.files.length} ${staging.files.length === 1 ? "file" : "files"}`}
                </Button>
              </div>
            </>
          )}
        </form>
      </Card>

      {preview && (
        <StagedFileLightbox staged={preview} onClose={() => setPreview(null)} />
      )}
    </>
  );
}
