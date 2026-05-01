"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  Input,
  Select,
  Textarea,
  useToast,
} from "@/components/ui";
import {
  applyRetentionOffer,
  markEngaged,
  scheduleSaveCall,
  sendOneOffWinbackEmail,
  suppressAtRiskAlert,
} from "@/app/actions/churn";

// RetentionActionMenu — per-row "..." menu with five save actions.
// Each opens a small dialog; the actions all hit dedicated server
// actions which audit-log + revalidate the page.

type ActionKind = "offer" | "call" | "engage" | "suppress" | "winback" | null;

export function RetentionActionMenu({
  tenantId,
  tenantName,
  coupons,
  canCoupon,
}: {
  tenantId: string;
  tenantName: string;
  coupons: { id: string; label: string }[];
  canCoupon: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState<ActionKind>(null);
  const ref = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const openAction = (k: ActionKind) => { setActive(k); setOpen(false); };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={`Actions for ${tenantName}`}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="ts-focus inline-flex h-7 w-7 items-center justify-center rounded-md border text-[13px] font-bold leading-none hover:bg-[var(--surface-2)]"
        style={{ borderColor: "var(--border-default)", color: "var(--text-muted)" }}
      >⋯</button>
      {open && (
        <div role="menu"
             className="absolute right-0 z-30 mt-1 w-56 overflow-hidden rounded-md border shadow-lg"
             style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}
             onClick={(e) => e.stopPropagation()}>
          {canCoupon && (
            <MenuItem onClick={() => openAction("offer")}>Save with offer</MenuItem>
          )}
          <MenuItem onClick={() => openAction("call")}>Schedule call</MenuItem>
          <MenuItem onClick={() => openAction("engage")}>Mark engaged</MenuItem>
          <MenuItem onClick={() => openAction("suppress")}>Suppress alert</MenuItem>
          <MenuItem onClick={() => openAction("winback")}>Send win-back email</MenuItem>
        </div>
      )}

      {active === "offer" && (
        <OfferDialog
          tenantId={tenantId} tenantName={tenantName}
          coupons={coupons}
          onClose={() => setActive(null)}
        />
      )}
      {active === "call" && (
        <CallDialog tenantId={tenantId} tenantName={tenantName} onClose={() => setActive(null)} />
      )}
      {active === "engage" && (
        <EngageDialog tenantId={tenantId} tenantName={tenantName} onClose={() => setActive(null)} />
      )}
      {active === "suppress" && (
        <SuppressDialog tenantId={tenantId} tenantName={tenantName} onClose={() => setActive(null)} />
      )}
      {active === "winback" && (
        <WinbackEmailDialog tenantId={tenantId} tenantName={tenantName} onClose={() => setActive(null)} />
      )}
    </div>
  );
}

function MenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="ts-focus block w-full px-3 py-2 text-left text-[12px] hover:bg-[var(--surface-2)]"
      style={{ color: "var(--text-default)" }}
    >
      {children}
    </button>
  );
}

/* ── individual dialogs ─────────────────────────────────────── */

