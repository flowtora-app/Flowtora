import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { isPlatformStaff } from "@/lib/rbac";
import { getPlatformSettings } from "@/lib/platform-settings";
import { PlatformNav } from "./PlatformNav";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || !isPlatformStaff(session.user.platformRole)) redirect("/login");

  const roleLabel =
    session.user.platformRole?.replace(/_/g, " ").toLowerCase() ?? "staff";

  // Surface maintenance + feature-freeze banners persistently for any
  // platform admin so they don't lose track of an "everyone is locked
  // out right now" state. Both link to the settings page where the
  // toggles live.
  const settings = await getPlatformSettings();

  return (
    <div className="flex min-h-screen">
      <PlatformNav
        roleLabel={roleLabel}
        userName={session.user.name ?? null}
        userEmail={session.user.email ?? ""}
        userImage={session.user.image ?? null}
        signOutAction={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      />
      {/* `min-w-0` is the secret sauce here — without it, flex
          children default to `min-width: auto` which prevents them
          from shrinking below their content. That makes wide tables
          push the whole layout horizontally instead of allowing
          inner overflow-x scrolling. Tighter padding on narrow
          viewports gives the table a few more px to breathe. */}
      <main className="min-w-0 flex-1 px-4 py-4 md:px-8 md:py-8">
        {(settings.maintenanceMode || settings.featureFreezeMode) && (
          <div className="mb-6 space-y-2">
            {settings.maintenanceMode && (
              <PlatformAlert
                tone="danger"
                title="Maintenance mode is ACTIVE"
                body={
                  settings.maintenanceMessage
                    ? `Tenants are seeing the maintenance page. Message: "${settings.maintenanceMessage}"`
                    : "Tenants are seeing the maintenance page. Platform admins (you) bypass."
                }
              />
            )}
            {settings.featureFreezeMode && (
              <PlatformAlert
                tone="warning"
                title="Feature freeze is on"
                body={
                  settings.featureFreezeReason
                    ? `${settings.featureFreezeReason}`
                    : "Hold off on shipping further changes until this is cleared."
                }
              />
            )}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

function PlatformAlert({
  tone,
  title,
  body,
}: {
  tone: "danger" | "warning";
  title: string;
  body: string;
}) {
  const palette =
    tone === "danger"
      ? { bg: "var(--danger-surface)",  fg: "var(--danger-fg)",  border: "var(--danger-fg)"  }
      : { bg: "var(--warning-surface)", fg: "var(--warning-fg)", border: "var(--warning-fg)" };
  return (
    <div
      className="flex items-start gap-3 rounded-md px-4 py-3 text-sm"
      style={{
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.fg,
      }}
    >
      <span aria-hidden className="text-base leading-none">{tone === "danger" ? "🛠" : "❄"}</span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        <div className="mt-0.5 text-xs" style={{ opacity: 0.85 }}>{body}</div>
      </div>
      <Link
        href="/platform/settings"
        className="ts-focus shrink-0 rounded-md px-2.5 py-1 text-xs font-medium underline"
        style={{ color: palette.fg }}
      >
        Manage →
      </Link>
    </div>
  );
}
