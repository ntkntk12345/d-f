import { getSiteSetting, setSiteSetting } from "./site-settings";

const SITE_CONTACT_LINK_KEY = "site_contact_link";
const DEFAULT_SITE_CONTACT_LINK = "https://zalo.me/0876480130/";
const SITE_CONTACT_CACHE_TTL_MS = 30 * 1000;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "tel:", "mailto:", "zalo:"]);

export type SiteContactControl = {
  contactLink: string;
  message: string;
  updatedAt?: string;
};

let cachedContactControl: SiteContactControl | null = null;
let cachedContactControlAt = 0;
let pendingContactControlPromise: Promise<SiteContactControl> | null = null;

function buildSiteContactControl(contactLink: string, updatedAt?: Date | null): SiteContactControl {
  const normalizedContactLink = normalizeSiteContactLink(contactLink) || DEFAULT_SITE_CONTACT_LINK;

  return {
    contactLink: normalizedContactLink,
    message:
      normalizedContactLink === DEFAULT_SITE_CONTACT_LINK
        ? "Dang dung link lien he mac dinh cho nut Zalo."
        : "Dang dung link lien he tuy chinh cho nut Zalo.",
    updatedAt: updatedAt ? updatedAt.toISOString() : undefined,
  };
}

function withPossibleProtocol(value: string) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return value;
  }

  if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(value)) {
    return `https://${value}`;
  }

  return value;
}

export function normalizeSiteContactLink(value: string | null | undefined) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;

  const normalizedValue = withPossibleProtocol(trimmed);

  try {
    const parsed = new URL(normalizedValue);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

async function loadSiteContactControl() {
  const row = await getSiteSetting(SITE_CONTACT_LINK_KEY);

  return buildSiteContactControl(row?.settingValue || DEFAULT_SITE_CONTACT_LINK, row?.updatedAt);
}

export async function getSiteContactControl(options: { forceRefresh?: boolean } = {}) {
  const now = Date.now();

  if (!options.forceRefresh && cachedContactControl && now - cachedContactControlAt < SITE_CONTACT_CACHE_TTL_MS) {
    return cachedContactControl;
  }

  if (!pendingContactControlPromise) {
    pendingContactControlPromise = loadSiteContactControl()
      .then((contactControl) => {
        cachedContactControl = contactControl;
        cachedContactControlAt = Date.now();
        return contactControl;
      })
      .finally(() => {
        pendingContactControlPromise = null;
      });
  }

  return pendingContactControlPromise;
}

export async function setSiteContactLink(contactLink: string) {
  const normalizedContactLink = normalizeSiteContactLink(contactLink);

  if (!normalizedContactLink) {
    throw new Error("INVALID_SITE_CONTACT_LINK");
  }

  const { updatedAt } = await setSiteSetting(SITE_CONTACT_LINK_KEY, normalizedContactLink);
  const contactControl = buildSiteContactControl(normalizedContactLink, updatedAt);

  cachedContactControl = contactControl;
  cachedContactControlAt = Date.now();

  return contactControl;
}

