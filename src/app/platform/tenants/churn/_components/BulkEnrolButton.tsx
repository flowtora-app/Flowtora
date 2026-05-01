"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Select,
  useToast,
} from "@/components/ui";
import { bulkEnrolInRetentionCampaign } from "@/app/actions/churn";
import type { WinbackCampaignRow } from "@/server/platform/churn";

// BulkEnrolButton — opens a dialog where the admin picks an active /
// draft campaign and bulk-enrols the selected at-risk tenants.

export function BulkEnrolButton({
  tenantIds,
  campaigns,
  onComplete,
}: {
  tenantIds: string[];
  campaigns: WinbackCampaignRow[];
  onComplete?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [campaignId, setCampaignId] = React.useState(campaigns[0]?.id ?? "");
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const toast = useToast();

  React.useEffect(() => {
    if (open && !campaignId) setCampaignId(campaigns[0]?.id ?? "");
  }, [open, campaignId, campaigns]);

  const onSubmit = async () => {
    if (!campaignId) { toast.error("Pick a campaign"); return; }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("tenantIds", tenantIds.join(","));
      fd.set("campaignId", campaignId);
      const res = await bulkEnrolInRetentionCampaign(fd);
      if (res.ok) {
        toast.success(`Enrolled ${res.count} tenant${res.count === 1 ? "" : "s"}`);
        setOpen(false);
        onComplete?.();
        router.refresh();
      } else toast.error(res.error ?? "Couldn't enrol");
    } finally { setPending(false); }
  };

  if (campaigns.length === 0) {
    return (
      <span className="text-[12px]" style={{ color: "var(--text-faint)" }}>
        Create a Win-back campaign first to bulk-enrol.
      </span>
    );
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Bulk enrol in retention campaign
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} size="sm">
        <DialogHeader
          title="Bulk enrol in campaign"
          description={`${tenantIds.length} tenant${tenantIds.length === 1 ? "" : "s"} will be enrolled. Already-enrolled rows are skipped.`}
          onClose={() => setOpen(false)}
        />
        <DialogBody>
          <Select label="Campaign" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.status.toLowerCase()}
              </option>
            ))}
          </Select>
        </DialogBody>
        <DialogFooter>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={onSubmit} disabled={pending}>
            {pending ? "Enrolling…" : `Enrol ${tenantIds.length}`}
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
