# Tracksign — 23-Phase Restructuring Plan

**Status:** Active. This is the source of truth for platform direction.

You are not building a basic MVP anymore.

You are upgrading and restructuring an already-existing multi-tenant SaaS
application for sign shop and print shop operations into a premium,
production-worthy, high-end SaaS platform that feels polished, complete,
thoughtful, scalable, and easy to use.

The previous version was built in phases 1–17, but this next version must go
much further. Your job is to audit, improve, expand, and refine the product
architecture, feature depth, workflows, page structure, and user experience so
this becomes a platform that can realistically command $100+/month or more.

This must feel like a real software company product, not a dev project.

---

## CORE OBJECTIVE

Transform the current application into a platform that is:

- premium and modern in design
- extremely easy to use
- deeply thought through in every workflow
- detailed at the page and interaction level
- built for real-world sign shop and print shop operations
- scalable as a serious multi-tenant SaaS platform
- polished both internally and externally
- ready for beta testing, support, iteration, and production launch

This should feel like a blend of:

- a premium SaaS product
- an operations platform
- a sales and production system
- a client-facing portal
- a serious business management platform

Do not think only like a developer. Think like:

- a SaaS founder
- a senior product designer
- a UX strategist
- a technical architect
- an operations consultant for sign and print shops

---

## IMPORTANT BUILD PHILOSOPHY

Do not implement shallow versions of features.

Every major area must be designed with:

- complete workflows
- page-level logic
- empty states
- edge cases
- permissions
- usability
- role awareness
- helpful defaults
- scalable data architecture
- polished UI structure
- operational realism

When building each feature, ask:

- What would make this feel premium?
- What would make it easier for real shop staff to use daily?
- What would reduce confusion and clicks?
- What details are usually forgotten?
- What would make users trust this product immediately?
- What does this page need to feel complete, not half-done?

---

## PRODUCT CONTEXT

This application is a multi-tenant SaaS platform for sign shops and print shops.

Each tenant/business has its own isolated workspace with its own users,
customers, products/services, quotes, orders, proofs, invoices, files, expenses,
reports, settings, branding, workflows.

The platform also has a **platform layer** for the SaaS owner/company to manage
tenants, plans, billing, support, feature flags, beta access, internal tools,
system health, platform analytics.

And it has a **customer/client layer** for each tenant's customers to view
quotes, approve proofs, pay invoices, upload files, track order progress,
review history, communicate with the shop.

---

## PRIMARY GOALS FOR THIS VERSION

### 1. Audit and improve all existing systems

Identify and improve: underdeveloped flows, weak UI/UX, missing permissions,
missing page states, missing admin tools, missing support tools, missing
edge-case handling, missing business logic, missing customer-facing polish,
missing internal operational logic.

### 2. Add missing platform layers

Full public-facing marketing website / landing page; better onboarding flows;
better dashboards by role; better settings architecture; search and navigation
systems; notifications and activity logs; help/support systems; testing mode /
beta release systems; ticket submission and issue reporting; admin oversight
tools; better customer portal experiences; better business customization
systems; stronger platform control center; better feedback loops before public
launch.

### 3. Build with premium UX standards

For every major page, think through: layout, hierarchy, actions, tables, cards,
forms, side panels, filters, search, bulk actions, empty states, success
states, loading states, destructive action warnings, mobile responsiveness
where relevant, usability for non-technical users.

---

## NON-NEGOTIABLE PRODUCT STANDARDS

The application must feel: premium, cohesive, modern, clean, intuitive,
trustworthy, operationally useful, visually organized, role-aware, scalable,
production-worthy.

Avoid: generic admin-page feel; bare tables with no product thinking; forms
without UX help; shallow workflows; pages that technically work but feel
unfinished; missing states; inconsistent patterns; feature bloat without
usability; building only backend logic without thoughtful front-end structure.

---

## PHASE 1 — CORE SAAS FOUNDATION AND TENANT ARCHITECTURE

