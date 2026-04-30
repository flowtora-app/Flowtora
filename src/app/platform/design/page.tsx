import { requirePlatformStaff } from "@/lib/platform";
import {
  Accordion,
  AccordionItem,
  Avatar,
  AvatarGroup,
  Badge,
  Banner,
  Breadcrumb,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CodeBlock,
  EmptyState,
  Input,
  Kbd,
  PageHeader,
  ProgressBar,
  ProgressRing,
  SectionHeader,
  Select,
  Skeleton,
  SkeletonCard,
  SkeletonText,
  Spinner,
  StatusPill,
  Stepper,
  Tabs,
  Textarea,
  ToastProvider,
} from "@/components/ui";
import { DialogTrigger } from "./DialogTrigger";
import {
  BannerDemos,
  ColorPickerDemos,
  ComboboxDemos,
  CommandPaletteDemo,
  ConfirmTriggers,
  DatePickerDemos,
  DrawerTriggers,
  FileUploadDemos,
  FilterBarDemo,
  ImageLightboxDemo,
  MentionInputDemo,
  NotificationCenterDemo,
  OtpDemos,
  PaginationDemos,
  PillFilterChipsDemos,
  RichTextToolbarDemo,
  ScheduleCalendarDemo,
  SearchWithSuggestionsDemo,
  TagsInputDemos,
  TenantSwitcherDemo,
  TimePickerDemo,
  ToastTriggers,
  UserMenuDemo,
} from "./ShowcaseTriggers";
import {
  ActivityFeedItem,
  AuditLogRow,
  CommentThread,
  DiffIndicator,
  DiffViewer,
  HorizontalTimeline,
  JsonViewer,
  MarkdownPreview,
  PullQuote,
  Table,
  VerticalTimeline,
  WebhookEventRow,
  AreaChartCard,
  BarChartCard,
  DonutChartCard,
  GaugeChart,
  LineChartCard,
  type ColumnDef,
} from "@/components/ui";

// /platform/design — design system showcase.
//
// Staff-only reference for every primitive. Two purposes:
//   1. Visual reference — eyeball every variant in one place.
//   2. Regression surface — when tokens or primitives change, scan
//      this page to confirm nothing visually broke.
//
// Sections mirror the Page 0 spec (docs/flowtora-admin-spec.md):
//   0.2 Color, 0.3 Typography → Tokens + Type Scale below
//   0.5 Components            → one Section per primitive

