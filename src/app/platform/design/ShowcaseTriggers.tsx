"use client";

import * as React from "react";
import {
  Button,
  Banner,
  ColorPicker,
  Combobox,
  CommandPalette,
  ConfirmDialog,
  DatePicker,
  DateRangePicker,
  Drawer,
  FileUpload,
  FilterBar,
  ImageLightbox,
  MentionInput,
  MultiCombobox,
  NotificationCenter,
  type NotificationItem,
  OtpInput,
  Pagination,
  PillFilterChips,
  RichTextToolbar,
  type RtCommand,
  ScheduleCalendar,
  SearchWithSuggestions,
  type Suggestion,
  TagsInput,
  TenantSwitcher,
  type TenantOption,
  TimePicker,
  type TimeValue,
  UserMenu,
  useToast,
  type DateRange,
} from "@/components/ui";

// Interactive demos for the design system page. The page itself is a
// server component; this client wrapper holds open/close state for
// modals/drawers and exposes one button per scenario.

export function ConfirmTriggers() {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [destructiveOpen, setDestructiveOpen] = React.useState(false);

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(true)}>
        Confirmation
      </Button>
      <Button variant="destructive" size="sm" onClick={() => setDestructiveOpen(true)}>
        Destructive (type-to-confirm)
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Send invitations?"
        description="Three team members will receive a sign-in link by email. They'll have 7 days to accept."
        confirmLabel="Send invites"
        onConfirm={() => {
          // demo: simulate async work
          return new Promise((resolve) => setTimeout(() => { setConfirmOpen(false); resolve(); }, 800));
        }}
      />
      <ConfirmDialog
        open={destructiveOpen}
        onClose={() => setDestructiveOpen(false)}
        variant="destructive"
        title="Delete tenant ACME-SIGNS?"
        description="60 invoices and all related data will be retained for 7 years for compliance, but the tenant will lose access immediately. Type the tenant's slug to confirm."
        typeToConfirm="acme-signs"
        confirmLabel="Delete tenant"
        onConfirm={() => {
          return new Promise((resolve) => setTimeout(() => { setDestructiveOpen(false); resolve(); }, 800));
        }}
      />
    </div>
  );
}

export function DrawerTriggers() {
  const [right, setRight] = React.useState(false);
  const [left, setLeft] = React.useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={() => setRight(true)}>
        Right drawer
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setLeft(true)}>
        Left drawer
      </Button>
      <Drawer
        open={right}
        onOpenChange={setRight}
        side="right"
        size="md"
        title="Tenant filters"
        description="Filter the tenant list by health, plan, and cohort."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setRight(false)}>
              Reset
            </Button>
            <Button size="sm" onClick={() => setRight(false)}>
              Apply
            </Button>
          </>
        }
      >
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Drawer body content goes here. Spec §0.5.29 — header sticky,
          tabs optional, body scrolls, footer sticky.
        </p>
      </Drawer>
      <Drawer
        open={left}
        onOpenChange={setLeft}
        side="left"
        size="sm"
        title="Quick nav"
      >
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Left drawer — useful for secondary nav sheets.
        </p>
      </Drawer>
    </div>
  );
}

export function ToastTriggers() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" size="sm" onClick={() => toast.success("Saved.")}>
        Success
      </Button>
      <Button variant="secondary" size="sm" onClick={() => toast.info("Invite sent", { description: "They'll get a sign-in link by email." })}>
        Info
      </Button>
      <Button variant="secondary" size="sm" onClick={() => toast.warning("Plan limit approaching", { description: "85% of monthly quotes used." })}>
        Warning
      </Button>
      <Button variant="secondary" size="sm" onClick={() => toast.error("Couldn't save", { description: "Network error — try again in a moment." })}>
        Error
      </Button>
      <Button variant="secondary" size="sm" onClick={() => toast.loading("Importing tenants…")}>
        Loading
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={() =>
          toast.promise(
            new Promise<{ count: number }>((res) => setTimeout(() => res({ count: 47 }), 1500)),
            {
              loading: "Generating report…",
              success: (data) => `Got ${data.count} rows.`,
              error:   () => "Report failed to generate.",
            },
          )
        }
      >
        Promise
      </Button>
    </div>
  );
}

