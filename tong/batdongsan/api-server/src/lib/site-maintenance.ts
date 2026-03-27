import { getSiteSetting, parseBooleanSiteSetting, setSiteSetting } from "./site-settings";

const SITE_MAINTENANCE_ENABLED_KEY = "site_maintenance_enabled";
const SITE_MAINTENANCE_ENABLED_VALUE = "true";
const SITE_MAINTENANCE_DISABLED_VALUE = "false";
const SITE_MAINTENANCE_CACHE_TTL_MS = 15 * 1000;

export type SiteMaintenanceStatus = {
  isEnabled: boolean;
  message: string;
  updatedAt?: string;
};

let cachedStatus: SiteMaintenanceStatus | null = null;
let cachedStatusAt = 0;
let pendingStatusPromise: Promise<SiteMaintenanceStatus> | null = null;

function buildSiteMaintenanceStatus(isEnabled: boolean, updatedAt?: Date | null): SiteMaintenanceStatus {
  return {
    isEnabled,
    message: isEnabled
      ? "He thong dang trong che do bao tri. Khach truy cap se tam thoi thay trang bao tri."
      : "Che do bao tri dang tat. Website hoat dong binh thuong.",
    updatedAt: updatedAt ? updatedAt.toISOString() : undefined,
  };
}

async function loadSiteMaintenanceStatus() {
  const row = await getSiteSetting(SITE_MAINTENANCE_ENABLED_KEY);

  return buildSiteMaintenanceStatus(
    parseBooleanSiteSetting(row?.settingValue, false, SITE_MAINTENANCE_DISABLED_VALUE),
    row?.updatedAt,
  );
}

export async function getSiteMaintenanceStatus(options: { forceRefresh?: boolean } = {}) {
  const now = Date.now();

  if (!options.forceRefresh && cachedStatus && now - cachedStatusAt < SITE_MAINTENANCE_CACHE_TTL_MS) {
    return cachedStatus;
  }

  if (!pendingStatusPromise) {
    pendingStatusPromise = loadSiteMaintenanceStatus()
      .then((status) => {
        cachedStatus = status;
        cachedStatusAt = Date.now();
        return status;
      })
      .finally(() => {
        pendingStatusPromise = null;
      });
  }

  return pendingStatusPromise;
}

export async function setSiteMaintenanceEnabled(isEnabled: boolean) {
  const { updatedAt } = await setSiteSetting(
    SITE_MAINTENANCE_ENABLED_KEY,
    isEnabled ? SITE_MAINTENANCE_ENABLED_VALUE : SITE_MAINTENANCE_DISABLED_VALUE,
  );

  const status = buildSiteMaintenanceStatus(isEnabled, updatedAt);
  cachedStatus = status;
  cachedStatusAt = Date.now();

  return status;
}
