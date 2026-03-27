import { useEffect } from "react";
import { BRAND_DOMAIN, BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";

type SeoOptions = {
  title: string;
  description?: string;
  image?: string;
  url?: string;
  type?: "website" | "article";
  robots?: string;
};

const DEFAULT_SITE_URL = `https://${BRAND_DOMAIN}`;
const DEFAULT_IMAGE_PATH = "/opengraph.jpg";
const DEFAULT_DESCRIPTION = `${BRAND_TAGLINE}. Tìm phòng trọ, studio, chung cư mini và nhà nguyên căn tại Hà Nội nhanh hơn.`;

function getSiteUrl() {
  if (typeof window === "undefined") return DEFAULT_SITE_URL;
  return window.location.origin || DEFAULT_SITE_URL;
}

function toAbsoluteUrl(value?: string) {
  const siteUrl = getSiteUrl();
  const fallback = new URL(DEFAULT_IMAGE_PATH, siteUrl).toString();

  if (!value) return fallback;
  if (/^https?:\/\//i.test(value)) return value;

  return new URL(value, siteUrl).toString();
}

function ensureMetaTag(attribute: "name" | "property", key: string) {
  const selector = `meta[${attribute}="${key}"]`;
  let element = document.head.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }

  return element;
}

function ensureLinkTag(rel: string) {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);

  if (!element) {
    element = document.createElement("link");
    element.setAttribute("rel", rel);
    document.head.appendChild(element);
  }

  return element;
}

export function truncateSeoText(value: string, maxLength = 160) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

export function useSeo({
  title,
  description = DEFAULT_DESCRIPTION,
  image,
  url,
  type = "website",
  robots = "index,follow",
}: SeoOptions) {
  useEffect(() => {
    const siteUrl = getSiteUrl();
    const absoluteUrl = url || (typeof window !== "undefined" ? window.location.href : siteUrl);
    const absoluteImage = toAbsoluteUrl(image);
    const normalizedDescription = truncateSeoText(description);

    document.documentElement.lang = "vi";
    document.title = title;

    ensureMetaTag("name", "description").setAttribute("content", normalizedDescription);
    ensureMetaTag("name", "robots").setAttribute("content", robots);
    ensureMetaTag("name", "author").setAttribute("content", BRAND_NAME);
    ensureMetaTag("name", "application-name").setAttribute("content", BRAND_NAME);
    ensureMetaTag("name", "theme-color").setAttribute("content", "#ef3b2d");

    ensureMetaTag("property", "og:locale").setAttribute("content", "vi_VN");
    ensureMetaTag("property", "og:site_name").setAttribute("content", BRAND_DOMAIN);
    ensureMetaTag("property", "og:type").setAttribute("content", type);
    ensureMetaTag("property", "og:title").setAttribute("content", title);
    ensureMetaTag("property", "og:description").setAttribute("content", normalizedDescription);
    ensureMetaTag("property", "og:url").setAttribute("content", absoluteUrl);
    ensureMetaTag("property", "og:image").setAttribute("content", absoluteImage);

    ensureMetaTag("name", "twitter:card").setAttribute("content", "summary_large_image");
    ensureMetaTag("name", "twitter:title").setAttribute("content", title);
    ensureMetaTag("name", "twitter:description").setAttribute("content", normalizedDescription);
    ensureMetaTag("name", "twitter:image").setAttribute("content", absoluteImage);

    ensureLinkTag("canonical").setAttribute("href", absoluteUrl);
  }, [description, image, robots, title, type, url]);
}