/* ── Pagination demo ───────────────────────────────────────── */

export function PaginationDemos() {
  const [page1, setPage1] = React.useState(3);
  const [size1, setSize1] = React.useState(25);
  const [page2, setPage2] = React.useState(7);
  const [size2, setSize2] = React.useState(50);
  const [page3, setPage3] = React.useState(1);
  return (
    <div className="space-y-4">
      <Pagination
        variant="numbered"
        page={page1}
        pageSize={size1}
        total={1247}
        onPageChange={setPage1}
        onPageSizeChange={setSize1}
      />
      <Pagination
        variant="prev-next"
        page={page2}
        pageSize={size2}
        total={50_000}
        onPageChange={setPage2}
        onPageSizeChange={setSize2}
      />
      <Pagination
        variant="load-more"
        page={page3}
        pageSize={20}
        total={120}
        onPageChange={setPage3}
      />
    </div>
  );
}

/* ── PillFilterChips demo ──────────────────────────────────── */

export function PillFilterChipsDemos() {
  const [single, setSingle] = React.useState<string | null>("active");
  const [multi, setMulti] = React.useState<string[]>(["growth", "pro"]);
  return (
    <div className="space-y-4">
      <PillFilterChips
        mode="single"
        label="Status"
        value={single}
        onChange={setSingle}
        options={[
          { value: "all",      label: "All",      count: 1247 },
          { value: "active",   label: "Active",   count: 1014 },
          { value: "trialing", label: "Trialing", count: 189 },
          { value: "past_due", label: "Past due", count: 27 },
          { value: "suspended", label: "Suspended", count: 17 },
        ]}
      />
      <PillFilterChips
        mode="multi"
        label="Plan"
        value={multi}
        onChange={setMulti}
        options={[
          { value: "starter",    label: "Starter" },
          { value: "growth",     label: "Growth" },
          { value: "pro",        label: "Pro" },
          { value: "enterprise", label: "Enterprise" },
        ]}
      />
    </div>
  );
}

/* ── FilterBar demo ────────────────────────────────────────── */

export function FilterBarDemo() {
  const [query, setQuery] = React.useState("");
  const [filters, setFilters] = React.useState([
    { id: "1", field: "Plan",   operator: "is one of", value: "Pro, Enterprise" },
    { id: "2", field: "Health", operator: "is",        value: "Unhealthy" },
  ]);
  return (
    <FilterBar
      query={query}
      onQueryChange={setQuery}
      searchPlaceholder="Search tenants by name or slug…"
      filters={filters}
      onRemoveFilter={(id) => setFilters((f) => f.filter((x) => x.id !== id))}
      onEditFilter={() => alert("Open edit popover (caller implements)")}
      onAddFilter={() => alert("Open Add-filter menu (caller implements)")}
      onReset={() => { setQuery(""); setFilters([]); }}
      onSaveView={() => alert("Save view (caller implements)")}
    />
  );
}

/* ── SearchWithSuggestions demo ────────────────────────────── */

const DEMO_SUGGESTIONS: Suggestion[] = [
  { id: "t1", category: "Tenants", label: "Acme Signs Ltd.",       description: "acme-signs · Pro · 47 orders" },
  { id: "t2", category: "Tenants", label: "Apex Print Co.",        description: "apex-print · Growth · 12 orders" },
  { id: "u1", category: "Users",   label: "Ada Lovelace",          description: "ada@flowtora.com · Admin" },
  { id: "u2", category: "Users",   label: "Alan Turing",           description: "alan@flowtora.com · Member" },
  { id: "i1", category: "Invoices", label: "INV-2026-0042",        description: "$2,499 · Acme Signs Ltd. · paid" },
];

