"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { revertReportVersion } from "@/app/actions/reports";
import { Button, Card, CardBody, CardHeader, EmptyState, useToast } from "@/components/ui";

export interface ReportVersionRow {
  id: string;
  name: string;
  description: string | null;
  filters: string;
  authorUserId: string;
  note: string | null;
  createdAt: Date;
}

export function ReportVersions({
  versions,
  ownedByMe,
}: {
  versions: ReportVersionRow[];
  ownedByMe: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  if (versions.length === 0) {
    return (
      <Card padding="lg">
        <EmptyState
          title="No version history yet"
          description="Versions are saved automatically each time the report is renamed, reverted, or otherwise edited."
        />
      </Card>
    );
  }

  const onRevert = async (versionId: string) => {
    if (!ownedByMe) return;
    if (!confirm("Revert the live report to this version? Your current state is auto-saved as a new version first.")) return;
    setPendingId(versionId);
    const fd = new FormData();
    fd.set("versionId", versionId);
    const res = await revertReportVersion(fd);
    setPendingId(null);
    if (!res.ok) toast.error(res.error ?? "Couldn't revert");
    else { toast.success("Reverted"); router.refresh(); }
  };

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-4 pt-4 pb-2">
        <CardHeader title="Version history" description={`${versions.length} ${versions.length === 1 ? "version" : "versions"} on file`} />
      </div>
      <CardBody>
        <ul className="flex flex-col gap-3">
          {versions.map((v, idx) => (
            <li key={v.id} className="flex items-start gap-3 rounded-md border p-3"
                style={{ borderColor: "var(--border-subtle)", background: idx === 0 ? "var(--surface-2)" : undefined }}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium" style={{ color: "var(--text-default)" }}>{v.name}</span>
                  {idx === 0 && <span className="rounded-full px-1.5 text-[10px] font-semibold" style={{ background: "var(--brand-100)", color: "var(--brand-800)" }}>Latest</span>}
                </div>
                <div className="mt-0.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  {new Date(v.createdAt).toLocaleString()}
                  {v.note ? ` · ${v.note}` : ""}
                </div>
                {v.description && (
                  <div className="mt-1 line-clamp-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                    {v.description}
                  </div>
                )}
                {v.filters && (
                  <div className="mt-1 truncate font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
                    ?{v.filters}
                  </div>
                )}
              </div>
              {ownedByMe && idx !== 0 && (
                <Button size="xs" variant="secondary" loading={pendingId === v.id} onClick={() => onRevert(v.id)}>
                  Revert to this
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