**Purpose.** Strengthen the SaaS core so everything else is built on a
reliable, secure, scalable foundation.

**Must include.** true multi-tenant architecture; strict tenant isolation;
tenant-aware queries and services; safe authorization boundaries; support for
current one-business-per-tenant model; future-ready foundation for
multi-location businesses; soft deletes where appropriate; restore/archive
behavior where appropriate; auditability and change history; environment
awareness (dev/staging/beta/live); system-wide feature flags; plan
entitlements and capability gating.

**Must improve.** tenant lifecycle states; suspended/archived/past-due
behaviors; internal admin visibility into tenant health; better internal SaaS
controls; safe impersonation architecture; internal notes/support metadata per
tenant.

**UX expectations.** platform admin overview dashboard; tenant status
indicators; billing state visibility; quick access to tenant health,
onboarding, support, and subscription status.

---

## PHASE 2 — AUTHENTICATION, SECURITY, USERS, ROLES, AND PERMISSIONS

**Purpose.** Build a serious access-control system that feels enterprise-aware
without being overly complex for small shops.

**Must include.** secure authentication; invite flows; password reset; email
verification; session handling; lockout/abuse protections; optional 2FA-ready
architecture; platform roles; tenant roles; custom role templates; permission
groups; granular permissions by capability.

**Must improve.** field-level restrictions where needed; action-level
permissions; approval permissions; financial visibility controls; role-aware
UI rendering; hidden actions when not allowed; role preview/testing for admins.

**UX expectations.** role assignment UI; permission matrix or grouped
permission builder; warnings for sensitive permissions; clear role
descriptions; "what this user can access" summaries.

---

## PHASE 3 — GLOBAL APP SHELL, NAVIGATION, SEARCH, AND PRODUCT EXPERIENCE LAYER

**Purpose.** Make the app fast and easy to use across the entire system.

**Must include.** robust sidebar navigation; top navigation utilities; global
search; quick actions / command menu; recent records; pinned/favorite records;
notification center; user profile menu; workspace/business context awareness.

**Search must support.** customers, leads, quotes, orders, invoices, proofs,
tickets, files, products, users where permitted.

**UX expectations.** universal quick-create; keyboard-friendly navigation;
consistent page headers; breadcrumbs where useful; saved views for table-heavy
modules; smart filters; clean loading states; no page should feel isolated
from the rest of the app.

---

## PHASE 4 — BUSINESS ONBOARDING, ACTIVATION, AND FIRST-RUN EXPERIENCE

**Purpose.** Help new shops get setup quickly and feel immediate value.

**Must include.** guided onboarding flow; business setup wizard; branding
setup; default numbering settings; tax settings; estimate defaults; proof
defaults; invoice defaults; deposit defaults; user invitation flow; first
product/service setup; first customer setup; first quote flow guidance.

**Must improve.** onboarding completion tracking; activation score / setup
progress; contextual recommendations; sample/demo data option; role-based
onboarding guidance; "skip for now" but incomplete setup reminders.

**UX expectations.** checklist-style onboarding dashboard; empty states that
teach; smart defaults by business type; progress meter; obvious next steps
after signup.

---

## PHASE 5 — PUBLIC MARKETING WEBSITE / LANDING PAGE / DEMO CONVERSION SYSTEM

**Purpose.** Build the public-facing website that sells the platform before
users ever log in. This is a major missing system and must be treated as a
real product surface, not a side page.

**Must feel.** premium, high-trust, polished, conversion-oriented, modern,
much stronger than basic competitors.

**Must include.** hero section with strong value proposition; CTA for sign up
and/or book demo; strong messaging for sign and print shop owners; clear
feature sections; visual product walkthrough/screenshot sections; role/use-case
sections; benefits by workflow; proofing/order/production/customer portal
highlights; pricing preview; testimonials/social proof sections; FAQ; footer
with proper product/company/legal navigation; comparison/value framing; strong
mobile design; polished forms for contact/demo/trial signup.

