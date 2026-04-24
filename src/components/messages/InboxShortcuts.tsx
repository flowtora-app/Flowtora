"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

// Gmail-style keyboard shortcuts for the Messages inbox.
//
//   j   — next conversation
//   k   — previous conversation
//   r   — focus the reply textarea (id="inbox-reply-body")
//   e   — archive current conversation (clicks id="inbox-archive-btn")
//   /   — focus the search input (id="inbox-search")
//   esc — deselect conversation (back to list-only view)
//
// Shortcuts are suppressed while the user is typing in an input/textarea
// so they don't collide with normal text entry.

type Props = {
  orderedCustomerIds: string[];
  currentCustomerId: string | null;
  basePath: string;              // `/t/{slug}/messages`
  preservedParams: string;       // `?view=all&q=...` — already includes leading `?` or empty
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function InboxShortcuts({
  orderedCustomerIds,
  currentCustomerId,
  basePath,
  preservedParams,
}: Props) {
  const router = useRouter();

  React.useEffect(() => {
    const goTo = (customerId: string) => {
      const p = new URLSearchParams(preservedParams.startsWith("?") ? preservedParams.slice(1) : preservedParams);
      p.set("c", customerId);
      router.push(`${basePath}?${p.toString()}`);
    };

    const deselect = () => {
      const p = new URLSearchParams(preservedParams.startsWith("?") ? preservedParams.slice(1) : preservedParams);
      p.delete("c");
      const qs = p.toString();
      router.push(`${basePath}${qs ? `?${qs}` : ""}`);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) {
        // The only key we still want while typing is Escape (to blur).
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      const idx = currentCustomerId
        ? orderedCustomerIds.indexOf(currentCustomerId)
        : -1;

      switch (e.key) {
        case "j":
        case "ArrowDown": {
          if (orderedCustomerIds.length === 0) return;
          const nextIdx = idx < 0 ? 0 : Math.min(idx + 1, orderedCustomerIds.length - 1);
          e.preventDefault();
          goTo(orderedCustomerIds[nextIdx]);
          break;
        }
        case "k":
        case "ArrowUp": {
          if (orderedCustomerIds.length === 0) return;
          const prevIdx = idx < 0 ? 0 : Math.max(idx - 1, 0);
          e.preventDefault();
          goTo(orderedCustomerIds[prevIdx]);
          break;
        }
        case "r": {
          const el = document.getElementById("inbox-reply-body") as HTMLTextAreaElement | null;
          if (el) {
            e.preventDefault();
            el.focus();
          }
          break;
        }
        case "e": {
          const btn = document.getElementById("inbox-archive-btn") as HTMLButtonElement | null;
          if (btn) {
            e.preventDefault();
            btn.click();
          }
          break;
        }
        case "/": {
          const input = document.getElementById("inbox-search") as HTMLInputElement | null;
          if (input) {
            e.preventDefault();
            input.focus();
            input.select();
          }
          break;
        }
        case "Escape": {
          if (currentCustomerId) {
            e.preventDefault();
            deselect();
          }
          break;
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [orderedCustomerIds, currentCustomerId, basePath, preservedParams, router]);

  return null;
}
