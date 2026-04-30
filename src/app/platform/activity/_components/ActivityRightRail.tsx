"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Avatar, Badge, Button, Card, CardBody, CardHeader, Dialog, DialogBody, DialogFooter, DialogHeader, Input, Select, useToast } from "@/components/ui";
import {
  createActivitySubscription,
  deleteActivitySubscription,
  toggleActivitySubscriptionPause,
  createPlatformSavedView,
  deletePlatformSavedView,
} from "@/app/actions/activity";

// ActivityRightRail — Page 2 §Right rail.
//
// Slots (top to bottom):
//   • Quick filter presets (chips → click to apply)
//   • Events-per-minute sparkline (last 60 minutes)
//   • Saved views list (mine + team)
//   • Active subscriptions list
//   • Subscribe + Save view buttons (open modals)

export interface SavedViewItem {
  id: string;
  name: string;
  filters: string;
  isShared: boolean;
  ownedByMe: boolean;
  ownerName: string | null;
}

export interface SubscriptionItem {
  id: string;
  name: string;
  filters: string;
  email: string;
  frequency: "LIVE" | "HOURLY" | "DAILY";
  paused: boolean;
  lastDeliveredAt: string | null;
}

export interface ActivityRightRailProps {
  /** Current filter querystring — used as the snapshot to save / subscribe to. */
  filterQs: string;
  presets: { id: string; label: string; href: string }[];
  spark60m: number[];
  savedViews: SavedViewItem[];
  subscriptions: SubscriptionItem[];
  /** Default email for the subscribe-modal form. */
  defaultEmail: string;
}

