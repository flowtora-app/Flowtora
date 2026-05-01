"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Input, useToast } from "@/components/ui";
import { acceptPlatformInvite } from "@/app/actions/platform-invites";

export function AcceptForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      const fd = new FormData();
      fd.set("token", token);
      if (name.trim()) fd.set("name", name.trim());
      const res = await acceptPlatformInvite(fd);
      if (res.ok) {
        toast.success("Invite accepted");
        setDone(true);
        // Push to /login so the user can sign in. The credentials path
        // requires them to set a password via /forgot-password first;
        // we'll surface that in the success copy.
      } else toast.error(res.error ?? "Couldn't accept");
    } finally { setPending(false); }
  };

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-md border p-3 text-[12px]"
             style={{ borderColor: "var(--emerald-200)", background: "var(--emerald-50)", color: "var(--emerald-700)" }}>
          Welcome to Flowtora! Your admin account is provisioned. To finish, set a password using the
          forgot-password flow, then sign in.
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => router.push("/forgot-password")}>Set password</Button>
          <Button size="sm" variant="secondary" onClick={() => router.push("/login")}>Go to sign-in</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <Input
        label="Display name (optional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={email.split("@")[0]?.replace(/[._-]+/g, " ") ?? ""}
        maxLength={120}
      />
      <Button type="submit" disabled={pending}>
        {pending ? "Accepting…" : "Accept invitation"}
      </Button>
      <p className="text-[11px]" style={{ color: "var(--text-faint)" }}>
        After accepting, set a password via <span className="font-mono">/forgot-password</span> and sign in.
      </p>
    </form>
  );
}