function OfferDialog({
  tenantId, tenantName, coupons, onClose,
}: {
  tenantId: string;
  tenantName: string;
  coupons: { id: string; label: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [couponId, setCouponId] = React.useState(coupons[0]?.id ?? "");
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const onSubmit = async () => {
    if (!couponId) { toast.error("Pick a coupon"); return; }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("tenantId", tenantId);
      fd.set("couponId", couponId);
      if (notes.trim()) fd.set("notes", notes.trim());
      const res = await applyRetentionOffer(fd);
      if (res.ok) { toast.success("Coupon applied"); router.refresh(); onClose(); }
      else toast.error(res.error ?? "Couldn't apply");
    } finally { setPending(false); }
  };

  return (
    <Dialog open onClose={onClose} size="sm">
      <DialogHeader title={`Save ${tenantName} with offer`} description="Apply an active coupon as the next-invoice discount." onClose={onClose} />
      <DialogBody>
        <div className="flex flex-col gap-3">
          {coupons.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>
              No active coupons. Mint one in <span className="font-mono">/platform/billing/coupons</span> first.
            </p>
          ) : (
            <Select label="Coupon" value={couponId} onChange={(e) => setCouponId(e.target.value)}>
              {coupons.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </Select>
          )}
          <Textarea label="Notes (optional)" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={onSubmit} disabled={pending || coupons.length === 0}>
          {pending ? "Applying…" : "Apply offer"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function CallDialog({
  tenantId, tenantName, onClose,
}: {
  tenantId: string;
  tenantName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [scheduledFor, setScheduledFor] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const onSubmit = async () => {
    if (!scheduledFor) { toast.error("Pick a date / time"); return; }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("tenantId", tenantId);
      fd.set("scheduledFor", scheduledFor);
      if (notes.trim()) fd.set("notes", notes.trim());
      const res = await scheduleSaveCall(fd);
      if (res.ok) { toast.success("Call scheduled"); router.refresh(); onClose(); }
      else toast.error(res.error ?? "Couldn't schedule");
    } finally { setPending(false); }
  };

  return (
    <Dialog open onClose={onClose} size="sm">
      <DialogHeader title={`Schedule call with ${tenantName}`} description="Logged in the retention timeline. Calendar invite is your job for now." onClose={onClose} />
      <DialogBody>
        <div className="flex flex-col gap-3">
          <Input
            label="When"
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
          />
          <Textarea label="Notes (optional)" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={onSubmit} disabled={pending}>
          {pending ? "Saving…" : "Schedule call"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function EngageDialog({
  tenantId, tenantName, onClose,
}: {
  tenantId: string;
  tenantName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const onSubmit = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("tenantId", tenantId);
      if (notes.trim()) fd.set("notes", notes.trim());
      const res = await markEngaged(fd);
      if (res.ok) { toast.success("Marked engaged for 30d"); router.refresh(); onClose(); }
      else toast.error(res.error ?? "Couldn't mark");
    } finally { setPending(false); }
  };

  return (
    <Dialog open onClose={onClose} size="sm">
      <DialogHeader title={`Mark ${tenantName} engaged`} description="Hides this tenant from the at-risk list for 30 days." onClose={onClose} />
      <DialogBody>
        <Textarea label="What did they do?" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
      </DialogBody>
      <DialogFooter>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={onSubmit} disabled={pending}>
          {pending ? "Saving…" : "Mark engaged"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function SuppressDialog({
  tenantId, tenantName, onClose,
}: {
  tenantId: string;
  tenantName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [days, setDays] = React.useState(14);
  const [notes, setNotes] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const onSubmit = async () => {
    if (days < 1) { toast.error("Days must be ≥ 1"); return; }
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("tenantId", tenantId);
      fd.set("days", String(days));
      if (notes.trim()) fd.set("notes", notes.trim());
      const res = await suppressAtRiskAlert(fd);
      if (res.ok) { toast.success(`Suppressed ${days}d`); router.refresh(); onClose(); }
      else toast.error(res.error ?? "Couldn't suppress");
    } finally { setPending(false); }
  };

  return (
    <Dialog open onClose={onClose} size="sm">
      <DialogHeader title={`Suppress alert for ${tenantName}`} description="Hide from at-risk list until the timer expires." onClose={onClose} />
      <DialogBody>
        <div className="flex flex-col gap-3">
          <Input
            label="Days"
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 1)}
          />
          <Textarea label="Reason (optional)" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={onSubmit} disabled={pending}>
          {pending ? "Saving…" : "Suppress"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

function WinbackEmailDialog({
  tenantId, tenantName, onClose,
}: {
  tenantId: string;
  tenantName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [subject, setSubject] = React.useState(`We miss you on Flowtora`);
  const [body, setBody] = React.useState(
    `Hey,\n\nLooks like you've been quiet — anything we can do to help?\n\nReply to this email if you've hit a wall, want a discount, or need a hand getting back into a rhythm. We'll jump on it.\n\n— The Flowtora team`,
  );
  const [pending, setPending] = React.useState(false);

  const onSubmit = async () => {
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("tenantId", tenantId);
      fd.set("subject", subject);
      fd.set("body", body);
      const res = await sendOneOffWinbackEmail(fd);
      if (res.ok) { toast.success("Win-back email sent"); router.refresh(); onClose(); }
      else toast.error(res.error ?? "Couldn't send");
    } finally { setPending(false); }
  };

  return (
    <Dialog open onClose={onClose} size="md">
      <DialogHeader title={`Send win-back to ${tenantName}`} description="One-off plain-text email to the OWNER membership." onClose={onClose} />
      <DialogBody>
        <div className="flex flex-col gap-3">
          <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          <Textarea label="Body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} maxLength={8000} />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={onSubmit} disabled={pending}>
          {pending ? "Sending…" : "Send"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
