// Server-side PDF rendering for /api/platform/reports/[key]/export.
//
// We use @react-pdf/renderer (pure JS, no headless Chromium) so the
// route works on Vercel's Node runtime without additional binaries.
// The PDF includes the report header, the auto-generated insights,
// and the data table (truncated to a reasonable page count). Charts
// are rendered as text-only summaries because react-pdf doesn't
// natively understand Recharts SVG — a later slice can add per-viz
// PDF renderers if there's demand.

import * as React from "react";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import type { ReportPayload } from "./loaders";

interface RenderArgs {
  report: { key: string; name: string; description: string; icon: string; category: string };
  payload: ReportPayload;
}

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10, fontFamily: "Helvetica", color: "#0F172A" },
  eyebrow: { fontSize: 9, color: "#7C3AED", marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 },
  title: { fontSize: 18, fontWeight: 700, marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#64748B", marginBottom: 18 },
  partial: { backgroundColor: "#FEF3C7", borderColor: "#FCD34D", borderWidth: 1, borderRadius: 4, padding: 8, fontSize: 9, marginBottom: 12, color: "#78350F" },
  pending: { backgroundColor: "#FEE2E2", borderColor: "#FCA5A5", borderWidth: 1, borderRadius: 4, padding: 12, fontSize: 10, color: "#7F1D1D" },
  sectionHeading: { fontSize: 12, fontWeight: 700, marginBottom: 6, marginTop: 12 },
  insight: { borderLeftWidth: 2, paddingLeft: 6, paddingTop: 2, paddingBottom: 2, marginBottom: 6 },
  insightTitle: { fontSize: 10, fontWeight: 700, marginBottom: 1 },
  insightBody: { fontSize: 9, color: "#64748B" },
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#E2E8F0", paddingVertical: 4 },
  tableHeaderRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#0F172A", paddingVertical: 4 },
  tableCell: { paddingHorizontal: 4, fontSize: 9 },
  tableHeaderCell: { paddingHorizontal: 4, fontSize: 8, fontWeight: 700, color: "#64748B", textTransform: "uppercase" },
  footer: { position: "absolute", bottom: 18, left: 32, right: 32, fontSize: 8, color: "#94A3B8", textAlign: "center" },
});

const TONE_BORDER: Record<string, string> = {
  positive: "#10B981",
  warning:  "#F59E0B",
  neutral:  "#94A3B8",
};

function ReportPdf({ report, payload }: RenderArgs) {
  if (payload.state === "PENDING") {
    return (
      <Document>
        <Page size="A4" style={styles.page}>
          <Text style={styles.eyebrow}>Flowtora · Reports</Text>
          <Text style={styles.title}>{report.icon} {report.name}</Text>
          <Text style={styles.subtitle}>{report.description}</Text>
          <View style={styles.pending}>
            <Text style={{ fontWeight: 700, marginBottom: 4 }}>Awaiting data source</Text>
            <Text>{payload.note}</Text>
          </View>
          <Text style={styles.footer}>Generated {new Date().toISOString().slice(0, 19)} UTC · Flowtora Admin</Text>
        </Page>
      </Document>
    );
  }

  const rows = payload.rows.slice(0, 200);
  const columns = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.eyebrow}>Flowtora · Reports</Text>
        <Text style={styles.title}>{report.icon} {report.name}</Text>
        <Text style={styles.subtitle}>{report.description}</Text>

        {payload.state === "PARTIAL" && payload.note && (
          <View style={styles.partial}>
            <Text>{payload.note}</Text>
          </View>
        )}

        <Text style={styles.sectionHeading}>Insights</Text>
        {payload.insights.length === 0 ? (
          <Text style={{ fontSize: 9, color: "#94A3B8" }}>No insights for this run.</Text>
        ) : (
          payload.insights.map((it, i) => (
            <View key={i} style={[styles.insight, { borderLeftColor: TONE_BORDER[it.tone ?? "neutral"] ?? "#94A3B8" }]}>
              <Text style={styles.insightTitle}>{it.title}</Text>
              <Text style={styles.insightBody}>{it.body}</Text>
            </View>
          ))
        )}

        <Text style={styles.sectionHeading}>Data ({payload.rows.length.toLocaleString()} rows{payload.rows.length > rows.length ? `, showing first ${rows.length}` : ""})</Text>

        {rows.length === 0 ? (
          <Text style={{ fontSize: 9, color: "#94A3B8" }}>No rows in this period.</Text>
        ) : (
          <View>
            <View style={styles.tableHeaderRow}>
              {columns.map((c) => (
                <Text key={c} style={[styles.tableHeaderCell, { flex: 1 }]}>{humanize(c)}</Text>
              ))}
            </View>
            {rows.map((r, i) => (
              <View key={i} style={styles.tableRow}>
                {columns.map((c) => {
                  const v = r[c];
                  return (
                    <Text key={c} style={[styles.tableCell, { flex: 1 }]}>
                      {v == null ? "—" : String(v)}
                    </Text>
                  );
                })}
              </View>
            ))}
          </View>
        )}

        <Text style={styles.footer}>
          Generated {new Date().toISOString().slice(0, 19)} UTC · Flowtora Admin · Charts available in the web view
        </Text>
      </Page>
    </Document>
  );
}

function humanize(s: string): string {
  return s.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).replace(/_/g, " ");
}

export async function renderReportPdf(args: RenderArgs): Promise<Buffer> {
  const stream = await pdf(<ReportPdf {...args} />).toBuffer();
  // @react-pdf/renderer's toBuffer returns a Node Readable. Aggregate it.
  return await streamToBuffer(stream);
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks);
}