export default async function DesignSystemPage() {
  await requirePlatformStaff();

  return (
    <ToastProvider position="top-right">
      <div className="space-y-10">
        <Header />

        <Section
          title="Color tokens"
          description="11-stop palettes per Spec §0.2 (brand, cyan, amber, slate, emerald, rose, sky). Each stop is also accessible as --brand-50 … --brand-950, etc."
        >
          <PaletteRow name="brand" />
          <PaletteRow name="cyan" />
          <PaletteRow name="amber" />
          <PaletteRow name="slate" />
          <PaletteRow name="emerald" />
          <PaletteRow name="rose" />
          <PaletteRow name="sky" />
        </Section>

        <Section
          title="Semantic tokens"
          description="Theme-aware aliases used by primitives. These flip automatically between light and dark themes."
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <SemanticSwatch label="surface-0" cssVar="--surface-0" />
            <SemanticSwatch label="surface-1" cssVar="--surface-1" />
            <SemanticSwatch label="surface-2" cssVar="--surface-2" />
            <SemanticSwatch label="surface-3" cssVar="--surface-3" />
            <SemanticSwatch label="border-subtle" cssVar="--border-subtle" />
            <SemanticSwatch label="border-default" cssVar="--border-default" />
            <SemanticSwatch label="border-strong" cssVar="--border-strong" />
            <SemanticSwatch label="accent-primary" cssVar="--accent-primary" />
            <SemanticSwatch label="success-fg" cssVar="--success-fg" />
            <SemanticSwatch label="warning-fg" cssVar="--warning-fg" />
            <SemanticSwatch label="danger-fg" cssVar="--danger-fg" />
            <SemanticSwatch label="info-fg" cssVar="--info-fg" />
          </div>
        </Section>

        <Section
          title="Typography"
          description="Spec §0.3 — Inter (variable) for UI + Inter Display for hero metrics, JetBrains Mono for code. Numerics use tabular-nums everywhere."
        >
          <TypeRow token="display-xl" size="3rem"     weight={700} sample="$2.4M MRR" />
          <TypeRow token="display-l"  size="2.25rem"  weight={700} sample="142 active tenants" />
          <TypeRow token="h1"         size="1.875rem" weight={700} sample="Platform overview" />
          <TypeRow token="h2"         size="1.5rem"   weight={600} sample="Recent activity" />
          <TypeRow token="h3"         size="1.25rem"  weight={600} sample="Card heading" />
          <TypeRow token="h4"         size="1.125rem" weight={600} sample="Sub-section" />
          <TypeRow token="body-l"     size="1rem"     weight={400} sample="Long-form copy in modals describing why a destructive action is final." />
          <TypeRow token="body-m"     size="0.875rem" weight={400} sample="Default UI body — most labels and table cells live here." />
          <TypeRow token="body-s"     size="0.8125rem" weight={400} sample="Dense table cells use this." />
          <TypeRow token="caption"    size="0.75rem"  weight={400} sample="Helper text · 2026-04-29 14:32 UTC" />
          <TypeRow token="overline"   size="0.6875rem" weight={600} sample="SECTION DIVIDER" tracked />
          <TypeRow token="code"       size="0.8125rem" weight={400} sample="const flag = await getFeatureFlag('billing.coupons');" mono />
        </Section>

        <Section
          title="Button"
          description="Spec §0.5.1 — 7 variants × 5 sizes. Loading state overlays a spinner without layout shift; disabled drops to opacity-50."
        >
          <Row label="Variants">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="tertiary">Tertiary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </Row>
          <Row label="Sizes">
            <Button size="xs">XS</Button>
            <Button size="sm">SM</Button>
            <Button size="md">MD (default)</Button>
            <Button size="lg">LG</Button>
            <Button size="xl">XL</Button>
          </Row>
          <Row label="States">
            <Button disabled>Disabled</Button>
            <Button loading>Loading</Button>
            <Button leftIcon={<span>↓</span>}>Leading icon</Button>
            <Button rightIcon={<span>→</span>} variant="secondary">Trailing icon</Button>
            <Button kbd="⌘ K">With shortcut</Button>
          </Row>
        </Section>

        <Section
          title="Input · Textarea · Select"
          description="Spec §0.5.3 — sm 32 / md 36 (default) / lg 40 with hover/focus/disabled/invalid/warning states."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input label="Name" placeholder="Ada Lovelace" hint="Shown on invoices." />
            <Input label="Email" type="email" required placeholder="you@example.com" />
            <Input label="Budget" prefix="$" suffix="USD" placeholder="0.00" />
            <Input label="Username" error="That handle is already taken." defaultValue="taken" />
            <Input label="Slug" warning="Unusual characters — proceed if intentional." defaultValue="acme-2026!" />
            <Select
              label="Plan"
              options={[
                { value: "starter", label: "Starter" },
                { value: "pro", label: "Pro" },
                { value: "enterprise", label: "Enterprise" },
              ]}
            />
            <Textarea label="Description" placeholder="Tell us about the project…" hint="Markdown supported." />
          </div>
        </Section>

        <Section
          title="Badge"
          description="Spec §0.5.15 — variant (solid/soft/outline/dot) × color (neutral/brand/accent/success/warning/error/info) × size (xs/sm/md). Optional count + leadingIcon."
        >
          <Row label="Soft (default)">
            <Badge color="neutral">Draft</Badge>
            <Badge color="brand">Brand</Badge>
            <Badge color="accent">Accent</Badge>
            <Badge color="success">Paid</Badge>
            <Badge color="warning">Due soon</Badge>
            <Badge color="error">Overdue</Badge>
            <Badge color="info">Beta</Badge>
          </Row>
          <Row label="Solid">
            <Badge variant="solid" color="brand">Brand</Badge>
            <Badge variant="solid" color="success">Paid</Badge>
            <Badge variant="solid" color="warning">Due soon</Badge>
            <Badge variant="solid" color="error">Overdue</Badge>
            <Badge variant="solid" color="info">Beta</Badge>
          </Row>
          <Row label="Outline">
            <Badge variant="outline" color="brand">Brand</Badge>
            <Badge variant="outline" color="success">Paid</Badge>
            <Badge variant="outline" color="warning">Due soon</Badge>
            <Badge variant="outline" color="error">Overdue</Badge>
          </Row>
          <Row label="Dot">
            <Badge variant="dot" color="success">Online</Badge>
            <Badge variant="dot" color="warning">Pending</Badge>
            <Badge variant="dot" color="error">Failed</Badge>
            <Badge variant="dot" color="neutral">Idle</Badge>
          </Row>
          <Row label="Sizes + count">
            <Badge size="xs" color="brand">XS</Badge>
            <Badge size="sm" color="brand">SM</Badge>
            <Badge size="md" color="brand">MD</Badge>
            <Badge color="error" count={3}>Errors</Badge>
            <Badge color="info" count={147}>Tickets</Badge>
          </Row>
        </Section>

        <Section
          title="Status pill"
          description="Spec §0.5.49 — platform-side tenant statuses. Three variants: dot-only / dot+label / solid filled."
        >
          <Row label="Dot+label (default)">
            <StatusPill status="active" />
            <StatusPill status="trialing" />
            <StatusPill status="past_due" />
            <StatusPill status="suspended" />
            <StatusPill status="cancelled" />
            <StatusPill status="pending" />
            <StatusPill status="failed" />
            <StatusPill status="draft" />
          </Row>
          <Row label="Solid">
            <StatusPill variant="solid" status="active" />
            <StatusPill variant="solid" status="trialing" />
            <StatusPill variant="solid" status="past_due" />
            <StatusPill variant="solid" status="suspended" />
            <StatusPill variant="solid" status="failed" />
          </Row>
          <Row label="Dot only">
            <StatusPill variant="dot-only" status="active" />
            <StatusPill variant="dot-only" status="past_due" />
            <StatusPill variant="dot-only" status="failed" />
          </Row>
        </Section>

        <Section
          title="Avatar"
          description="Spec §0.5.14 — 7 sizes (xs 20 → 3xl 96), initials fallback, optional status dot, group with overflow."
        >
          <Row label="Sizes">
            <Avatar size="xs" name="Ada Lovelace" />
            <Avatar size="sm" name="Ada Lovelace" />
            <Avatar size="md" name="Ada Lovelace" />
            <Avatar size="lg" name="Ada Lovelace" />
            <Avatar size="xl" name="Ada Lovelace" />
            <Avatar size="2xl" name="Ada Lovelace" />
            <Avatar size="3xl" name="Ada Lovelace" />
          </Row>
          <Row label="Status dot">
            <Avatar name="Online User" status="online" />
            <Avatar name="Away User" status="away" />
            <Avatar name="Offline User" status="offline" />
            <Avatar name="Errored User" status="error" />
            <Avatar name="Imp User" status="impersonating" />
          </Row>
          <Row label="Group">
            <AvatarGroup max={3}>
              <Avatar name="Alex Anderson" />
              <Avatar name="Brooke Baker" />
              <Avatar name="Cassidy Chen" />
              <Avatar name="Devin Diaz" />
              <Avatar name="Emerson Eaton" />
              <Avatar name="Finley Frost" />
            </AvatarGroup>
          </Row>
        </Section>

        <Section
          title="Kbd"
          description="Spec §0.5.37 — keyboard shortcut chip. Auto-detects Mac vs Win for the modifier symbol (⌘ vs Ctrl)."
        >
          <Row label="Single keys">
            <Kbd keys={["mod", "k"]} /> Open command palette
          </Row>
          <Row label="With modifier">
            <Kbd keys={["shift", "n"]} /> New tenant
          </Row>
          <Row label="Literal">
            <Kbd>⌘ ↵</Kbd> Submit
          </Row>
        </Section>

        <Section
          title="Card"
          description="Spec §0.5.18 — variants default / elevated / interactive / gradient + padding scale none/sm/md/lg."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card padding="md">
              <div className="text-sm font-semibold">Default</div>
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                surface-1 + subtle border. The workhorse.
              </p>
            </Card>
            <Card elevation="elevated" padding="md">
              <div className="text-sm font-semibold">Elevated</div>
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                surface-2 + shadow-md. Stands forward.
              </p>
            </Card>
            <Card elevation="interactive" padding="md">
              <div className="text-sm font-semibold">Interactive</div>
              <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                Hover lifts to shadow-md. For clickable cards.
              </p>
            </Card>
            <Card elevation="gradient" padding="md">
              <div className="text-sm font-semibold" style={{ color: "var(--brand-900)" }}>Gradient</div>
              <p className="mt-1 text-xs" style={{ color: "var(--brand-700)" }}>
                Brand soft tint. Use sparingly for highlights.
              </p>
            </Card>
          </div>
          <Card>
            <CardHeader title="Composed card" description="Header + Body + Footer slots." />
            <CardBody>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Slot pattern keeps spacing consistent regardless of content.
              </p>
            </CardBody>
            <CardFooter>
              <Button variant="secondary" size="sm">Cancel</Button>
              <Button size="sm">Save</Button>
            </CardFooter>
          </Card>
        </Section>

        <Section
          title="Banner / Alert"
          description="Spec §0.5.31 — info/success/warning/error/neutral × inline/full layouts. Use dismissId to persist user dismissal."
        >
          <BannerDemos />
        </Section>

        <Section
          title="Tabs"
          description="Spec §0.5.22 — line / pill / segmented variants × sm / md / lg sizes. Link-based for server components."
        >
          <Row label="Line (default)">
            <div style={{ width: "100%" }}>
              <Tabs
                variant="line"
                activeHref="/platform/design"
                items={[
                  { label: "Overview", href: "/platform" },
                  { label: "Tenants", href: "/platform/tenants" },
                  { label: "Design system", href: "/platform/design", badge: "A" },
                  { label: "Audit log", href: "/platform/audit" },
                ]}
              />
            </div>
          </Row>
          <Row label="Pill">
            <div style={{ width: "100%" }}>
              <Tabs
                variant="pill"
                activeHref="/platform/design"
                items={[
                  { label: "All", href: "#" },
                  { label: "Active", href: "#" },
                  { label: "Trial", href: "#" },
                  { label: "Past due", href: "/platform/design", badge: 3 },
                ]}
              />
            </div>
          </Row>
          <Row label="Segmented">
            <div style={{ width: "100%" }}>
              <Tabs
                variant="segmented"
                size="sm"
                activeHref="/platform/design"
                items={[
                  { label: "Day", href: "#" },
                  { label: "Week", href: "/platform/design" },
                  { label: "Month", href: "#" },
                  { label: "Year", href: "#" },
                ]}
              />
            </div>
          </Row>
        </Section>

        <Section
          title="Accordion"
          description="Spec §0.5.23 — single/multi mode × boxed/bordered/ghost variants. Animated 200ms panel transition."
        >
          <Row label="Boxed (default)">
            <div style={{ width: "100%" }}>
              <Accordion mode="single" defaultOpen={["billing"]}>
                <AccordionItem id="billing" trigger="Billing & Revenue" helper="3 alerts">
                  Configure plan changes, refunds, dunning, and coupon issuance.
                </AccordionItem>
                <AccordionItem id="security" trigger="Security & access" helper="0 alerts">
                  Manage staff roles, audit log, and impersonation rules.
                </AccordionItem>
                <AccordionItem id="comms" trigger="Communications" helper="1 alert">
                  Transactional templates and announcement broadcasts.
                </AccordionItem>
              </Accordion>
            </div>
          </Row>
          <Row label="Bordered">
            <div style={{ width: "100%" }}>
              <Accordion variant="bordered" mode="multi">
                <AccordionItem id="a" trigger="What's new this week">
                  Recent changes ship here.
                </AccordionItem>
                <AccordionItem id="b" trigger="Roadmap">
                  Quarter-by-quarter plan.
                </AccordionItem>
              </Accordion>
            </div>
          </Row>
        </Section>

        <Section
          title="Stepper / Wizard"
          description="Spec §0.5.24 — completed dots emerald-500 + check; current dot brand-600 ring; error rose ring + ! glyph."
        >
          <Row label="Horizontal">
            <div style={{ width: "100%" }}>
              <Stepper
                orientation="horizontal"
                currentStep={2}
                steps={[
                  { id: "tenant",   title: "Pick tenant", description: "Acme Signs Ltd." },
                  { id: "plan",     title: "Plan",        description: "Pro · annual" },
                  { id: "review",   title: "Review",      description: "Confirm details" },
                  { id: "complete", title: "Complete",    description: "Send invite" },
                ]}
              />
            </div>
          </Row>
          <Row label="With error">
            <div style={{ width: "100%" }}>
              <Stepper
                orientation="horizontal"
                steps={[
                  { id: "a", title: "Identity",   state: "completed" },
                  { id: "b", title: "Payment",    state: "error", description: "Card declined" },
                  { id: "c", title: "Confirm",    state: "upcoming" },
                ]}
              />
            </div>
          </Row>
        </Section>

        <Section
          title="Breadcrumb"
          description={'Spec §0.5.25 — "/" separator, last item non-link, previous items text-link.'}
        >
          <Breadcrumb
            items={[
              { label: "Platform", href: "/platform" },
              { label: "Tenants", href: "/platform/tenants" },
              { label: "Acme Signs Ltd." },
            ]}
          />
        </Section>

        <Section
          title="Page & section headers"
          description="Hierarchy primitives. PageHeader uses h1, SectionHeader uses h2."
        >
          <Card padding="md">
            <PageHeader
              eyebrow="Customers"
              title="Acme Signs Ltd."
              description="Last activity 2 days ago · 47 orders lifetime"
              actions={
                <>
                  <Button variant="secondary" size="sm">Edit</Button>
                  <Button size="sm">New order</Button>
                </>
              }
            />
            <div className="mt-6">
              <SectionHeader
                title="Open orders"
                description="Orders in production or waiting for proof."
                actions={<Button variant="ghost" size="sm">View all</Button>}
              />
            </div>
          </Card>
        </Section>

        <Section
          title="Empty state"
          description="Spec §0.5.32 — illustration + heading + body + primary CTA + optional secondary."
        >
          <Card>
            <EmptyState
              icon={<span style={{ fontSize: 22 }}>📦</span>}
              title="No orders yet"
              description="When a customer accepts a quote, the order will appear here with its production status."
              action={<Button size="sm">Create test order</Button>}
              secondary={<Button variant="link" size="sm">Learn about orders</Button>}
            />
          </Card>
        </Section>

        <Section
          title="Spinner"
          description="Spec §0.5.35 — xs 12 / sm 16 / md 20 / lg 24 / xl 32. Inherits text color so it works inside any button."
        >
          <Row label="Sizes">
            <Spinner size="xs" />
            <Spinner size="sm" />
            <Spinner size="md" />
            <Spinner size="lg" />
            <Spinner size="xl" />
          </Row>
          <Row label="Tones">
            <Spinner size="md" tone="current" />
            <Spinner size="md" tone="muted" />
            <Spinner size="md" tone="accent" />
          </Row>
        </Section>

        <Section
          title="Progress bar"
          description="Spec §0.5.34 — sm 4 / md 6 / lg 8 height; striped variant for in-progress; indeterminate for unknown ETAs."
        >
          <div className="space-y-3">
            <ProgressBar value={32} label="Activation" showValue size="sm" />
            <ProgressBar value={68} label="Quotes used" showValue tone="warning" />
            <ProgressBar value={91} label="Storage quota" showValue tone="danger" size="lg" />
            <ProgressBar value={47} label="Importing tenants" showValue striped />
            <ProgressBar indeterminate label="Working…" />
          </div>
        </Section>

        <Section
          title="Progress ring"
          description="Spec §0.5.34 — sm 24 / md 40 / lg 64. Stroke 4px; with center number/percent label."
        >
          <Row label="Sizes">
            <ProgressRing size="sm" value={42} />
            <ProgressRing size="md" value={68} showValue />
            <ProgressRing size="lg" value={91} showValue />
          </Row>
          <Row label="Tones">
            <ProgressRing size="md" value={75} tone="accent" showValue />
            <ProgressRing size="md" value={100} tone="success" label="Done" />
            <ProgressRing size="md" value={20} tone="warning" showValue />
            <ProgressRing size="md" value={5} tone="danger" showValue />
            <ProgressRing size="md" indeterminate aria-label="Loading" />
          </Row>
        </Section>

        <Section
          title="Pagination"
          description="Spec §0.5.21 — numbered (default) / prev-next / load-more. Per-page 10/25/50/100/250; jump-to-page when pages > 20."
        >
          <PaginationDemos />
        </Section>

        <Section
          title="Pill filter chips"
          description="Spec §0.5.45 — single-select toggles others off, multi-select toggles individually. Optional count badge."
        >
          <PillFilterChipsDemos />
        </Section>

        <Section
          title="Filter bar"
          description="Spec §0.5.43 — search + active chips + Add filter + Reset + Save view. Caller drives the Add-filter and edit popovers."
        >
          <FilterBarDemo />
        </Section>

        <Section
          title="Search with suggestions"
          description="Spec §0.5.44 — typeahead with categorized results. ↑↓ to navigate, Enter to pick, Esc closes. Match is bolded."
        >
          <SearchWithSuggestionsDemo />
        </Section>

        <Section
          title="Code block"
          description="Spec §0.5.36 — language tab + filename + copy + line numbers + diff highlighting. Shiki syntax highlighting deferred."
        >
          <div className="space-y-4">
            <CodeBlock
              language="ts"
              filename="src/lib/billing.ts"
              lineNumbers
              wrapToggle
              code={`async function applyCouponToTenant(tenantId: string, couponCode: string) {
  const coupon = await db.coupon.findUnique({ where: { code: couponCode } });
  if (!coupon || coupon.status !== "ACTIVE") return null;
  await db.tenant.update({
    where: { id: tenantId },
    data: { activeCouponId: coupon.id },
  });
  return coupon;
}`}
            />
            <CodeBlock
              language="diff"
              filename="auth.ts"
              code={[
                { text: "import NextAuth from \"next-auth\";", kind: "normal" },
                { text: "import Credentials from \"next-auth/providers/credentials\";", kind: "normal" },
                { text: "import GitHub from \"next-auth/providers/github\";", kind: "removed" },
                { text: "import Resend from \"next-auth/providers/resend\";", kind: "added" },
                { text: "", kind: "normal" },
                { text: "export const { handlers, signIn, signOut, auth } = NextAuth({", kind: "normal" },
                { text: "  providers: [Credentials({ ... }), Resend({ ... })],", kind: "added" },
                { text: "  providers: [Credentials({ ... }), GitHub({ ... })],", kind: "removed" },
                { text: "});", kind: "normal" },
              ]}
            />
          </div>
        </Section>

        <Section
          title="Skeleton"
          description="Spec §0.5.33 — loading shimmer; collapses to a static pulse under prefers-reduced-motion."
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card padding="md">
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10" rounded="full" />
                <div className="flex-1">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                </div>
              </div>
            </Card>
            <Card padding="md">
              <SkeletonText lines={4} />
            </Card>
            <SkeletonCard />
          </div>
        </Section>

        <Section
          title="Dialog"
          description="Spec §0.5.28 — sm 400 / md 560 (default) / lg 720 / xl 960 / 2xl 1200 / full. Body scrolls at 70vh."
        >
          <DialogTrigger />
        </Section>

        <Section
          title="Confirm dialogs"
          description="Spec §0.5.28 confirmation + destructive variants. Destructive requires type-to-confirm."
        >
          <ConfirmTriggers />
        </Section>

        <Section
          title="Drawer / Slide-over"
          description="Spec §0.5.29 — sides right (default) / left. Bottom kept as a non-spec mobile extension."
        >
          <DrawerTriggers />
        </Section>

        <Section
          title="Toast"
          description="Spec §0.5.30 — info / success / warning / error / loading + promise API. 5s auto-dismiss; 10s for error; pause on hover; max-stack 5."
        >
          <ToastTriggers />
        </Section>

        {/* ── Slice 5 — Specialized inputs ───────────────────── */}

        <Section
          title="Combobox · MultiCombobox"
          description="Spec §0.5.5 — searchable single/multi select with keyboard nav, async load (250ms debounce), Recent section, Create CTA."
        >
          <ComboboxDemos />
        </Section>

        <Section
          title="Date pickers"
          description="Spec §0.5.6 — single date, optional time picker, two-month range with preset sidebar."
        >
          <DatePickerDemos />
        </Section>

        <Section
          title="Time picker"
          description="Spec §0.5.7 — 12h / 24h spinners, AM/PM toggle, configurable minute step."
        >
          <TimePickerDemo />
        </Section>

        <Section
          title="File upload"
          description="Spec §0.5.8 — drop / button / avatar / gallery variants. Idle / uploading / success / error states."
        >
          <FileUploadDemos />
        </Section>

        <Section
          title="Tags input"
          description="Spec §0.5.11 — comma/Enter to commit, paste-multi, per-tag validator with red ring, suggestions dropdown."
        >
          <TagsInputDemos />
        </Section>

        <Section
          title="OTP input"
          description="Spec §0.5.12 — 6 boxes, auto-advance, paste-spread, error/success states."
        >
          <OtpDemos />
        </Section>

        <Section
          title="Color picker"
          description="Spec §0.5.13 — swatch + hex input, SV pad, hue slider, RGB readout, recent row, browser EyeDropper."
        >
          <ColorPickerDemos />
        </Section>

        {/* ── Slice 6 — Tables & charts ─────────────────────── */}

        <Section
          title="Table"
          description="Spec §0.5.20 — sticky header, sortable columns, selectable rows with bulk bar, expandable rows, sticky-left, density, striped variant."
        >
          <TableDemo />
        </Section>

        <Section
          title="Schedule calendar"
          description="Spec §0.5.39 — month / week / day views with event chips and today indicator. Optional Upcoming agenda."
        >
          <ScheduleCalendarDemo />
        </Section>

        <Section
          title="Charts"
          description="Spec §0.5.40 — Line / Area / Bar / Donut / Gauge wrappers around Recharts with the spec's tooltip + axis + legend defaults baked in."
        >
          <ChartsDemo />
        </Section>

        {/* ── Slice 7 — Menus & overlays cont. ──────────────── */}

        <Section
          title="Notification center"
          description="Spec §0.5.46 — slide-over right with All / Unread / Mentions tabs, date-grouped items, mark-read + dismiss actions."
        >
          <NotificationCenterDemo />
        </Section>

        <Section
          title="User menu"
          description="Spec §0.5.47 — avatar trigger, identity header, item sections with dividers, submenu support, kbd shortcuts, destructive items."
        >
          <UserMenuDemo />
        </Section>

        <Section
          title="Tenant switcher"
          description="Spec §0.5.48 — searchable list with Recent + All sections, current tenant indicator, Create-new footer link."
        >
          <TenantSwitcherDemo />
        </Section>

        <Section
          title="Command palette"
          description="Spec §0.5.42 — ⌘K / Ctrl+K to open. Recent + Actions when empty; async results grouped by category. ↑↓ to navigate, ↵ to pick."
        >
          <CommandPaletteDemo />
        </Section>

        {/* ── Slice 8 — Rich content ────────────────────────── */}

        <Section
          title="JSON viewer"
          description="Spec §0.5.61 — collapsible nested keys, line numbers, search, copy-path / copy-value. Brand-coloured types."
        >
          <JsonViewerDemo />
        </Section>

        <Section
          title="Diff viewer"
          description="Spec §0.5.38 — line-level LCS, unified + split variants, hunk collapse, +/− markers."
        >
          <DiffViewerDemo />
        </Section>

        <Section
          title="Mention input"
          description="Spec §0.5.55 — @ for mentions, # for tags, / for commands. Caller drives per-trigger search."
        >
          <MentionInputDemo />
        </Section>

        <Section
          title="Rich-text toolbar"
          description="Spec §0.5.56 — text style / heading / list / block / insert groups. Caller wires the editor body."
        >
          <RichTextToolbarDemo />
        </Section>

        <Section
          title="Markdown preview"
          description="Spec §0.5.57 — in-house parser (no remark/react-markdown dep). Headings, lists, code, links, quotes, images, HR, inline formatting."
        >
          <MarkdownPreviewDemo />
        </Section>

        <Section
          title="Image lightbox"
          description="Spec §0.5.58 — full-screen overlay with zoom (+/−), rotate (R), fit/actual (F), download, copy link, ← → keyboard nav."
        >
          <ImageLightboxDemo />
        </Section>

        {/* ── Slice 9 — Specialized rows ────────────────────── */}

        <Section
          title="Audit-log row"
          description="Spec §0.5.59 — timestamp + actor + verb badge + resource + status dot + IP + tenant chip + 3-dot."
        >
          <AuditLogRowDemo />
        </Section>

        <Section
          title="Webhook event row"
          description="Spec §0.5.60 — timestamp + event type + status pill + attempts + destination + response time + replay/payload actions."
        >
          <WebhookEventRowDemo />
        </Section>

        <Section
          title="Activity feed item"
          description="Spec §0.5.53 — actor avatar + verb-led summary + target + timestamp + meta chips + expand-for-detail."
        >
          <ActivityFeedDemo />
        </Section>

        <Section
          title="Comment thread"
          description="Spec §0.5.54 — avatar + author + role + timestamp + body + reactions + reply. Indent for nested replies."
        >
          <CommentThreadDemo />
        </Section>

        <Section
          title="Timeline"
          description="Spec §0.5.52 — vertical (left rail with dots, expandable detail) and horizontal (Gantt-style for incidents/rollouts)."
        >
          <TimelineDemos />
        </Section>

        <Section
          title="Diff indicator · Pull quote"
          description="Spec §0.5.50, §0.5.51 — inline +/− with old↔new tooltip, plus brand-bar pull quote for announcements."
        >
          <DiffPullQuoteDemos />
        </Section>
      </div>
    </ToastProvider>
  );
}

