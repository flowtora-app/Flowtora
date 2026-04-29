import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Spec Page 0 §0.3 — UI font Inter (variable), monospace JetBrains
// Mono. Both loaded via next/font with display:swap so we don't
// block first paint on web fonts. Variables expose them to CSS so
// the type-scale tokens in globals.css can resolve them.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

// Root metadata. Per-page `export const metadata` in marketing routes
// overrides `title` (via the template below) and `description`, while
// inheriting things like `metadataBase` and the default OG defaults.

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  process.env.APP_URL ??
  "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Flowtora — The operating system for sign and print shops",
    template: "%s · Flowtora",
  },
  description:
    "Run quoting, proofing, production, installs, and invoicing in one shop-floor-grade platform. Built for teams who make real things.",
  applicationName: "Flowtora",
  authors: [{ name: "Flowtora, Inc." }],
  keywords: [
    "sign shop software",
    "print shop software",
    "sign shop CRM",
    "print MIS",
    "sign shop quoting",
    "custom fabrication software",
    "install crew routing",
    "signage production management",
  ],
  openGraph: {
    type: "website",
    siteName: "Flowtora",
    locale: "en_US",
    url: siteUrl,
  },
  twitter: {
    card: "summary_large_image",
    title: "Flowtora",
    description:
      "One platform for CRM, quoting, proofing, production, installs, and invoicing.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
};

// Theme boot script. Rendered BEFORE hydration in <head>-adjacent
// position so it runs synchronously and sets data-theme before first
// paint, preventing a light/dark flash. Reads:
//   1. ts_theme cookie   (server-authoritative choice)
//   2. localStorage key  (fallback for the brief window before cookie)
//   3. prefers-color-scheme media query  (default when "system" or absent)
// The script also subscribes to OS theme changes so "system" users see
// the app flip when they toggle their OS theme.
const THEME_BOOT_SCRIPT = `
(function(){
  try {
    var m = document.cookie.match(/(?:^|; )ts_theme=([^;]+)/);
    var pref = m ? decodeURIComponent(m[1]) : (localStorage.getItem('ts_theme') || 'system');
    if (pref !== 'light' && pref !== 'dark' && pref !== 'system') pref = 'system';
    var mql = window.matchMedia('(prefers-color-scheme: light)');
    function apply(){
      var effective = pref === 'system' ? (mql.matches ? 'light' : 'dark') : pref;
      document.documentElement.setAttribute('data-theme', effective);
    }
    apply();
    if (pref === 'system' && mql.addEventListener) mql.addEventListener('change', apply);
    // Flip on "ts-theme-ready" so transitions kick in for later swaps.
    requestAnimationFrame(function(){
      document.documentElement.classList.add('ts-theme-ready');
    });
    window.__tsApplyTheme = function(next){
      pref = next;
      try { localStorage.setItem('ts_theme', next); } catch (e) {}
      apply();
    };
  } catch (e) {}
})();
`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Read the cookie on the server so the initial HTML already carries
  // the right data-theme attribute. The boot script re-applies the same
  // value (and falls back to system) so the client and server agree.
  const jar = await cookies();
  const cookieTheme = jar.get("ts_theme")?.value;
  const themePref: "system" | "light" | "dark" =
    cookieTheme === "light" || cookieTheme === "dark" || cookieTheme === "system"
      ? cookieTheme
      : "system";
  // For the SSR attribute we default "system" to dark (matches our
  // default palette). The boot script corrects to light if the OS
  // prefers it, before first paint.
  const initialTheme = themePref === "light" ? "light" : "dark";

  return (
    // suppressHydrationWarning is required here: the boot script runs
    // before hydration and may swap data-theme (cookie "system" +
    // prefers-color-scheme can resolve to a value that differs from the
    // server default). The mismatch is intentional and scoped to the
    // <html> element only.
    <html
      lang="en"
      data-theme={initialTheme}
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
