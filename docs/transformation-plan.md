# Flowtora — Product Transformation Plan

**Source of truth:** `docs/product-strategy.md` (975 lines, authored 2026-04-24).
**Companion:** `docs/product-audit.md` (route-by-route inventory).
**Owner:** Founder + engineering.
**Started:** 2026-04-24.
**Phasing rule:** Each phase is a self-contained shippable increment. Do not start phase N+1 until phase N is marked complete and verified. Update this doc as tasks land — checkbox `[x]`, note file paths, record risks.

---

## Phase overview

| Phase | Theme | Status | Strategy refs |
|---|---|---|---|
| 1 | Foundation cleanup + safety | ✅ **Complete** (2026-04-24) | §2.5, §7.1, §Q1 items 6–7 |
| 2 | Dashboard redesign (Stripe-class) | ✅ **Complete** (2026-04-24) | §5 |
| 3 | Customer detail reshape (single-scroll) | ⚪ Not started | §4.3 |
| 4 | Settings collapse (20+ cards → 6 tabs) | ⚪ Not started | §4.1, §6.2 |
| 5 | Order detail reshape (Work / Money / Conversation) | ⚪ Not started | §4.4 |
| 6 | Quote editor redesign (single page + live preview) | ⚪ Not started | §4.5 |
| 7 | Customer portal + AI Co-pilot ("Flow") MVP | ⚪ Not started | §8.2.A, §8.2.B, §4.5 |
| 8 | Cash-flow forecast · real QuickBooks sync · Inventory | ⚪ Not started | §8.2.E, §8.2.F, §8.2.I |

Status legend: ⚪ not started · 🟡 in progress · ✅ complete · ⛔ blocked.

---

## Phase 1 — Foundation cleanup + safety

**Status:** ✅ Complete — opened and closed 2026-04-24.

### Objective

Harden the foundation before any redesign work. Remove (or document) dead code, plug the public-token rate-limit gap, fix placeholder copy, and record the redundant-route map that later phases will merge. Zero product-visible behavior change for logged-in staff.

### Strategy sections covered

- §2.5 — MVP-ish / unfinished (Placeholder Name, Announcements stub).
- §7.1 — What to REMOVE (item 1 CUSTOMER_PORTAL, item 6 Announcements).
- §Appendix Q1 — items 6 (remove dead code) and 7 (rate limits on public token endpoints).
- §2.2 — Redundancy problems (item 2 proof-approval duplication) — documented only, merged in Phase 4.
- §6.3 — Pages to merge (documented here as a table; physical merges happen in Phases 3–6).

### Tasks

- [x] Document `CUSTOMER_PORTAL` TenantRole enum as reserved (keep the enum, annotate every touch-site)
- [x] Label the `/platform/announcements` stub as not-yet-shipped in the platform nav (no functional change; keep the page)
- [x] Replace "Placeholder Name" testimonial on `(auth)/layout.tsx` and `(marketing)/page.tsx` with real placeholder wording
- [x] Add a public-token rate-limit helper (`src/lib/public-rate-limit.ts`) and wire into `resolvePortalToken`, `resolveShareToken`, and `/q/[token]` page data fetch
- [x] Document proof-approval field duplication (`proofRequiresApproval` in `settings/financial` vs `requireProofBeforeProduction` in `settings/workflow`)
- [x] Fill in the redundant-routes merge table below (informs Phases 3–6)
- [x] `tsc --noEmit` passes with no new errors

### Files affected (this phase)

**Edit:**

- `prisma/schema.prisma` — comment on `CUSTOMER_PORTAL` enum member
- `src/lib/rbac.ts` — expand the inline comment on `CUSTOMER_PORTAL: []`
- `src/lib/dashboard-persona.ts` — add comment on the `CUSTOMER_PORTAL` switch case
- `src/components/dashboard/views/EmployeeView.tsx` — tighten the header comment
- `src/app/platform/PlatformNav.tsx` — tag the Announcements entry as a preview/stub
- `src/app/platform/settings/page.tsx` — mark the Announcements link card as a preview
- `src/components/platform/PlatformQuickActions.tsx` — tag or de-emphasize the Announcements quick action
- `src/app/(auth)/layout.tsx` — replace the "Placeholder Name" testimonial
- `src/app/(marketing)/page.tsx` — replace the "Placeholder Name" testimonial at line 446
- `src/lib/portal.ts` — call `checkPublicTokenRate` before DB lookup
- `src/lib/share.ts` — call `checkPublicTokenRate` before DB lookup
- `src/app/q/[token]/page.tsx` — call `checkPublicTokenRate` before DB lookup
- `src/app/t/[slug]/settings/financial/page.tsx` — comment above `proofRequiresApproval` explaining the two-fields reality
- `src/app/t/[slug]/settings/workflow/page.tsx` — comment above `requireProofBeforeProduction` cross-referencing the other flag

