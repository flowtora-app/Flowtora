"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";
import { recomputeAllHealthScores } from "@/app/actions/health-scoring";

// RecomputeAllButton — manually triggers `runRecompute("manual")` on
// the server. Snapshots are written for every non-archived tenant
// + a shadow row when a shadow model is configured.

export function RecomputeAllButton() {
  const [pending, setPending] = React.useState(false);
  const router = useRouter();
  const toast = useToast();

  const onClick = async () => {
    setPending(true);
    try {
      const res = await recomputeAllHealthScores();
      if (res.ok) {
        toast.success(`Recomputed ${res.count} snapshot${res.count === 1 ? "" : "s"}`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Couldn't recompute");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't recompute");
    } finally {
      setPending(false);
    }
  };

  return (
    <Button size="sm" variant="secondary" onClick={onClick} disabled={pending}>
      {pending ? "Recomputing…" : "Recompute all scores"}
    </Button>
  );
}
