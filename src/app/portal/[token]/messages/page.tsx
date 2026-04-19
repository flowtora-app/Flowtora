import { requirePortalToken, portalPath } from "@/lib/portal";
import { db } from "@/lib/db";
import { sendPortalMessage } from "@/app/actions/portal-messages";
import { formatDateTime } from "@/lib/format";

export default async function PortalMessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const ctx = await requirePortalToken(token);
  const scope = { tenantId: ctx.tenant.id, customerId: ctx.customer.id };

  const messages = await db.portalMessage.findMany({
    where: {
      ...scope,
      archivedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      direction: true,
      subject: true,
      body: true,
      createdAt: true,
      sender: { select: { name: true } },
    },
  });

  const action = sendPortalMessage.bind(null, token);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1
          className="text-xl font-semibold"
          style={{ color: "var(--text-default)" }}
        >
          Messages
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Send a message to {ctx.tenant.name}. We&apos;ll reply by email and
          post the response here.
        </p>
      </div>

      {/* Success / error banners */}
      {sp.ok && (
        <div
          className="rounded-lg px-4 py-3 text-sm font-medium"
          style={{
            background: "var(--success-surface)",
            color: "var(--success-text)",
            border: "1px solid var(--success-border)",
          }}
        >
          Your message has been sent.
        </div>
      )}
      {sp.error && (
        <div
          className="rounded-lg px-4 py-3 text-sm font-medium"
          style={{
            background: "var(--danger-surface)",
            color: "var(--danger-text)",
            border: "1px solid var(--danger-border)",
          }}
        >
          {decodeURIComponent(sp.error)}
        </div>
      )}

      {/* Message thread */}
      {messages.length > 0 ? (
        <div className="space-y-3">
          {messages.map((msg) => {
            const isInbound = msg.direction === "INBOUND";
            return (
              <div
                key={msg.id}
                className="rounded-xl px-5 py-4"
                style={{
                  background: isInbound
                    ? "var(--surface-1)"
                    : "var(--portal-accent, #111)",
                  border: isInbound
                    ? "1px solid var(--border-subtle)"
                    : "none",
                  marginLeft: isInbound ? 0 : "auto",
                  maxWidth: isInbound ? "100%" : "88%",
                  color: isInbound
                    ? "var(--text-default)"
                    : "#fff",
                }}
              >
                <div
                  className="mb-1.5 flex items-center justify-between gap-4 text-xs font-medium"
                  style={{
                    color: isInbound ? "var(--text-muted)" : "rgba(255,255,255,0.65)",
                  }}
                >
                  <span>
                    {isInbound
                      ? "You"
                      : msg.sender?.name ?? ctx.tenant.name}
                  </span>
                  <span>{formatDateTime(msg.createdAt)}</span>
                </div>
                {msg.subject && (
                  <div
                    className="mb-1 text-sm font-semibold"
                    style={{
                      color: isInbound ? "var(--text-strong)" : "#fff",
                    }}
                  >
                    {msg.subject}
                  </div>
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {msg.body}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className="rounded-xl px-6 py-10 text-center"
          style={{
            background: "var(--surface-1)",
            border: "1px dashed var(--border-subtle)",
          }}
        >
          <div
            className="text-sm font-medium"
            style={{ color: "var(--text-default)" }}
          >
            No messages yet
          </div>
          <div
            className="mt-1 text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            Use the form below to send a message to {ctx.tenant.name}.
          </div>
        </div>
      )}

      {/* Compose form */}
      <form action={action} className="space-y-3">
        <div
          className="rounded-xl p-5 space-y-3"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <div className="text-sm font-semibold" style={{ color: "var(--text-strong)" }}>
            Send a message
          </div>
          <div className="space-y-1">
            <label
              className="block text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              Subject <span className="text-[10px] font-normal">(optional)</span>
            </label>
            <input
              type="text"
              name="subject"
              maxLength={300}
              placeholder="e.g. Question about my order"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--border-default)",
                color: "var(--text-default)",
              }}
            />
          </div>
          <div className="space-y-1">
            <label
              className="block text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              Message <span className="text-[10px] text-red-500">*</span>
            </label>
            <textarea
              name="body"
              rows={4}
              required
              maxLength={4000}
              placeholder="Type your message here…"
              className="w-full resize-y rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                background: "var(--input-bg)",
                border: "1px solid var(--border-default)",
                color: "var(--text-default)",
              }}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="rounded-lg px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: "var(--portal-accent, #111)" }}
            >
              Send message
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
