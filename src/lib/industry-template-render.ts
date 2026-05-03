// Page 29 — sample-data interpolation for the template preview.
//
// Replaces `{{path.to.value}}` placeholders against a sample-data
// object. Honest scope: this is a preview-only helper — the real
// workspace render pipeline does much more (loops, conditionals,
// localization, currency formatting). Here we only handle simple
// dot-path lookup so the editor's preview tab gives a recognizable
// rendering without lying about what production does.

const PLACEHOLDER_RX = /\{\{\s*([\w$.]+)\s*\}\}/g;

function lookupPath(scope: unknown, path: string): unknown {
  const segments = path.split(".");
  let cur: unknown = scope;
  for (const s of segments) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[s];
  }
  return cur;
}

function formatValue(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
  }
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function renderTemplate(body: string, scope: Record<string, unknown>): string {
  return body.replace(PLACEHOLDER_RX, (_match, path: string) => {
    const value = lookupPath(scope, path);
    if (value === undefined) return `{{${path}}}`; // leave unresolved placeholders visible
    return formatValue(value);
  });
}

/** Default sample data for the editor preview pane. */
export const SAMPLE_DATA: Record<string, unknown> = {
  tenant: {
    name: "Demo Sign Shop",
    slug: "demo-sign-shop",
    address: "123 Main St, Springfield, IL 62701",
    phone: "(555) 555-0100",
    email: "hello@demo-sign-shop.example",
    website: "https://demo-sign-shop.example",
    logoUrl: "https://placehold.co/240x80?text=DEMO+SIGNS",
  },
  customer: {
    name: "Acme Coffee Co.",
    contactName: "Alex Rivera",
    email: "alex@acmecoffee.example",
    phone: "(555) 222-3344",
    address: "456 Oak Ave, Springfield, IL 62701",
  },
  job: {
    number: "Q-2026-0142",
    title: "Storefront banner refresh",
    status: "Pending approval",
    dueDate: "2026-05-20",
    subtotal: "$540.00",
    tax: "$47.25",
    total: "$587.25",
    lineItems: [
      "13oz vinyl banner — 96\" × 36\" ($240)",
      "Cardboard yard signs — 25 pcs ($300)",
    ],
  },
  proof: {
    url: "https://flowtora.app/p/proof/example",
    expiresAt: "2026-05-15",
  },
  cta: {
    label: "Approve proof",
    url: "https://flowtora.app/p/proof/example",
  },
  date: {
    today: new Date().toISOString().slice(0, 10),
    year: new Date().getUTCFullYear(),
  },
};
