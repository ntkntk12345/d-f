import { useEffect } from "react";
import { useLocation } from "wouter";
import { apiFetch, useAuth } from "@/context/AuthContext";

export function PageTrafficTracker() {
  const [location] = useLocation();
  const { token } = useAuth();

  useEffect(() => {
    if (location.startsWith("/admin/bichha")) {
      return;
    }

    void apiFetch(
      "/analytics/track",
      {
        method: "POST",
        body: JSON.stringify({ path: location }),
      },
      token,
    );
  }, [location, token]);

  return null;
}
