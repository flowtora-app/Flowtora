"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, Input, Select, useToast, Badge } from "@/components/ui";
import {
  setReportUserState,
  createReportSchedule,
  deleteReportSchedule,
  toggleReportSchedulePause,
} from "@/app/actions/reports";

// Header-row controls for a single report — favorite, pin, schedule.
//
// Wraps the design-system Button + Dialog primitives; the page server
// component renders this as a small island above the chart so we keep
// the rest of the detail view server-rendered.

export interface ScheduleRow {
  id: string;
  name: string;
  recipients: string;
  format: "HTML_EMAIL" | "CSV" | "PDF";
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "CRON";
  paused: boolean;
  lastDeliveredAt: string | null;
  cronExpression: string | null;
  timeOfDay: string;
  timezone: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
}

export interface ReportHeaderActionsProps {
  reportKey: string;
  reportName: string;
  isFavorite: boolean;
  isPinned: boolean;
  filterQs: string;
  schedules: ScheduleRow[];
  defaultRecipientEmail: string;
}

export function ReportHeaderActions({
  reportKey,
  reportName,
  isFavorite,
  isPinned,
  filterQs,
  schedules,
  defaultRecipientEmail,
}: ReportHeaderActionsProps) {
  const router = useRouter();
  const toast = useToast();
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [schedulesPanelOpen, setSchedulesPanelOpen] = React.useState(false);

  const setBoolFlag = async (which: "isFavorite" | "isPinned", on: boolean) => {
    const fd = new FormData();
    fd.set("reportKey", reportKey);
    fd.set(which, on ? "on" : "off");
    const res = await setReportUserState(fd);
    if (!res.ok) toast.error(res.error ?? "Couldn't update");
    else router.refresh();
  };

  const exportCsv = `/api/platform/reports/${reportKey}/export?format=csv${filterQs ? `&${filterQs}` : ""}`;
  const exportJson = `/api/platform/reports/${reportKey}/export?format=json${filterQs ? `&${filterQs}` : ""}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setBoolFlag("isFavorite", !isFavorite)}
        className="ts-focus inline-flex h-8 items-center gap-1 rounded-md border px-2 text-[12px] font-medium"
        title={isFavorite ? "Unfavorite" : "Favorite"}
        style={{
          background: isFavorite ? "var(--amber-50)" : "var(--surface-1)",
          color: isFavorite ? "var(--amber-700)" : "var(--text-default)",
          borderColor: "var(--border-default)",
        }}
      >
        <span aria-hidden>⭐</span>
        {isFavorite ? "Favorited" : "Favorite"}
      </button>
      <button
        type="button"
        onClick={() => setBoolFlag("isPinned", !isPinned)}
        className="ts-focus inline-flex h-8 items-center gap-1 rounded-md border px-2 text-[12px] font-medium"
        title={isPinned ? "Unpin" : "Pin to top"}
        style={{
          background: isPinned ? "var(--brand-50)" : "var(--surface-1)",
          color: isPinned ? "var(--brand-700)" : "var(--text-default)",
          borderColor: "var(--border-default)",
        }}
      >
        <span aria-hidden>📌</span>
        {isPinned ? "Pinned" : "Pin"}
      </button>
      <Button size="sm" variant="secondary" onClick={() => setScheduleOpen(true)}>Schedule</Button>
      {schedules.length > 0 && (
        <Button size="sm" variant="ghost" onClick={() => setSchedulesPanelOpen((o) => !o)}>
          {schedules.length} schedule{schedules.length === 1 ? "" : "s"}
        </Button>
      )}
      <Link href={exportCsv}>
        <Button size="sm" variant="ghost">Export CSV</Button>
      </Link>
      <Link href={exportJson}>
        <Button size="sm" variant="ghost">Export JSON</Button>
      </Link>

      {schedulesPanelOpen && (
        <SchedulePanel
          reportKey={reportKey}
          schedules={schedules}
          onClose={() => setSchedulesPanelOpen(false)}
        />
      )}

      <ScheduleModal
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        reportKey={reportKey}
        reportName={reportName}
        filterQs={filterQs}
        defaultEmail={defaultRecipientEmail}
        onSaved={() => { setScheduleOpen(false); router.refresh(); }}
      />
    </div>
  );
}

/* ── Schedule modal ──────────────────────────────────────── */

function ScheduleModal({
  open,
  onClose,
  reportKey,
  reportName,
  filterQs,
  defaultEmail,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  reportKey: string;
  reportName: string;
  filterQs: string;
  defaultEmail: string;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = React.useState(`${reportName} — daily`);
  const [recipients, setRecipients] = React.useState(defaultEmail);
  const [format, setFormat] = React.useState<"HTML_EMAIL" | "CSV">("HTML_EMAIL");
  const [frequency, setFrequency] = React.useState<"DAILY" | "WEEKLY" | "MONTHLY" | "CRON">("DAILY");
  const [dayOfWeek, setDayOfWeek] = React.useState("1");   // Mon
  const [dayOfMonth, setDayOfMonth] = React.useState("1");
  const [timeOfDay, setTimeOfDay] = React.useState("09:00");
  const [cron, setCron] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setName(`${reportName} — daily`);
      setRecipients(defaultEmail);
      setFormat("HTML_EMAIL");
      setFrequency("DAILY");
      setDayOfWeek("1");
      setDayOfMonth("1");
      setTimeOfDay("09:00");
      setCron("");
    }
  }, [open, reportName, defaultEmail]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    const fd = new FormData();
    fd.set("reportKey", reportKey);
    fd.set("name", name);
    fd.set("recipients", recipients);
    fd.set("filters", filterQs);
    fd.set("format", format);
    fd.set("frequency", frequency);
    if (frequency === "WEEKLY")  fd.set("dayOfWeek", dayOfWeek);
    if (frequency === "MONTHLY") fd.set("dayOfMonth", dayOfMonth);
    if (frequency === "CRON")    fd.set("cron", cron);
    fd.set("timeOfDay", timeOfDay);
    const res = await createReportSchedule(fd);
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error ?? "Couldn't create schedule");
      return;
    }
    toast.success("Schedule created");
    onSaved();
  };

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <form onSubmit={onSubmit}>
        <DialogHeader title="Schedule report delivery" description="Email a snapshot of this report on a recurring cadence." />
        <DialogBody>
          <div className="flex flex-col gap-3">
            <Input label="Schedule name" value={name} onChange={(e) => setName(e.currentTarget.value)} required autoFocus />
            <Input
              label="Recipients (comma-separated)"
              value={recipients}
              onChange={(e) => setRecipients(e.currentTarget.value)}
              placeholder="alice@flowtora.com, finance@example.com"
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Format"
                value={format}
                onChange={(e) => setFormat(e.currentTarget.value as "HTML_EMAIL" | "CSV")}
                options={[
                  { value: "HTML_EMAIL", label: "Inline HTML email" },
                  { value: "CSV",        label: "CSV attachment" },
                ]}
                hint="PDF reserved for a future slice"
              />
              <Select
                label="Frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.currentTarget.value as "DAILY" | "WEEKLY" | "MONTHLY" | "CRON")}
                options={[
                  { value: "DAILY",   label: "Daily" },
                  { value: "WEEKLY",  label: "Weekly" },
                  { value: "MONTHLY", label: "Monthly" },
                  { value: "CRON",    label: "Custom CRON" },
                ]}
              />
            </div>
            {frequency === "WEEKLY" && (
              <Select
                label="Day of week"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.currentTarget.value)}
                options={[
                  { value: "0", label: "Sunday" },
                  { value: "1", label: "Monday" },
                  { value: "2", label: "Tuesday" },
                  { value: "3", label: "Wednesday" },
                  { value: "4", label: "Thursday" },
                  { value: "5", label: "Friday" },
                  { value: "6", label: "Saturday" },
                ]}
              />
            )}
            {frequency === "MONTHLY" && (
              <Input label="Day of month (1–28)" type="number" min={1} max={28}
                value={dayOfMonth} onChange={(e) => setDayOfMonth(e.currentTarget.value)} />
            )}
            {frequency === "CRON" ? (
              <Input
                label="CRON expression (UTC)"
                value={cron}
                onChange={(e) => setCron(e.currentTarget.value)}
                placeholder="0 9 * * 1-5"
                hint="5-field standard CRON. Runs are scheduled to the nearest hour by the cron job."
              />
            ) : (
              <Input
                label="Time of day (HH:MM, UTC)"
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.currentTarget.value)}
                placeholder="09:00"
              />
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={submitting} disabled={!name.trim() || !recipients.trim()}>Create schedule</Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

/* ── Schedule list panel (inline) ─────────────────────────── */

function SchedulePanel({
  reportKey,
  schedules,
  onClose,
}: {
  reportKey: string;
  schedules: ScheduleRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  void reportKey;
  return (
    <div
      className="absolute right-4 z-20 mt-12 w-[420px] rounded-lg border p-3 shadow-lg"
      style={{ background: "var(--surface-1)", borderColor: "var(--border-default)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[12px] font-semibold" style={{ color: "var(--text-default)" }}>Active schedules</div>
        <button onClick={onClose} className="ts-focus text-[14px]" aria-label="Close" style={{ color: "var(--text-faint)" }}>×</button>
      </div>
      {schedules.length === 0 ? (
        <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>No schedules yet.</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {schedules.map((s) => (
            <li key={s.id} className="rounded-md border p-2"
                style={{ borderColor: "var(--border-subtle)" }}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-medium" style={{ color: "var(--text-default)" }}>{s.name}</span>
                {s.paused && <Badge size="xs" color="neutral">Paused</Badge>}
              </div>
              <div className="mt-1 truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                {s.recipients} · {s.frequency.toLowerCase()}
                {s.frequency === "CRON" && s.cronExpression ? ` (${s.cronExpression})` : ""}
                {" · "}{s.format.replace("_", " ").toLowerCase()}
                {s.lastDeliveredAt ? ` · last sent ${new Date(s.lastDeliveredAt).toLocaleString()}` : ""}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <form action={async (fd) => {
                  const res = await toggleReportSchedulePause(fd);
                  if (!res.ok) toast.error(res.error ?? "Couldn't toggle");
                  else { toast.success(s.paused ? "Resumed" : "Paused"); router.refresh(); }
                }}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="ts-focus text-[11px] hover:underline" style={{ color: "var(--text-muted)" }}>
                    {s.paused ? "Resume" : "Pause"}
                  </button>
                </form>
                <form action={async (fd) => {
                  const res = await deleteReportSchedule(fd);
                  if (!res.ok) toast.error(res.error ?? "Couldn't delete");
                  else { toast.success("Schedule removed"); router.refresh(); }
                }}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="ts-focus text-[11px] hover:underline" style={{ color: "var(--rose-700)" }}>Delete</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
