import { auth } from "@/auth";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { CookieConsentProvider } from "@/components/consent/CookieConsentProvider";
import { CookieBanner, PreferencesModal } from "@/components/consent/CookieBanner";
import { Tracker } from "@/components/Tracker";

// Phase 18 Slice C — marketing route group.
//
// Every public-facing page (landing, pricing, features, industry,
// contact) renders inside this layout. We own the header + footer and
// nothing else; individual pages compose <Hero>, <Section>, etc.
//
// The app routes (/t/[slug], /platform, /portal) have their own
// shells and are unaffected.

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  // Read the session server-side so the nav knows whether to offer
  // "Sign in / Start trial" or a single "Go to dashboard" jump. We
  // route authed users through /select-tenant which already handles
  // platform-staff, single-tenant, multi-tenant, and no-workspace
  // cases in one place.
  const session = await auth();
  const authed  = !!session?.user?.id;

  return (
    <CookieConsentProvider>
      <div className="flex min-h-screen flex-col">
        <MarketingHeader authed={authed} />
        <main className="flex-1">{children}</main>
        <MarketingFooter />
        <Tracker />
        <CookieBanner />
        <PreferencesModal />
      </div>
    </CookieConsentProvider>
  );
}