**UX expectations.** premium design quality; clear section flow; excellent
copy hierarchy; trust-building visual treatment; no generic SaaS landing page
blocks without niche relevance; every section should answer a buyer objection
or strengthen conversion.

---

## PHASE 6 — ROLE-BASED DASHBOARDS AND DAILY WORKSPACES

**Purpose.** Make each user feel the product is built for their actual job.

**Must include role-aware dashboards for.** business owner, shop manager/admin,
sales rep, designer, production manager, installer/field tech,
accounting/bookkeeper, customer service/front desk, platform admin,
support/internal staff.

**Dashboard components may include.** revenue summary; quote conversion; jobs
due today; unpaid invoices; overdue approvals; proof revisions pending;
production backlog; install schedule; task list; reminders; tickets/issues;
recent activity; team workload.

**UX expectations.** modular card system; clean hierarchy; useful at-a-glance
information; not just stats, but actionable next steps; user-specific
shortcuts; empty states for new tenants/users.

---

## PHASE 7 — CRM, LEADS, CUSTOMERS, CONTACTS, AND RELATIONSHIP TIMELINES

**Purpose.** Build a real CRM layer tailored for sign/print shop sales and
repeat business.

**Must include.** leads/prospects; status pipelines; source tracking; lead
assignment; follow-ups; reminders; customer accounts; business vs individual
customers; multi-contact customer records; billing/install addresses; tags
and segmentation; notes; attachments; history of quotes/orders/invoices/
proofs/files.

**Must improve.** activity timeline per customer; "next action" visibility;
lost reason tracking; opportunity health; sales notes structure; lead
conversion flow into customer/account.

**UX expectations.** strong timeline design; kanban + table views; follow-up
prompts; clean profile pages; linked records are easy to reach; action buttons
always obvious.

---

## PHASE 8 — PRODUCT CATALOG, SERVICE TYPES, AND ADVANCED PRICING ENGINE

**Purpose.** Build a flexible pricing and catalog system that reflects real
sign/print shop quoting.

**Must include.** standard products; custom products; print products; sign
products; install services; design services; rush fees; delivery fees; labor
items; setup fees; product options; variant logic; pricing methods (fixed
price, quantity based, square foot, linear foot, labor-based, custom quoted);
cost tracking; margin visibility; optional internal instructions/assets/spec
sheets.

**Must improve.** reusable configurations; common package templates;
formula-ready pricing architecture; better handling of custom work; more
realistic materials/finish/illumination/mounting options; shop-specific
pricing rules.

**UX expectations.** live calculator feel where appropriate; product setup
should not be overwhelming; grouped forms; smart option sections;
internal-only vs customer-facing information separation.

---

## PHASE 9 — QUOTING SYSTEM, ESTIMATING, PROPOSALS, AND APPROVAL FLOWS

**Purpose.** Make the quoting system a core strength of the platform.

**Must include.** quote builder; reusable templates; optional items; grouped
sections; discounts; taxes; deposits; shipping/install fees; internal notes;
customer notes; expiration dates; share links; branded outputs; quote
statuses; approval/rejection workflows; revisions/versioning; convert quote
to order.

**Must improve.** better revision controls; interactive client-facing quote
experience; approval clarity; good/better/best package presentation where
useful; quote analytics (viewed, approved, aging); clearer internal handoff
after approval.

**UX expectations.** quote builder must be fast; line item editing should
feel professional; totals and margin logic should be clear internally;
customer-facing quote should be clean and persuasive; revision flow should
be easy to understand.

---

## PHASE 10 — ORDER MANAGEMENT, JOB LIFECYCLE, TASKS, AND INTERNAL COORDINATION

**Purpose.** Turn won work into cleanly managed jobs with visibility across
teams.

