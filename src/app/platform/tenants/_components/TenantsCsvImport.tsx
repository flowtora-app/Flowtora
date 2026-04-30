"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, useToast } from "@/components/ui";
import {
  previewTenantsImport,
  commitTenantsImport,
  type CsvImportRow,
  type CsvImportPreviewItem,
} from "@/app/actions/tenants-provision";

// Three-stage CSV import:
//   1. Upload — drag/drop or pick a file, parse client-side via xlsx
//      (which reads CSV cleanly too).
//   2. Preview — server-side dry-run validates each row + checks for
//      slug collisions; renders a per-row decision table.
//   3. Commit — flips the safe rows into real tenants.

const RECOGNISED_HEADERS = new Set([
  "shopname", "slug", "ownername", "owneremail",
  "plan", "status", "trialdays", "country",
  "industry", "source", "notes",
]);

type Stage = "upload" | "preview" | "done";

export function TenantsCsvImport() {
  const router = useRouter();
  const toast = useToast();
  const [stage, setStage] = React.useState<Stage>("upload");
  const [parsedRows, setParsedRows] = React.useState<CsvImportRow[]>([]);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [preview, setPreview] = React.useState<{
    rows: CsvImportPreviewItem[];
    totals: { create: number; skip: number; error: number };
  } | null>(null);
  const [committing, setCommitting] = React.useState(false);
  const [commitResult, setCommitResult] = React.useState<null | {
    created: number; skipped: number; errored: number;
    errors: { rowIndex: number; reason: string }[];
  }>(null);

  const onFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const firstSheet = wb.SheetNames[0];
      if (!firstSheet) throw new Error("File has no sheets");
      const ws = wb.Sheets[firstSheet]!;
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (json.length === 0) {
        toast.error("File is empty");
        return;
      }
      // Normalise headers — case-insensitive map onto the canonical
      // wizard schema field names.
      const headerKeyMap: Record<string, keyof CsvImportRow> = {};
      const sampleKeys = Object.keys(json[0] ?? {});
      for (const k of sampleKeys) {
        const norm = k.toLowerCase().replace(/[\s_-]+/g, "");
        if (norm === "shopname") headerKeyMap[k] = "shopName";
        else if (norm === "slug") headerKeyMap[k] = "slug";
        else if (norm === "ownername") headerKeyMap[k] = "ownerName";
        else if (norm === "owneremail") headerKeyMap[k] = "ownerEmail";
        else if (norm === "plan") headerKeyMap[k] = "plan";
        else if (norm === "status") headerKeyMap[k] = "status";
        else if (norm === "trialdays") headerKeyMap[k] = "trialDays";
        else if (norm === "country") headerKeyMap[k] = "country";
        else if (norm === "industry") headerKeyMap[k] = "industry";
        else if (norm === "source") headerKeyMap[k] = "source";
        else if (norm === "notes") headerKeyMap[k] = "notes";
      }
      const recognisedHeaders = sampleKeys.filter((k) => RECOGNISED_HEADERS.has(k.toLowerCase().replace(/[\s_-]+/g, "")));
      setHeaders(recognisedHeaders);

      const rows: CsvImportRow[] = json.map((r, i) => {
        const out: CsvImportRow = { rowIndex: i + 1 };
        for (const [k, v] of Object.entries(r)) {
          const target = headerKeyMap[k];
          if (target) {
            // Coerce all incoming cells to string for downstream Zod
            // (which then re-coerces numerics where appropriate).
            (out as unknown as Record<string, unknown>)[target] = v == null ? "" : String(v);
          }
        }
        return out;
      });
      setParsedRows(rows);

      // Auto-advance into preview.
      const res = await previewTenantsImport(rows);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setPreview(res);
      setStage("preview");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't parse file");
    }
  };

  const onCommit = async () => {
    setCommitting(true);
    const res = await commitTenantsImport(parsedRows);
    setCommitting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setCommitResult({
      created: res.created,
      skipped: res.skipped,
      errored: res.errored,
      errors: res.errors,
    });
    setStage("done");
    if (res.created > 0) {
      router.refresh();
    }
  };

  const reset = () => {
    setStage("upload");
    setParsedRows([]);
    setHeaders([]);
    setPreview(null);
    setCommitResult(null);
  };

  if (stage === "upload") {
    return (
      <UploadDropZone
        onFile={onFile}
      />
    );
  }

  if (stage === "preview" && preview) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3"
             style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)" }}>
          <strong className="text-[13px]" style={{ color: "var(--text-default)" }}>
            {parsedRows.length} rows parsed
          </strong>
          <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            from {headers.length} recognised columns
          </span>
          <div className="ml-4 flex gap-2 text-[12px]">
            <Badge size="xs" color="success">{preview.totals.create} create</Badge>
            <Badge size="xs" color="info">{preview.totals.skip} skip</Badge>
            <Badge size="xs" color="error">{preview.totals.error} error</Badge>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={reset}>Upload a different file</Button>
            <Button size="sm" loading={committing} disabled={preview.totals.create === 0} onClick={onCommit}>
              Commit {preview.totals.create} {preview.totals.create === 1 ? "tenant" : "tenants"}
            </Button>
          </div>
        </div>

        <Card padding="none" className="overflow-hidden">
          <CardHeader title="Per-row preview" />
          <div className="max-h-[480px] overflow-auto">
            <table className="w-full text-[12px]">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr>
                  <Th>Row</Th><Th>Decision</Th><Th>Shop</Th><Th>Slug</Th><Th>Owner</Th><Th>Plan</Th><Th>Status</Th><Th>Reason</Th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.rowIndex} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <Td><span className="font-mono" style={{ color: "var(--text-faint)" }}>{r.rowIndex}</span></Td>
                    <Td>
                      {r.decision === "create" && <Badge size="xs" color="success">Create</Badge>}
                      {r.decision === "skip"   && <Badge size="xs" color="info">Skip</Badge>}
                      {r.decision === "error"  && <Badge size="xs" color="error">Error</Badge>}
                    </Td>
                    <Td>{r.shopName || <span style={{ color: "var(--text-faint)" }}>—</span>}</Td>
                    <Td><span className="font-mono">{r.slug || "—"}</span></Td>
                    <Td>{r.ownerEmail || <span style={{ color: "var(--text-faint)" }}>—</span>}</Td>
                    <Td>{r.plan || "—"}</Td>
                    <Td>{r.status || "—"}</Td>
                    <Td><span style={{ color: "var(--text-muted)" }}>{r.reason ?? ""}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  if (stage === "done" && commitResult) {
    return (
      <div className="flex flex-col gap-4">
        <Card padding="md">
          <CardHeader title="Import complete" />
          <CardBody>
            <div className="flex flex-wrap gap-3 text-[13px]">
              <Stat label="Created"  value={commitResult.created.toLocaleString()} tone="success" />
              <Stat label="Skipped"  value={commitResult.skipped.toLocaleString()} tone="info" />
              <Stat label="Errored"  value={commitResult.errored.toLocaleString()} tone={commitResult.errored > 0 ? "warning" : "muted"} />
            </div>
            {commitResult.errors.length > 0 && (
              <div className="mt-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Errors (first {commitResult.errors.length})
                </div>
                <ul className="mt-2 flex flex-col gap-1 text-[12px]">
                  {commitResult.errors.map((e, i) => (
                    <li key={i} style={{ color: "var(--text-default)" }}>
                      <span className="font-mono" style={{ color: "var(--text-faint)" }}>row {e.rowIndex}:</span> {e.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <Button onClick={reset}>Import another file</Button>
              <Button variant="secondary" onClick={() => router.push("/platform/tenants")}>Back to tenants</Button>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return <EmptyState title="Nothing to show" description="Upload a CSV to begin." />;
}

function UploadDropZone({ onFile }: { onFile: (f: File) => void }) {
  const [dragOver, setDragOver] = React.useState(false);
  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      className="ts-focus flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed text-center"
      style={{
        background: dragOver ? "var(--brand-50)" : "var(--surface-1)",
        borderColor: dragOver ? "var(--brand-500)" : "var(--border-default)",
      }}
    >
      <span style={{ fontSize: 32 }} aria-hidden>📥</span>
      <span className="text-[13px] font-medium" style={{ color: "var(--text-default)" }}>
        Drop a CSV or XLSX here
      </span>
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Or click to browse · accepts .csv, .xlsx, .xls
      </span>
      <input
        type="file"
        accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (f) onFile(f);
        }}
      />
    </label>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "success" | "info" | "warning" | "muted" }) {
  const palette =
    tone === "success" ? { bg: "var(--emerald-50)", fg: "var(--emerald-700)" } :
    tone === "info"    ? { bg: "var(--brand-50)",   fg: "var(--brand-800)" } :
    tone === "warning" ? { bg: "var(--amber-50)",   fg: "var(--amber-800)" } :
                          { bg: "var(--surface-2)", fg: "var(--text-muted)" };
  return (
    <div className="rounded-md border p-3" style={{ background: palette.bg, borderColor: "var(--border-subtle)", color: palette.fg }}>
      <div className="text-[10px] font-semibold uppercase tracking-wide">{label}</div>
      <div className="mt-0.5 text-[20px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="sticky top-0 px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wide"
        style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)", background: "var(--surface-2)" }}>
      {children}
    </th>
  );
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-2 py-1.5" style={{ color: "var(--text-default)" }}>{children}</td>;
}
