"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { renameReport } from "@/app/actions/reports";
import { useToast } from "@/components/ui";

/** Click-to-edit report name. Renders the title; clicking the title
 *  swaps in an inline input that submits to renameReport on Enter. */
export function ReportEditableName({
  reportId,
  initialName,
  icon,
}: {
  reportId: string;
  initialName: string;
  icon: string;
}) {
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(initialName);
  const [pending, setPending] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const submit = async () => {
    if (pending) return;
    if (name.trim() === initialName.trim()) {
      setEditing(false);
      return;
    }
    if (name.trim().length === 0) {
      setName(initialName);
      setEditing(false);
      return;
    }
    setPending(true);
    const fd = new FormData();
    fd.set("reportId", reportId);
    fd.set("name", name.trim());
    const res = await renameReport(fd);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error ?? "Couldn't rename");
      setName(initialName);
      setEditing(false);
      return;
    }
    toast.success("Renamed");
    setEditing(false);
    router.refresh();
  };

  if (editing) {
    return (
      <span className="inline-flex items-center gap-2">
        <span aria-hidden style={{ fontSize: 22 }}>{icon}</span>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") { setName(initialName); setEditing(false); }
          }}
          className="ts-focus rounded-md border bg-transparent px-2 text-[20px] font-semibold"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-default)", color: "var(--text-default)" }}
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="ts-focus inline-flex items-center gap-2 rounded-md text-left hover:bg-[var(--surface-2)]"
      style={{ padding: "2px 6px", marginLeft: "-6px" }}
      title="Click to rename"
    >
      <span aria-hidden style={{ fontSize: 22 }}>{icon}</span>
      {name}
      <span aria-hidden className="text-[12px] font-normal" style={{ color: "var(--text-faint)" }}>✎</span>
    </button>
  );
}
