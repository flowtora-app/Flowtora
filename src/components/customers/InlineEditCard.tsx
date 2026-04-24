"use client";

import * as React from "react";

// Phase 3 (transformation) — inline edit card primitive.
//
// The /edit route is gone: every editable section on the customer detail
// page uses this card. It renders two modes:
//
//   • "view" — the caller's read-only children (labels + values)
//   • "edit" — the same children wrapped in a <form> bound to a server
//             action, with Save / Cancel buttons.
//
// Why a client component? The toggle is a tiny bit of local state (which
// mode we're in), and wrapping server action forms in it keeps the read
// view as zero-JS HTML. The form itself still submits to a server
// action, so business logic + auth checks stay on the server.
//
// Design trade-offs:
//   • Optimistic UX is deliberately *not* implemented here — the action
//     calls revalidatePath, which refreshes the server-rendered view
//     once the update lands. This matches the rest of the app's pattern.
//   • Fields are passed in as children, not props. Lets the caller use
//     <Field>, <SelectField>, <TextArea> from @/components/Field without
//     this card knowing anything about their shape.
//   • The title + description slot matches <CardHeader>'s API on purpose
//     so switching a card from "display only" to "inline editable" is a
//     diff you can read in a PR.

export type InlineEditCardProps = {
  title:        string;
  description?: string;
  /**
   * Read-only view. Rendered when the card is not in edit mode. If the
   * user can't edit, they'll only ever see this.
   */
  view:         React.ReactNode;
  /**
   * Edit form fields. Rendered inside a <form action={action}> when the
   * card is in edit mode. If omitted, the card is read-only regardless
   * of `canEdit`.
   */
  edit?:        React.ReactNode;
  /** Server action bound to (formData) => void. */
  action?:      (formData: FormData) => void | Promise<void>;
  /** Gates whether the Edit button shows at all. */
  canEdit?:     boolean;
  /** Override the Edit button label (default "Edit"). */
  editLabel?:   string;
};

export function InlineEditCard({
  title,
  description,
  view,
  edit,
  action,
  canEdit = true,
  editLabel = "Edit",
}: InlineEditCardProps) {
  const [mode, setMode] = React.useState<"view" | "edit">("view");
  // Reset to "view" after the form submits. Next.js server actions fire
  // a revalidate, which re-renders the tree — toggling back on the
  // next render is fine, but we also flip eagerly so the save doesn't
  // feel like it did nothing during the turnaround.
  const [pending, startTransition] = React.useTransition();

  const editable = canEdit && !!edit && !!action;

  return (
    <div
      className="overflow-hidden rounded-md"
      style={{ background: "var(--panel)", border: "1px solid var(--border)" }}
    >
      <div
        className="flex items-start justify-between px-5 py-4"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div>
          <div className="text-sm font-semibold">{title}</div>
          {description && (
            <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
              {description}
            </div>
          )}
        </div>
        {editable && mode === "view" && (
          <button
            type="button"
            onClick={() => setMode("edit")}
            className="text-xs underline"
            style={{ color: "var(--muted)" }}
          >
            {editLabel}
          </button>
        )}
      </div>

      {mode === "view" || !editable ? (
        <div>{view}</div>
      ) : (
        <form
          action={(fd) => {
            startTransition(async () => {
              await action!(fd);
              setMode("view");
            });
          }}
          className="space-y-3 px-5 py-4"
        >
          {edit}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md px-3 py-1.5 text-xs font-semibold"
              style={{
                background: "var(--accent-primary)",
                color: "white",
                opacity: pending ? 0.6 : 1,
              }}
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setMode("view")}
              disabled={pending}
              className="rounded-md px-3 py-1.5 text-xs"
              style={{ color: "var(--muted)" }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
