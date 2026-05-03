// Page 28 — pricing-formula tester API.
// POST { expression, variables, constants, tierTable, inputs } → eval result.

import { NextResponse } from "next/server";
import { requirePlatformStaff } from "@/lib/platform";
import { evaluateFormula } from "@/lib/pricing-formula-eval";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  await requirePlatformStaff();
  const body = (await req.json().catch(() => null)) as {
    expression?: string;
    variables?: unknown;
    constants?: unknown;
    tierTable?: unknown;
    inputs?: unknown;
  } | null;
  if (!body || typeof body.expression !== "string") {
    return NextResponse.json({ ok: false, error: "Missing expression" }, { status: 400 });
  }
  const variables = Array.isArray(body.variables) ? body.variables : [];
  const constants = Array.isArray(body.constants) ? body.constants : [];
  const tierTable = Array.isArray(body.tierTable) ? body.tierTable : undefined;
  const inputs = (body.inputs && typeof body.inputs === "object")
    ? body.inputs as Record<string, unknown>
    : {};
  const result = evaluateFormula({
    expression: body.expression,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    variables: variables as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constants: constants as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tierTable: tierTable as any,
    inputs,
  });
  return NextResponse.json(result);
}
