import { createContext, useContext, type ReactNode } from "react";
import { FALLBACK_SITE_CONTACT_SETTINGS, useSiteContactSettings, type SiteContactSettings } from "@/hooks/useSiteContactSettings";

const SiteContactContext = createContext<SiteContactSettings>(FALLBACK_SITE_CONTACT_SETTINGS);

export function SiteContactProvider({ children }: { children: ReactNode }) {
  const { data } = useSiteContactSettings();

  return (
    <SiteContactContext.Provider value={data || FALLBACK_SITE_CONTACT_SETTINGS}>
      {children}
    </SiteContactContext.Provider>
  );
}

export function useSiteContact() {
  return useContext(SiteContactContext);
}

