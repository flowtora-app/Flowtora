import { requirePlatformStaff } from "@/lib/platform";
import {
  Badge,
  Breadcrumb,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  EmptyState,
  Input,
  PageHeader,
  SectionHeader,
  Select,
  Skeleton,
  SkeletonCard,
  SkeletonText,
  Tabs,
  Textarea,
} from "@/components/ui";
import { DialogTrigger } from "./DialogTrigger";

// Phase 18 Slice A — design system showcase.
//
// Staff-only, intentionally dense. Every primitive we ship appears
// below in its common configurations so we can:
//   1. Eyeball visual consistency as we add primitives.
//   2. Regress quickly after token changes (compare screenshots).
//   3. Copy-paste working examples when implementing new pages.
//
// Layout: a vertical stack of `Section` blocks, one per primitive.

export default async function DesignSystemPage() {
  await requirePlatformStaff();

  return (
    <div className="space-y-10">
      <div>
        <Breadcrumb
          items={[
            { label: "Platform", href: "/platform" },
            { label: "Design system" },
          ]}
        />
        <div className="mt-3">
          <PageHeader
            eyebrow="Internal"
            title="Design system"
            description="Primitives that live under @/components/ui. Use this page as a reference and as a regression surface when tokens change."
            actions={
              <>
                <Button variant="secondary" size="sm">View tokens</Button>
                <Button size="sm">New component</Button>
              </>
            }
          />
        </div>
      </div>

      {/* ── Buttons ───────────────────────────────────────────────── */}
      <Section title="Button" description="Six variants × three sizes. Loading state overlays a spinner without layout shift.">
        <Row label="Variants">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="success">Success</Button>
          <Button variant="link">Link</Button>
        </Row>
        <Row label="Sizes">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </Row>
        <Row label="States">
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
          <Button leftIcon={<span>↓</span>}>With icon</Button>
          <Button rightIcon={<span>→</span>} variant="secondary">Continue</Button>
        </Row>
      </Section>

      {/* ── Inputs ────────────────────────────────────────────────── */}
      <Section title="Input / Textarea / Select" description="Form primitives with built-in label, hint, and error slots.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Input label="Name" placeholder="Ada Lovelace" hint="Shown on invoices." />
          <Input label="Email" type="email" required placeholder="you@example.com" />
          <Input label="Budget" prefix="$" suffix="USD" placeholder="0.00" />
          <Input label="Username" error="That handle is already taken." defaultValue="taken" />
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

      {/* ── Badges ────────────────────────────────────────────────── */}
      <Section title="Badge" description="Status chips. Use tone to communicate meaning; dot for dense at-a-glance lists.">
        <Row label="Tones">
          <Badge>Draft</Badge>
          <Badge tone="accent">Active</Badge>
          <Badge tone="success">Paid</Badge>
          <Badge tone="warning">Due soon</Badge>
          <Badge tone="danger">Overdue</Badge>
          <Badge tone="info">Beta</Badge>
        </Row>
        <Row label="With dot">
          <Badge dot>Idle</Badge>
          <Badge tone="success" dot>Online</Badge>
          <Badge tone="warning" dot>Pending</Badge>
          <Badge tone="danger" dot>Failed</Badge>
        </Row>
        <Row label="Sizes">
          <Badge size="sm" tone="accent">SM</Badge>
          <Badge size="md" tone="accent">MD</Badge>
        </Row>
      </Section>

      {/* ── Cards ─────────────────────────────────────────────────── */}
      <Section title="Card" description="Three elevation levels. Compose with CardHeader / CardBody / CardFooter.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card elevation="flat" padded>
            <div className="text-sm font-semibold">Flat card</div>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Transparent surface, just a border. For inline groupings.
            </p>
          </Card>
          <Card>
            <CardHeader title="Default card" description="Surface-1 panel. The workhorse." />
            <CardBody>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Most content in the app lives in one of these.
              </p>
            </CardBody>
            <CardFooter>
              <Button variant="secondary" size="sm">Cancel</Button>
              <Button size="sm">Save</Button>
            </CardFooter>
          </Card>
          <Card elevation="elevated" padded>
            <div className="text-sm font-semibold">Elevated card</div>
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Surface-2 with shadow — stands forward from the page.
            </p>
          </Card>
        </div>
      </Section>

      {/* ── PageHeader / SectionHeader ────────────────────────────── */}
      <Section title="Page & section headers" description="Hierarchy primitives. PageHeader uses h1, SectionHeader uses h2.">
        <Card padded>
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

      {/* ── Breadcrumb ────────────────────────────────────────────── */}
      <Section title="Breadcrumb" description="Flat path. Last item is non-link and stronger.">
        <Breadcrumb
          items={[
            { label: "Platform", href: "/platform" },
            { label: "Tenants", href: "/platform/tenants" },
            { label: "Acme Signs Ltd." },
          ]}
        />
      </Section>

      {/* ── Tabs ──────────────────────────────────────────────────── */}
      <Section title="Tabs" description="Link-based tabs for server-rendered routes. Pass activeHref to highlight.">
        <Tabs
          activeHref="/platform/design"
          items={[
            { label: "Overview", href: "/platform" },
            { label: "Tenants", href: "/platform/tenants" },
            { label: "Design system", href: "/platform/design", badge: "A" },
            { label: "Audit log", href: "/platform/audit" },
            { label: "Disabled", href: "#", disabled: true },
          ]}
        />
      </Section>

      {/* ── EmptyState ────────────────────────────────────────────── */}
      <Section title="EmptyState" description="Treat empty lists as a teaching moment — tell the user what the surface does and how to start.">
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

      {/* ── Skeleton ──────────────────────────────────────────────── */}
      <Section title="Skeleton" description="Loading placeholder. Shimmer collapses to a static pulse under prefers-reduced-motion.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card padded>
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10" rounded="full" />
              <div className="flex-1">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="mt-2 h-3 w-1/2" />
              </div>
            </div>
          </Card>
          <Card padded>
            <SkeletonText lines={4} />
          </Card>
          <SkeletonCard />
        </div>
      </Section>

      {/* ── Dialog ────────────────────────────────────────────────── */}
      <Section title="Dialog" description="Built on native <dialog>. Accessible focus trap + backdrop dismiss.">
        <DialogTrigger />
      </Section>

      {/* ── Tokens reference ─────────────────────────────────────── */}
      <Section title="Tokens" description="CSS custom properties that back every primitive. Pull from @/lib/design/tokens if you need the JS side.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <TokenSwatch label="surface-0" cssVar="--surface-0" />
          <TokenSwatch label="surface-1" cssVar="--surface-1" />
          <TokenSwatch label="surface-2" cssVar="--surface-2" />
          <TokenSwatch label="surface-3" cssVar="--surface-3" />
          <TokenSwatch label="accent-primary" cssVar="--accent-primary" />
          <TokenSwatch label="success" cssVar="--success" />
          <TokenSwatch label="warning" cssVar="--warning" />
          <TokenSwatch label="danger" cssVar="--danger" />
        </div>
      </Section>
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
      <span className="w-20 shrink-0 text-xs uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
        {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function TokenSwatch({ label, cssVar }: { label: string; cssVar: string }) {
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
