// Quick inventory of operations data for the new pages.
import { db } from "../src/lib/db";

async function main() {
  const [
    customers, orders, ordersByStatus,
    tickets, kbArticles, announcements,
  ] = await Promise.all([
    db.customer.count(),
    db.order.count(),
    db.order.groupBy({ by: ["status"], _count: { _all: true } }),
    db.supportTicket.count(),
    db.kbArticle.count(),
    db.platformAnnouncement.count(),
  ]);

  console.log("Customers:           ", customers);
  console.log("Orders:              ", orders);
  console.log("Orders by status:    ");
  for (const r of ordersByStatus) {
    console.log(`  ${r.status.padEnd(20)} ${r._count._all}`);
  }
  console.log("SupportTickets:      ", tickets);
  console.log("KbArticles:          ", kbArticles);
  console.log("PlatformAnnouncements:", announcements);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
