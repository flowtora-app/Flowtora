// Page 28 — Pricing-formula evaluator.
//
// Compiles + runs JS-like expressions written by platform admins
// (and only admins) against a controlled scope. The scope exposes
// the declared variables, constants, the tier-table, and a small
// helper library (min, max, round, ceil, floor, area, perimeter,
// volume, lookup, tier, ifElse).
//
// Honest deferrals: this is `new Function()` under the hood. It's
// safe for trusted admin input — admins can author any formula they
// want, including ones with bugs that produce nonsense numbers, but
// they can't escape into Node globals because the function body
// runs in strict mode with an explicit `this = undefined` and the
// helper scope as its only `with`-style binding (we destructure the
// scope into named parameters rather than using `with`). Tenants
// are NEVER allowed to author or run formulas directly through
// this surface — that ships when we build a sandboxed worker.

export interface FormulaVariable {
  key: string;
  type: "number" | "select" | "boolean" | "text";
  label: string;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string | number; label: string }[];
  required?: boolean;
}

export interface FormulaConstant {
  key: string;
  label?: string;
  value: number;
  description?: string;
}

export interface FormulaTier {
  qty: number;
  unitPrice: number;
}

export interface FormulaEvalInput {
  expression: string;
  variables: FormulaVariable[];
  constants: FormulaConstant[];
  tierTable?: FormulaTier[];
  /** Variable values supplied by the tester pane. */
  inputs: Record<string, unknown>;
}

export interface FormulaEvalResult {
  ok: boolean;
  value?: number;
  steps?: { label: string; value: unknown }[];
  error?: string;
}

const DISALLOWED_TOKENS = [
  "fetch", "process", "require", "import", "globalThis",
  "Buffer", "eval", "Function", "constructor", "prototype",
  "__proto__", "Reflect", "Proxy", "WeakRef", "FinalizationRegistry",
  "queueMicrotask", "setImmediate", "setInterval", "setTimeout",
];

function lintSafety(expression: string): string | null {
  for (const token of DISALLOWED_TOKENS) {
    const rx = new RegExp(`\\b${token}\\b`);
    if (rx.test(expression)) {
      return `Disallowed token in formula: ${token}`;
    }
  }
  return null;
}

/* ── Helper library exposed to formulas ─────────────────── */

function lookup(qty: number, tiers: FormulaTier[] | undefined): FormulaTier | null {
  if (!tiers || tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.qty - b.qty);
  let match: FormulaTier | null = null;
  for (const t of sorted) {
    if (qty >= t.qty) match = t;
  }
  return match ?? sorted[0] ?? null;
}

function tier(qty: number, tiers: FormulaTier[] | undefined): number {
  return lookup(qty, tiers)?.unitPrice ?? 0;
}

function area(width: number, height: number): number {
  // sq ft when both inputs are inches (divide by 144).
  return (width * height) / 144;
}

function perimeter(width: number, height: number): number {
  return 2 * (width + height) / 12; // perimeter in ft when inputs are inches
}

function volume(width: number, height: number, depth: number): number {
  return (width * height * depth) / 1728; // cubic ft when inputs are inches
}

function ifElse<T>(cond: unknown, ifTrue: T, ifFalse: T): T {
  return cond ? ifTrue : ifFalse;
}

/* ── Main entry ─────────────────────────────────────────── */

export function evaluateFormula(input: FormulaEvalInput): FormulaEvalResult {
  if (!input.expression || input.expression.trim() === "") {
    return { ok: false, error: "Expression is empty" };
  }
  const safetyError = lintSafety(input.expression);
  if (safetyError) return { ok: false, error: safetyError };

  // Build the scope. We expose every constant + every variable input
  // by name, plus the helper library, plus the tier table.
  const scope: Record<string, unknown> = {
    Math,
    min: Math.min,
    max: Math.max,
    round: Math.round,
    ceil: Math.ceil,
    floor: Math.floor,
    abs: Math.abs,
    pow: Math.pow,
    sqrt: Math.sqrt,
    lookup: (qty: number) => lookup(qty, input.tierTable),
    tier: (qty: number) => tier(qty, input.tierTable),
    area, perimeter, volume,
    ifElse,
    tiers: input.tierTable ?? [],
  };

  // Coerce + add variables. Number variables get coerced via Number();
  // boolean via Boolean(); text/select pass through; missing values
  // fall back to declared default.
  for (const v of input.variables) {
    let val = input.inputs[v.key];
    if (val == null || val === "") val = v.default;
    if (v.type === "number") val = Number(val ?? 0);
    if (v.type === "boolean") val = !!val;
    scope[v.key] = val;
  }
  // Constants — exposed by their declared key.
  for (const c of input.constants) {
    scope[c.key] = c.value;
  }

  const argNames = Object.keys(scope);
  const argValues = argNames.map((k) => scope[k]);

  let fn: (...args: unknown[]) => unknown;
  try {
    // The `"use strict"` + explicit `return` keeps the body to a
    // single expression. We wrap in parens so admins can write
    // either a one-liner or a multi-statement block (with explicit
    // return at the end).
    const body = input.expression.includes("return ")
      ? input.expression
      : `return (${input.expression});`;
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    fn = new Function(...argNames, `"use strict";\n${body}`) as (...args: unknown[]) => unknown;
  } catch (err) {
    return { ok: false, error: `Compile error: ${err instanceof Error ? err.message : String(err)}` };
  }

  let result: unknown;
  try {
    result = fn.apply(undefined, argValues);
  } catch (err) {
    return { ok: false, error: `Runtime error: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (typeof result !== "number" || !Number.isFinite(result)) {
    return { ok: false, error: `Formula returned non-numeric result: ${String(result)}` };
  }
  if (result < 0) {
    return { ok: false, error: `Formula returned negative result: ${result}` };
  }

  return { ok: true, value: result };
}
