import { redirect } from "next/navigation";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import { db } from "@/lib/db";

export default async function SelectTenantPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Platform staff get sent to the platform console.
  if (session.user.platformRole) redirect("/platform");

  const memberships = await db.membership.findMany({
    where: { userId: session.user.id, status: "ACTIVE" },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) {
    return (
      <main className="mx-auto max-w-md px-6 py-24">
        <h1 className="text-2xl font-semibold">No workspaces yet</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          You don&apos;t have access to any shop. Ask an admin to invite you, or start your own.
        </p>
        <div className="mt-6 flex gap-3">
          <Link href="/signup" className="rounded-md px-4 py-2 text-sm" style={{ background: "var(--accent)", color: "white" }}>
            Create a shop
          </Link>
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
            <button type="submit" className="rounded-md px-4 py-2 text-sm" style={{ border: "1px solid var(--border)" }}>
              Sign out
            </button>
          </form>
        </div>
      </main>
    );
  }

  if (memberships.length === 1) redirect(`/t/${memberships[0].tenant.slug}/dashboard`);

  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <h1 className="text-2xl font-semibold">Choose a workspace</h1>
      <ul className="mt-6 space-y-2">
        {memberships.map((m) => (
          <li key={m.id}>
            <Link
              href={`/t/${m.tenant.slug}/dashboard`}
              className="block rounded-md px-4 py-3"
              style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
            >
              <div className="text-sm font-medium">{m.tenant.name}</div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>{m.role.replace(/_/g, " ")}</div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
