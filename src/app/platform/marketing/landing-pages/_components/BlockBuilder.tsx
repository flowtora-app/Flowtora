"use client";

// Page 38 — Block-based visual builder.
//
// Renders the block list with inline edit, reorder (up/down), delete,
// and an "Add block" picker. Live preview pane on the right (rendered
// via a `srcdoc` iframe so the page CSS can be isolated). The full
// blocks JSON is mirrored to a hidden input so the parent form can
// persist on submit.

import * as React from "react";
import {
  BLOCK_LABELS,
  BLOCK_DESCRIPTIONS,
  defaultBlock,
  renderBlocks,
  LP_BASE_CSS,
  type LpBlock,
  type LpBlockKind,
} from "@/lib/lp-blocks";

const BLOCK_KINDS: LpBlockKind[] = [
  "header", "hero", "features", "testimonials", "pricing", "cta", "faq", "footer", "image", "raw_html",
];

export function BlockBuilder({
  initial,
  hiddenInputName,
  customCss,
}: {
  initial: LpBlock[];
  hiddenInputName: string;
  customCss?: string | null;
}) {
  const [blocks, setBlocks] = React.useState<LpBlock[]>(initial);
  const [activeId, setActiveId] = React.useState<string | null>(initial[0]?.id ?? null);
  const [showPreview, setShowPreview] = React.useState(true);

  React.useEffect(() => { setBlocks(initial); }, [initial]);

  const json = React.useMemo(() => JSON.stringify(blocks), [blocks]);
  const html = React.useMemo(() => renderBlocks(blocks), [blocks]);
  const previewSrc = React.useMemo(() => {
    return `<!doctype html><html><head><meta charset="utf-8"/><style>${LP_BASE_CSS}${customCss ?? ""}</style></head><body class="lp-body">${html}</body></html>`;
  }, [html, customCss]);

  const addBlock = (kind: LpBlockKind) => {
    const block = defaultBlock(kind);
    setBlocks((prev) => [...prev, block]);
    setActiveId(block.id);
  };
  const removeBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    setActiveId((cur) => (cur === id ? null : cur));
  };
  const moveBlock = (id: string, dir: -1 | 1) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[idx], copy[target]] = [copy[target]!, copy[idx]!];
      return copy;
    });
  };
  const updateBlock = (next: LpBlock) => {
    setBlocks((prev) => prev.map((b) => (b.id === next.id ? next : b)));
  };

  const active = blocks.find((b) => b.id === activeId) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={hiddenInputName} value={json} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-md border p-2"
           style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Add block
        </span>
        {BLOCK_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => addBlock(k)}
            title={BLOCK_DESCRIPTIONS[k]}
            className="ts-focus rounded-sm px-2 py-1 text-[11px] font-medium"
            style={{ background: "var(--surface-1)", color: "var(--text-default)", border: "1px solid var(--border-default)" }}
          >
            + {BLOCK_LABELS[k]}
          </button>
        ))}
        <span aria-hidden className="ml-auto" />
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="ts-focus rounded-sm px-2 py-1 text-[11px] font-medium"
          style={{
            background: showPreview ? "var(--accent-primary)" : "var(--surface-1)",
            color: showPreview ? "var(--accent-fg)" : "var(--text-default)",
            border: `1px solid ${showPreview ? "var(--accent-primary)" : "var(--border-default)"}`,
          }}
        >
          {showPreview ? "Hide preview" : "Show preview"}
        </button>
      </div>

      <div className={`grid gap-3 ${showPreview ? "lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,1fr)]" : "lg:grid-cols-[260px_minmax(0,1fr)]"}`}>
        {/* Block list */}
        <aside className="flex flex-col gap-1 rounded-md border p-2"
               style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          {blocks.length === 0 && (
            <p className="px-2 py-3 text-[11px]" style={{ color: "var(--text-faint)" }}>
              Empty page. Click an "+ Add block" button above to start.
            </p>
          )}
          {blocks.map((b, idx) => (
            <div
              key={b.id}
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px]"
              style={{
                background: activeId === b.id ? "var(--surface-2)" : "transparent",
                color: "var(--text-default)",
              }}
            >
              <button
                type="button"
                onClick={() => setActiveId(b.id)}
                className="ts-focus min-w-0 flex-1 truncate text-left"
                style={{ color: "var(--text-default)" }}
              >
                <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                  {idx + 1}.
                </span>{" "}
                <strong>{BLOCK_LABELS[b.kind]}</strong>{" "}
                <span style={{ color: "var(--text-muted)" }}>
                  {summaryFor(b)}
                </span>
              </button>
              <button type="button" onClick={() => moveBlock(b.id, -1)}
                      className="ts-focus px-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
                ↑
              </button>
              <button type="button" onClick={() => moveBlock(b.id,  1)}
                      className="ts-focus px-1 text-[12px]" style={{ color: "var(--text-muted)" }}>
                ↓
              </button>
              <button type="button" onClick={() => removeBlock(b.id)}
                      className="ts-focus px-1 text-[12px]" style={{ color: "var(--danger-fg)" }}>
                ×
              </button>
            </div>
          ))}
        </aside>

        {/* Edit pane */}
        <section className="rounded-md border p-3"
                 style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          {active ? (
            <BlockEditor block={active} onChange={updateBlock} />
          ) : (
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Pick a block on the left, or add a new one from the toolbar above.
            </p>
          )}
        </section>

        {/* Preview pane */}
        {showPreview && (
          <section className="overflow-hidden rounded-md border"
                   style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", minHeight: 480 }}>
            <iframe
              title="Live preview"
              srcDoc={previewSrc}
              style={{ width: "100%", height: 720, border: "none", background: "#fff" }}
              sandbox="allow-same-origin"
            />
          </section>
        )}
      </div>
    </div>
  );
}

