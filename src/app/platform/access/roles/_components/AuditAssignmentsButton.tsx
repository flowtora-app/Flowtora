"use client";

import * as React from "react";
import { Button, useToast } from "@/components/ui";
import { snapshotRoleAssignments } from "@/app/actions/platform-roles";

// AuditAssignmentsButton — pulls the per-staff role snapshot and
// triggers a JSON file download. Useful for compliance reviewers
// who want a point-in-time copy of who has what.

export function AuditAssignmentsButton() {
  const [pending, setPending] = React.useState(false);
  const toast = useToast();

  const onClick = async () => {
    setPending(true);
    try {
      const res = await snapshotRoleAssignments();
      if (!res.ok) { toast.error(res.error ?? "Couldn't snapshot"); return; }
      const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `role-assignments-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Snapshotted ${res.rows.length} assignment${res.rows.length === 1 ? "" : "s"}`);
    } finally { setPending(false); }
  };

  return (
    <Button size="sm" variant="ghost" onClick={onClick} disabled={pending}>
      {pending ? "Snapshotting…" : "Audit role assignments"}
    </Button>
  );
}
