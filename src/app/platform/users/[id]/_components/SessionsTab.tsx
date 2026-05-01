"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button, Card, useToast } from "@/components/ui";
import { revokeUserSession } from "@/app/actions/platform-users";
import type { UserSession } from "@/server/platform/users-list";

// SessionsTab — Session model in NextAuth's default schema doesn't
// include UA / IP / location / lastActive. We surface what we have
// (token expiry) honestly + the Revoke button to drop the row.

export function SessionsTab({
  userId,
  sessions,
  canBan,
}: {
  userId: string;
  sessions: UserSession[];
  canBan: boolean;
}) {
  if (sessions.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center">
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>No active sessions</h3>
          <p className="mx-auto mt-1 max-w-md text-[12px]" style={{ color: "var(--text-muted)" }}>
            User has no DB-strategy sessions. JWT-strategy sessions live client-side and can&apos;t be enumerated here —
            use <span className="font-mono">Sign out all sessions</span> from the row menu to invalidate them.
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card padding="md">
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead style={{ background: "var(--surface-2)" }}>
            <tr>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Session ID</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>Expires</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>UA</th>
              <th className="px-3 py-2 text-left font-semibold" style={{ color: "var(--text-muted)" }}>IP</th>
              <th className="w-24 px-3 py-2 text-right font-semibold" style={{ color: "var(--text-muted)" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <Row key={s.id} session={s} userId={userId} canBan={canBan} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
        UA + IP not captured by NextAuth&apos;s default Session schema.
      </p>
    </Card>
  );
}

function Row({
  session,
  userId,
  canBan,
}: {
  session: UserSession;
  userId: string;
  canBan: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  const onRevoke = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("userId", userId);
      fd.set("sessionId", session.id);
      const res = await revokeUserSession(fd);
      if (res.ok) { toast.success("Session revoked"); router.refresh(); }
      else toast.error(res.error ?? "Couldn't revoke");
    } finally { setBusy(false); }
  };

  return (
    <tr style={{ borderTop: "1px solid var(--border-subtle)" }}>
      <td className="px-3 py-2 font-mono text-[10px]" style={{ color: "var(--text-default)" }}>{session.id}</td>
      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{session.expires.toLocaleString()}</td>
      <td className="px-3 py-2" style={{ color: "var(--text-faint)" }}>—</td>
      <td className="px-3 py-2" style={{ color: "var(--text-faint)" }}>—</td>
      <td className="px-3 py-2 text-right">
        {canBan && (
          <Button size="xs" variant="ghost" onClick={onRevoke} disabled={busy}>
            Revoke
          </Button>
        )}
      </td>
    </tr>
  );
}