function summaryFor(b: LpBlock): string {
  switch (b.kind) {
    case "header":       return b.props.logoText;
    case "hero":         return b.props.headline.slice(0, 40);
    case "features":     return `${b.props.items.length} items`;
    case "testimonials": return `${b.props.items.length} quotes`;
    case "pricing":      return `${b.props.plans.length} plans`;
    case "cta":          return b.props.headline.slice(0, 40);
    case "faq":          return `${b.props.items.length} Q&A`;
    case "footer":       return b.props.text.slice(0, 40);
    case "image":        return b.props.alt || "image";
    case "raw_html":     return "raw html";
  }
}

/* ── Per-block editor forms ─────────────────────────────── */

function BlockEditor({
  block, onChange,
}: {
  block: LpBlock;
  onChange: (next: LpBlock) => void;
}) {
  switch (block.kind) {
    case "hero":         return <HeroEditor         block={block} onChange={onChange} />;
    case "header":       return <HeaderEditor       block={block} onChange={onChange} />;
    case "features":     return <FeaturesEditor     block={block} onChange={onChange} />;
    case "testimonials": return <TestimonialsEditor block={block} onChange={onChange} />;
    case "pricing":      return <PricingEditor      block={block} onChange={onChange} />;
    case "cta":          return <CtaEditor          block={block} onChange={onChange} />;
    case "faq":          return <FaqEditor          block={block} onChange={onChange} />;
    case "footer":       return <FooterEditor       block={block} onChange={onChange} />;
    case "image":        return <ImageEditor        block={block} onChange={onChange} />;
    case "raw_html":     return <RawHtmlEditor      block={block} onChange={onChange} />;
  }
}

function patch<T extends LpBlock>(block: T, props: Partial<T["props"]>, onChange: (b: T) => void) {
  onChange({ ...block, props: { ...block.props, ...props } } as T);
}

function FieldInput({ label, value, onChange, multi, placeholder }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multi?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {multi ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3}
                  placeholder={placeholder}
                  className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
                  style={inputStyle()} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)}
               placeholder={placeholder}
               className="ts-focus rounded-md px-2 py-1.5 text-[12px] outline-none"
               style={inputStyle()} />
      )}
    </label>
  );
}