export function ActivityRightRail({
  filterQs,
  presets,
  spark60m,
  savedViews,
  subscriptions,
  defaultEmail,
}: ActivityRightRailProps) {
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [subOpen, setSubOpen] = React.useState(false);
  const toast = useToast();
  const router = useRouter();

  return (
    <div className="space-y-4">
      {/* Save + Subscribe action row */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setSubOpen(true)}>Subscribe to filter</Button>
        <Button size="sm" variant="secondary" onClick={() => setSaveOpen(true)}>Save view</Button>
      </div>

      {/* Quick presets */}
      <Card padding="md">
        <CardHeader title="Quick filters" description="One-click filter presets" />
        <CardBody>
          <ul className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <li key={p.id}>
                <Link
                  href={p.href}
                  className="ts-focus inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-medium"
                  style={{
                    background: "var(--surface-2)",
                    color: "var(--text-default)",
                    border: "1px solid var(--border-default)",
                  }}
                >
                  {p.label}
                </Link>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {/* Events-per-minute sparkline */}
      <Card padding="md">
        <CardHeader title="Events / minute" description="Last 60 minutes" />
        <CardBody>
          <Sparkline values={spark60m} />
          <div className="mt-1 flex items-center justify-between text-[10px]" style={{ color: "var(--text-faint)" }}>
            <span>−60m</span>
            <span>now</span>
          </div>
        </CardBody>
      </Card>

      {/* Saved views */}
      <Card padding="md">
        <CardHeader
          title="Saved views"
          description={savedViews.length === 0 ? "No saved views yet" : `${savedViews.length} ${savedViews.length === 1 ? "view" : "views"}`}
        />
        <CardBody>
          {savedViews.length === 0 ? (
            <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Click <span className="font-medium">Save view</span> to capture the current filters.
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {savedViews.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-2 text-[13px]">
                  <Link
                    href={`/platform/activity?${v.filters}`}
                    className="min-w-0 flex-1 truncate hover:underline"
                    style={{ color: "var(--text-default)" }}
                  >
                    {v.name}
                  </Link>
                  <div className="flex shrink-0 items-center gap-1">
                    {v.isShared && <Badge size="xs" color="info">Team</Badge>}
                    {v.ownedByMe && (
                      <form action={async (fd) => {
                        const res = await deletePlatformSavedView(fd);
                        if (!res.ok) toast.error(res.error ?? "Couldn't delete view");
                        else router.refresh();
                      }}>
                        <input type="hidden" name="id" value={v.id} />
                        <button
                          type="submit"
                          className="ts-focus rounded p-0.5 text-[12px] hover:bg-[var(--surface-2)]"
                          title="Delete view"
                          aria-label={`Delete saved view ${v.name}`}
                          style={{ color: "var(--text-faint)" }}
                        >
                          ✕
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Active subscriptions */}
      <Card padding="md">
        <CardHeader
          title="Active subscriptions"
          description={subscriptions.length === 0 ? "No subscriptions yet" : `${subscriptions.length} active`}
        />
        <CardBody>
          {subscriptions.length === 0 ? (
            <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Click <span className="font-medium">Subscribe to filter</span> to get an email digest when new events match these filters.
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {subscriptions.map((s) => (
                <li key={s.id} className="flex items-start gap-2 rounded-md border p-2"
                    style={{ borderColor: "var(--border-subtle)", background: "var(--surface-1)" }}>
                  <Avatar size="xs" name={s.name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[13px] font-medium" style={{ color: "var(--text-default)" }}>{s.name}</span>
                      {s.paused && <Badge size="xs" color="neutral">Paused</Badge>}
                    </div>
                    <div className="truncate text-[10px]" style={{ color: "var(--text-muted)" }}>
                      {s.email} · {s.frequency.toLowerCase()}
                      {s.lastDeliveredAt && ` · last sent ${formatRelative(new Date(s.lastDeliveredAt))}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <form action={async (fd) => {
                      const res = await toggleActivitySubscriptionPause(fd);
                      if (!res.ok) toast.error(res.error ?? "Couldn't toggle");
                      else { toast.success(s.paused ? "Resumed" : "Paused"); router.refresh(); }
                    }}>
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" className="ts-focus text-[10px] hover:underline" style={{ color: "var(--text-muted)" }}>
                        {s.paused ? "Resume" : "Pause"}
                      </button>
                    </form>
                    <form action={async (fd) => {
                      const res = await deleteActivitySubscription(fd);
                      if (!res.ok) toast.error(res.error ?? "Couldn't delete");
                      else { toast.success("Subscription removed"); router.refresh(); }
                    }}>
                      <input type="hidden" name="id" value={s.id} />
                      <button type="submit" className="ts-focus text-[10px] hover:underline" style={{ color: "var(--rose-700)" }}>
                        Delete
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Save-view modal */}
      <SaveViewModal open={saveOpen} onClose={() => setSaveOpen(false)} filterQs={filterQs} onSaved={() => { setSaveOpen(false); router.refresh(); }} />

      {/* Subscribe modal */}
      <SubscribeModal open={subOpen} onClose={() => setSubOpen(false)} filterQs={filterQs} defaultEmail={defaultEmail} onSaved={() => { setSubOpen(false); router.refresh(); }} />
    </div>
  );
}

/* ── Save-view modal ──────────────────────────────────────── */

function SaveViewModal({ open, onClose, filterQs, onSaved }: { open: boolean; onClose: () => void; filterQs: string; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [shared, setShared] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) { setName(""); setShared(false); }
  }, [open]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("filters", filterQs);
    fd.set("isShared", shared ? "on" : "");
    const res = await createPlatformSavedView(fd);
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error ?? "Couldn't save view");
      return;
    }
    toast.success("View saved");
    onSaved();
  };

  return (
    <Dialog open={open} onClose={onClose} size="sm">
      <form onSubmit={onSubmit}>
        <DialogHeader title="Save current view" description="Capture this filter set as a one-click view." />
        <DialogBody>
          <div className="flex flex-col gap-3">
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="e.g. Suspicious logins this week"
              required
              autoFocus
            />
            <label className="flex items-start gap-2 text-[13px]" style={{ color: "var(--text-default)" }}>
              <input
                type="checkbox"
                checked={shared}
                onChange={(e) => setShared(e.currentTarget.checked)}
              />
              <span>
                <span className="block font-medium">Share with team</span>
                <span className="block text-[11px]" style={{ color: "var(--text-muted)" }}>
                  All platform staff will see this view in their Saved views list.
                </span>
              </span>
            </label>
            {filterQs ? (
              <div className="rounded-md border p-2 font-mono text-[10px]"
                   style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
                ?{filterQs}
              </div>
            ) : (
              <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                No active filters — saving an empty view captures the default feed.
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={submitting} disabled={!name.trim()}>Save view</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/* ── Subscribe modal ──────────────────────────────────────── */

function SubscribeModal({ open, onClose, filterQs, defaultEmail, onSaved }: { open: boolean; onClose: () => void; filterQs: string; defaultEmail: string; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState(defaultEmail);
  const [frequency, setFrequency] = React.useState<"LIVE" | "HOURLY" | "DAILY">("HOURLY");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) { setName(""); setEmail(defaultEmail); setFrequency("HOURLY"); }
  }, [open, defaultEmail]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData();
    fd.set("name", name);
    fd.set("filters", filterQs);
    fd.set("email", email);
    fd.set("frequency", frequency);
    const res = await createActivitySubscription(fd);
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error ?? "Couldn't subscribe");
      return;
    }
    toast.success("Subscription created");
    onSaved();
  };

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <form onSubmit={onSubmit}>
        <DialogHeader
          title="Subscribe to filter"
          description="Get an email digest when new events match these filters. Slack delivery is coming."
        />
        <DialogBody>
          <div className="flex flex-col gap-3">
            <Input
              label="Subscription name"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
              placeholder="e.g. Failed payments daily"
              required
              autoFocus
            />
            <Input
              label="Deliver to"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              hint="Defaults to your account email — change to send to a shared alias."
              required
            />
            <Select
              label="Frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.currentTarget.value as "LIVE" | "HOURLY" | "DAILY")}
              options={[
                { value: "LIVE",   label: "Live (every 5 minutes)" },
                { value: "HOURLY", label: "Hourly digest" },
                { value: "DAILY",  label: "Daily digest" },
              ]}
            />
            {filterQs ? (
              <div className="rounded-md border p-2 font-mono text-[10px]"
                   style={{ background: "var(--surface-2)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
                ?{filterQs}
              </div>
            ) : (
              <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                Heads up — no active filters. This subscription will fire on every event. Add a filter first to scope it.
              </div>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={submitting} disabled={!name.trim() || !email.trim()}>Create subscription</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/* ── Sparkline ───────────────────────────────────────────── */

function Sparkline({ values }: { values: number[] }) {
  const w = 280;
  const h = 64;
  if (values.length < 2) {
    return (
      <div className="flex h-16 items-center justify-center text-[11px]" style={{ color: "var(--text-faint)" }}>
        No events in the last hour.
      </div>
    );
  }
  const max = Math.max(1, ...values);
  const stepX = w / (values.length - 1);
  const points = values.map((v, i) => `${i * stepX},${h - 2 - (v / max) * (h - 4)}`).join(" ");
  const total = values.reduce((s, v) => s + v, 0);
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="block w-full" style={{ height: 64 }} aria-label={`${total} events in the last hour`}>
        <polygon points={`0,${h} ${points} ${w},${h}`} fill="var(--brand-500)" fillOpacity={0.14} />
        <polyline points={points} fill="none" stroke="var(--brand-600)" strokeWidth={1.5} />
      </svg>
      <div className="mt-1 text-[11px] font-semibold tabular-nums" style={{ color: "var(--text-default)" }}>
        {total.toLocaleString()} events · peak {Math.max(...values).toLocaleString()}/min
      </div>
    </div>
  );
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const min = 60_000, hour = 60 * min, day = 24 * hour;
  if (ms < min)  return "just now";
  if (ms < hour) return `${Math.floor(ms / min)}m ago`;
  if (ms < day)  return `${Math.floor(ms / hour)}h ago`;
  return `${Math.floor(ms / day)}d ago`;
}
