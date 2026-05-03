"use client";

import * as React from "react";
import type { PricingFormulaDetail } from "@/server/platform/pricing-formulas";
import type { FormulaVariable } from "@/lib/pricing-formula-eval";

export function TesterTab({ detail }: { detail: PricingFormulaDetail }) {
  // Initialize input state from each variable's declared default.
  const [inputs, setInputs] = React.useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const v of detail.variables) {
      init[v.key] = v.default ?? (v.type === "number" ? 1 : v.type === "boolean" ? false : "");
    }
    return init;
  });
  const [result, setResult] = React.useState<{
    ok: boolean; value?: number; error?: string;
  } | null>(null);
  const [pending, setPending] = React.useState(false);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    try {
      const res = await fetch("/api/platform/catalog/pricing/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expression: detail.expression,
          variables: detail.variables,
          constants: detail.constants,
          tierTable: detail.tierTable,
          inputs,
        }),
      });
      const json = await res.json();
      setResult(json);
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Network error" });
    } finally {
      setPending(false);
    }
  };

  const updateInput = (key: string, value: unknown) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_400px]">
      <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
        <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
          <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
            Inputs
          </h2>
          <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
            Set variable values + click <strong>Calculate</strong> to evaluate the formula.
          </p>
        </div>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2">
          {detail.variables.length === 0 ? (
            <p className="md:col-span-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
              No declared variables. Add some on the Definition tab to enable the tester.
            </p>
          ) : (
            detail.variables.map((v) => (
              <VariableInput
                key={v.key}
                variable={v}
                value={inputs[v.key]}
                onChange={(val) => updateInput(v.key, val)}
              />
            ))
          )}
          {detail.variables.length > 0 && (
            <div className="md:col-span-2 flex items-end justify-end">
              <button type="submit" disabled={pending}
                      className="ts-focus rounded-md px-4 py-2 text-[13px] font-medium"
                      style={{ background: "var(--accent-primary)", color: "var(--accent-on-primary)" }}>
                {pending ? "Calculating…" : "Calculate"}
              </button>
            </div>
          )}
        </form>
      </section>

      <aside className="space-y-4">
        {result && (
          <section className="rounded-lg border" style={{
            background: "var(--surface-1)",
            borderColor: result.ok ? "var(--success-fg)" : "var(--danger-fg)",
          }}>
            <div className="px-4 py-3" style={{
              background: result.ok ? "var(--success-surface)" : "var(--danger-surface)",
            }}>
              <div className="text-[11px] font-semibold uppercase tracking-wide"
                   style={{ color: result.ok ? "var(--success-fg)" : "var(--danger-fg)" }}>
                {result.ok ? "Calculated price" : "Error"}
              </div>
              <div className="mt-1 text-[28px] font-semibold tabular-nums leading-none"
                   style={{ color: result.ok ? "var(--success-fg)" : "var(--danger-fg)" }}>
                {result.ok && result.value != null
                  ? `$${result.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : "—"}
              </div>
              {!result.ok && (
                <p className="mt-2 font-mono text-[12px]" style={{ color: "var(--danger-fg)" }}>
                  {result.error}
                </p>
              )}
            </div>
          </section>
        )}

        <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
            <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
              Expression
            </h2>
          </div>
          <pre className="overflow-auto p-4 font-mono text-[12px] whitespace-pre-wrap break-words"
               style={{ color: "var(--text-default)" }}>
            {detail.expression}
          </pre>
        </section>

        {detail.constants.length > 0 && (
          <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
                Constants
              </h2>
            </div>
            <ul className="divide-y text-[12px]" style={{ borderColor: "var(--border-subtle)" }}>
              {detail.constants.map((c) => (
                <li key={c.key} className="flex items-baseline justify-between gap-3 px-4 py-2">
                  <span style={{ color: "var(--text-default)" }}>
                    <span className="font-mono">{c.key}</span>
                    {c.label && <span style={{ color: "var(--text-muted)" }}> · {c.label}</span>}
                  </span>
                  <span className="font-mono tabular-nums" style={{ color: "var(--text-default)" }}>
                    {c.value}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {detail.tierTable && detail.tierTable.length > 0 && (
          <section className="rounded-lg border" style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)" }}>
            <div className="border-b px-4 py-3" style={{ borderColor: "var(--border-subtle)" }}>
              <h2 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>
                Tier table
              </h2>
            </div>
            <table className="w-full text-[12px]">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium" style={{ color: "var(--text-muted)" }}>Qty</th>
                  <th className="px-3 py-1.5 text-right font-medium" style={{ color: "var(--text-muted)" }}>Unit price</th>
                </tr>
              </thead>
              <tbody>
                {detail.tierTable.map((t, i) => (
                  <tr key={i} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                    <td className="px-3 py-1.5 tabular-nums" style={{ color: "var(--text-default)" }}>{t.qty}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: "var(--text-default)" }}>
                      ${t.unitPrice.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </aside>
    </div>
  );
}

function VariableInput({
  variable, value, onChange,
}: {
  variable: FormulaVariable;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const labelText = `${variable.label}${variable.required ? " *" : ""}`;

  if (variable.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--text-default)" }}>
        <input type="checkbox" checked={!!value}
               onChange={(e) => onChange(e.target.checked)} />
        <span>{labelText}</span>
      </label>
    );
  }

  if (variable.type === "select" && variable.options) {
    return (
      <label className="block">
        <span className="block text-[11px] font-medium uppercase tracking-wide"
              style={{ color: "var(--text-muted)" }}>
          {labelText}
        </span>
        <select
          value={String(value ?? "")}
          onChange={(e) => {
            const opt = variable.options?.find((o) => String(o.value) === e.target.value);
            onChange(opt?.value ?? e.target.value);
          }}
          className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
          style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
        >
          {variable.options.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
          ))}
        </select>
      </label>
    );
  }

  // number / text / fallback
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-wide"
            style={{ color: "var(--text-muted)" }}>
        {labelText}
      </span>
      <input
        type={variable.type === "number" ? "number" : "text"}
        value={String(value ?? "")}
        min={variable.min}
        max={variable.max}
        step={variable.step}
        onChange={(e) => {
          const v = variable.type === "number"
            ? (e.target.value === "" ? "" : Number(e.target.value))
            : e.target.value;
          onChange(v);
        }}
        className="ts-focus mt-1 w-full rounded-md border px-3 py-2 text-[13px]"
        style={{ background: "var(--surface-1)", borderColor: "var(--border-subtle)", color: "var(--text-default)" }}
      />
    </label>
  );
}
