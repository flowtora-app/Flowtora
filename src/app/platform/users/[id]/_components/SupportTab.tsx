import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui";
import type { UserSupportTicket } from "@/server/platform/users-list";

export function SupportTab({ tickets }: { tickets: UserSupportTicket[] }) {
  if (tickets.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center">
          <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-default)" }}>No tickets</h3>
          <p className="mx-auto mt-1 max-w-md text-[12px]" style={{ color: "var(--text-muted)" }}>
            User hasn&apos;t opened or rated any support tickets.
          </p>
        </div>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader title={`Support history (${tickets.length})`}
                  description="Tickets the user opened or rated." />
      <CardBody>
        <ul className="divide-y" style={{ borderColor: "var(--border-subtle)" }}>
          {tickets.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-3 py-2 text-[12px]">
              <div className="min-w-0 flex-1">
                <Link href={`/platform/support?ticketId=${t.id}`}
                      className="block truncate font-semibold hover:underline"
                      style={{ color: "var(--text-default)" }}>
                  {t.subject}
                </Link>
                <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                  {t.tenantName ?? "—"} · {t.status} · {t.createdAt.toLocaleDateString()}
                </div>
              </div>
              <span className="shrink-0 inline-flex items-center rounded-full px-1.5 text-[10px] font-semibold uppercase tracking-wide"
                    style={{
                      background: t.status === "OPEN" ? "var(--amber-50)"
                              : t.status === "RESOLVED" || t.status === "CLOSED" ? "var(--emerald-50)"
                              : "var(--surface-2)",
                      color: t.status === "OPEN" ? "var(--amber-700)"
                          : t.status === "RESOLVED" || t.status === "CLOSED" ? "var(--emerald-700)"
                          : "var(--text-muted)",
                    }}>
                {t.status}
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
