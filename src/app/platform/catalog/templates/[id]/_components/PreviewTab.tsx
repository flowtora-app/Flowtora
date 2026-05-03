import type { TemplateDetail } from "@/server/platform/industry-templates";
import { renderTemplate, SAMPLE_DATA } from "@/lib/industry-template-render";
import { DeferredNote } from "../../_components/shared";

export function PreviewTab({ detail }: { detail: TemplateDetail }) {
  const isEmail = detail.kind === "PROOF_EMAIL" || detail.kind === "CUSTOMER_EMAIL";
  const renderedSubject = isEmail && detail.subject
    ? renderTemplate(detail.subject, SAMPLE_DATA)
    : null;
  const renderedHtml = renderTemplate(detail.bodyHtml, SAMPLE_DATA);
  const renderedText = detail.bodyText ? renderTemplate(detail.bodyText, SAMPLE_DATA) : null;

  return (
    <div className="space-y-5">
      {renderedSubject && (
        <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
              Subject (rendered)
            </h2>
          </div>
          <div className="px-4 py-3 text-[14px]" style={{ color: "var(--text-default)" }}>
            {renderedSubject}
          </div>
        </section>
      )}

      <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="flex items-baseline justify-between gap-2 border-b px-4 py-3"
             style={{ borderColor: "var(--border-subtle)" }}>
          <div>
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
              HTML render
            </h2>
            <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              Sample-data placeholders filled. Iframe sandbox disables scripts.
            </p>
          </div>
        </div>
        <div className="p-4">
          <iframe
            title="Template preview"
            sandbox=""
            srcDoc={renderedHtml}
            style={{
              width: "100%",
              minHeight: 480,
              border: "1px solid var(--border-subtle)",
              borderRadius: 6,
              background: "white",
            }}
          />
        </div>
      </section>

      {renderedText && (
        <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
              Plain-text render
            </h2>
          </div>
          <pre className="overflow-auto p-4 font-mono text-[12px] whitespace-pre-wrap break-words"
               style={{ color: "var(--text-default)" }}>
            {renderedText}
          </pre>
        </section>
      )}

      <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            Sample data
          </h2>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Object the preview is rendered against. Production uses real tenant + customer data
            at render time.
          </p>
        </div>
        <pre className="overflow-auto p-4 font-mono text-[11px] whitespace-pre-wrap break-words"
             style={{ color: "var(--text-muted)" }}>
          {JSON.stringify(SAMPLE_DATA, null, 2)}
        </pre>
      </section>

      <DeferredNote>
        <strong>Production render pipeline is deferred.</strong> The preview here uses a simple
        `{`{{path.to.value}}`}` substitution against sample data. The workspace pipeline will
        do loops, conditionals, currency formatting, and locale-aware dates — wire-up ships
        when the email + PDF render surfaces are unified. Per-template "send test" + custom
        sample-data input UI ships with that.
      </DeferredNote>
    </div>
  );
}
