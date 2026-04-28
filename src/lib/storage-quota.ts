// File-storage quota tracking.
//
// We don't denormalize a counter on Tenant — at this scale the live
// SUM(File.sizeBytes) is fast enough (one indexed query per upload)
// and trivially correct. If a tenant ever pushes hundreds of thousands
// of files we can swap to a denormalized counter without touching
// callers — `getStorageUsage()` is the only API.

import { db } from "@/lib/db";
import { planLimit } from "@/lib/entitlements";
import type { Plan } from "@prisma/client";

export const GB_IN_BYTES = 1024 * 1024 * 1024;

export interface StorageUsage {
  /** Sum of File.sizeBytes for the tenant. */
  usedBytes: number;
  /** Plan cap in bytes. `Infinity` for unlimited tiers. */
  quotaBytes: number;
  /** 0–1 fraction; clamped to 1 once over. `0` for unlimited tiers. */
  percentUsed: number;
  /** True when the next upload should be blocked. */
  exceeded: boolean;
}

/**
 * Read the current file-storage usage for a tenant.
 *
 * Numbers in the DB are gigabytes (5, 50, -1=unlimited); we convert
 * to bytes for the comparison so callers can do the natural
 * `usedBytes + incoming.size > quotaBytes` test.
 */
export async function getStorageUsage(
  tenantId: string,
  plan: Plan,
): Promise<StorageUsage> {
  const [usage, quotaGB] = await Promise.all([
    db.file.aggregate({
      where: { tenantId },
      _sum: { sizeBytes: true },
    }),
    planLimit(tenantId, plan, "storageQuotaGB"),
  ]);

  const usedBytes = usage._sum.sizeBytes ?? 0;
  const quotaBytes = quotaGB === Infinity ? Infinity : quotaGB * GB_IN_BYTES;
  const percentUsed = quotaBytes === Infinity
    ? 0
    : Math.min(1, usedBytes / quotaBytes);
  const exceeded = quotaBytes !== Infinity && usedBytes >= quotaBytes;

  return { usedBytes, quotaBytes, percentUsed, exceeded };
}

/**
 * Check whether a pending upload of `incomingBytes` would push the
 * tenant over their plan's quota. Returns `null` when allowed, or a
 * structured "denied" object when the upload should be blocked.
 *
 * Callers in upload server actions can return this directly to the
 * client which renders the corresponding error.
 */
export interface QuotaDenial {
  ok: false;
  error: string;
  reason: "storage_quota_exceeded";
  usedBytes: number;
  quotaBytes: number;
  /** Friendly upgrade-target plan name, e.g. "Professional". */
  upgradeTo: "Professional" | "Enterprise" | null;
}

export async function checkStorageQuota(
  tenantId: string,
  plan: Plan,
  incomingBytes: number,
): Promise<QuotaDenial | null> {
  const usage = await getStorageUsage(tenantId, plan);

  // Unlimited tiers always pass.
  if (usage.quotaBytes === Infinity) return null;

  if (usage.usedBytes + incomingBytes <= usage.quotaBytes) return null;

  // Pick the next-up plan name based on the current tier. The legacy
  // `Plan` enum doesn't 1:1 map to the new pricing slugs, so we use a
  // simple ladder that matches the marketing tiers.
  const upgradeTo: QuotaDenial["upgradeTo"] =
    plan === "ENTERPRISE"
      ? null
      : plan === "PRO"
      ? "Enterprise"
      : "Professional";

  const usedGB = (usage.usedBytes / GB_IN_BYTES).toFixed(2);
  const quotaGB = (usage.quotaBytes / GB_IN_BYTES).toFixed(0);
  const upgradeMsg = upgradeTo
    ? `Upgrade to ${upgradeTo} for more storage.`
    : "Contact support for additional storage.";

  return {
    ok: false,
    error: `Storage quota exceeded — using ${usedGB} GB of ${quotaGB} GB. ${upgradeMsg}`,
    reason: "storage_quota_exceeded",
    usedBytes: usage.usedBytes,
    quotaBytes: usage.quotaBytes,
    upgradeTo,
  };
}

// Format helpers for UI rendering.
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "Unlimited";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}