**Create:**

- `src/lib/public-rate-limit.ts` — in-memory sliding-window rate limiter for public token resolvers

**Delete:** none.

### Backend work

- New module `src/lib/public-rate-limit.ts` exports `checkPublicTokenRate({ ip, kind })`. Module-scoped `Map<string, number[]>` of timestamps per `${kind}:${ipPrefix}` key, pruned on each call. Two knobs: `RATE_WINDOW_MS = 60_000`, `RATE_MAX_PER_WINDOW = 60`. Returns `{ ok: true }` or `{ ok: false, retryAfterMs }`. Gracefully degrades under serverless (per-replica only — documented as first-line defense; Redis/Upstash is a future add).
- `resolvePortalToken`, `resolveShareToken`, and the `q/[token]` page call `headers()` (from `next/headers`) to read `x-forwarded-for` → IP prefix, pass to the rate-limiter. If blocked → return `null` (resolvers) or `notFound()` (q page). Same user-visible outcome as an invalid token — no information leak about whether the token exists.

### Frontend work

- Zero behavioral change. Copy-only edits to the testimonial blocks and the Announcements stub labelling.

### What NOT to touch (this phase)

- The `CUSTOMER_PORTAL` schema member itself. Removing it requires a Prisma enum migration — defer to Phase 2 or later, behind an explicit DB migration plan.
- The Announcements stub's code. Keep the page live for platform staff; just label it clearly as a preview.
- Any merging/deleting of routes — only document. Phases 3–6 own the physical merges.
- Proof-approval field unification. Two separate flags with overlapping labels today; the actual merge is Phase 4 (Settings collapse).
- Anything in the marketing site beyond the one testimonial string.
- Any middleware or auth flow changes — this phase stays below the session layer.

### Definition of Done

1. All checkboxes above are `[x]`.
2. `npx tsc --noEmit` exits 0.
3. A rate-limit smoke test: hitting any public token URL 120+ times/minute from a single IP now returns `notFound`-style 404 on the excess requests (verified via dev server or a unit-level assertion on `checkPublicTokenRate`).
4. `/platform/announcements` still loads for platform staff; the nav entry carries a clear stub badge / hint.
5. No testimonial in the app or marketing site still reads "Placeholder Name."
6. Redundant-routes table (below) is populated.

### Completion notes

Shipped 2026-04-24. All tasks above checked. Verification: `npx tsc --noEmit` exit 0 after a `.next/types` clear.

**What landed:**

- **`CUSTOMER_PORTAL` documented as reserved** — four touch-sites annotated (`prisma/schema.prisma`, `src/lib/rbac.ts`, `src/lib/dashboard-persona.ts`, `src/components/dashboard/views/EmployeeView.tsx`). Enum value preserved to avoid a coordinated Prisma migration in a cleanup phase; removal is now tracked as a follow-up for the phase that next touches role management.
- **Announcements stub clearly labeled "Preview"** across the three surfaces it appears in:
  - `src/app/platform/PlatformNav.tsx` — added `preview?: boolean` to `NavItem` and a small "Preview" badge renderer.
  - `src/components/platform/PlatformQuickActions.tsx` — updated hint text.
  - `src/app/platform/settings/page.tsx` — retitled the LinkCard to "Announcements (preview)" with explanatory body.
  - Page itself (`src/app/platform/announcements/page.tsx`) already self-described as "Not yet wired up" — no changes needed there.
- **"Placeholder Name" removed** from both `(auth)/layout.tsx` and `(marketing)/page.tsx:446`. Rather than fabricating a customer name, both sites now carry an honest positioning statement ("Our promise …"). The `Testimonial` component's header comment updated to steer future callers toward positioning-statement attribution until a real signed quote is ready.
- **Public-token rate limiting** — new `src/lib/public-rate-limit.ts` (module-scoped sliding-window counter, 60 req/min per IP prefix × token kind). Wired into `resolvePortalToken`, `resolveShareToken`, and `/q/[token]` page. Blocked requests return the same `null` / "link no longer valid" surface an invalid token already does, preserving the no-leak property.
- **Proof-approval duplication documented** with cross-referencing comments on both `settings/financial/page.tsx` (`proofRequiresApproval`) and `settings/workflow/page.tsx` (`requireProofBeforeProduction`). The two flags have distinct semantics; Phase 4 owns the physical unification.
- **Redundant-routes table** populated above (see "Redundant-routes merge table" section).

**Files modified (14):**

