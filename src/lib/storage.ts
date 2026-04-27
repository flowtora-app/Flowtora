// Tenant-scoped object storage.
//
// Backed by Cloudflare R2 via the S3-compatible SDK. Two buckets on
// one account:
//
//   * private — the default. Tenant data (receipts, mockups, install
//     photos, customer uploads). We store opaque KEYS in Postgres and
//     mint short-lived signed GETs on read, so access control flows
//     through the current request's auth every time.
//
//   * public — logos and marketing assets that need to be embeddable
//     in emails and PDF invoices. Served via a Cloudflare custom
//     domain (or the per-bucket pub-*.r2.dev URL for dev). We store
//     the full CDN URL in the DB for these because the URL *is* the
//     asset address for downstream consumers.
//
// Design principles:
//
// 1. Public vs. private is a bucket-level choice, not a path prefix.
//    This keeps "anything in public can be embedded anywhere" as a
//    grep-friendly, auditable guarantee — a config flip on one bucket
//    can't accidentally expose the other.
//
// 2. Keys are always prefixed with `tenants/<tenantId>/<scope>/…` so
//    bucket-level listings and per-tenant purge scripts are trivial.
//
// 3. The R2 client is lazy: if the env isn't configured, constructing
//    the client is the error point (callers see a clear message).
//    This keeps boot and tests green in environments without R2.

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "node:crypto";

// ── Config ────────────────────────────────────────────────────────

// Signed-GET TTL for reads. 15 min is the sweet spot: long enough
// that a customer clicking a PDF link from an email won't bounce off
// an expired URL mid-render, short enough that forwarded links rot.
const DEFAULT_SIGNED_READ_TTL_SECONDS = 15 * 60;

// Max key segment length — prevents path-injection style smuggling
// through wildly long filenames.
const MAX_FILENAME_LENGTH = 120;

export type Visibility = "public" | "private";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  privateBucket: string;
  publicBucket: string;
  publicBaseUrl: string; // no trailing slash
};

function readConfig(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const privateBucket = process.env.R2_BUCKET;
  const publicBucket = process.env.R2_BUCKET_PUBLIC;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !privateBucket ||
    !publicBucket ||
    !publicBaseUrl
  ) {
    return null;
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    privateBucket,
    publicBucket,
    // Tolerate trailing-slash in the env to keep URL-joins predictable.
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
  };
}

let cachedClient: { client: S3Client; cfg: R2Config } | null = null;

function getClient(): { client: S3Client; cfg: R2Config } {
  if (cachedClient) return cachedClient;
  const cfg = readConfig();
  if (!cfg) {
    // Thrown at call-time only — boot and static analysis still pass.
    throw new StorageError(
      "File storage isn't configured on this deploy. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_BUCKET_PUBLIC, and R2_PUBLIC_BASE_URL, then redeploy.",
    );
  }
  // R2's S3-compatible endpoint. Region is fixed to "auto".
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
  cachedClient = { client, cfg };
  return cachedClient;
}

function bucketFor(visibility: Visibility, cfg: R2Config): string {
  return visibility === "public" ? cfg.publicBucket : cfg.privateBucket;
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

// ── Key helpers ───────────────────────────────────────────────────

// Known storage "scopes" — extend as features start writing. Keeping
// this as a union rather than a free string means adding a scope is a
// compile-time decision (plus grep-friendly).
export type StorageScope =
  | "logos"
  | "receipts"
  | "proofs"
  | "install-photos"
  | "customer-files"
  | "avatars"
  | "tenant-files";

function safeFilename(name: string): string {
  const trimmed = name.trim().slice(-MAX_FILENAME_LENGTH);
  // Strip path separators and control chars; keep a reasonable subset
  // so the resulting key is still human-readable in the dashboard.
  return trimmed.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, "-") || "file";
}

// Build a tenant-scoped object key. Callers should pass a stable
// "owner" id (e.g. the receipt or proof row id) so keys stay
// deterministic per upload and re-uploads don't orphan infinite
// copies — though we always append a short random suffix so the same
// owner id + filename still get unique keys on replacement.
export function keyFor(args: {
  tenantId: string;
  scope: StorageScope;
  ownerId?: string;
  filename: string;
}): string {
  const suffix = randomBytes(6).toString("hex");
  const base = safeFilename(args.filename);
  const ownerSegment = args.ownerId ? `${args.ownerId}/` : "";
  return `tenants/${args.tenantId}/${args.scope}/${ownerSegment}${suffix}-${base}`;
}

// ── Operations ────────────────────────────────────────────────────

export async function putObject(args: {
  key: string;
  body: Buffer | Uint8Array;
  contentType: string;
  visibility?: Visibility; // default private
}): Promise<void> {
  const { client, cfg } = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: bucketFor(args.visibility ?? "private", cfg),
      Key: args.key,
      Body: args.body,
      ContentType: args.contentType,
    }),
  );
}

// Mint a short-lived GET URL for a stored PRIVATE object. Use this
// any time you hand a URL back to the browser — never persist it.
// For public objects use `publicUrlFor()` — signing a public URL is
// pointless and more expensive.
export async function getSignedReadUrl(
  key: string,
  ttlSeconds: number = DEFAULT_SIGNED_READ_TTL_SECONDS,
): Promise<string> {
  const { client, cfg } = getClient();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: cfg.privateBucket, Key: key }),
    { expiresIn: ttlSeconds },
  );
}

// Build the CDN URL for a public object. Persist-safe because the
// bucket is public by design and the CDN base is a deploy-time
// config (swappable via env when we attach a custom domain).
export function publicUrlFor(key: string): string {
  const { cfg } = getClient();
  // Keys are already slash-safe; `encodeURI` handles spaces and such
  // without double-encoding the forward slashes we want to keep.
  return `${cfg.publicBaseUrl}/${encodeURI(key)}`;
}

export async function deleteObject(
  key: string,
  visibility: Visibility = "private",
): Promise<void> {
  const { client, cfg } = getClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucketFor(visibility, cfg),
      Key: key,
    }),
  );
}

// Convenience: upload a browser File (from a FormData field) in one
// step. Streams the file's ArrayBuffer into a Buffer — fine for the
// sizes we expect (receipts/proofs up to a few MB). Reach for a
// streaming approach only if we start accepting huge PDFs.
export async function putFile(args: {
  tenantId: string;
  scope: StorageScope;
  ownerId?: string;
  file: File;
  visibility?: Visibility; // default private
}): Promise<{ key: string; contentType: string; size: number }> {
  const key = keyFor({
    tenantId: args.tenantId,
    scope: args.scope,
    ownerId: args.ownerId,
    filename: args.file.name,
  });
  const contentType = args.file.type || "application/octet-stream";
  const body = Buffer.from(await args.file.arrayBuffer());
  await putObject({
    key,
    body,
    contentType,
    visibility: args.visibility,
  });
  return { key, contentType, size: body.byteLength };
}

// Best-effort delete — used in cleanup paths where we'd rather not
// crash the parent operation if R2 happens to be unreachable or the
// object is already gone. Logs the failure so a sweeper can find
// orphans later.
export async function tryDelete(
  key: string,
  visibility: Visibility = "private",
): Promise<void> {
  try {
    await deleteObject(key, visibility);
  } catch (err) {
    console.error(`[storage.tryDelete] ${key}:`, err);
  }
}

// Export config-readiness so UI can render a helpful "not configured"
// state instead of letting put() throw.
export function isStorageConfigured(): boolean {
  return readConfig() !== null;
}