**Must include.** order conversion from quote; manual order creation; order
statuses; due dates; priority/rush indicators; linked customer, quote,
invoice, proof, files; job specs; dimensions; materials; colors; install
info; production notes; internal comments; mentions; checklists; attachments;
tasks/subtasks; blockers/on-hold reasons.

**Must improve.** true lifecycle visibility; status transitions with rules;
dependency awareness; internal accountability; handoff between sales,
design, production, install, accounting.

**UX expectations.** order detail page should be one of the strongest pages
in the app; clear timeline/history; sections must feel organized, not
overwhelming; all key job info accessible from one central page; strong use
of tabs/cards/side panels where appropriate.

---

## PHASE 11 — ARTWORK, FILE MANAGEMENT, PROOFS, VERSIONING, AND APPROVAL SYSTEM

**Purpose.** Make proofing and artwork management one of the biggest
differentiators of the platform.

**Must include.** file upload and categorization; version tracking; proof
files; production files; reference files; artwork statuses; proof sheet
generation; proof templates; watermarking; customer revision requests; proof
approval; decline/revision flows; approval records; version history.

**Must improve.** clearer version comparisons; internal designer workflow;
revision count handling; proof locking after approval; customer-friendly
viewing experience; audit trail for proof decisions.

**UX expectations.** customer-facing proof page must be extremely clear; big
obvious approve/request revision actions; internal art pages should support
fast iteration; version labels must be easy to understand; uploaded file
organization must not become chaotic.

---

## PHASE 12 — PRODUCTION MANAGEMENT, WORK ORDERS, SHOP FLOOR OPERATIONS, AND SCHEDULING

**Purpose.** Support real production workflows inside a sign/print shop.

**Must include.** production queue; department-based workflow; work orders;
machine/department assignment; production notes; due dates; shop scheduling;
rush job handling; readiness states; quality control checkpoints; material
usage tracking (light inventory level); rework/defect logging; department
task breakdown.

**Departments may include.** print, CNC, vinyl, channel letters, LED
assembly, acrylic, finishing, packaging.

**Must improve.** bottleneck visibility; workload visibility; department
handoffs; queue prioritization; daily production control.

**UX expectations.** production boards should be visually strong; usable on
large monitors and shop floor screens; filters for due today, overdue,
department, ready, blocked; drag/drop where helpful, but not gimmicky; work
order print/export support if needed.

---

## PHASE 13 — INSTALLATION, DELIVERY, SITE SURVEY, AND FIELD EXECUTION

**Purpose.** Support real-world field work and final fulfillment.

**Must include.** install scheduling; crew assignment; site address; customer
contact info; install notes; required tools/materials; before/after photos;
signatures; completion checklists; issue reporting; delivery tracking; pickup
tracking; site survey support; measurements; permit/access/electrical notes.

**Must improve.** mobile-first field experience; completion evidence;
schedule clarity; install readiness checks; issue escalation from the field.

**UX expectations.** field pages must be simple and fast; photo upload should
be easy; signatures and completion flow should feel polished; route/location
info must be obvious; installer experience should not feel like desktop
software squeezed into a phone.

---

## PHASE 14 — INVOICING, PAYMENTS, EXPENSES, PROFIT VISIBILITY, AND FINANCIAL OPERATIONS

**Purpose.** Give tenants professional financial tools without making the app
feel like accounting software overload.

**Must include.** deposit invoices; final invoices; partial invoices;
outstanding balances; online payments; manual payments; failed payment
visibility; tax support; discounts; refunds; credits; write-offs; payment
history; expense tracking; vendor records; receipt uploads; job-linked
expenses; gross profit visibility.

**Must improve.** margin awareness from quote to order to invoice; cleaner
financial summaries; aging visibility; overdue workflows; owner/admin
reporting clarity.

**UX expectations.** invoice pages should be clean and professional; payment
actions must be frictionless; internal finance pages should be organized,
not intimidating; customer-facing invoice experience must be easy on mobile.

