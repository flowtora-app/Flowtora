import type { Permission } from "@/lib/rbac";

// Phase 14 — comment parent resolution.
//
// A comment can attach to any of these business objects. We keep the union
// explicit (rather than a generic "polymorphic parent" type) so:
//   1. callers get full TypeScript coverage of which ids are valid
//   2. permission mapping is a compile-time lookup, not a runtime match
//   3. adding a new parent type is a single grep-able spot
//
// At most one parent must be set per comment — enforced by the actions layer
// (the DB can't express "exactly one of N optional FKs" cleanly). Mirrors how
// `File` does the same thing.

export type CommentParent =
  | { kind: "customer";     customerId:     string }
  | { kind: "quote";        quoteId:        string }
  | { kind: "order";        orderId:        string }
  | { kind: "proof";        proofId:        string }
  | { kind: "install";      installEventId: string }
  | { kind: "task";         taskId:         string };

export type CommentParentKind = CommentParent["kind"];

// Permission required to *view* the parent. Creating a comment requires this
// same permission — if you can see the parent, you can participate in its
// thread. (Destructive moderation beyond your own comment requires
// `staff:manage`, which the action handles separately.)
export const PARENT_VIEW_PERMISSION: Record<CommentParentKind, Permission> = {
  customer: "customers:view",
  quote:    "quotes:view",
  order:    "orders:view",
  proof:    "proofs:view",
  install:  "installs:view",
  // Tasks aren't gated behind a dedicated permission — anyone with
  // `customers:view` can see the shared task list today. If that ever splits,
  // bump this to a new `tasks:view` permission and the grep will land here.
  task:     "customers:view",
};

// Build the Prisma `where` fragment for a given parent. Used both when
// creating (to validate the parent exists in this tenant) and when listing
// comments for a specific entity.
export function parentWhere(parent: CommentParent): {
  customerId?:     string;
  quoteId?:        string;
  orderId?:        string;
  proofId?:        string;
  installEventId?: string;
  taskId?:         string;
} {
  switch (parent.kind) {
    case "customer": return { customerId:     parent.customerId     };
    case "quote":    return { quoteId:        parent.quoteId        };
    case "order":    return { orderId:        parent.orderId        };
    case "proof":    return { proofId:        parent.proofId        };
    case "install":  return { installEventId: parent.installEventId };
    case "task":     return { taskId:         parent.taskId         };
  }
}

// Human-facing kind label for notifications / timelines.
export function parentLabel(kind: CommentParentKind): string {
  switch (kind) {
    case "customer": return "customer";
    case "quote":    return "quote";
    case "order":    return "order";
    case "proof":    return "proof";
    case "install":  return "install";
    case "task":     return "task";
  }
}

// ────────────────────────────────────────────────────────────
// @mention resolution (Phase 14 Slice B)
// ────────────────────────────────────────────────────────────
//
// Rules:
//   - `@token` in the comment body is a mention candidate. We match against
//     the tenant's active members by canonicalized first name, last name,
//     full name (no spaces), and email-local-part. All lowercased + stripped
//     of non-alphanumerics so the user can type `@John`, `@john.smith`,
//     `@JohnSmith`, or `@jsmith` interchangeably.
//   - If exactly ONE member matches the token, it's a mention. Zero or
//     multiple matches silently drop — we'd rather under-notify than spam
//     the wrong person because two Johns exist.
//   - Self-mentions are kept in the array (so the UI can highlight "you were
//     mentioned" consistently) but the notification fan-out excludes them.
//
// Dedup happens via a Set; order is preserved by first-occurrence so a
// comment reading "ping @alice and @bob" notifies in that order.

export type MentionCandidate = {
  userId: string;
  name:   string;
  email:  string;
};

function canon(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function extractMentionedUserIds(
  body: string,
  members: MentionCandidate[],
): string[] {
  // Loose pattern — the regex over-captures (e.g. trailing punctuation),
  // but `canon()` strips it below so we don't need a tight grammar here.
  const tokens = body.match(/@[\w.\-]+/g);
  if (!tokens) return [];

  // Precompute the searchable aliases per member once. Typical tenant has
  // <50 active members, so an array scan is cheap and clearer than a map.
  const indexed = members.map((m) => {
    const parts = m.name.split(/\s+/).filter(Boolean);
    const first = parts[0] ?? "";
    const last  = parts.length > 1 ? parts[parts.length - 1] : "";
    const emailLocal = (m.email.split("@")[0] ?? "");
    const aliases = new Set<string>(
      [m.name, first, last, emailLocal]
        .map(canon)
        .filter((s) => s.length > 0),
    );
    return { userId: m.userId, aliases };
  });

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const raw of tokens) {
    const tok = canon(raw.slice(1)); // drop the leading '@' before canon
    if (!tok) continue;
    const hits = indexed.filter((m) => m.aliases.has(tok));
    if (hits.length !== 1) continue; // ambiguous or unknown
    const uid = hits[0].userId;
    if (seen.has(uid)) continue;
    seen.add(uid);
    ids.push(uid);
  }
  return ids;
}