export function SearchWithSuggestionsDemo() {
  const [q, setQ] = React.useState("");
  const filtered = q.trim() === ""
    ? DEMO_SUGGESTIONS
    : DEMO_SUGGESTIONS.filter((s) => s.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="max-w-md">
      <SearchWithSuggestions
        query={q}
        onQueryChange={setQ}
        suggestions={filtered}
        onSelect={(s) => alert(`Selected: ${s.label}`)}
        onSubmit={(query) => alert(`Search submitted: ${query}`)}
        placeholder="Search tenants, users, invoices…"
      />
    </div>
  );
}

/* ── Combobox demos ────────────────────────────────────────── */

const COMBO_OPTIONS = [
  { value: "starter",    label: "Starter",    description: "$49/mo · up to 3 users",  group: "Plans" },
  { value: "growth",     label: "Growth",     description: "$149/mo · up to 10 users", group: "Plans" },
  { value: "pro",        label: "Pro",        description: "$299/mo · unlimited users", group: "Plans" },
  { value: "enterprise", label: "Enterprise", description: "Custom pricing",            group: "Plans" },
];

export function ComboboxDemos() {
  const [single, setSingle] = React.useState<string | null>("growth");
  const [multi, setMulti] = React.useState<string[]>(["growth", "pro"]);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Combobox
        label="Plan"
        value={single}
        onChange={setSingle}
        options={COMBO_OPTIONS}
        recent={["pro"]}
        onCreate={(q) => alert(`Create plan "${q}"`)}
      />
      <MultiCombobox
        label="Compatible plans"
        value={multi}
        onChange={setMulti}
        options={COMBO_OPTIONS}
        hint="Multiple selections render as chips with remove buttons."
      />
    </div>
  );
}

/* ── Date pickers ─────────────────────────────────────────── */

export function DatePickerDemos() {
  const [single, setSingle] = React.useState<Date | null>(new Date());
  const [withTime, setWithTime] = React.useState<Date | null>(new Date());
  const [range, setRange] = React.useState<DateRange>({ start: null, end: null });
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <DatePicker label="Start date"  value={single}  onChange={setSingle} />
      <DatePicker label="With time"   value={withTime} onChange={setWithTime} showTime />
      <DateRangePicker label="Reporting range" value={range} onChange={setRange} />
    </div>
  );
}

export function TimePickerDemo() {
  const [t12, setT12] = React.useState<TimeValue>({ hours: 14, minutes: 30 });
  const [t24, setT24] = React.useState<TimeValue>({ hours: 9, minutes: 0 });
  return (
    <div className="flex flex-wrap items-end gap-6">
      <TimePicker label="12-hour" value={t12} onChange={setT12} format={12} />
      <TimePicker label="24-hour, 15-min step" value={t24} onChange={setT24} format={24} minuteStep={15} />
    </div>
  );
}

/* ── File upload ──────────────────────────────────────────── */

export function FileUploadDemos() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FileUpload variant="drop" multiple accept="image/*,application/pdf" hint="Drag files or click. Max 10MB each." maxSize={10 * 1024 * 1024} />
      <FileUpload variant="button" label="Attach file" />
      <FileUpload variant="avatar" label="Profile photo" hint="JPG or PNG, square works best." accept="image/png,image/jpeg" />
      <FileUpload variant="gallery" multiple accept="image/*" hint="Mock gallery — drop a few images." />
    </div>
  );
}

/* ── Tags input ───────────────────────────────────────────── */

