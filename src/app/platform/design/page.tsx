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
  ConfirmTriggers,
  DrawerTriggers,
  FilterBarDemo,
  PaginationDemos,
  PillFilterChipsDemos,
  SearchWithSuggestionsDemo,
  ToastTriggers,
} from "./ShowcaseTriggers";

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