function HeroEditor({ block, onChange }: { block: Extract<LpBlock, { kind: "hero" }>; onChange: (b: LpBlock) => void }) {
  const p = block.props;
  return (
    <div className="grid gap-2">
      <FieldInput label="Eyebrow"       value={p.eyebrow ?? ""}     onChange={(v) => patch(block, { eyebrow: v || undefined }, onChange)} />
      <FieldInput label="Headline"      value={p.headline}          onChange={(v) => patch(block, { headline: v }, onChange)} />
      <FieldInput label="Subheadline"   value={p.subheadline ?? ""} onChange={(v) => patch(block, { subheadline: v || undefined }, onChange)} multi />
      <div className="grid gap-2 md:grid-cols-2">
        <FieldInput label="Primary label" value={p.primaryLabel ?? ""} onChange={(v) => patch(block, { primaryLabel: v || undefined }, onChange)} />
        <FieldInput label="Primary href"  value={p.primaryHref ?? ""}  onChange={(v) => patch(block, { primaryHref: v || undefined }, onChange)} />
        <FieldInput label="Secondary label" value={p.secondaryLabel ?? ""} onChange={(v) => patch(block, { secondaryLabel: v || undefined }, onChange)} />
        <FieldInput label="Secondary href"  value={p.secondaryHref ?? ""}  onChange={(v) => patch(block, { secondaryHref: v || undefined }, onChange)} />
      </div>
      <FieldInput label="Image URL" value={p.imageUrl ?? ""} onChange={(v) => patch(block, { imageUrl: v || undefined }, onChange)} />
      <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
        Align:
        <select value={p.align ?? "center"} onChange={(e) => patch(block, { align: e.target.value as "left" | "center" }, onChange)}
                className="ts-focus rounded-md px-2 py-1 text-[12px] outline-none" style={inputStyle()}>
          <option value="center">center</option>
          <option value="left">left</option>
        </select>
      </label>
    </div>
  );
}

function HeaderEditor({ block, onChange }: { block: Extract<LpBlock, { kind: "header" }>; onChange: (b: LpBlock) => void }) {
  const p = block.props;
  return (
    <div className="grid gap-2">
      <FieldInput label="Logo text" value={p.logoText} onChange={(v) => patch(block, { logoText: v }, onChange)} />
      <FieldInput label="Logo image URL" value={p.logoUrl ?? ""} onChange={(v) => patch(block, { logoUrl: v || undefined }, onChange)} />
      <ListEditor
        label="Nav links"
        items={p.links}
        onChange={(items) => patch(block, { links: items as { label: string; href: string }[] }, onChange)}
        renderItem={(item, set) => (
          <div className="grid gap-1 md:grid-cols-2">
            <FieldInput label="Label" value={item.label} onChange={(v) => set({ ...item, label: v })} />
            <FieldInput label="Href"  value={item.href}  onChange={(v) => set({ ...item, href: v })} />
          </div>
        )}
        defaultNew={() => ({ label: "New link", href: "#" })}
      />
      <FieldInput label="Primary CTA label" value={p.primaryLabel ?? ""} onChange={(v) => patch(block, { primaryLabel: v || undefined }, onChange)} />
      <FieldInput label="Primary CTA href"  value={p.primaryHref  ?? ""} onChange={(v) => patch(block, { primaryHref:  v || undefined }, onChange)} />
    </div>
  );
}

function FeaturesEditor({ block, onChange }: { block: Extract<LpBlock, { kind: "features" }>; onChange: (b: LpBlock) => void }) {
  const p = block.props;
  return (
    <div className="grid gap-2">
      <FieldInput label="Headline"    value={p.headline    ?? ""} onChange={(v) => patch(block, { headline:    v || undefined }, onChange)} />
      <FieldInput label="Subheadline" value={p.subheadline ?? ""} onChange={(v) => patch(block, { subheadline: v || undefined }, onChange)} multi />
      <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
        Columns:
        <select value={p.columns ?? 3} onChange={(e) => patch(block, { columns: parseInt(e.target.value, 10) as 2 | 3 | 4 }, onChange)}
                className="ts-focus rounded-md px-2 py-1 text-[12px] outline-none" style={inputStyle()}>
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4">4</option>
        </select>
      </label>
      <ListEditor
        label="Features"
        items={p.items}
        onChange={(items) => patch(block, { items: items as { icon?: string; title: string; body: string }[] }, onChange)}
        renderItem={(item, set) => (
          <div className="grid gap-1 md:grid-cols-[80px_minmax(0,1fr)]">
            <FieldInput label="Icon" value={item.icon ?? ""} onChange={(v) => set({ ...item, icon: v || undefined })} />
            <FieldInput label="Title" value={item.title} onChange={(v) => set({ ...item, title: v })} />
            <div className="md:col-span-2">
              <FieldInput label="Body" value={item.body} onChange={(v) => set({ ...item, body: v })} multi />
            </div>
          </div>
        )}
        defaultNew={() => ({ icon: "🟦", title: "Feature", body: "Describe the feature." })}
      />
    </div>
  );
}