---

## PHASE 15 — CUSTOMER PORTAL, SHARED LINKS, AND CLIENT EXPERIENCE

**Purpose.** Give customers a premium self-service experience that reduces
back-and-forth.

**Must include.** secure portal login; quote viewing; proof approval; invoice
payment; file upload; status tracking; messaging/history; download
invoices/receipts; approval history; shared links for quotes/proofs/invoices;
expiring secure links where appropriate.

**Must improve.** visual polish; client trust; clarity of project progress;
reduction of confusion during approvals/payments; branded tenant-specific
portal experience.

**UX expectations.** portal must feel premium and easy; timeline/status view
should be clear; customers should immediately know what action is needed; no
cluttered back-office UI exposed to customers.

---

## PHASE 16 — NOTIFICATIONS, ACTIVITY FEEDS, COMMUNICATIONS, AND EVENT HISTORY

**Purpose.** Centralize awareness across the system.

**Must include.** notification center; email notifications; status-based
alerts; overdue reminders; proof reminders; payment reminders; mentions;
internal comments; activity feeds; communication history per customer/job
where possible.

**Must improve.** relevance of alerts; internal coordination; visibility into
what happened and when; event logging for major actions.

**UX expectations.** notifications should be useful, not noisy; feeds must
be readable; filters for unread/type/priority; clear distinction between
internal and customer-facing communications.

---

## PHASE 17 — REPORTING, DASHBOARDS, ANALYTICS, AND BUSINESS INTELLIGENCE

**Purpose.** Help owners and managers understand the business, not just
operate it.

**Must include.** sales reporting; quote conversion; revenue trends; top
customers; top products/services; overdue invoices; production backlog;
turnaround times; install completion metrics; expense reporting; profitability
insights; platform-level reporting for SaaS admin.

**Must improve.** actionable dashboards; exportability; visual clarity;
filtering by date/user/customer/status/location later; health indicators for
tenant businesses.

**UX expectations.** dashboards must feel useful at a glance; charts should
support decisions; avoid analytics overload; allow saved views or common
report presets.

---

## PHASE 18 — PLATFORM ADMIN CONTROL CENTER, SUPPORT STAFF TOOLS, AND INTERNAL OPERATIONS

**Purpose.** Give the SaaS company serious tools to manage and support the
product.

**Must include.** tenant search; tenant detail pages; subscription visibility;
billing issue visibility; onboarding progress visibility; support notes;
tenant flags; impersonation with audit logs; feature flags; plan entitlements;
usage metrics; support tooling; issue escalation handling.

**Must improve.** internal visibility; support efficiency; safe admin
control; structured tenant notes and history; beta cohort management.

**UX expectations.** platform admin tools should feel like a real control
center; critical tenant info should be easy to scan; destructive actions
should be guarded; support staff should have fast paths to context.

---

## PHASE 19 — TESTING MODE, BETA RELEASE MANAGEMENT, FEEDBACK, AND PRE-LAUNCH ITERATION SYSTEMS

**Purpose.** Support a real testing phase before full launch. This is required.

**Must include.** beta user onboarding flow; tenant/user beta flags; UI beta
badges/banners where appropriate; "testing mode" labeling where needed;
in-app feedback collection; issue/suggestion capture; release notes / "what
changed" area; internal review queue for beta feedback; prioritization
workflows; ability to tag issues by module/severity; tracking of fixed vs
open issues; test-user communication workflows.

**Must improve.** visibility into beta cohorts; structured learning from
early users; confidence before production launch; clear distinction between
feedback, bugs, and requests.

**UX expectations.** users should understand they are in beta without losing
trust; feedback submission should be easy; admins should have structured
review tools; status of reported issues should be trackable internally.

---

## PHASE 20 — BUILT-IN SUPPORT TICKETS, ISSUE REPORTING, DEBUG CONTEXT, AND RESOLUTION WORKFLOWS