/* ────────────────────────────────────────────────────────────── */

function Header() {
  return (
    <div>
      <Breadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: "Design system" },
        ]}
      />
      <div className="mt-3">
        <PageHeader
          eyebrow="Internal · Page 0"
          title="Design system"
          description="Primitives that live under @/components/ui. Use this page as a reference and as a regression surface when tokens change. Aligned to docs/flowtora-admin-spec.md §0.2-§0.5."
          actions={
            <>
              <Button variant="outline" size="sm">View spec</Button>
              <Button size="sm">New component</Button>
            </>
          }
        />
      </div>
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold" style={{ color: "var(--text-default)" }}>
          {title}
        </h2>
        <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/* ───── Color palette swatches ─────────────────────────────── */

function PaletteRow({ name }: { name: string }) {
  const stops = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-default)" }}>
          {name}
        </span>
        <span className="font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>
          --{name}-50 … --{name}-950
        </span>
      </div>
      <div className="grid grid-cols-11 gap-1">
        {stops.map((stop) => (
          <div
            key={stop}
            className="flex h-12 flex-col justify-end p-1 rounded-sm"
            style={{ background: `var(--${name}-${stop})` }}
          >
            <span
              className="font-mono text-[9px]"
              style={{
                color: stop <= 400 ? "rgba(15,23,42,0.7)" : "rgba(255,255,255,0.85)",
                fontWeight: 600,
              }}
            >
              {stop}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SemanticSwatch({ label, cssVar }: { label: string; cssVar: string }) {
  return (
    <div
      className="flex items-center gap-3 rounded-md p-3"
      style={{ background: "var(--surface-1)", border: "1px solid var(--border-subtle)" }}
    >
      <div
        className="h-8 w-8 rounded-md"
        style={{ background: `var(${cssVar})`, border: "1px solid var(--border-subtle)" }}
      />
      <div className="min-w-0">
        <div className="truncate text-xs font-medium" style={{ color: "var(--text-default)" }}>
          {label}
        </div>
        <div className="mt-0.5 truncate font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
          {cssVar}
        </div>
      </div>
    </div>
  );
}

/* ───── Typography rows ────────────────────────────────────── */

function TypeRow({
  token,
  size,
  weight,
  sample,
  mono,
  tracked,
}: {
  token: string;
  size: string;
  weight: number;
  sample: string;
  mono?: boolean;
  tracked?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[160px_80px_60px_1fr]">
      <span className="font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
        {token}
      </span>
      <span className="font-mono text-[11px]" style={{ color: "var(--text-faint)" }}>
        {size}
      </span>
      <span className="font-mono text-[11px]" style={{ color: "var(--text-faint)" }}>
        {weight}
      </span>
      <span
        style={{
          fontSize: size,
          fontWeight: weight,
          color: "var(--text-default)",
          fontFamily: mono ? "var(--font-mono)" : undefined,
          letterSpacing: tracked ? "0.08em" : undefined,
          textTransform: tracked ? "uppercase" : undefined,
        }}
      >
        {sample}
      </span>
    </div>
  );
}

/* ───── Static demo helpers (server-rendered) ──────────────── */

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  health: "Healthy" | "Watch" | "Unhealthy";
  mrr: number;
  orders: number;
  signedUp: string;
}

const SAMPLE_TENANTS: TenantRow[] = [
  { id: "t1", name: "ACME Signs Co.",     slug: "acme-signs", plan: "Pro",        health: "Healthy",   mrr: 2_499, orders:  47, signedUp: "2024-11-02" },
  { id: "t2", name: "Apex Print Co.",     slug: "apex-print", plan: "Growth",     health: "Watch",     mrr:   899, orders:  12, signedUp: "2025-02-14" },
  { id: "t3", name: "Northwind Studio",   slug: "northwind",  plan: "Starter",    health: "Unhealthy", mrr:   149, orders:   3, signedUp: "2025-08-20" },
  { id: "t4", name: "Lakeside Banner",    slug: "lakeside",   plan: "Trial",      health: "Watch",     mrr:     0, orders:   0, signedUp: "2026-04-12" },
  { id: "t5", name: "Halcyon Press Ltd.", slug: "halcyon",    plan: "Pro",        health: "Healthy",   mrr: 3_199, orders:  89, signedUp: "2024-06-30" },
  { id: "t6", name: "Beacon Imaging",     slug: "beacon",     plan: "Enterprise", health: "Healthy",   mrr: 9_400, orders: 211, signedUp: "2023-04-09" },
];

function TableDemo() {
  const columns: ColumnDef<TenantRow>[] = [
    { key: "name",     header: "Tenant",    cell: (r) => (
      <div className="min-w-0">
        <div className="truncate font-medium" style={{ color: "var(--text-default)" }}>{r.name}</div>
        <div className="truncate font-mono text-[10px]" style={{ color: "var(--text-faint)" }}>{r.slug}</div>
      </div>
    ), sortable: true, sticky: "left", width: 220 },
    { key: "plan",     header: "Plan",      cell: (r) => r.plan, sortable: true, width: 120 },
    { key: "health",   header: "Health",    cell: (r) => (
      <span style={{
        color: r.health === "Healthy" ? "var(--emerald-700)" : r.health === "Watch" ? "var(--amber-700)" : "var(--rose-700)",
      }}>● {r.health}</span>
    ), sortable: true, width: 120 },
    { key: "mrr",      header: "MRR",       cell: (r) => "$" + r.mrr.toLocaleString(), kind: "money", sortable: true, width: 100 },
    { key: "orders",   header: "Orders",    cell: (r) => r.orders, kind: "number", sortable: true, width: 90 },
    { key: "signedUp", header: "Signed up", cell: (r) => r.signedUp, kind: "date", sortable: true, width: 130 },
  ];
  return (
    <div className="space-y-3">
      <Table<TenantRow>
        rows={SAMPLE_TENANTS}
        columns={columns}
        sort={{ key: "mrr", dir: "desc" }}
        density="comfortable"
      />
      <div className="text-[11px]" style={{ color: "var(--text-faint)" }}>
        Static demo — header sort indicators show but click-to-sort is wired in real pages via state.
      </div>
    </div>
  );
}

/* ── Charts demo ─────────────────────────────────────────── */

const TIME_SERIES = [
  { day: "Mon", signups: 18, churn: 3 },
  { day: "Tue", signups: 22, churn: 2 },
  { day: "Wed", signups: 26, churn: 5 },
  { day: "Thu", signups: 31, churn: 4 },
  { day: "Fri", signups: 28, churn: 6 },
  { day: "Sat", signups: 17, churn: 2 },
  { day: "Sun", signups: 14, churn: 1 },
];

const PLAN_MIX = [
  { name: "Starter",    value: 142 },
  { name: "Growth",     value:  87 },
  { name: "Pro",        value:  46 },
  { name: "Enterprise", value:   9 },
];

function ChartsDemo() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card padding="md">
        <CardHeader title="Line — Signups vs churn" description="Last 7 days" />
        <CardBody>
          <LineChartCard
            data={TIME_SERIES}
            xKey="day"
            series={[
              { dataKey: "signups", name: "Signups" },
              { dataKey: "churn",   name: "Churn",   color: "var(--rose-500)" },
            ]}
            height="sm"
          />
        </CardBody>
      </Card>
      <Card padding="md">
        <CardHeader title="Area — Stacked composition" />
        <CardBody>
          <AreaChartCard
            data={TIME_SERIES}
            xKey="day"
            series={[
              { dataKey: "signups", name: "Signups" },
              { dataKey: "churn",   name: "Churn" },
            ]}
            height="sm"
          />
        </CardBody>
      </Card>
      <Card padding="md">
        <CardHeader title="Bar — Daily volume" />
        <CardBody>
          <BarChartCard
            data={TIME_SERIES}
            xKey="day"
            series={[{ dataKey: "signups", name: "Signups" }]}
            height="sm"
          />
        </CardBody>
      </Card>
      <Card padding="md">
        <CardHeader title="Donut — Plan mix" />
        <CardBody>
          <DonutChartCard data={PLAN_MIX} centerLabel="284" height="sm" />
        </CardBody>
      </Card>
      <Card padding="md">
        <CardHeader title="Gauge — Activation" />
        <CardBody>
          <GaugeChart value={68} max={100} label="of 100% target" height="sm" />
        </CardBody>
      </Card>
    </div>
  );
}