function TestimonialsEditor({ block, onChange }: { block: Extract<LpBlock, { kind: "testimonials" }>; onChange: (b: LpBlock) => void }) {
  const p = block.props;
  return (
    <div className="grid gap-2">
      <FieldInput label="Headline" value={p.headline ?? ""} onChange={(v) => patch(block, { headline: v || undefined }, onChange)} />
      <ListEditor
        label="Quotes"
        items={p.items}
        onChange={(items) => patch(block, { items: items as { quote: string; author: string; role?: string; avatarUrl?: string }[] }, onChange)}
        renderItem={(item, set) => (
          <div className="grid gap-1">
            <FieldInput label="Quote"  value={item.quote}  onChange={(v) => set({ ...item, quote: v })} multi />
            <div className="grid gap-1 md:grid-cols-3">
              <FieldInput label="Author"     value={item.author}     onChange={(v) => set({ ...item, author: v })} />
              <FieldInput label="Role"       value={item.role ?? ""} onChange={(v) => set({ ...item, role: v || undefined })} />
              <FieldInput label="Avatar URL" value={item.avatarUrl ?? ""} onChange={(v) => set({ ...item, avatarUrl: v || undefined })} />
            </div>
          </div>
        )}
        defaultNew={() => ({ quote: "Loved it.", author: "Jane Doe", role: "Owner" })}
      />
    </div>
  );
}

function PricingEditor({ block, onChange }: { block: Extract<LpBlock, { kind: "pricing" }>; onChange: (b: LpBlock) => void }) {
  const p = block.props;
  type Plan = (typeof p.plans)[number];
  return (
    <div className="grid gap-2">
      <FieldInput label="Headline"    value={p.headline    ?? ""} onChange={(v) => patch(block, { headline:    v || undefined }, onChange)} />
      <FieldInput label="Subheadline" value={p.subheadline ?? ""} onChange={(v) => patch(block, { subheadline: v || undefined }, onChange)} multi />
      <ListEditor<Plan>
        label="Plans"
        items={p.plans}
        onChange={(items) => patch(block, { plans: items }, onChange)}
        renderItem={(item, set) => (
          <div className="grid gap-1">
            <div className="grid gap-1 md:grid-cols-3">
              <FieldInput label="Name"   value={item.name}            onChange={(v) => set({ ...item, name: v })} />
              <FieldInput label="Price"  value={item.price}           onChange={(v) => set({ ...item, price: v })} />
              <FieldInput label="Tagline" value={item.tagline ?? ""}  onChange={(v) => set({ ...item, tagline: v || undefined })} />
            </div>
            <FieldInput label="Bullets (one per line)"
                       value={item.bullets.join("\n")}
                       onChange={(v) => set({ ...item, bullets: v.split("\n").filter((s) => s.trim().length > 0) })}
                       multi />
            <div className="grid gap-1 md:grid-cols-3">
              <FieldInput label="CTA label" value={item.ctaLabel} onChange={(v) => set({ ...item, ctaLabel: v })} />
              <FieldInput label="CTA href"  value={item.ctaHref}  onChange={(v) => set({ ...item, ctaHref: v })} />
              <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
                <input type="checkbox" checked={item.featured ?? false} onChange={(e) => set({ ...item, featured: e.target.checked })}
                       className="ts-focus h-3 w-3" />
                Featured
              </label>
            </div>
          </div>
        )}
        defaultNew={(): Plan => ({ name: "Plan", price: "$0/mo", bullets: ["Feature one"], ctaLabel: "Start", ctaHref: "/signup" })}
      />
    </div>
  );
}

function CtaEditor({ block, onChange }: { block: Extract<LpBlock, { kind: "cta" }>; onChange: (b: LpBlock) => void }) {
  const p = block.props;
  return (
    <div className="grid gap-2">
      <FieldInput label="Headline"    value={p.headline}              onChange={(v) => patch(block, { headline: v }, onChange)} />
      <FieldInput label="Subheadline" value={p.subheadline ?? ""}     onChange={(v) => patch(block, { subheadline: v || undefined }, onChange)} multi />
      <FieldInput label="Primary label" value={p.primaryLabel}         onChange={(v) => patch(block, { primaryLabel: v }, onChange)} />
      <FieldInput label="Primary href"  value={p.primaryHref}          onChange={(v) => patch(block, { primaryHref: v }, onChange)} />
      <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
        <input type="checkbox" checked={p.formCapture ?? false} onChange={(e) => patch(block, { formCapture: e.target.checked }, onChange)}
               className="ts-focus h-3 w-3" />
        Render inline email-capture form (posts to /api/lp/submit)
      </label>
    </div>
  );
}

