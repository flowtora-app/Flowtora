import type { File as FileRow } from "@prisma/client";
import { Card, CardHeader } from "@/components/Card";
import { Button, Field, SelectField, TextArea } from "@/components/Field";
import { archiveFile, createFile, deleteFile, restoreFile } from "@/app/actions/files";
import {
  ACTIVE_FILE_KINDS,
  fileGroup,
  fileKindLabel,
  FILE_GROUP_META,
  FILE_KINDS,
  formatSize,
  isImage,
} from "@/lib/proofs";
import { formatDateTime } from "@/lib/format";

type Parent =
  | { kind: "customer"; id: string }
  | { kind: "quote"; id: string }
  | { kind: "order"; id: string }
  | { kind: "proof"; id: string };

type MemberMap = Map<string, { userId: string; name: string; email: string }>;

export function FilesCard({
  slug,
  files,
  parent,
  canUpload,
  backUrl,
  title = "Files",
  defaultKind = "ATTACHMENT",
  memberMap,
  // When true the parent proof is locked — we still render the file list
  // but hide all mutation affordances (upload, archive, delete). Only
  // meaningful for proof parents; ignored elsewhere.
  locked = false,
}: {
  slug: string;
  files: FileRow[];
  parent: Parent;
  canUpload: boolean;
  backUrl: string;
  title?: string;
  defaultKind?: (typeof FILE_KINDS)[number]["value"];
  memberMap?: MemberMap;
  locked?: boolean;
}) {
  const action = createFile.bind(null, slug);

  // Split archived from active. Archived files never clutter the main list
  // — they're hidden behind a <details> fold so the history is recoverable
  // without being visually noisy.
  const active   = files.filter((f) => !f.archivedAt);
  const archived = files.filter((f) =>  f.archivedAt);

  // Grouping only makes sense for proof parents — that's the surface where
  // the Phase 11 taxonomy (customer-facing vs production vs reference)
  // carries real meaning. Everywhere else, a flat list is simpler.
  const groupingEnabled = parent.kind === "proof";
  const groups = groupingEnabled
    ? (["customer-facing", "production", "reference"] as const).map((g) => ({
        key: g,
        meta: FILE_GROUP_META[g],
        items: active.filter((f) => fileGroup(f.kind) === g),
      }))
    : null;

  // Effective "can edit" for this file set. Locked proofs freeze everything.
  const canMutate = canUpload && !locked;

  return (
    <Card>
      <CardHeader
        title={title}
        description={
          `${active.length} ${active.length === 1 ? "file" : "files"}` +
          (archived.length > 0 ? ` · ${archived.length} archived` : "") +
          ` · URLs only for now — blob uploads land in Phase 14.`
        }
      />

      {active.length === 0 ? (
        <div className="px-5 py-4 text-sm" style={{ color: "var(--muted)" }}>No files yet.</div>
      ) : groups ? (
        <div>
          {groups.map((g) =>
            g.items.length === 0 ? null : (
              <div key={g.key}>
                <div
                  className="flex items-baseline justify-between px-5 py-2 text-xs uppercase tracking-wider"
                  style={{ background: "var(--bg)", color: "var(--muted)", borderTop: "1px solid var(--border)" }}
                >
                  <span>{g.meta.label}</span>
                  <span style={{ textTransform: "none", color: "var(--muted)" }}>{g.meta.hint}</span>
                </div>
                <ul>
                  {g.items.map((f) => (
                    <FileRowItem
                      key={f.id}
                      f={f}
                      slug={slug}
                      parent={parent}
                      canMutate={canMutate}
                      memberMap={memberMap}
                    />
                  ))}
                </ul>
              </div>
            ),
          )}
        </div>
      ) : (
        <ul>
          {active.map((f) => (
            <FileRowItem
              key={f.id}
              f={f}
              slug={slug}
              parent={parent}
              canMutate={canMutate}
              memberMap={memberMap}
            />
          ))}
        </ul>
      )}

      {/* Archived fold — always render but only visible when user expands.
          Keeps legal-value history accessible without cluttering the list. */}
      {archived.length > 0 && (
        <details style={{ borderTop: "1px solid var(--border)" }}>
          <summary
            className="cursor-pointer px-5 py-2 text-xs uppercase tracking-wider"
            style={{ color: "var(--muted)" }}
          >
            {archived.length} archived file{archived.length === 1 ? "" : "s"}
          </summary>
          <ul>
            {archived.map((f) => (
              <FileRowItem
                key={f.id}
                f={f}
                slug={slug}
                parent={parent}
                canMutate={canMutate}
                memberMap={memberMap}
                dimmed
              />
            ))}
          </ul>
        </details>
      )}

      {canMutate && (
        <form action={action} className="space-y-3 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
          <input type="hidden" name={`${parent.kind}Id`} value={parent.id} />
          <input type="hidden" name="backUrl" value={backUrl} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Filename" name="filename" required placeholder="logo-v2.pdf" />
            <SelectField
              label="Kind"
              name="kind"
              defaultValue={defaultKind}
              options={ACTIVE_FILE_KINDS.map((k) => ({ value: k.value, label: k.label }))}
            />
          </div>
          <Field
            label="Public URL"
            name="storageUrl"
            type="url"
            required
            placeholder="https://…"
            hint="Paste a hosted URL. Direct uploads come in Phase 14."
          />
          <div className="grid grid-cols-4 gap-3">
            <Field label="MIME type" name="mimeType" placeholder="image/png" />
            <Field label="Size (bytes)" name="sizeBytes" type="number" min="0" />
            <Field label="Thumbnail URL" name="thumbnailUrl" type="url" />
            <Field
              label="Iteration #"
              name="assetVersion"
              type="number"
              min="1"
              placeholder="e.g. 3"
              hint="Optional designer-side tweak counter."
            />
          </div>
          <TextArea label="Notes" name="notes" rows={2} />
          <Button type="submit" variant="secondary">Attach file</Button>
        </form>
      )}

      {locked && canUpload && (
        <div className="px-5 py-3 text-xs" style={{ color: "var(--muted)", borderTop: "1px solid var(--border)" }}>
          Proof is locked — file changes disabled. Start a new revision to add or replace files.
        </div>
      )}
    </Card>
  );
}