/* ── JsonViewer ──────────────────────────────────────────── */

const JSON_SAMPLE = {
  tenant: {
    id: "t_acme",
    name: "ACME Signs Co.",
    plan: "pro",
    active: true,
    seats: 12,
    coupon: null,
    flags: ["beta-charts", "new-billing"],
    address: {
      city: "Cleveland",
      state: "OH",
      zip: "44114",
    },
  },
  meta: {
    createdAt: "2024-11-02T15:42:11Z",
    lastSeen:  "2026-04-30T09:14:50Z",
  },
};

function JsonViewerDemo() {
  return <JsonViewer data={JSON_SAMPLE} lineNumbers withSearch initialExpandedDepth={3} />;
}

/* ── DiffViewer ──────────────────────────────────────────── */

const DIFF_OLD = `export function pricePerUnit(qty: number) {
  if (qty < 10)  return 12.5;
  if (qty < 100) return 9.0;
  return 7.0;
}

const TAX_RATE = 0.08;`;

const DIFF_NEW = `export function pricePerUnit(qty: number, tier: "std" | "vip" = "std") {
  const base = qty < 10 ? 12.5 : qty < 100 ? 9.0 : 7.0;
  return tier === "vip" ? base * 0.9 : base;
}

const TAX_RATE = 0.0825;`;

