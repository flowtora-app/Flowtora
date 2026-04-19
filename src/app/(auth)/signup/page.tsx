import Link from "next/link";
import type { Metadata } from "next";
import { signupAction } from "@/app/actions/auth";

export const metadata: Metadata = {
  title: "Start your trial — Tracksign",
  description:
    "Spin up your shop in 15 minutes. 14-day free trial, no credit card required.",
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="space-y-8">
      <div>
        <span
          className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium"
          style={{
            background: "var(--accent-surface)",
            color: "var(--accent-primary)",
            border: "1px solid var(--accent-surface-strong)",
          }}
        >
          14-day free trial · No credit card
        </span>
        <h1
          className="mt-4 text-3xl font-semibold tracking-tight"
          style={{ color: "var(--text-default)" }}
        >
          Spin up your shop
        </h1>
        <p
          className="mt-2 text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          Import your customers, seed your price book, and send your first
          quote today.
        </p>
      </div>

      <form action={signupAction} className="space-y-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Your name"
            name="name"
            autoComplete="name"
            required
          />
          <Field
            label="Work email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          hint="At least 8 characters."
        />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field
            label="Shop name"
            name="shopName"
            placeholder="Acme Sign Co."
            required
          />
          <Field
            label="Shop URL"
            name="slug"
            placeholder="acme-sign"
            required
            pattern="[a-z0-9-]+"
            hint="Lowercase letters, numbers, and hyphens."
          />
        </div>

        {sp.error && (
          <div
            role="alert"
            className="rounded-md px-4 py-3 text-sm"
            style={{
              background: "var(--danger-surface)",
              color: "var(--danger-fg)",
              border: "1px solid var(--danger-fg)",
            }}
          >
            {decodeURIComponent(sp.error)}
          </div>
        )}

        <button
          type="submit"
          className="ts-focus inline-flex h-11 w-full items-center justify-center rounded-md text-sm font-medium transition-colors hover:brightness-110"
          style={{
            background: "var(--accent-primary)",
            color: "var(--accent-fg)",
          }}
        >
          Start free trial
        </button>

        <p className="text-xs" style={{ color: "var(--text-faint)" }}>
          By creating an account you agree to our{" "}
          <Link href="/legal/terms" className="underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/legal/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </form>

      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium"
          style={{ color: "var(--accent-primary)" }}
        >
          Sign in →
        </Link>
      </p>
    </div>
  );
}

function Field(
  props: React.InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    hint?: string;
  },
) {
  const { label, hint, ...rest } = props;
  return (
    <label className="block">
      <span
        className="mb-1 block text-sm font-medium"
        style={{ color: "var(--text-default)" }}
      >
        {label}
        {rest.required && (
          <span aria-hidden className="ml-1" style={{ color: "var(--accent-primary)" }}>
            *
          </span>
        )}
      </span>
      <input
        {...rest}
        className="ts-focus w-full rounded-md px-3 py-2.5 text-sm outline-none transition-colors"
        style={{
          background: "var(--surface-0)",
          border: "1px solid var(--border-default)",
          color: "var(--text-default)",
        }}
      />
      {hint && (
        <span
          className="mt-1 block text-xs"
          style={{ color: "var(--text-faint)" }}
        >
          {hint}
        </span>
      )}
    </label>
  );
}
