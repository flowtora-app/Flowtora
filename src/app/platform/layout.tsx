import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { isPlatformStaff } from "@/lib/rbac";
import { PlatformNav } from "./PlatformNav";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user || !isPlatformStaff(session.user.platformRole)) redirect("/login");

  const roleLabel =
    session.user.platformRole?.replace(/_/g, " ").toLowerCase() ?? "staff";

  return (
    <div className="flex min-h-screen">
      <PlatformNav
        roleLabel={roleLabel}
        signOutAction={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      />
      <main className="flex-1 px-8 py-8">{children}</main>
    </div>
  );
}