function DiffViewerDemo() {
  return (
    <div className="space-y-4">
      <DiffViewer original={DIFF_OLD} modified={DIFF_NEW} variant="unified" title="pricing.ts · unified" />
      <DiffViewer original={DIFF_OLD} modified={DIFF_NEW} variant="split"   title="pricing.ts · split" />
    </div>
  );
}

/* ── MarkdownPreview ─────────────────────────────────────── */

const MD_SAMPLE = [
  "# Release notes — v3.4",
  "",
  "Shipped **2026-04-30**. Highlights below.",
  "",
  "## Highlights",
  "",
  "- Stripe coupon mirroring is *live* for all tenants.",
  "- Magic-link sign-in for staff (super-admin only).",
  "- New `/platform/design` reference page.",
  "",
  "## Internals",
  "",
  "Inline code: `pricePerUnit(qty, tier)` now accepts a tier argument.",
  "",
  "> Heads up: TAX_RATE moved from 8.0% to 8.25%.",
  "",
  "[Full changelog](#) · [API docs](#)",
  "",
  "---",
  "",
  "Thanks to the whole team.",
].join("\n");

function MarkdownPreviewDemo() {
  return (
    <Card padding="md">
      <MarkdownPreview source={MD_SAMPLE} />
    </Card>
  );
}

