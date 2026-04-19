import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
        That page doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link href="/" className="mt-6 inline-block underline">Back home</Link>
    </main>
  );
}
