import Link from "next/link";
import { requirePermission } from "@/lib/tenant";
import { createEquipment } from "@/app/actions/equipment";
import { Card } from "@/components/Card";

export default async function NewEquipmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  await requirePermission(slug, "customers:view");

  const action = createEquipment.bind(null, slug);

  const inputStyle = {
    width: "100%",
    height: 40,
    padding: "0 12px",
    borderRadius: 8,
    background: "var(--surface-1)",
    border: "1px solid var(--border-subtle)",
    color: "var(--text-default)",
    fontSize: 13,
    outline: "none",
    letterSpacing: "-0.005em",
  } as const;

  const labelStyle = {
    display: "block" as const,
    marginBottom: 6,
    color: "var(--text-default)",
    fontSize: 12.5,
    fontWeight: 600 as const,
    letterSpacing: "-0.005em",
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div style={{ fontSize: 12 }}>
        <Link
          href={`/t/${slug}/equipment`}
          className="ts-focus inline-flex items-center gap-1 transition-colors hover:text-[var(--text-default)]"
          style={{ color: "var(--text-muted)" }}
        >
          ← Equipment
        </Link>
      </div>

      <header
        className="relative overflow-hidden rounded-2xl"
        style={{
          padding: "18px 22px",
          background:
            "radial-gradient(720px circle at -8% -40%, var(--accent-surface), transparent 55%), " +
            "linear-gradient(180deg, color-mix(in oklab, var(--surface-1) 92%, white 8%) 0%, var(--surface-1) 100%)",
          border: "1px solid var(--border-subtle)",
          boxShadow:
            "inset 0 1px 0 0 color-mix(in oklab, white 4%, transparent), " +
            "0 1px 2px 0 rgba(0,0,0,0.18)",
        }}
      >
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 40,
              height: 40,
              borderRadius: 10,
              background:
                "linear-gradient(135deg, var(--accent-surface-strong), var(--accent-surface))",
              color: "var(--accent-primary)",
              border:
                "1px solid color-mix(in oklab, var(--accent-primary) 30%, transparent)",
              flexShrink: 0,
              boxShadow:
                "inset 0 1px 0 0 color-mix(in oklab, white 6%, transparent)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="6" width="18" height="13" rx="2" />
              <path d="M8 6v-2M16 6v-2M3 11h18" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h1
              className="font-semibold"
              style={{
                color: "var(--text-default)",
                fontSize: 22,
                letterSpacing: "-0.018em",
                lineHeight: 1.2,
              }}
            >
              Add equipment
            </h1>
            <p
              className="mt-1.5"
              style={{
                color: "var(--text-muted)",
                fontSize: 12.5,
                lineHeight: 1.45,
              }}
            >
              Register a printer, cutter, press, embroidery machine, or CNC router. You can assign an operator and link current jobs once it&apos;s in.
            </p>
          </div>
        </div>
      </header>

      {sp.error && (
        <div
          className="rounded-lg px-3.5 py-2.5"
          style={{
            background: "color-mix(in oklab, var(--rose-500) 14%, transparent)",
            color: "var(--danger-fg, var(--rose-500))",
            border:
              "1px solid color-mix(in oklab, var(--rose-500) 30%, transparent)",
            fontSize: 12.5,
            fontWeight: 500,
          }}
        >
          {decodeURIComponent(sp.error)}
        </div>
      )}

      <Card>
        <form action={action} className="space-y-4 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              <span style={labelStyle}>Name</span>
              <input type="text" name="name" required placeholder="Roland #1" style={inputStyle} />
            </label>
            <label>
              <span style={labelStyle}>Kind</span>
              <input type="text" name="kind" required placeholder="Large-format printer" style={inputStyle} />
            </label>
            <label>
              <span style={labelStyle}>Model</span>
              <input type="text" name="model" placeholder="Roland TrueVIS VG2-640" style={inputStyle} />
            </label>
            <label>
              <span style={labelStyle}>Serial number</span>
              <input type="text" name="serialNumber" placeholder="Optional" style={inputStyle} />
            </label>
            <label>
              <span style={labelStyle}>Initial status</span>
              <select name="status" defaultValue="IDLE" style={inputStyle}>
                <option value="IDLE">Idle</option>
                <option value="RUNNING">Running</option>
                <option value="MAINTENANCE">Maintenance</option>
                <option value="DOWN">Down</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span style={labelStyle}>Internal notes</span>
            <textarea
              name="internalNotes"
              rows={3}
              placeholder="Operating quirks, calibration notes, who to call for repair, etc."
              style={{
                ...inputStyle,
                height: "auto",
                paddingTop: 10,
                paddingBottom: 10,
                resize: "vertical",
                lineHeight: 1.5,
              }}
            />
          </label>

          <div
            className="flex items-center justify-end gap-2 pt-4"
            style={{ borderTop: "1px solid var(--border-subtle)" }}
          >
            <Link
              href={`/t/${slug}/equipment`}
              className="ts-focus inline-flex items-center rounded-lg transition-colors hover:bg-[var(--surface-3)]"
              style={{
                height: 32,
                padding: "0 12px",
                color: "var(--text-muted)",
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
              Cancel
            </Link>
            <button
              type="submit"
              className="ts-focus inline-flex items-center gap-1.5 rounded-lg font-semibold transition-transform"
              style={{
                height: 32,
                padding: "0 14px",
                background:
                  "linear-gradient(180deg, color-mix(in oklab, var(--accent-primary) 96%, white 4%) 0%, var(--accent-primary) 100%)",
                color: "var(--accent-fg)",
                border:
                  "1px solid color-mix(in oklab, var(--accent-primary) 80%, black 20%)",
                boxShadow:
                  "0 1px 0 0 rgba(255,255,255,0.15) inset, " +
                  "0 1px 2px 0 rgba(0,0,0,0.35)",
                fontSize: 12.5,
                letterSpacing: "-0.005em",
              }}
            >
              Add equipment
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
