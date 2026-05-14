// Page 69 — Webhooks Catalog data layer.
//
// Developer-facing catalog of every webhook event Flowtora emits — schemas,
// samples, code receivers, deprecation notices, version history. Reads
// existing WebhookEvent + WebhookEventVersion + WebhookEndpoint models;
// no schema additions for this page (the existing Page 46 data already
// covers it).

import { db } from "@/lib/db";
import type {
  WebhookEventCategory,
  WebhookEventStability,
} from "@prisma/client";

export const CATEGORY_LABEL: Record<WebhookEventCategory, string> = {
  TENANT_LIFECYCLE: "Tenant lifecycle",
  SUBSCRIPTION:     "Subscription",
  INVOICE:          "Invoices",
  PAYMENT:          "Payments",
  USER:             "Users & teams",
  JOB:              "Orders & jobs",
  INTEGRATION:      "Integrations",
  SYSTEM:           "System",
  SECURITY:         "Security",
  MARKETING:        "Marketing",
};

export const STABILITY_TONE: Record<
  WebhookEventStability,
  { bg: string; fg: string; label: string; description: string }
> = {
  STABLE: {
    bg: "var(--emerald-100)", fg: "var(--emerald-700)",
    label: "Stable",
    description: "Production-ready. We commit to non-breaking changes within the major version.",
  },
  BETA: {
    bg: "var(--amber-100)", fg: "var(--amber-700)",
    label: "Beta",
    description: "May change without notice. Suitable for early-access integrators only.",
  },
  DEPRECATED: {
    bg: "var(--rose-100)", fg: "var(--rose-700)",
    label: "Deprecated",
    description: "Will be removed in a future version. See deprecation notice for migration path.",
  },
};

export const CATEGORY_ORDER: WebhookEventCategory[] = [
  "TENANT_LIFECYCLE", "SUBSCRIPTION", "INVOICE", "PAYMENT",
  "USER", "JOB", "INTEGRATION", "SYSTEM", "SECURITY", "MARKETING",
];

/* ── Loaders ──────────────────────────────────────────── */