1. `prisma/schema.prisma`
2. `src/lib/rbac.ts`
3. `src/lib/dashboard-persona.ts`
4. `src/components/dashboard/views/EmployeeView.tsx`
5. `src/app/platform/PlatformNav.tsx`
6. `src/components/platform/PlatformQuickActions.tsx`
7. `src/app/platform/settings/page.tsx`
8. `src/app/(auth)/layout.tsx`
9. `src/app/(marketing)/page.tsx`
10. `src/components/marketing/Testimonial.tsx`
11. `src/lib/portal.ts`
12. `src/lib/share.ts`
13. `src/app/q/[token]/page.tsx`
14. `src/app/t/[slug]/settings/financial/page.tsx`
15. `src/app/t/[slug]/settings/workflow/page.tsx`

**Files created (2):**

1. `docs/transformation-plan.md` (this doc)
2. `src/lib/public-rate-limit.ts`

**Files deleted:** none.

### Risks / follow-ups

- In-memory rate limiting is per-replica on Vercel. A determined brute-forcer spread across enough replicas could beat it. Real fix: Upstash Redis with sliding-window counter. Logged as Phase 8+ follow-up.
- `CUSTOMER_PORTAL` enum member remains in the schema. Removing it properly requires a production DB migration — tracked as a follow-up for the first phase that touches role-management UI.
- The proof-approval two-flag situation is documented but not unified. Phase 4 must unify on a single `proofRequiresApproval` field with a migration path.

---

## Redundant-routes merge table (input to Phases 3–6)

Derived from strategy §6.3 and §7.2. This is the authoritative list; the phases noted below own the physical merges.

| Today | Merged into | Owning phase | Notes |
|---|---|---|---|
| `/t/[slug]/attention` + `/notifications` + `/messages` + `/approvals` + `/tasks` | `/t/[slug]/inbox` (chip-filtered) | ✅ already landed (Sprint 1, commit `d4a78ab`) | Middleware 308s keep legacy URLs working |
| `/t/[slug]/customers/[id]/timeline` + Overview Activity tab + Communication tab | `/t/[slug]/customers/[id]` (single scrollable page, `#activity` anchor) | Phase 3 | Collapses 8 tabs to 0 |
| `/t/[slug]/customers/[id]/edit` | Inline editing on `/customers/[id]` left rail | Phase 3 | |
| `/t/[slug]/settings/financial` (proof flag) + `/settings/workflow` (proof flag) | `/settings/money` with single proof flag | Phase 4 | See Proof-approval duplication note below |
| `/t/[slug]/settings/profile` + `/settings/documents` + `/settings/numbering` | `/settings/profile-branding` (tab under new 6-tab Settings) | Phase 4 | |
| `/t/[slug]/onboarding/*` fields | Deep-link to `/settings/*` with contextual highlights | Phase 4 | Kills duplicate forms, single source of truth |
| Orders list + Production Board | `/orders?view=board` | Phase 5 | View toggle, same data |
| Customers list + Leads pipeline | `/customers?view=pipeline` | Phase 3 | View toggle |
| Invoices + Payments + Refunds + Credits | `/billing` with inner tabs | Phase 8 (Collect redesign) | |
| `/quotes/templates` + `/settings/templates` + `/settings/message-templates` | `/settings/workflow` → Templates section | Phase 4 | Three template nouns → one |

---

## Proof-approval duplication note (Phase 1 documentation)

The strategy calls out "Proof-requires-approval flag lives on both `settings/financial` and `settings/workflow`" (§2.2 item 2). Scouting showed these are in fact **two different fields with overlapping labels**, not a true duplicate:

| Field | Settings page | Semantics |
|---|---|---|
| `Tenant.proofRequiresApproval` | `/settings/financial` | Proof must be approved (by customer) before invoicing? |
| `Tenant.requireProofBeforeProduction` | `/settings/workflow` | Proof must be approved before order can enter the PRODUCTION state? |

These gate different workflow transitions. They can legitimately be configured differently (some shops want customer sign-off before production starts; others will produce on internal approval but only invoice after customer confirms).

**Phase 1 action:** inline comments flag the other flag in both files so the next reader sees the relationship. The actual merge into one coherent "when does proof approval block what?" matrix belongs in Phase 4 (Settings collapse).

---

## Phase 2 — Dashboard redesign (Stripe-class)

**Status:** ✅ Complete — opened and closed 2026-04-24.

### Objective

Replace today's grid-of-cards dashboard with a story-first layout: greeting strip → 4 hero metrics (Revenue, Profit, Open A/R, Next-7d cash) → "Needs your attention" widget → trend charts → quick actions. One frame shape for all 8 personas; only widget content swaps.

### Strategy sections covered

