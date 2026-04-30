"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, Input, useToast } from "@/components/ui";
import { createPlatformSavedView, deletePlatformSavedView } from "@/app/actions/activity";

// "Save current as view" + "My saved views" dropdown for the tenants
// list. Reuses the existing PlatformSavedView table with kind="tenants".

export interface SavedView {
  id: string;
  name: string;
  filters: string;
  isShared: boolean;
  ownedByMe: boolean;
  ownerName: string | null;
}

export function TenantsSavedViews({ views }: { views: SavedView[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [saveOpen, setSaveOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement | null>(null);
  const [name, setName] = React.useState("");
  const [shared, setShared] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentFilters = sp.toString();

  const onSave = async () => {
    setPending(true);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("filters", currentFilters);
    fd.set("kind", "tenants");
    fd.set("isShared", shared ? "on" : "");
    const res = await createPlatformSavedView(fd);
    setPending(false);
    if (!res.ok) {
      toast.error(res.error ?? "Couldn't save view");
      return;
    }
    toast.success("View saved");
    setSaveOpen(false);
    setName("");
    setShared(false);
    router.refresh();
  };

  const onDelete = async (id: string) => {
    if (!confirm("Delete this saved view?")) return;
    const fd = new FormData();
    fd.set("id", id);
    const res = await deletePlatformSavedView(fd);
    if (!res.ok) toast.error(res.error ?? "Couldn't delete");
    else { toast.success("View deleted"); router.refresh(); }
  };

  return (
    <>
      <div ref={ref} className="relative inline-block">
        <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
          Saved views <span className="ml-1 font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>({views.length})</span>
        </Button>
        {open && (
          <div
            className="absolute right-0 z-30 mt-1 w-72 overflow-hidden rounded-md border shadow-lg"
            style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}
          >
            {views.length === 0 ? (
              <div className="px-3 py-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
                No saved views yet. Use "Save current as view" to capture this filter set.
              </div>
            ) : (
              <ul>
                {views.map((v) => (
                  <li key={v.id} className="flex items-center gap-2 px-3 py-2 text-[13px]" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <Link
                      href={`${pathname}?${v.filters}`}
                      className="min-w-0 flex-1 truncate hover:underline"
                      onClick={() => setOpen(false)}
                      style={{ color: "var(--text-default)" }}
                    >{v.name}</Link>
                    {v.isShared && (
                      <span className="rounded-full px-1.5 text-[9px] font-semibold uppercase" style={{ background: "var(--brand-100)", color: "var(--brand-800)" }}>Team</span>
                    )}
                    {v.ownedByMe && (
                      <button
                        type="button"
                        onClick={() => onDelete(v.id)}
                        className="ts-focus rounded p-0.5 text-[12px] hover:bg-[var(--surface-2)]"
                        title="Delete"
                        aria-label={`Delete saved view ${v.name}`}
                        style={{ color: "var(--text-faint)" }}
                      >✕</button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t px-3 py-2" style={{ borderColor: "var(--border-subtle)" }}>
              <Button size="xs" variant="primary" onClick={() => { setOpen(false); setSaveOpen(true); }}>
                + Save current as view
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} size="sm">
        <DialogHeader title="Save current as view" description="Capture the current filter set as a one-click tab." />
        <DialogBody>
          <div className="flex flex-col gap-3">
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder='e.g. "VIP shops in NA"'
              required
              autoFocus
            />
            <label className="flex items-start gap-2 text-[13px]" style={{ color: "var(--text-default)" }}>
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.currentTarget.checked)} />
              <span>
                <span className="block font-medium">Share with team</span>
                <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>
                  All platform staff will see this view alongside their own.
                </span>
              </span>
            </label>
            {currentFilters ? (
              <div className="rounded-md border p-2 font-mono text-[10px]"
                   style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
                ?{currentFilters}
              </div>
            ) : (
              <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                No active filters — saving captures the unfiltered list.
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setSaveOpen(false)}>Cancel</Button>
          <Button loading={pending} disabled={!name.trim()} onClick={onSave}>Save view</Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