/* ── AuditLogRow ─────────────────────────────────────────── */

function AuditLogRowDemo() {
  const now = Date.now();
  return (
    <Card padding="none">
      <AuditLogRow
        timestamp={new Date(now - 4 * 60_000)}
        actor={{ name: "Ada Lovelace", email: "ada@flowtora.com" }}
        action={<Badge size="xs" color="brand">platform.tenant_suspended</Badge>}
        resource={<span className="font-mono">tenant:acme-signs</span>}
        status="success"
        ip="73.14.108.221"
        tenant={{ name: "ACME Signs Co.", slug: "acme-signs" }}
      />
      <AuditLogRow
        timestamp={new Date(now - 14 * 60_000)}
        actor={{ name: "Alan Turing" }}
        action={<Badge size="xs" color="warning">billing.coupon_issued</Badge>}
        resource={<span className="font-mono">coupon:LAUNCH2026</span>}
        status="warning"
        ip="73.14.108.221"
        tenant={{ name: "Apex Print Co.", slug: "apex-print" }}
      />
      <AuditLogRow
        timestamp={new Date(now - 22 * 60_000)}
        actor={{ name: "System" }}
        action={<Badge size="xs" color="error">webhooks.delivery_failed</Badge>}
        resource={<span className="font-mono">webhook:wh_42</span>}
        status="failure"
        ip="—"
      />
    </Card>
  );
}