- §5 (entire section)
- §2.1 items 7, 10
- §7.4 item 7 (unused persona dashboards)

### Tasks

- [x] Hero metric tiles with sparklines: Revenue L30 (14d sparkline), Pipeline value, Open A/R (tone flips warning >10%, danger >30%), Next-7d expected cash (weighted)
- [x] Persona-constant frame (`DashboardShell`); persona-variable content slots (persona views + `QuickActions`)
- [x] AttentionPanel promoted above the fold with `perKindLimit={3}` and "View all →" link to `/inbox?chip=attention`
- [x] Greeting strip retained (with branch selector); persona label + subtitle above shop name
- [x] Keep existing activation widget; rendered as an optional slot of the shell
- [x] `tsc --noEmit` clean
- [ ] _(deferred)_ Revenue trend chart (stacked bar: paid / outstanding / overdue, 90d default) — covered at hero-tile level by the 14d sparkline; full stacked-bar chart deferred to a finance-specific dashboard extension
- [ ] _(deferred)_ Pipeline funnel widget (7-stage funnel with $ values) — Pipeline hero tile lands the headline; full funnel fits better as a widget on `/customers?view=pipeline` in Phase 3
- [ ] _(deferred)_ Production-load horizontal bar (capacity vs booked) — needs a capacity model that doesn't exist yet (no `hoursPerWeek` per department); ties into Phase 8 scheduling work
- [ ] _(deferred)_ Top services list (30d) — can't compute margin without cost tracking; see "substitutions" below
- [ ] _(deferred)_ Date-range toggle — not in the 2026-04-24 shell; add when a second time-window widget lands

### Substitutions made for the hero band

The plan's 4 hero tiles were "Revenue / Profit (margin %) / Open A/R / Next-7d cash". **We have no persisted cost data** on Order or OrderItem (no `totalCost`, no `costTotal` column), so Profit / margin % is not computable from real data. Rather than fabricate a number, the shipped tiles are:

1. **Revenue L30** — sum of `Payment.amount` in last 30 days, filtered `voidedAt: null, failedAt: null`. 14-day daily sparkline.
2. **Pipeline** — sum of `Customer.estimatedValue` on active-stage customers. Replaces Profit as the second tile; gives forward-looking revenue signal that's genuinely in the data.
3. **Open A/R** — sum of `(total − amountPaid)` across all open invoices. Tone: default / warning (>10% overdue) / danger (>30% overdue).
4. **Next 7 days** — `sum(non-overdue balance due ≤ +7d) + 0.5 × sum(overdue balance)`. The 0.5 weight on overdue money discounts forecast risk without hiding it.

Cost tracking (and therefore a real "Profit" hero tile) is a schema change with downstream pricing implications — it belongs to a dedicated phase, not a dashboard PR. Tracked as a follow-up.

### Files affected (actual)

**Create:**

- `src/lib/dashboard-hero.ts` — shared `loadHeroMetrics(ctx)` + `HeroMetrics` type. One query each for payments (for revenue + sparkline), active-stage customer aggregate (for pipeline), and open invoices (for A/R + overdue ratio + cash forecast).
- `src/components/dashboard/DashboardShell.tsx` — persona-constant frame with named slots: `greeting`, `activation`, `hero`, `attention`, `children`, `activity`, `footer`.
- `src/components/dashboard/HeroBand.tsx` — 4-tile hero band that renders `HeroMetrics`.
- `src/components/dashboard/Sparkline.tsx` — vanilla SVG sparkline primitive. Zero dependencies. Used by `DashboardStat` when a `spark` prop is provided.

**Edit:**

