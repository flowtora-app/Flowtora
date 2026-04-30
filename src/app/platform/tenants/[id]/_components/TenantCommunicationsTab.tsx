import { db } from "@/lib/db";
import { Badge, Card, CardBody, CardHeader, EmptyState } from "@/components/ui";

// Tab 11 — Communications. Sub-sections for Emails / SMS / In-app /
// Support tickets / NPS responses.

export interface TenantCommunicationsTabProps { tenantId: string }

export async function TenantCommunicationsTab({ tenantId }: TenantCommunicationsTabProps) {
  const [emails, tickets, npsResponses] = await Promise.all([
    db.notification.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, type: true, title: true, body: true,
        readAt: true, createdAt: true, link: true,
      },
    }),
    db.supportTicket.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, subject: true, status: true, priority: true, category: true, module: true, createdAt: true, satisfactionRating: true },
    }),
    db.surveyResponse.findMany({
      where: { tenantId, survey: { kind: "NPS" } },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: { id: true, score: true, comment: true, createdAt: true },
    }),
  ]);

  return (
    <div className="space-y-4">
      <Card padding="none" className="overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <CardHeader title="In-app notifications" description={`${emails.length} most recent`} />
        </div>
        {emails.length === 0 ? (
          <CardBody><EmptyState title="No notifications on file" description="In-app notifications fanned out to this tenant's members appear here. Outbound transactional email delivery logs land in /platform/notifications when sent through the dispatcher." /></CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr><Th>Type</Th><Th>Title</Th><Th>Read?</Th><Th>Sent</Th></tr>
              </thead>
              <tbody>
                {emails.map((e) => (
                  <tr key={e.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <Td><span className="font-mono text-[11px]">{e.type}</span></Td>
                    <Td>{e.title}</Td>
                    <Td>{e.readAt ? <Badge size="xs" color="success">Read</Badge> : <Badge size="xs" color="neutral">Unread</Badge>}</Td>
                    <Td>{e.createdAt.toLocaleString()}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <CardHeader title="Support history" description={`${tickets.length} most recent tickets`} />
        </div>
        {tickets.length === 0 ? (
          <CardBody><EmptyState title="No support tickets" description="Tickets opened by this tenant's members appear here." /></CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr><Th>Subject</Th><Th>Category</Th><Th>Module</Th><Th>Priority</Th><Th>Status</Th><Th>Rating</Th><Th>Opened</Th></tr>
              </thead>
              <tbody>
                {tickets.map((t: typeof tickets[number]) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <Td>
                      <a href={`/platform/support/${t.id}`} className="hover:underline" style={{ color: "var(--accent-primary)" }}>
                        {t.subject}
                      </a>
                    </Td>
                    <Td>{t.category.toLowerCase()}</Td>
                    <Td>{t.module.toLowerCase().replace("_", " ")}</Td>
                    <Td><Badge size="xs" color={t.priority === "URGENT" ? "error" : t.priority === "HIGH" ? "warning" : "neutral"}>{t.priority.toLowerCase()}</Badge></Td>
                    <Td><Badge size="xs" color={t.status === "RESOLVED" || t.status === "CLOSED" ? "success" : "info"}>{t.status.toLowerCase().replace("_", " ")}</Badge></Td>
                    <Td>{t.satisfactionRating ? `${t.satisfactionRating}/5` : <span style={{ color: "var(--text-faint)" }}>—</span>}</Td>
                    <Td>{t.createdAt.toLocaleDateString()}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="px-4 pt-4 pb-2">
          <CardHeader title="NPS responses" description={`${npsResponses.length} on file`} />
        </div>
        {npsResponses.length === 0 ? (
          <CardBody><EmptyState title="No NPS responses" description="Open an NPS Survey row at /platform/notifications to start collecting." /></CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead style={{ background: "var(--surface-2)" }}>
                <tr><Th>Score</Th><Th>Comment</Th><Th>When</Th></tr>
              </thead>
              <tbody>
                {npsResponses.map((r: typeof npsResponses[number]) => (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <Td>
                      <Badge size="xs" color={r.score >= 9 ? "success" : r.score >= 7 ? "neutral" : "error"}>
                        {r.score}/10
                      </Badge>
                    </Td>
                    <Td>{r.comment ?? <span style={{ color: "var(--text-faint)" }}>(no comment)</span>}</Td>
                    <Td>{r.createdAt.toLocaleDateString()}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}>{children}</th>;
}
function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-2" style={{ color: "var(--text-default)" }}>{children}</td>;
}