export function TagsInputDemos() {
  const [tags, setTags] = React.useState<string[]>(["vip", "growth", "trial"]);
  const [emails, setEmails] = React.useState<string[]>(["alex@flowtora.com"]);
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <TagsInput
        label="Admin tags"
        value={tags}
        onChange={setTags}
        suggestions={["vip", "at-risk", "growth", "enterprise-pilot", "trial", "churned"]}
        hint="Comma or Enter to commit. Suggestions dropdown filters as you type."
      />
      <TagsInput
        label="Invitee emails"
        value={emails}
        onChange={setEmails}
        validate={(t) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(t) ? null : "Not a valid email"}
        hint="Per-tag validator: invalid entries get a red ring."
      />
    </div>
  );
}

/* ── OTP + ColorPicker ────────────────────────────────────── */

export function OtpDemos() {
  const [code, setCode] = React.useState("");
  const [bad, setBad] = React.useState("123");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <OtpInput value={code} onChange={setCode} length={6} onComplete={(v) => alert(`Got: ${v}`)} />
        <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>Auto-advances; paste-spread; backspace deletes back.</span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <OtpInput value={bad} onChange={setBad} length={6} state="error" />
        <span className="text-[12px]" style={{ color: "var(--rose-700)" }}>Error state — code is incomplete or wrong.</span>
      </div>
    </div>
  );
}

export function ColorPickerDemos() {
  const [color, setColor] = React.useState("#7C3AED");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ColorPicker label="Brand color" value={color} onChange={setColor} recent={["#7C3AED", "#06B6D4", "#10B981", "#F59E0B", "#F43F5E"]} />
    </div>
  );
}

/* ── ScheduleCalendar ─────────────────────────────────────── */

export function ScheduleCalendarDemo() {
  const [view, setView] = React.useState<"month" | "week" | "day">("month");
  const [cursor, setCursor] = React.useState<Date>(new Date());
  const today = new Date();
  const events = [
    { id: "1", title: "Maintenance window", start: new Date(today.getFullYear(), today.getMonth(), 5, 14, 0), color: "var(--amber-500)" },
    { id: "2", title: "Q1 launch announcement", start: new Date(today.getFullYear(), today.getMonth(), 12, 10, 30), color: "var(--brand-500)" },
    { id: "3", title: "Beta cohort review", start: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 9, 0), color: "var(--emerald-500)" },
    { id: "4", title: "All-hands", start: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2, 16, 0) },
    { id: "5", title: "Dunning auto-suspend cutover", start: new Date(today.getFullYear(), today.getMonth(), 22, 0, 0), color: "var(--rose-500)" },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        {(["month", "week", "day"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className="ts-focus inline-flex h-7 items-center rounded-md border px-2 text-[11px] font-medium"
            style={{
              background: view === v ? "var(--surface-2)" : "var(--surface-1)",
              borderColor: "var(--border-default)",
              color: "var(--text-default)",
            }}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
      <ScheduleCalendar view={view} events={events} cursor={cursor} onCursorChange={setCursor} showAgenda />
    </div>
  );
}

/* ── NotificationCenter / UserMenu / TenantSwitcher / CommandPalette ── */

export function NotificationCenterDemo() {
  const [open, setOpen] = React.useState(false);
  const items: NotificationItem[] = [
    { id: "1", title: "New tenant signup",       body: "ACME Signs Co. just signed up for the Pro trial.", unread: true,  createdAt: new Date(Date.now() - 5 * 60_000) },
    { id: "2", title: "Failed payment",          body: "Charge for Apex Print Co. declined — card expired.", unread: true,  createdAt: new Date(Date.now() - 32 * 60_000) },
    { id: "3", title: "@you mentioned",          body: "Sarah mentioned you in ticket #428.",               unread: true,  mention: true, createdAt: new Date(Date.now() - 3 * 3600_000) },
    { id: "4", title: "Coupon redemption cap",   body: "LAUNCH2026 reached 100% redeemed.",                 unread: false, createdAt: new Date(Date.now() - 26 * 3600_000) },
    { id: "5", title: "Weekly digest ready",     body: "Your platform-health digest is ready to review.",   unread: false, createdAt: new Date(Date.now() - 5 * 86400_000) },
  ];
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>Open notifications</Button>
      <NotificationCenter
        open={open}
        onOpenChange={setOpen}
        items={items}
        onMarkAllRead={() => alert("Mark all read")}
        viewAllHref="/platform/security"
      />
    </>
  );
}