/* ── WebhookEventRow ─────────────────────────────────────── */

function WebhookEventRowDemo() {
  const now = Date.now();
  return (
    <Card padding="none">
      <WebhookEventRow
        timestamp={new Date(now - 30_000)}
        eventType="invoice.paid"
        statusCode={200}
        attempts={1}
        destinationUrl="https://hooks.acme-signs.com/flowtora"
        responseMs={142}
      />
      <WebhookEventRow
        timestamp={new Date(now - 5 * 60_000)}
        eventType="order.created"
        statusCode={429}
        attempts={3}
        destinationUrl="https://hooks.apex-print.com/orders"
        responseMs={680}
      />
      <WebhookEventRow
        timestamp={new Date(now - 11 * 60_000)}
        eventType="tenant.suspended"
        statusCode={500}
        attempts={5}
        destinationUrl="https://hooks.northwind.dev/in"
        responseMs={1420}
      />
      <WebhookEventRow
        timestamp={new Date(now - 26 * 60_000)}
        eventType="coupon.redeemed"
        statusCode={0}
        attempts={2}
        destinationUrl="https://hooks.halcyon-press.com/x"
        responseMs={null}
      />
    </Card>
  );
}

/* ── ActivityFeed ────────────────────────────────────────── */

function ActivityFeedDemo() {
  const now = Date.now();
  return (
    <Card padding="none">
      <ActivityFeedItem
        actor={{ name: "Ada Lovelace" }}
        summary={" suspended tenant "}
        target={<a href="#" style={{ color: "var(--accent-primary)" }}>ACME Signs Co.</a>}
        timestamp={new Date(now - 4 * 60_000)}
        metaChips={["IP 73.14.108.221", "via console"]}
      />
      <ActivityFeedItem
        actor={{ name: "Alan Turing" }}
        summary={" issued a 20% coupon "}
        target={<span className="font-mono">LAUNCH2026</span>}
        timestamp={new Date(now - 22 * 60_000)}
        metaChips={["Apex Print Co."]}
      />
      <ActivityFeedItem
        actor={{ name: "Sarah Connor" }}
        summary={" updated billing address on "}
        target={<a href="#" style={{ color: "var(--accent-primary)" }}>Northwind Studio</a>}
        timestamp={new Date(now - 3 * 3600_000)}
        density="expanded"
        preview={
          <div>
            <div style={{ color: "var(--rose-700)" }}>− 1700 Lake Ave, Cleveland OH 44114</div>
            <div style={{ color: "var(--emerald-700)" }}>+ 2100 Euclid Ave, Cleveland OH 44115</div>
          </div>
        }
      />
    </Card>
  );
}