**Purpose.** Add a real support/ticketing system inside the app. This is
required and must be treated as a first-class system, not an afterthought.

**Must include.** "report an issue" entry point in-app; support ticket
submission form; issue type/category; urgency/priority; screenshot/file
uploads; freeform explanation; page/feature reference; optional auto-capture
of technical context where safe/appropriate (current page, user, tenant,
browser/device, timestamp, recent actions if available); ticket statuses;
support/admin dashboard; assignment; internal notes; customer-visible updates
where appropriate; resolution flow; ticket history by tenant and user;
post-resolution feedback.

**Must improve.** context quality for debugging; communication loop with
users; internal support efficiency; trust and visibility during beta and
after launch.

**UX expectations.** ticket submission must be simple; users must feel
heard; ticket status should be understandable; internal support pages
should support triage and prioritization.

---

## PHASE 21 — SETTINGS ARCHITECTURE, CUSTOMIZATION, TEMPLATES, AND BUSINESS CONTROL PANELS

**Purpose.** Make settings feel complete and organized, not like a dumping
ground.

**Must include organized settings areas such as.** business profile;
branding; locations/future location readiness; users/roles; numbering
formats; quote defaults; invoice defaults; proof defaults; taxes; deposits;
notification preferences; customer portal branding; file/storage preferences
where relevant; support/contact preferences; integrations; billing/
subscription; templates; feature access depending on plan.

**Must improve.** settings IA (information architecture); role-based
visibility; clarity of what changes affect; admin confidence when editing
settings.

**UX expectations.** settings should be grouped logically; descriptions/help
text should be useful; destructive changes must be warned; preview examples
where helpful.

---

## PHASE 22 — ADVANCED AUTOMATION, APPROVAL RULES, WORKFLOW RULES, AND FUTURE SCALE SYSTEMS

**Purpose.** Reduce manual work and prepare the platform for larger
businesses.

**Must include.** reminders; automated follow-ups; auto-assignment rules;
status-based triggers; proof reminder flows; overdue payment reminders;
approval rules; manager approval thresholds; owner approval thresholds;
deposit-required rules; reusable templates/checklists/messages; customer
tier pricing readiness; enterprise/multi-location architecture readiness.

**Must improve.** consistency; scalability; reduction of manual admin work;
high-value automation without making the system confusing.

**UX expectations.** workflow rules must be understandable; automation setup
should be human-readable; rules must show what they affect.

---

## PHASE 23 — FINAL UX POLISH, DESIGN SYSTEM, EMPTY STATES, MICROCOPY, AND PRODUCTION READINESS

**Purpose.** Take the product from functional to premium.

**Must include.** design consistency pass; reusable design system patterns;
polished empty states; loading skeletons; error states; success confirmations;
destructive action modals; helpful microcopy; inline guidance where useful;
accessibility improvements; responsive behavior review; quality assurance
pass across all modules.

**Must improve.** trust; clarity; emotional feel of the product; perceived
quality; ease of use for non-technical business staff.

**UX expectations.** every page should feel intentionally designed; no
dead-end screens; no awkward unfinished modules; no confusing labels; the
app must feel cohesive across all modules.

---

## OUTPUT AND IMPLEMENTATION EXPECTATIONS

For each system or phase provide: feature structure; page structure; roles
involved; core workflows; important states; UX details; data/logic
considerations; implementation notes where needed.

When implementing, think in terms of: complete modules; complete pages;
reusable components; scalable architecture; admin usability; real tenant
operations; polished customer-facing experiences.

---

## PAGE-LEVEL PRODUCT THINKING REQUIREMENT

For every major page/module, think through:

- **Page composition.** header, summary cards, filters, tables/lists, detail
  panels, actions, tabs, activity history, related records.
- **States.** empty, loading, success, validation errors, permission denied,
  archived/suspended cases, destructive confirmation, partial/incomplete
  setup.
