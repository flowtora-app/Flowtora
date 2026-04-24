"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

// Fires the bound markRead server action once on mount when the user
// opens a conversation with unreads. Keeps the inbox badge and list
// in sync with "I just looked at this thread".

// The caller should pass the conversation id via React's reserved `key`
// prop on the JSX element so this component remounts when the selected
// conversation changes.
type Props = {
  action: () => Promise<void>;
  unreadCount: number;
};

export function AutoMarkRead({ action, unreadCount }: Props) {
  const router = useRouter();
  const fired = React.useRef(false);

  React.useEffect(() => {
    if (fired.current) return;
    if (unreadCount <= 0) return;
    fired.current = true;
    action()
      .then(() => router.refresh())
      .catch(() => { /* non-fatal; timeline stays marked unread */ });
  }, [action, unreadCount, router]);

  return null;
}