function FaqEditor({ block, onChange }: { block: Extract<LpBlock, { kind: "faq" }>; onChange: (b: LpBlock) => void }) {
  const p = block.props;
  return (
    <div className="grid gap-2">
      <FieldInput label="Headline" value={p.headline ?? ""} onChange={(v) => patch(block, { headline: v || undefined }, onChange)} />
      <ListEditor
        label="Q & A"
        items={p.items}
        onChange={(items) => patch(block, { items: items as { question: string; answer: string }[] }, onChange)}
        renderItem={(item, set) => (
          <div className="grid gap-1">
            <FieldInput label="Question" value={item.question} onChange={(v) => set({ ...item, question: v })} />
            <FieldInput label="Answer"   value={item.answer}   onChange={(v) => set({ ...item, answer: v })} multi />
          </div>
        )}
        defaultNew={() => ({ question: "New question", answer: "Answer." })}
      />
    </div>
  );
}

function FooterEditor({ block, onChange }: { block: Extract<LpBlock, { kind: "footer" }>; onChange: (b: LpBlock) => void }) {
  const p = block.props;
  return (
    <div className="grid gap-2">
      <FieldInput label="Footer text" value={p.text} onChange={(v) => patch(block, { text: v }, onChange)} />
      <ListEditor
        label="Footer links"
        items={p.links ?? []}
        onChange={(items) => patch(block, { links: items as { label: string; href: string }[] }, onChange)}
        renderItem={(item, set) => (
          <div className="grid gap-1 md:grid-cols-2">
            <FieldInput label="Label" value={item.label} onChange={(v) => set({ ...item, label: v })} />
            <FieldInput label="Href"  value={item.href}  onChange={(v) => set({ ...item, href: v })} />
          </div>
        )}
        defaultNew={() => ({ label: "Link", href: "/" })}
      />
    </div>
  );
}

function ImageEditor({ block, onChange }: { block: Extract<LpBlock, { kind: "image" }>; onChange: (b: LpBlock) => void }) {
  const p = block.props;
  return (
    <div className="grid gap-2">
      <FieldInput label="Image URL" value={p.url} onChange={(v) => patch(block, { url: v }, onChange)} />
      <FieldInput label="Alt text"  value={p.alt} onChange={(v) => patch(block, { alt: v }, onChange)} />
      <FieldInput label="Caption"   value={p.caption ?? ""} onChange={(v) => patch(block, { caption: v || undefined }, onChange)} />
      <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
        <input type="checkbox" checked={p.fullBleed ?? false} onChange={(e) => patch(block, { fullBleed: e.target.checked }, onChange)}
               className="ts-focus h-3 w-3" />
        Full bleed
      </label>
    </div>
  );
}

function RawHtmlEditor({ block, onChange }: { block: Extract<LpBlock, { kind: "raw_html" }>; onChange: (b: LpBlock) => void }) {
  return (
    <FieldInput label="HTML" value={block.props.html} onChange={(v) => onChange({ ...block, props: { html: v } })} multi />
  );
}

function ListEditor<T>({
  label, items, onChange, renderItem, defaultNew,
}: {
  label: string;
  items: T[];
  onChange: (next: T[]) => void;
  renderItem: (item: T, set: (next: T) => void) => React.ReactNode;
  defaultNew: () => T;
}) {
  const set = (idx: number) => (next: T) => {
    const copy = [...items];
    copy[idx] = next;
    onChange(copy);
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const copy = [...items];
    [copy[idx], copy[target]] = [copy[target]!, copy[idx]!];
    onChange(copy);
  };
  return (
    <div className="rounded-md border p-2"
         style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          {label} ({items.length})
        </span>
        <button type="button" onClick={() => onChange([...items, defaultNew()])}
                className="ts-focus rounded-sm px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: "var(--accent-primary)", color: "var(--accent-fg)" }}>
          + Add
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((item, idx) => (
          <li key={idx}
              className="rounded-md border p-2"
              style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <div className="mb-1 flex items-center justify-end gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
              <button type="button" onClick={() => move(idx, -1)}>↑</button>
              <button type="button" onClick={() => move(idx,  1)}>↓</button>
              <button type="button" onClick={() => remove(idx)} style={{ color: "var(--danger-fg)" }}>×</button>
            </div>
            {renderItem(item, set(idx))}
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-[11px]" style={{ color: "var(--text-faint)" }}>None — click + Add.</li>
        )}
      </ul>
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    background: "var(--surface-1)",
    border: "1px solid var(--border-default)",
    color: "var(--text-default)",
  };
}