export async function loadCatalog(args?: {
  category?: WebhookEventCategory;
  stability?: WebhookEventStability;
  search?: string;
}) {
  const where: Record<string, unknown> = {};
  if (args?.category)  where.category  = args.category;
  if (args?.stability) where.stability = args.stability;
  if (args?.search) {
    where.OR = [
      { name:        { contains: args.search, mode: "insensitive" } },
      { description: { contains: args.search, mode: "insensitive" } },
    ];
  }
  return db.webhookEvent.findMany({
    where,
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export async function loadEventDetail(name: string) {
  return db.webhookEvent.findUnique({
    where: { name },
    include: {
      versions: { orderBy: { releasedAt: "desc" } },
    },
  });
}

/** Live subscriber count per event — recomputed cheaply at request time. */
export async function loadSubscriberCounts(): Promise<Map<string, number>> {
  const endpoints = await db.webhookEndpoint.findMany({
    where: { status: "ACTIVE" },
    select: { subscribedEvents: true },
  });
  const counts = new Map<string, number>();
  for (const ep of endpoints) {
    for (const evt of ep.subscribedEvents) {
      counts.set(evt, (counts.get(evt) ?? 0) + 1);
    }
  }
  return counts;
}

/** Most-recent delivery snapshot per event, used for "last seen" badges. */
export async function loadLastDeliveryByEvent(): Promise<Map<string, Date>> {
  // One query, group by eventName.
  const grouped = await db.webhookDelivery.groupBy({
    by: ["eventName"],
    _max: { attemptedAt: true },
  });
  const map = new Map<string, Date>();
  for (const g of grouped) if (g._max.attemptedAt) map.set(g.eventName, g._max.attemptedAt);
  return map;
}

/* ── KPIs ─────────────────────────────────────────────── */

export interface CatalogKpis {
  totalEvents: number;
  stableCount: number;
  betaCount: number;
  deprecatedCount: number;
  activeEndpoints: number;
  deliveries24h: number;
  failures24h: number;
}

export async function loadCatalogKpis(): Promise<CatalogKpis> {
  const since = new Date(Date.now() - 86_400_000);
  const [events, activeEndpoints, deliveries24h, failures24h] = await Promise.all([
    db.webhookEvent.findMany({ select: { stability: true } }),
    db.webhookEndpoint.count({ where: { status: "ACTIVE" } }),
    db.webhookDelivery.count({ where: { attemptedAt: { gte: since } } }),
    db.webhookDelivery.count({ where: { attemptedAt: { gte: since }, status: "FAILED" } }),
  ]);
  return {
    totalEvents:     events.length,
    stableCount:     events.filter((e) => e.stability === "STABLE").length,
    betaCount:       events.filter((e) => e.stability === "BETA").length,
    deprecatedCount: events.filter((e) => e.stability === "DEPRECATED").length,
    activeEndpoints,
    deliveries24h,
    failures24h,
  };
}

/* ── Code receivers ───────────────────────────────────── */

export interface CodeSamples {
  node?:   string;
  python?: string;
  ruby?:   string;
  php?:    string;
  go?:     string;
  curl?:   string;
}

const DEFAULT_RECEIVERS: CodeSamples = {
  node:   `import express from "express";
import crypto from "node:crypto";

const SECRET = process.env.FLOWTORA_WEBHOOK_SECRET!;
const app = express();
app.use(express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf.toString(); } }));

app.post("/webhooks/flowtora", (req, res) => {
  const sig = req.header("Flowtora-Signature") ?? "";
  const expected = crypto.createHmac("sha256", SECRET).update((req as any).rawBody).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return res.status(401).send("invalid signature");
  }
  const event = req.body;
  // …process event.type, event.data…
  res.status(200).send("ok");
});

app.listen(3000);`,
  python: `from flask import Flask, request, abort
import hmac, hashlib, os

SECRET = os.environ["FLOWTORA_WEBHOOK_SECRET"].encode()
app = Flask(__name__)

@app.post("/webhooks/flowtora")
def receive():
    sig = request.headers.get("Flowtora-Signature", "")
    expected = hmac.new(SECRET, request.get_data(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        abort(401)
    event = request.get_json()
    # …process event["type"], event["data"]…
    return "ok"
`,
  ruby:   `require "sinatra"
require "openssl"

SECRET = ENV.fetch("FLOWTORA_WEBHOOK_SECRET")

post "/webhooks/flowtora" do
  body = request.body.read
  sig  = request.env["HTTP_FLOWTORA_SIGNATURE"]
  expected = OpenSSL::HMAC.hexdigest("SHA256", SECRET, body)
  halt 401 unless Rack::Utils.secure_compare(sig.to_s, expected)
  event = JSON.parse(body)
  # …process event["type"], event["data"]…
  "ok"
end`,
  php:    `<?php
$secret = getenv("FLOWTORA_WEBHOOK_SECRET");
$body   = file_get_contents("php://input");
$sig    = $_SERVER["HTTP_FLOWTORA_SIGNATURE"] ?? "";
$expected = hash_hmac("sha256", $body, $secret);
if (!hash_equals($expected, $sig)) {
  http_response_code(401);
  exit;
}
$event = json_decode($body, true);
// …process $event["type"], $event["data"]…
http_response_code(200);`,
  go:     `package main

import (
  "crypto/hmac"
  "crypto/sha256"
  "encoding/hex"
  "io"
  "net/http"
  "os"
)

var secret = []byte(os.Getenv("FLOWTORA_WEBHOOK_SECRET"))

func receive(w http.ResponseWriter, r *http.Request) {
  body, _ := io.ReadAll(r.Body)
  mac := hmac.New(sha256.New, secret)
  mac.Write(body)
  expected := hex.EncodeToString(mac.Sum(nil))
  if !hmac.Equal([]byte(r.Header.Get("Flowtora-Signature")), []byte(expected)) {
    w.WriteHeader(401); return
  }
  // …process the event…
  w.WriteHeader(200)
}`,
  curl:   `# Verifying a signature manually:
echo -n "$BODY" | openssl dgst -sha256 -hmac "$FLOWTORA_WEBHOOK_SECRET"
# Compare the result to the Flowtora-Signature header value (constant-time only in code).`,
};

export function getCodeSamples(event: { codeSamples: unknown } | null | undefined): CodeSamples {
  const stored = (event?.codeSamples ?? {}) as Record<string, string>;
  return {
    node:   stored.node   ?? DEFAULT_RECEIVERS.node,
    python: stored.python ?? DEFAULT_RECEIVERS.python,
    ruby:   stored.ruby   ?? DEFAULT_RECEIVERS.ruby,
    php:    stored.php    ?? DEFAULT_RECEIVERS.php,
    go:     stored.go     ?? DEFAULT_RECEIVERS.go,
    curl:   stored.curl   ?? DEFAULT_RECEIVERS.curl,
  };
}

/* ── Helpers ──────────────────────────────────────────── */

export function relativeFromNow(d: Date | null | undefined): string {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const future = ms < 0;
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60_000);
  const fmt = (s: string) => future ? `in ${s}` : `${s} ago`;
  if (mins < 1)  return future ? "soon" : "just now";
  if (mins < 60) return fmt(`${mins}m`);
  const hrs = Math.round(mins / 60);
  if (hrs < 24)  return fmt(`${hrs}h`);
  const days = Math.round(hrs / 24);
  if (days < 30) return fmt(`${days}d`);
  const months = Math.round(days / 30);
  return fmt(`${months}mo`);
}

export function prettyJson(value: unknown): string {
  try { return JSON.stringify(value, null, 2); }
  catch { return String(value); }
}

/* ── Aggregate page loader ────────────────────────────── */

export async function loadCatalogPage(args?: {
  category?: WebhookEventCategory;
  stability?: WebhookEventStability;
  search?: string;
}) {
  const [kpis, events, subscribers, lastDelivery] = await Promise.all([
    loadCatalogKpis(),
    loadCatalog(args),
    loadSubscriberCounts(),
    loadLastDeliveryByEvent(),
  ]);
  return { kpis, events, subscribers, lastDelivery };
}
