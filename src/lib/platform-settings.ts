import { db } from "@/lib/db";

// Helper for the PlatformSetting singleton — the row that drives
// maintenance mode + the global feature-freeze advisory flag.
//
// We always read by the fixed id "singleton". The first call creates
// the row; subsequent calls just fetch it. Cheap (single-row primary
// key lookup) so we can call this from any layout without batching.

const SINGLETON_ID = "singleton";

export interface PlatformSettings {
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  featureFreezeMode: boolean;
  featureFreezeReason: string | null;
  updatedBy: string | null;
  updatedAt: Date;
}

const DEFAULT_SETTINGS: PlatformSettings = {
  maintenanceMode: false,
  maintenanceMessage: null,
  featureFreezeMode: false,
  featureFreezeReason: null,
  updatedBy: null,
  updatedAt: new Date(0),
};

/**
 * Read the singleton settings row. Auto-creates it on first read so
 * downstream callers never have to handle the null case. Returns a
 * stable in-memory default if the DB is unreachable so we don't take
 * the whole site down because of a settings lookup failure.
 */
export async function getPlatformSettings(): Promise<PlatformSettings> {
  try {
    const existing = await db.platformSetting.findUnique({ where: { id: SINGLETON_ID } });
    if (existing) {
      return {
        maintenanceMode:     existing.maintenanceMode,
        maintenanceMessage:  existing.maintenanceMessage,
        featureFreezeMode:   existing.featureFreezeMode,
        featureFreezeReason: existing.featureFreezeReason,
        updatedBy:           existing.updatedBy,
        updatedAt:           existing.updatedAt,
      };
    }
    // Lazy-init the singleton on first read.
    const row = await db.platformSetting.create({
      data: { id: SINGLETON_ID, maintenanceMode: false, featureFreezeMode: false },
    });
    return {
      maintenanceMode:     row.maintenanceMode,
      maintenanceMessage:  row.maintenanceMessage,
      featureFreezeMode:   row.featureFreezeMode,
      featureFreezeReason: row.featureFreezeReason,
      updatedBy:           row.updatedBy,
      updatedAt:           row.updatedAt,
    };
  } catch {
    // DB unreachable — fall back to safe defaults so the site doesn't
    // hard-fail on a settings lookup.
    return DEFAULT_SETTINGS;
  }
}

export const PLATFORM_SETTING_ID = SINGLETON_ID;
