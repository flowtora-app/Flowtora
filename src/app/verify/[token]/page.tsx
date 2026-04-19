import { confirmVerification } from "@/app/actions/account-security";

export const dynamic = "force-dynamic";

// Phase 2 — confirm an email verification token.
//
// The entire work happens in `confirmVerification`, which redirects to
// either a success page (via /select-tenant or /login) or /verify/invalid.
// This route component is effectively a thunk — we call the server
// action from a server component and let the redirect fly.

export default async function VerifyWithTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  await confirmVerification(token);
  // Unreachable — the action always redirects.
  return null;
}