// Row renderer — extracted so grouped and flat lists share markup.
function FileRowItem({
  f,
  slug,
  parent,
  canMutate,
  memberMap,
  dimmed = false,
}: {
  f: FileRow;
  slug: string;
  parent: Parent;
  canMutate: boolean;
  memberMap?: MemberMap;
  dimmed?: boolean;
}) {
  const remove   = deleteFile.bind(null, slug, f.id);
  const archive  = archiveFile.bind(null, slug, f.id);
  const restore  = restoreFile.bind(null, slug, f.id);
  const img = isImage(f);
  const uploader = memberMap?.get(f.uploaderId)?.name ?? null;

  // For proof-parented files, archive is the preferred soft-delete (the
  // artwork stays in the revision history). For everything else, archive
  // has no real audience — a flat hard-delete is fine.
  const showArchive = parent.kind === "proof" && !f.archivedAt;
  const showRestore = parent.kind === "proof" && Boolean(f.archivedAt);
  const showDelete  = parent.kind !== "proof" || !f.archivedAt;

  return (
    <li
      className="flex items-start gap-3 px-5 py-3"
      style={{ borderTop: "1px solid var(--border)", opacity: dimmed ? 0.65 : 1 }}
    >
      <div className="flex-shrink-0" style={{ width: 48, height: 48, borderRadius: 6, overflow: "hidden", background: "var(--border)" }}>
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={f.thumbnailUrl ?? f.storageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs" style={{ color: "var(--muted)" }}>
            {(f.mimeType ?? "file").split("/").pop()?.slice(0, 4).toUpperCase() ?? "FILE"}
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <a href={f.storageUrl} target="_blank" rel="noopener noreferrer" className="truncate text-sm font-medium underline">
          {f.filename}
        </a>
        <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
          {fileKindLabel(f.kind)}
          {f.assetVersion ? ` · iteration ${f.assetVersion}` : ""}
          {" · "}{formatSize(f.sizeBytes)}
          {" · "}{formatDateTime(f.createdAt)}
          {uploader ? ` · by ${uploader}` : ""}
        </div>
        {f.notes && (
          <div className="mt-1 whitespace-pre-wrap text-xs" style={{ color: "var(--muted)" }}>{f.notes}</div>
        )}
        {f.archivedAt && (
          <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Archived {formatDateTime(f.archivedAt)}
          </div>
        )}
      </div>
      {canMutate && (
        <div className="flex flex-shrink-0 flex-col items-end gap-1">
          {showArchive && (
            <form action={archive}>
              <button type="submit" className="text-xs underline" style={{ color: "var(--muted)" }}>
                Archive
              </button>
            </form>
          )}
          {showRestore && (
            <form action={restore}>
              <button type="submit" className="text-xs underline" style={{ color: "var(--muted)" }}>
                Restore
              </button>
            </form>
          )}
          {showDelete && (
            <form action={remove}>
              <button type="submit" className="text-xs underline" style={{ color: "#ff6b6b" }}>
                Remove
              </button>
            </form>
          )}
        </div>
      )}
    </li>
  );
}