export function UserMenuDemo() {
  return (
    <UserMenu
      name="Ada Lovelace"
      email="ada@flowtora.com"
      role="Super Admin"
      tenantName="Flowtora HQ"
      items={[
        {
          items: [
            { id: "profile",   label: "View profile", icon: <span>👤</span>, onClick: () => alert("Profile") },
            { id: "settings",  label: "Account settings", icon: <span>⚙</span> },
          ],
        },
        {
          items: [
            { id: "switch", label: "Switch organization", icon: <span>⇄</span>, children: [
              { id: "acme",  label: "ACME Signs Co." },
              { id: "apex",  label: "Apex Print Co." },
              { id: "north", label: "Northwind Studio" },
            ]},
            { id: "imp", label: "View as tenant", icon: <span>👁</span> },
          ],
        },
        {
          items: [
            { id: "theme",     label: "Theme",     icon: <span>◐</span>, kbd: "T" },
            { id: "kbd",       label: "Keyboard shortcuts", icon: <span>⌘</span>, kbd: "?" },
            { id: "docs",      label: "Documentation", icon: <span>📘</span>, href: "#" },
          ],
        },
        {
          items: [
            { id: "out", label: "Sign out", icon: <span>↩</span>, destructive: true, onClick: () => alert("Sign out") },
          ],
        },
      ]}
      footer={<span>v3.4.2 · <span style={{ color: "var(--emerald-700)" }}>● operational</span></span>}
    />
  );
}

export function TenantSwitcherDemo() {
  const tenants: TenantOption[] = [
    { id: "1", name: "ACME Signs Co.", slug: "acme-signs", meta: "Pro" },
    { id: "2", name: "Apex Print Co.", slug: "apex-print", meta: "Growth" },
    { id: "3", name: "Northwind Studio", slug: "northwind", meta: "Starter" },
    { id: "4", name: "Lakeside Banner Co.", slug: "lakeside", meta: "Trial" },
    { id: "5", name: "Halcyon Press", slug: "halcyon", meta: "Pro" },
  ];
  const [current, setCurrent] = React.useState<TenantOption>(tenants[0]!);
  return (
    <TenantSwitcher
      current={current}
      options={tenants}
      recentIds={["2", "5"]}
      onPick={setCurrent}
      onCreate={() => alert("Create new tenant")}
    />
  );
}

export function CommandPaletteDemo() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Open command palette
        <kbd className="ml-2 rounded bg-white/20 px-1 text-[10px] font-mono">⌘ K</kbd>
      </Button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        recent={[
          { id: "r1", label: "ACME Signs Co.", category: "Recent", description: "tenant · acme-signs", href: "#" },
          { id: "r2", label: "Ada Lovelace",   category: "Recent", description: "user · ada@flowtora.com", href: "#" },
        ]}
        actions={[
          { id: "a1", label: "Create new tenant", category: "Actions", icon: <span>+</span>, onSelect: () => alert("Create tenant") },
          { id: "a2", label: "Send announcement", category: "Actions", icon: <span>📣</span>, onSelect: () => alert("Send announcement") },
          { id: "a3", label: "Toggle dark mode",  category: "Actions", icon: <span>◐</span>, kbd: "T" },
        ]}
        search={(q) => {
          if (!q) return [];
          const all = [
            { id: "t1", label: "ACME Signs Co.", category: "Tenants", description: "acme-signs · Pro" },
            { id: "t2", label: "Apex Print Co.", category: "Tenants", description: "apex-print · Growth" },
            { id: "u1", label: "Ada Lovelace",   category: "Users",   description: "ada@flowtora.com · Admin" },
            { id: "i1", label: "INV-2026-0042",  category: "Invoices", description: "$2,499 · ACME Signs Co." },
            { id: "n1", label: "/platform/billing", category: "Navigation", description: "Billing & Revenue hub" },
          ];
          return all.filter((x) => (x.label + " " + (x.description ?? "")).toLowerCase().includes(q.toLowerCase()));
        }}
      />
    </>
  );
}

