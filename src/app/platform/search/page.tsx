import { requirePlatformStaff } from "@/lib/platform";
import { AdminSearch } from "@/components/platform/AdminSearch";

// Premium admin search — single page, instant results, keyboard-first.
//
// Page is intentionally thin: auth + render. All UX (debounced
// fetching, keyboard navigation, recents, filter chips, highlighting,
// race protection) lives in the AdminSearch client component, and
// the actual searching is handled by the searchAdmin server action.
//
// Modeled after Linear / Stripe / Notion — the input is the page,
// not a form to submit.

export const dynamic = "force-dynamic";

export default async function PlatformSearchPage() {
  await requirePlatformStaff();
  return <AdminSearch />;
}
