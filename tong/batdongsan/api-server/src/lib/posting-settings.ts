import { getSiteSetting, parseBooleanSiteSetting, setSiteSetting } from "./site-settings";

const PROPERTY_POSTING_ENABLED_KEY = "property_posting_enabled";
const PROPERTY_POSTING_ENABLED_VALUE = "true";
const PROPERTY_POSTING_DISABLED_VALUE = "false";

export type PropertyPostingAvailability = {
  isEnabled: boolean;
  message: string;
  updatedAt?: string;
};

function buildPropertyPostingAvailability(isEnabled: boolean, updatedAt?: Date | null): PropertyPostingAvailability {
  return {
    isEnabled,
    message: isEnabled
      ? "Dang bai dang duoc bat. Nguoi dung co the gui tin moi."
      : "Dang bai tam thoi dang tat. Nguoi dung se khong gui duoc tin moi.",
    updatedAt: updatedAt ? updatedAt.toISOString() : undefined,
  };
}

export async function getPropertyPostingAvailability(): Promise<PropertyPostingAvailability> {
  const row = await getSiteSetting(PROPERTY_POSTING_ENABLED_KEY);

  return buildPropertyPostingAvailability(
    parseBooleanSiteSetting(row?.settingValue, true, PROPERTY_POSTING_DISABLED_VALUE),
    row?.updatedAt,
  );
}

export async function setPropertyPostingEnabled(isEnabled: boolean): Promise<PropertyPostingAvailability> {
  const { updatedAt } = await setSiteSetting(
    PROPERTY_POSTING_ENABLED_KEY,
    isEnabled ? PROPERTY_POSTING_ENABLED_VALUE : PROPERTY_POSTING_DISABLED_VALUE,
  );

  return buildPropertyPostingAvailability(isEnabled, updatedAt);
}