- **UX patterns.** primary CTA, secondary CTA, bulk actions where useful,
  clear status badges, search behavior, saved filters/views where useful,
  side drawers/modals only when they improve speed, keyboard and
  speed-of-use considerations for staff.

---

## QUALITY BAR

The final product should feel closer to: a premium vertical SaaS; a serious
operations platform; a polished business system.

It should not feel like: an unfinished admin dashboard; a stitched-together
CRUD tool; a generic template with business entities added.

---

## WHAT TO PRIORITIZE MOST

If tradeoffs are needed, prioritize: usability; workflow clarity; role-aware
design; proof/order/invoice/customer portal experience; internal operational
visibility; premium product feel; supportability and beta readiness;
scalability.

---

## IMPLEMENTATION MODE

Use this as the new source of truth for expanding/rebuilding the platform.

As you proceed: identify gaps in the current implementation; propose
improvements where needed; restructure modules if current architecture is
too shallow; build in a way that supports phased rollout; preserve
scalability and maintainability; favor thoughtful completeness over rushed
feature count.

Do not stay at MVP level. Build this like a serious SaaS company product.

---

## SESSION PROGRESS LOG

- [x] **Phase 1** — Core SaaS Foundation (tenants, environment, archive lifecycle, plans)
- [x] **Phase 2** — Authentication, Security, Users, Roles, Permissions
  (2FA, password reset, email verification, lockout, session revocation,
  team management, ownership transfer, suspend/reinstate)
- [x] **Phase 3** — Global App Shell, Navigation, Search, Product
  Experience Layer (⌘K palette with pins, full search page, shortcut
  cheat-sheet, workspace switcher chips)
- [x] **Phase 3.5** (ad-hoc) — Auth config split (`auth.config.ts`) to
  unblock middleware on the Edge runtime
- [x] **Phase 4** — Business Onboarding, Activation, First-Run Experience
- [x] **Phase 5** — Public Marketing Website / Landing Page
- [x] **Phase 6** — Role-Based Dashboards
- [x] **Phase 7** — CRM, Leads, Customers, Contacts
- [x] **Phase 8** — Product Catalog, Pricing Engine
- [x] **Phase 9** — Quoting System, Proposals, Approval Flows
- [x] **Phase 10** — Order Management, Job Lifecycle
- [x] **Phase 11** — Artwork, File Management, Proofs, Versioning
- [x] **Phase 12** — Production Management, Work Orders, Shop Floor
- [x] **Phase 13** — Installation, Delivery, Site Survey, Field Execution
- [x] **Phase 14** — Invoicing, Payments, Expenses, Financial Operations
- [x] **Phase 15** — Customer Portal, Shared Links, Client Experience
- [x] **Phase 16** — Notifications, Activity Feeds, Communications, Event History
  (Resend email provider wired; sendMessageTemplate sends real email;
  Resend delivery webhook for open/click/bounce tracking; two-way portal
  messaging with customer compose + staff reply; per-user notification
  preferences in Settings → Notifications)
- [x] **Phase 17** — Reporting, Dashboards, Analytics, Business Intelligence
  (Recharts TrendChart + DonutChart; financial revenue trend + method donut;
  products/services report with multi-line trend; CSV exports on all report pages;
  platform MRR/churn dashboard with 90-day growth trend and plan breakdown table)
- [x] **Phase 18** — Platform Admin Control Center, Support Staff Tools, Internal Operations
  (Platform sidebar with active nav state; tenant onboarding milestones card;
  business profile card; trial expiry warning banner on tenant detail;
  all prior: tenant list/search/filter, tenant detail with 8 KPIs, feature
  entitlements matrix, impersonation, archive/restore, support ticket queue + detail,
  compliance queue, audit log viewer, feature flags global page)
