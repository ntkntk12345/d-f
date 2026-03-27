import { eq } from "drizzle-orm";
import { db, pool, siteSettingsTable } from "../../db";

const CREATE_SITE_SETTINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS site_settings (
    setting_key VARCHAR(128) NOT NULL,
    setting_value TEXT NOT NULL,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (setting_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

let ensureSiteSettingsTablePromise: Promise<void> | null = null;

export async function ensureSiteSettingsTable() {
  if (!ensureSiteSettingsTablePromise) {
    ensureSiteSettingsTablePromise = pool.query(CREATE_SITE_SETTINGS_TABLE_SQL)
      .then(() => undefined)
      .catch((error) => {
        ensureSiteSettingsTablePromise = null;
        throw error;
      });
  }

  await ensureSiteSettingsTablePromise;
}

export async function getSiteSetting(settingKey: string) {
  await ensureSiteSettingsTable();

  const [row] = await db
    .select({
      settingValue: siteSettingsTable.settingValue,
      updatedAt: siteSettingsTable.updatedAt,
    })
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.settingKey, settingKey))
    .limit(1);

  return row;
}

export async function setSiteSetting(settingKey: string, settingValue: string) {
  await ensureSiteSettingsTable();

  const updatedAt = new Date();

  await db
    .insert(siteSettingsTable)
    .values({
      settingKey,
      settingValue,
      updatedAt,
    })
    .onDuplicateKeyUpdate({
      set: {
        settingValue,
        updatedAt,
      },
    });

  return {
    settingKey,
    settingValue,
    updatedAt,
  };
}

export function parseBooleanSiteSetting(
  value: string | null | undefined,
  defaultValue: boolean,
  falseValue = "false",
) {
  if (!value) return defaultValue;
  return value.trim().toLowerCase() !== falseValue;
}