/* ── CommentThread ───────────────────────────────────────── */

function CommentThreadDemo() {
  const now = Date.now();
  return (
    <Card padding="md">
      <CommentThread
        comments={[
          {
            id: "c1",
            author: { name: "Ada Lovelace", role: "Super Admin" },
            body: "Customer reached out about the suspended account — turns out the card on file expired. @alan can you reach out and confirm replacement?",
            createdAt: new Date(now - 3 * 3600_000),
            reactions: { "👍": 2, "👀": 1 },
          },
          {
            id: "c2",
            parentId: "c1",
            author: { name: "Alan Turing", role: "Support" },
            body: "On it — sending a magic-link to the billing contact and following up by phone in 30m.",
            createdAt: new Date(now - 90 * 60_000),
            reactions: { "🙏": 1 },
          },
          {
            id: "c3",
            author: { name: "Sarah Connor", role: "Engineering" },
            body: "Heads up — we shipped the dunning auto-suspend cutover today. If anyone sees similar tickets, ping me.",
            createdAt: new Date(now - 30 * 60_000),
          },
        ]}
        me={{ name: "You" }}
      />
    </Card>
  );
}

/* ── Timeline (Vertical + Horizontal) ────────────────────── */

function TimelineDemos() {
  const today = new Date();
  const day = (offset: number, h = 9, m = 0) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    d.setHours(h, m, 0, 0);
    return d;
  };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card padding="md">
        <CardHeader title="Vertical timeline" description="Tenant lifecycle" />
        <CardBody>
          <VerticalTimeline
            showToday
            entries={[
              { id: "v1", timestamp: day(-30),  title: "Trial started",       description: "Auto-applied LAUNCH2026 coupon", tone: "accent" },
              { id: "v2", timestamp: day(-12),  title: "First invoice paid",  description: "$899 · Stripe", tone: "success" },
              { id: "v3", timestamp: day(-3),   title: "Plan upgraded",       description: "Growth → Pro", tone: "success", milestone: true },
              { id: "v4", timestamp: day(2),    title: "Renewal scheduled",   description: "$2,499 · annual", tone: "neutral" },
              { id: "v5", timestamp: day(7),    title: "Auto-suspend if unpaid", tone: "warning" },
            ]}
          />
        </CardBody>
      </Card>
      <Card padding="md">
        <CardHeader title="Horizontal timeline" description="Q2 rollouts (Gantt)" />
        <CardBody>
          <HorizontalTimeline
            showToday
            bars={[
              { id: "g1", label: "Magic-link rollout",   start: day(-14), end: day(2),  tone: "accent" },
              { id: "g2", label: "Coupon mirror",        start: day(-7),  end: day(5),  tone: "success" },
              { id: "g3", label: "Dunning auto-suspend", start: day(-2),  end: day(10), tone: "warning",
                markers: [{ at: day(0), tone: "danger", label: "Cutover" }] },
              { id: "g4", label: "RBAC v2",              start: day(4),   end: day(28), tone: "neutral" },
            ]}
          />
        </CardBody>
      </Card>
    </div>
  );
}

/* ── DiffIndicator + PullQuote ───────────────────────────── */

function DiffPullQuoteDemos() {
  return (
    <div className="space-y-4">
      <Row label="Compact">
        <DiffIndicator kind="added"   newValue="seat #4" />
        <DiffIndicator kind="removed" oldValue="seat #3" />
        <DiffIndicator kind="changed" oldValue="Growth" newValue="Pro" />
      </Row>
      <Row label="Expanded">
        <DiffIndicator density="expanded" kind="added"   newValue="alex@flowtora.com" />
        <DiffIndicator density="expanded" kind="removed" oldValue="ada@flowtora.com" />
        <DiffIndicator density="expanded" kind="changed" oldValue="USD"   newValue="EUR" />
      </Row>
      <Card padding="md">
        <PullQuote attribution={<>— Engineering, <span className="font-mono">2026-04-30</span></>}>
          Magic-link sign-in is now the default for all platform staff. Password fallback remains for break-glass scenarios only.
        </PullQuote>
      </Card>
    </div>
  );
}
