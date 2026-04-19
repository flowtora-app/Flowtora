import { notFound } from "next/navigation";
import { requireShareToken } from "@/lib/share";
import { PublicInvoiceView } from "@/components/share/PublicInvoiceView";
import { PublicProofView } from "@/components/share/PublicProofView";

// Phase 15 Slice A — public share-link landing page.
//
// A single route handles both proof and invoice share tokens. We pick the
// renderer based on `kind` rather than having separate URLs because the
// token is the only thing staff paste into emails / chat — one URL shape
// keeps copy-paste errors out of support tickets.
//
// Authentication: the token itself IS the capability. We do not expose any
// PII (email, address) in the public view — only the content the customer
// already knows (invoice line items, proof files). We also don't leak
// cross-tenant or cross-entity data: `requireShareToken` scopes strictly
// to the row the token points at.

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string; done?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const ctx = await requireShareToken(token);

  if (ctx.token.kind === "INVOICE" && ctx.token.invoiceId) {
    return (
      <PublicInvoiceView
        shareCtx={ctx}
        invoiceId={ctx.token.invoiceId}
      />
    );
  }
  if (ctx.token.kind === "PROOF" && ctx.token.proofId) {
    return (
      <PublicProofView
        shareCtx={ctx}
        proofId={ctx.token.proofId}
        shareTokenId={ctx.token.id}
        flashError={sp.error}
        flashDone={sp.done === "1"}
      />
    );
  }

  // Defensive: a token with mismatched kind/targetId shouldn't exist, but
  // if one slips through, fail shut.
  notFound();
}
