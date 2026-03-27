import { useQuery } from "@tanstack/react-query";
import { apiJsonFetch } from "@/context/AuthContext";

export type SiteContactSettings = {
  contactLink: string;
  message: string;
  updatedAt?: string;
};

export const FALLBACK_SITE_CONTACT_SETTINGS: SiteContactSettings = {
  contactLink: "https://zalo.me/0876480130/",
  message: "Dang dung link lien he mac dinh cho nut Zalo.",
};

export function useSiteContactSettings(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["site-contact-settings"],
    queryFn: async () => {
      const { res, data } = await apiJsonFetch<SiteContactSettings>(
        "/site/contact-settings",
        FALLBACK_SITE_CONTACT_SETTINGS,
      );

      return res.ok && data.contactLink
        ? data
        : FALLBACK_SITE_CONTACT_SETTINGS;
    },
    enabled: options.enabled ?? true,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

