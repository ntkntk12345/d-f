import { useQuery } from "@tanstack/react-query";
import { apiJsonFetch } from "@/context/AuthContext";

export type SiteMaintenanceStatus = {
  isEnabled: boolean;
  message: string;
  updatedAt?: string;
};

const FALLBACK_SITE_MAINTENANCE_STATUS: SiteMaintenanceStatus = {
  isEnabled: false,
  message: "Website hoat dong binh thuong.",
};

export function useSiteMaintenanceStatus(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["site-maintenance-status"],
    queryFn: async () => {
      const { res, data } = await apiJsonFetch<SiteMaintenanceStatus>(
        "/site/maintenance-status",
        FALLBACK_SITE_MAINTENANCE_STATUS,
      );

      return res.ok ? data : FALLBACK_SITE_MAINTENANCE_STATUS;
    },
    enabled: options.enabled ?? true,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