/* ── MentionInput ─────────────────────────────────────────── */

export function MentionInputDemo() {
  const [text, setText] = React.useState("Hi @ada, can you take a look at this? cc @sarah");
  return (
    <MentionInput
      label="Comment"
      value={text}
      onChange={setText}
      hint="Type @ to mention a teammate, # for a tag, / for a command."
      triggers={[
        {
          char: "@",
          search: (q) => [
            { id: "ada",   label: "Ada Lovelace",  description: "ada@flowtora.com",   token: "@ada" },
            { id: "alan",  label: "Alan Turing",   description: "alan@flowtora.com",  token: "@alan" },
            { id: "sarah", label: "Sarah Connor",  description: "sarah@flowtora.com", token: "@sarah" },
            { id: "rob",   label: "Robin Hood",    description: "robin@flowtora.com", token: "@rob" },
          ].filter((x) => x.label.toLowerCase().includes(q.toLowerCase())),
        },
        {
          char: "#",
          search: () => [
            { id: "vip", label: "vip" },
            { id: "billing", label: "billing" },
            { id: "p1", label: "p1-incident" },
          ],
        },
      ]}
    />
  );
}

/* ── RichTextToolbar ──────────────────────────────────────── */

export function RichTextToolbarDemo() {
  const [active, setActive] = React.useState<Partial<Record<RtCommand, boolean>>>({ bold: true });
  return (
    <div className="space-y-2">
      <RichTextToolbar
        active={active}
        onCommand={(cmd) => setActive((a) => ({ ...a, [cmd]: !a[cmd] }))}
      />
      <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        Toolbar is presentation-only — it fires onCommand and toggles `active`. The editor body (textarea/contenteditable/tiptap) lives wherever the caller wants it.
      </div>
    </div>
  );
}

/* ── ImageLightbox ────────────────────────────────────────── */

export function ImageLightboxDemo() {
  const [index, setIndex] = React.useState(-1);
  const images = [
    { id: "1", src: "https://images.unsplash.com/photo-1551077720-0e6c5b8a8f3e?w=1200", alt: "Sign installation 1", caption: "Field install — Cleveland storefront" },
    { id: "2", src: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1200", alt: "Sign installation 2", caption: "Vehicle wrap delivery photo" },
    { id: "3", src: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=1200", alt: "Sign installation 3" },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {images.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setIndex(i)}
            className="ts-focus h-16 w-24 overflow-hidden rounded-md border"
            style={{ borderColor: "var(--border-default)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </button>
        ))}
      </div>
      <ImageLightbox images={images} index={index} onIndexChange={setIndex} onClose={() => setIndex(-1)} />
    </div>
  );
}

export function BannerDemos() {
  return (
    <div className="space-y-3">
      <Banner variant="info" layout="inline">
        Inline info — terse callout in flow.
      </Banner>
      <Banner variant="warning" title="Plan limit approaching" cta={{ label: "Upgrade", href: "#" }}>
        85% of your monthly quote allowance has been used. Upgrade to Pro for unlimited quotes.
      </Banner>
      <Banner
        variant="error"
        title="Maintenance window scheduled"
        cta={{ label: "Status page", href: "#" }}
        dismissId="design-demo-maintenance"
      >
        Tonight 02:00–03:00 UTC. The platform will be read-only for ~30 minutes.
      </Banner>
      <Banner variant="success" layout="inline">
        Stripe coupon mirroring is live.
      </Banner>
      <Banner variant="neutral" layout="inline">
        Read-only system message — no tone applied.
      </Banner>
    </div>
  );
}
