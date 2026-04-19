import type { ShareToken } from "@prisma/client";
import { Card, CardHeader } from "@/components/Card";
import { Button, Field, SelectField } from "@/components/Field";
import { CopyUrlButton } from "@/components/share/CopyUrlButton";
import {
  isShareTokenActive,
  shareTokenStatusLabel,
  shareUrl,
  defaultExpiryDaysFor,
} from "@/lib/share";
import { formatDate } from "@/lib/format";

// Phase 15 Slice A — staff-side share-link manager.
//
// Renders on the invoice + proof detail pages. Shows every issued token
// (active and revoked/expired — we keep history for audit). Lets staff
// mint new tokens with a quick expiry picker, copy the URL, and revoke
// anything still live.
//
// Both `createAction` and `revokeAction` are bound by the parent page so
// this component stays tenant-agnostic — the slug is the parent's concern.

export function ShareLinkPanel({
  tokens,
  createAction,
  revokeAction,
  kind,
}: {
  tokens: Pick<
    ShareToken,
    "id" | "token" | "label" | "expiresAt" | "revokedAt" | "lastUsedAt" | "viewCount" | "createdAt"
  >[];
  createAction: (formData: FormData) => void | Promise<void>;
  // Invoked as `revokeAction.bind(null, shareTokenId)` at each row.
  revokeAction: (shareTokenId: string) => void | Promise<void>;
  kind: "PROOF" | "INVOICE";
}) {
  const defaultDays = defaultExpiryDaysFor(kind);
  const active = tokens.filter((t) => isShareTokenActive(t));
  const history = tokens.filter((t) => !isShareTokenActive(t));

  const description =
    kind === "INVOICE"
      ? "Forwardable URL for the customer or their accounts team — balance, line items, payment history visible without login."
      : "Forwardable URL for the customer or their approver — they can view files and respond without a portal login.";

  return (
    <Card>
      <CardHeader title="Public share link" description={description} />
      <div className="space-y-5 px-5 py-4">
        {active.length > 0 && (
          <div className="space-y-3">
            {active.map((t) => {
              const url = shareUrl(t.token);
              return (
                <div
                  key={t.id}
                  className="rounded-md px-3 py-2"
                  style={{
                    background: "var(--surface-1)",
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span
                      className="rounded-full px-2 py-0.5 font-medium"
                      style={{
                        background: "var(--success-surface)",
                        color: "var(--success-fg)",
                        border: "1px solid var(--success-fg)",
                      }}
                    >
                      {shareTokenStatusLabel(t)}
                    </span>
                    {t.label && <span className="font-medium">{t.label}</span>}
                    <span style={{ color: "var(--text-muted)" }}>
                      {t.expiresAt ? <>expires {formatDate(t.expiresAt)}</> : <>never expires</>}
                    </span>
                    {t.lastUsedAt && (
                      <span style={{ color: "var(--text-muted)" }}>
                        · last opened {formatDate(t.lastUsedAt)}
                      </span>
                    )}
                    <span style={{ color: "var(--text-muted)" }}>
                      · {t.viewCount} {t.viewCount === 1 ? "view" : "views"}
                    </span>
                  </div>
                  <div
                    className="mt-2 rounded-md px-2 py-1.5 font-mono text-[11px] break-all"
                    style={{
                      background: "var(--surface-0)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-default)",
                    }}
                  >
                    {url}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <CopyUrlButton url={url} label="Copy link" />
                    <form action={revokeAction.bind(null, t.id)}>
                      <Button type="submit" variant="danger">Revoke</Button>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create form */}
        <form action={createAction} className="grid grid-cols-2 gap-3">
          <Field
            label="Label (optional)"
            name="label"
            placeholder={kind === "INVOICE" ? "e.g. Accounts Payable contact" : "e.g. Client approver"}
          />
          <SelectField
            label="Expires"
            name="expiresAt"
            defaultValue={`+${defaultDays}`}
            options={[
              { value: "+7",  label: "In 7 days" },
              { value: "+14", label: "In 14 days" },
              { value: `+${defaultDays}`, label: `In ${defaultDays} days (default)` },
              { value: "+180", label: "In 6 months" },
              { value: "+365", label: "In 1 year" },
              { value: "never", label: "Never" },
            ]}
          />
          <div className="col-span-2">
            <Button type="submit">Generate share link</Button>
          </div>
        </form>

        {history.length > 0 && (
          <details className="text-xs">
            <summary
              className="cursor-pointer font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              History ({history.length})
            </summary>
            <ul className="mt-2 space-y-1">
              {history.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2" style={{ color: "var(--text-muted)" }}>
                  <span>{shareTokenStatusLabel(t)}</span>
                  <span className="font-mono text-[10px]">…{t.token.slice(-8)}</span>
                  {t.label && <span>— {t.label}</span>}
                  <span>· issued {formatDate(t.createdAt)}</span>
                  {t.viewCount > 0 && <span>· {t.viewCount} views</span>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </Card>
  );
}