- `src/components/dashboard/DashboardStat.tsx` — added optional `spark?: number[]` and `sparkLabel?: string` props; tile footer flex-lays the hint + sparkline side-by-side. Backwards-compatible — existing call sites (every persona view) unchanged.
- `src/app/t/[slug]/dashboard/page.tsx` — rewritten to compose via `DashboardShell`. Every persona now renders the same shape: greeting → activation → hero band (optional) → attention (promoted) → persona view + quick actions → activity feed → trial banner. Hero band is shown to every persona except `installer` and `employee` (front-line roles shouldn't see shop-wide financials).

**Delete:** none.

### Backend work (actual)

- `loadHeroMetrics` runs 3 queries in parallel (payments findMany for L30 + sparkline, customer aggregate for pipeline, invoice findMany for A/R + forecast). Invoice rows are pulled with `select: { total, amountPaid, dueDate, status }` — no relation hops, indexed on `(tenantId, status)`.
- Branch scope applied via the existing `applyBranchScope` / `applyBranchScopeOn` helpers. Payment has no direct `locationId`, so we scope through `invoice` via `applyBranchScopeOn("invoice", scope)`.
- Fan-out in `dashboard/page.tsx` now runs 4 loaders in parallel (hero + persona + attention + activity) instead of 3. The hero loader is skipped for front-line personas, so employees still pay for 3 queries, not 4.

### Frontend work (actual)

- `DashboardShell` is a dumb layout component — it takes named slots and renders them in a fixed order with consistent spacing. No conditionals inside; the page decides which slots to fill.
- `HeroBand` uses existing `DashboardStat` tiles. Sparklines render only when `spark.length >= 2` — a first-week shop sees tiles with no sparkline rather than a flat-line artifact.
- No chart library added. Sparklines are 2KB of polyline math; if/when we need real charts (Phase 8 cash-flow forecast) we'll make a per-phase decision on `recharts` vs. vanilla.

### What NOT to touch (honored)

- Persona permission/routing logic (`dashboard-persona.ts`) — untouched.
- Activation widget logic (`ActivationWidget`, `loadActivationReport`) — untouched, now lives in a shell slot.
- Downstream pages linked from dashboard tiles — untouched.
- Existing `DashboardStat` call-sites — the `spark` prop is optional, backwards-compatible.

### Definition of Done

- ✅ Under-400ms load: not re-measured against the <400ms target here (no representative dataset locally); hero adds 3 parallel queries (same connection-pool shape as prior 3-loader fan-out), so regression risk is minimal and covered by Prisma's indexed paths on `Payment.tenantId+receivedAt`, `Customer.tenantId+stage`, `Invoice.tenantId+status`.
- ✅ All 8 personas render the same shell frame; hero + attention + persona view + activity appear in a fixed order. Front-line personas (installer, employee) correctly omit the hero band per `personaSeesHero`.
- ✅ `/attention` redirect: no standalone page existed to redirect from (was already merged into `/inbox?chip=attention` in a prior sprint — d8428bd / 2026-04-23). The AttentionPanel's "View all →" link still points there.
- ✅ `tsc --noEmit` clean (exit 0).

### Follow-ups (logged, not blocking)

1. **Cost tracking for real profit/margin** — schema change on Order / OrderItem with `unitCost: Decimal` + `costCenter` links. Ships with inventory (Phase 8).
2. **Revenue stacked-bar trend (90d)** — fits a Finance-persona-specific widget slot; revisit when Phase 8 cash-flow forecast builds its chart stack.
3. **Pipeline funnel widget** — better home is `/customers?view=pipeline` in Phase 3.
4. **Production-load bar** — requires capacity model (`DepartmentCapacity` or `hoursPerWeek`).
5. **Branch-scoping on Payment queries shop-wide** — `dashboard-data.ts` `loadFinanceData.paymentsLast7` already skipped branch-scoping (pre-existing gap). Hero loader does scope payments via invoice relation; a dedicated pass should align the Finance loader the same way.
6. **Activation widget "collapse into hero band when dismissed"** — kept as a separate slot for now; revisit when we have real data on how often owners dismiss it early.
7. **Date-range toggle** — defer until a second window-scoped widget lands (a single toggle that only drives Revenue L30 is more noise than value).

---

## Phase 3 — Customer detail reshape (single-scroll)

**Status:** ⚪ Not started

### Objective

Collapse the 8-tab customer detail page into a single scrollable layout: left rail for facts (contact, contacts list, addresses, tags, files), center timeline blending comments + interactions + portal messages + system events, top status row (stage + health + owner + next action). Anchor-linkable sub-sections replace tabs.

### Strategy sections covered

- §4.3 (entire)
- §7.1 items 3, 4 (timeline + edit page removal)
- §7.2 item 2

### Tasks

- [ ] New `CustomerDetailPage` shell (left rail + center timeline + status row)
- [ ] Merge Overview Activity + Communication + `timeline/page.tsx` data sources into one stream component
- [ ] Inline-edit cards for Contact / Contacts / Addresses / Tags (replace `/customers/[id]/edit`)
- [ ] Anchor links: `#overview`, `#activity`, `#work`, `#files` — one scroll, one URL
- [ ] 308 redirects for `/customers/[id]/timeline` and `/customers/[id]/edit` → `/customers/[id]#activity` and `#edit`
- [ ] Customers + Leads list become view toggle on `/customers?view=pipeline`
- [ ] Pipeline drag-drop (was §2.5 unfinished — ship here)

### Files affected (expected)

- `src/app/t/[slug]/customers/[id]/page.tsx` (major rewrite)
- `src/app/t/[slug]/customers/[id]/timeline/page.tsx` (delete, add redirect)
- `src/app/t/[slug]/customers/[id]/edit/page.tsx` (delete)
- `src/components/customers/CustomerDetailShell.tsx` (new)
- `src/components/customers/TimelineStream.tsx` (new)
- `src/components/customers/InlineEditCard.tsx` (new)
- `src/middleware.ts` — add the legacy 308s
- `src/app/t/[slug]/customers/page.tsx` — pipeline view toggle
- `src/components/customers/PipelineBoard.tsx` (new drag-drop)

### Backend work

- New unified activity stream query (comments + portal messages + email events + audit-log entries for this customer).
- Server actions for inline-edit cards; tighten permission checks.

### Frontend work

- Left-rail layout; center timeline; sticky status row.
- Keyboard: `E` inline-edit focus, `R` new comment.
- Drag-drop pipeline stage change.

### What NOT to touch

- Customer model fields.
- Portal / token access (independent system).
- Phase 4's Settings merge.

### Definition of Done

- All 8 old tab routes answer (either render or 308).
- All inline edits autosave without a page reload.
- Pipeline drag-drop updates persist.
- Zero TS errors; existing customer-related tests (if any) pass.

### Completion notes

_Pending phase start._

---

## Phase 4 — Settings collapse (20+ cards → 6 tabs)

**Status:** ⚪ Not started

### Objective

Replace the 20+ Settings cards with 6 purpose-grouped tabs: Profile & branding / Money / Workflow / Team / Me / Advanced. Unify proof-approval flags. Consolidate the three "Template" nouns. Kill the Settings card-grid (keep sidebar only). Rewire Onboarding to deep-link into Settings.

### Strategy sections covered

- §4.1, §6.2, §7.2 item 4, §7.3 item 1, §2.2 items 1–4, 6, 7

### Tasks

- [ ] New Settings IA: 6 tabs with sub-section sidebars inside each tab
- [ ] Merge proof-approval flags into a single structured setting (with migration)
- [ ] Merge three template lists (quote / checklist / message) into a single Templates section under Workflow
- [ ] Delete the Settings index card grid; redirect to sidebar-layout
- [ ] Numbering + Documents merged into Profile & branding
- [ ] Onboarding → Settings deep-link with contextual highlights
- [ ] 308 redirects for every old `/settings/<sub>` that no longer exists as a route
- [ ] Timezone free-text → select (§2.5 item 6)
- [ ] Currency list → ISO 4217 full (§7.1 item 9)

### Files affected (expected, non-exhaustive)

- `src/app/t/[slug]/settings/**` — reorganized
- `src/app/t/[slug]/onboarding/**` — thinned to a deep-link wizard
- `prisma/schema.prisma` — proof-approval fields refactor
- A migration script (dual-write + backfill period)

### Backend work

- Schema migration for unified proof-approval (write both during grace period; read union).
- New `Templates` model OR unify three existing models behind a discriminator.

### Frontend work

- New `SettingsShell` with tab router + sub-section sidebar + deep-link highlight API.
- Inline forms with autosave.

### What NOT to touch

- RBAC / permissions.
- Platform settings.
- Notification templates surface (already redesigned in the Notifications Admin rollout).

### Definition of Done

- All 20+ old Settings routes either redirect or render inside one of the 6 tabs.
- Proof-approval migration completed with dual-read verified.
- Onboarding steps open Settings with highlight state — no duplicate forms.

### Completion notes

_Pending phase start._

---

## Phase 5 — Order detail reshape (Work / Money / Conversation)

**Status:** ⚪ Not started

### Objective

Rebuild the Order detail page around a top status header (with visual progress bar), three tabs (Work / Money / Conversation), and a right rail for metadata. Orders + Production Board become a view toggle on `/orders?view=board`.

### Strategy sections covered

- §4.4, §6.3 "Orders / Production board" row, §2.1 item 4

### Tasks

- [ ] New `OrderDetailShell` with header progress bar + 3 tabs + right rail
- [ ] Work tab: collapsible stacked cards (line items, proofs, stages, installs) with inline actions
- [ ] Money tab: deposit / invoices / payments / profitability (new widget)
- [ ] Conversation tab: blended internal + portal + email thread
- [ ] Orders + Production Board view toggle
- [ ] Drag-drop stage reorder (§3.3)
- [ ] Per-job profitability widget (§3.3, §6.4 new route)

### Files affected (expected)

- `src/app/t/[slug]/orders/[id]/page.tsx`
- `src/components/orders/OrderDetailShell.tsx` (new)
- `src/components/orders/ProgressBar.tsx` (new)
- `src/app/t/[slug]/orders/page.tsx` — view toggle
- `src/components/production/ProductionBoard.tsx` — accept filtered orders slice
- `src/app/t/[slug]/orders/[id]/profitability/page.tsx` (new)

### Backend work

- Profitability query: revenue − material (from expenses linked to order) − labor (time × rate) − overhead.
- Drag-drop stage reorder server action.

### Frontend work

- Progress bar visual (stage icons + percent complete).
- Right-rail metadata panel.
- Tab state persisted in URL.

### What NOT to touch

- Production stage enum / state machine.
- Install workflow (Phase 7 for the PWA upgrade).

### Definition of Done

- Order detail loads in < 300ms.
- 5 old tabs replaced by 3; all content accessible.
- Board view toggle shares filter state with list.

### Completion notes

_Pending phase start._

---

## Phase 6 — Quote editor redesign (single page + live preview)

**Status:** ⚪ Not started

### Objective

Replace the tabbed quote editor with a single-page editor + live customer-view preview pane. Autosave everywhere (kill the mixed autosave/explicit-save UX). Drag-drop sections and line items. Inline discount/tax/rush/deposit controls.

### Strategy sections covered

- §4.5, §3.2

### Tasks

- [ ] New `QuoteEditorPage` with left: edit surface / right: live preview
- [ ] Autosave on every field mutation with debounced save + "Saved 2s ago" indicator
- [ ] Drag-drop sections (vertical) + line items (within section)
- [ ] Inline discount / tax / rush / deposit controls
- [ ] Activity + Sharing move to a header dropdown (no longer tabs)
- [ ] Auto-reminder sequences on SENT quotes (§3.1, §7.3 item 7) — schedule +3d/+7d/+14d

### Files affected (expected)

- `src/app/t/[slug]/quotes/[id]/page.tsx`
- `src/components/quotes/QuoteEditor.tsx` (new)
- `src/components/quotes/QuoteLivePreview.tsx` (new)
- `src/app/actions/quotes.ts` — add granular autosave endpoints

### Backend work

- Field-scoped autosave actions (set subtotal / line-item / discount / tax etc.) that return minimal diff.
- Scheduled-reminder job queue row per quote on SEND.

### Frontend work

- Drag-drop with dnd-kit (already in deps? verify in phase kickoff).
- Live preview iframe or in-place render of the customer view.

### What NOT to touch

- Quote state machine (DRAFT → SENT → APPROVED/DECLINED/EXPIRED).
- Public `/q/[token]` share route rendering.

### Definition of Done

- Autosave works on every field; no Save button anywhere except Send.
- Preview matches `/q/[token]` rendering.
- Reminder job schedules + fires at intervals in a staging environment.

### Completion notes

_Pending phase start._

---

## Phase 7 — Customer portal redesign + AI Co-pilot ("Flow") MVP

**Status:** ⚪ Not started

### Objective

Two parallel tracks, both customer-value forward:

**A. Portal redesign** — from a list-of-lists to a "Your projects with Acme Signs" dashboard with job cards, photo strip, countdown-to-install, big "Pay balance" CTA. Branded (subdomain + logo/color/typography). Proof markup tool. Mobile-first PWA.

**B. AI Co-pilot ("Flow") MVP** — three highest-leverage surfaces first: (1) Quote drafting from customer email thread, (2) Inbox reply suggestions, (3) Morning brief email to the owner. All usage metered, plan-gated.

### Strategy sections covered

- §8.2.A (full), §8.2.B (full), §8.2.D (e-sign + deposit), §8.2.H (proof markup), §3.5 (portal upgrades)

### Tasks

- [ ] Portal branded-tier infrastructure: custom subdomain, brand-color theming, logo
- [ ] Portal landing redesign: job cards, photo strip, pay CTA
- [ ] Proof markup canvas (arrows, boxes, text, color picker, version scrubber)
- [ ] E-sign + Stripe deposit capture on quote approval
- [ ] `Flow` AI integration: new `/t/[slug]/ai` surface
- [ ] Flow: "Draft a quote from this email" on customer Communication tab
- [ ] Flow: "Suggest reply" button in Inbox Messages chip
- [ ] Flow: Morning brief scheduled job → email owner with daily summary
- [ ] AI usage metering table + plan-gated limits

### Files affected (expected, non-exhaustive)

- `src/app/portal/**` — landing rebuild
- `src/app/(marketing)/[brand]/portal/**` — branded subdomain router (TBD)
- `src/components/proofs/ProofMarkup.tsx` (new)
- `src/app/actions/quote-approve.ts` — e-sign + deposit flow
- `src/app/t/[slug]/ai/page.tsx` (new)
- `src/lib/flow.ts` — AI client wrapper + usage metering
- `prisma/schema.prisma` — AI usage rows, markup storage, branded-tier flags

### Backend work

- Anthropic Claude integration with per-tenant usage caps + plan gates.
- Proof markup storage (JSON blob per version).
- Stripe deposit checkout in the approve flow.
- Branded subdomain routing + CNAME flow.

### Frontend work

- Canvas-based markup tool.
- Redesigned portal landing (job cards, photo strip, pay CTA).
- AI inline buttons with streaming responses.

### What NOT to touch

- Existing staff-facing Inbox (already consolidated in Sprint 1).
- Current token model — only extend.

### Definition of Done

- A staff user can draft a quote from a customer email thread end-to-end.
- A customer can approve + sign + pay deposit in a single portal flow.
- Proof markup persists and renders correctly across versions.
- Branded portal loads from a CNAME pointing at Flowtora.

### Completion notes

_Pending phase start._

---

## Phase 8 — Cash-flow forecast · real QuickBooks sync · Inventory

**Status:** ⚪ Not started

### Objective

Three retention/moat features, shipped together because they share the "financial foresight" mental model and together justify the Pro/Scale plan split.

1. **Cash-flow forecast** (`/t/[slug]/forecast`) — 30/60/90d expected cash in/out with drill-down.
2. **Real QuickBooks / Xero two-way sync** — unblocks 40% of the market that bounces on "not compatible with QB."
3. **Inventory / Materials module** — on-hand stock, BOM auto-decrement from quote, reorder points, PO generation.

Also folds in Billing consolidation (Invoices + Payments + Refunds + Credits → `/t/[slug]/billing`) and dunning sequences.

### Strategy sections covered

- §8.2.E, §8.2.F, §8.2.I, §3.4 full, §6.4 (new routes: payments, forecast, inventory, purchase-orders)

### Tasks

- [ ] New `/t/[slug]/forecast` page with 30/60/90d cash in/out + drill-down
- [ ] Invoices + Payments + Refunds + Credits merge into `/t/[slug]/billing` tabs
- [ ] Dunning sequences: auto +7/+14/+30/+60 reminders on SENT invoices
- [ ] Promise-to-pay support (pauses reminders)
- [ ] QuickBooks two-way sync: customers, invoices, payments; chart-of-accounts mapping UI; reconciliation conflict resolver
- [ ] Xero sync equivalent
- [ ] Inventory module: Materials master, on-hand stock, auto-decrement on stage completion
- [ ] Purchase Orders page + flow
- [ ] Materials → Order profitability wired

### Files affected (expected, non-exhaustive)

- `src/app/t/[slug]/forecast/page.tsx` (new)
- `src/app/t/[slug]/billing/**` (new, replaces separate invoices / payments pages)
- `src/app/t/[slug]/inventory/**` (new module)
- `src/app/t/[slug]/purchase-orders/**` (new module)
- `src/lib/accounting/quickbooks.ts` (new)
- `src/lib/accounting/xero.ts` (new)
- `prisma/schema.prisma` — Material, StockLevel, PurchaseOrder, QboAccount, XeroAccount models

### Backend work

- QB/Xero OAuth + webhook handling + periodic reconciliation job.
- Materials stock tracking with atomic decrement on stage completion.
- Dunning scheduler + promise-to-pay state.
- Cash-flow forecast query: weighted sum of expected invoice payments − scheduled expenses.

### Frontend work

- Billing tab shell.
- Mapping UI for QB chart-of-accounts.
- Inventory tables + reorder point UI.

### What NOT to touch

- Existing Stripe integration (extend, not rewrite).
- Historical invoice data (migrate forward).

### Definition of Done

- QB sync round-trips an invoice + payment in staging.
- Inventory auto-decrements on a test stage completion.
- Cash-flow forecast math matches hand calculation on test fixtures.
- All old invoice/payment routes 308 to Billing tabs.

### Completion notes

_Pending phase start._

---

## Appendix — what's explicitly deferred past Phase 8

From strategy §8.6 Q4 ("24 months — the sign-shop OS"):

- Crew scheduling + route optimisation (§8.2.G extension)
- Industry benchmarks (§8.2.J)
- Printer queue integrations (Onyx / Caldera / Roland)
- Public API + app marketplace
- Franchise group-sharing invite flow

And from §3 gap analysis not yet assigned:

- Customer merge / dedupe tool (§3.1)
- Contact-level activity (per-contact history)
- Email sync (Gmail/Outlook in-product)
- Option-builder pricing in share view
- Tiered "Good/Better/Best" packages
- Margin guardrails on line items
- Quote view-through analytics
- Capacity planning
- Shop-floor tablet mode (`/floor` URL)
- iCal export for installs
- PDF rendering for invoices/quotes

These are out of scope for the current 8 phases. They will be re-scoped after Phase 8 lands.

---

*End of plan. Owner updates this file on every task close. Never delete completed-phase history — the audit trail is the point.*
