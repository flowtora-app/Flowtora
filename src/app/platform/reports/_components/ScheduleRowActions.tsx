"use client";

import { useRouter } from "next/navigation";
import { Button, useToast } from "@/components/ui";
import { deleteReportSchedule, toggleReportSchedulePause } from "@/app/actions/reports";

export function ScheduleRowActions({ id, paused }: { id: string; paused: boolean }) {
  const router = useRouter();
  const toast = useToast();

  const onToggle = async () => {
    const fd = new FormData();
    fd.set("id", id);
    const res = await toggleReportSchedulePause(fd);
    if (!res.ok) toast.error(res.error ?? "Couldn't toggle");
    else { toast.success(paused ? "Resumed" : "Paused"); router.refresh(); }
  };

  const onDelete = async () => {
    if (!confirm("Delete this schedule? Recipients will stop getting the digest.")) return;
    const fd = new FormData();
    fd.set("id", id);
    const res = await deleteReportSchedule(fd);
    if (!res.ok) toast.error(res.error ?? "Couldn't delete");
    else { toast.success("Schedule removed"); router.refresh(); }
  };

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Button size="xs" variant="ghost" onClick={onToggle}>{paused ? "Resume" : "Pause"}</Button>
      <Button size="xs" variant="ghost" onClick={onDelete}>Delete</Button>
    </div>
  );
}