- [x] **Phase 19** — Testing Mode, Beta Release Management, Feedback, Pre-launch
  (Tenant.betaCohort enum with ALPHA/BETA/PILOT/NONE rollout waves shown
  as chips on tenant list + detail; marketing lead inbox at /platform/leads
  with kind/status/mine filters and triage detail page for status/assignee/
  conversion/notes; launch readiness scoring at /platform/readiness
  deriving go/no-go from profile + onboarding + member + customer/product/
  quote counts + Stripe linkage — per-tenant card also shows on the tenant
  detail; platform feedback aggregator at /platform/feedback with
  kind/rating/date/tenant filters and CSV export; sandbox reset button on
  DEMO/TEST tenants wipes+reseeds demo data via extracted
  clearSampleDataForTenant/loadSampleDataForTenant cores)
- [x] **Phase 20** — Built-in support tickets, issue reporting, resolution workflows
  (Staff-only internal notes on tickets — amber styling + "staff only" badge
  on platform view, stripped at the query level on tenant view so rendering
  bugs can't leak them; tenant-side email notification when platform staff
  replies, gated by per-user `support.staff_replied` pref (default off);
  SLA tracking with `dueBy` computed from priority at open/reactivation
  (URGENT 4h / HIGH 24h / NORMAL 72h / LOW 7d) and chip on queue + detail
  showing "due in 2h" / "overdue 1d 4h"; `firstStaffReplyAt` stamped on
  first non-internal staff message → "first response in 3h" line on detail;
  platform-wide canned replies library at /platform/support/templates with
  optional category filter and soft-delete, client-side picker on reply
  form interpolating `{{tenantName}}` / `{{ticketSubject}}`; 1–5 satisfaction
  rating on RESOLVED/CLOSED tickets with optional comment, surfaced in
  platform queue + detail with green/amber/red color by score)
- [x] **Phase 21** — Settings architecture, customization, templates
  (Slice A: email sender customization — `emailFromName` + `emailReplyTo` on
  Tenant wired through `sendCustomerEmail` to the Resend transport with the
  display name sanitized against header injection while the envelope sender
  stays on the verified `noreply@tracksign.app` domain (DKIM/SPF safe) —
  Reply-To goes back to the shop's inbox. Slice B: document output
  customization — `quoteFooterText`, `invoiceFooterText`, and
  `paymentInstructions` on Tenant; new /settings/documents form; rendered
  above the contact line in quote/invoice/payment-receipt emails and on
  the portal's quote/invoice detail pages (whitespace-pre-wrap, no HTML
  passthrough); payment instructions only shown on the portal invoice
  when a balance remains. Slice C: tenant-wide notification defaults —
  `Tenant.defaultNotifPrefs` JSON shares the Membership shape; new
  /settings/notifications-defaults admin page (fieldset-disabled for
  non-managers); invite-accept seeds the defaults into the new
  Membership's notifPrefs; `resolveEffectivePref` falls through
  personal → tenant default → built-in {inApp:true, email:false};
  support-reply email pipeline now honors the tenant default when the
  member hasn't set `support.staff_replied` personally; personal
  notifications page gets a "Reset to workspace defaults" button. Slice D:
  locale & formatting — `Tenant.dateFormat` (US|EU|ISO, default US) +
  `Tenant.weekStartsOn` (0–6); `formatDate(d, fmt?)` stays backward-compatible
  (staff screens default to ISO) while portal pages pass
  `ctx.tenant.dateFormat` — retrofitted portal home, quotes list/detail,
  invoices list/detail, orders list/detail, proofs list/detail, and
  installs; profile settings form adds both controls. Slice E: settings
  hub — /settings no longer redirects, it renders a grouped card index
  (Shop / Workspace / People / Account) with a short description on each
  card, gated by entitlements, plus an "Last settings change" banner
  pulling the most recent `settings.*` audit log row; SettingsNav grew an
  Overview link back to the hub. All settings save actions log
  `settings.*` audit events for the Overview banner to read.)

- [ ] Phase 22–23 — pending ← NEXT
