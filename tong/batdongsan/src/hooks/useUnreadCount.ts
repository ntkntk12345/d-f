import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiJsonFetch } from "@/context/AuthContext";

export function useUnreadCount() {
  const { isLoggedIn, token } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!isLoggedIn || !token) {
      setUnreadCount(0);
      return;
    }
    const fetch = async () => {
      try {
        const { res, data } = await apiJsonFetch<{ count?: number }>(
          "/messages/unread-count",
          {},
          {},
          token,
        );
        if (!res.ok) {
          setUnreadCount(0);
          return;
        }
        setUnreadCount(data.count ?? 0);
      } catch {
        setUnreadCount(0);
      }
    };
    fetch();
    const interval = setInterval(fetch, 15000);
    return () => clearInterval(interval);
  }, [isLoggedIn, token]);

  return unreadCount;
}
