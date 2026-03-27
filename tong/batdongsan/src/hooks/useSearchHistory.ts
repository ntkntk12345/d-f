import { useCallback, useEffect, useState } from "react";
import { apiFetch, apiJsonFetch, useAuth } from "@/context/AuthContext";

export interface SearchHistory {
  keyword?: string;
  province?: string;
  district?: string;
  category?: string;
  roomType?: string;
  priceMin?: number;
  priceMax?: number;
  timestamp: number;
}

const GUEST_KEY = "timtro_search_history_guest";
const MAX_HISTORY = 10;

function applyPriceBuffer(search: SearchHistory, buffer = 0.2): { priceMin?: number; priceMax?: number } {
  return {
    priceMin: search.priceMin != null ? Math.round(search.priceMin * (1 - buffer) * 10) / 10 : undefined,
    priceMax: search.priceMax != null ? Math.round(search.priceMax * (1 + buffer) * 10) / 10 : undefined,
  };
}

function getStorageKey(userId?: number | null) {
  return userId ? `timtro_search_history_user_${userId}` : GUEST_KEY;
}

function readStoredHistory(storageKey: string): SearchHistory[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "[]");
  } catch {
    return [];
  }
}

function persistHistory(storageKey: string, next: SearchHistory[]) {
  localStorage.setItem(storageKey, JSON.stringify(next));
}

function sameSearch(a: Omit<SearchHistory, "timestamp">, b: Omit<SearchHistory, "timestamp">) {
  return (
    a.keyword === b.keyword &&
    a.province === b.province &&
    a.district === b.district &&
    a.category === b.category &&
    a.roomType === b.roomType &&
    a.priceMin === b.priceMin &&
    a.priceMax === b.priceMax
  );
}

function mergeHistoryEntries(entries: SearchHistory[]) {
  const next: SearchHistory[] = [];

  for (const entry of entries.sort((a, b) => b.timestamp - a.timestamp)) {
    const exists = next.some((item) => sameSearch(item, entry));
    if (!exists) next.push(entry);
    if (next.length >= MAX_HISTORY) break;
  }

  return next;
}

export function useSearchHistory() {
  const { token, isLoggedIn, user } = useAuth();
  const storageKey = getStorageKey(user?.id);
  const [history, setHistory] = useState<SearchHistory[]>(() => readStoredHistory(storageKey));

  useEffect(() => {
    persistHistory(storageKey, history);
  }, [history, storageKey]);

  useEffect(() => {
    if (!isLoggedIn || !token) {
      setHistory(readStoredHistory(storageKey));
      return;
    }

    let cancelled = false;

    const loadAccountHistory = async () => {
      const guestHistory = readStoredHistory(GUEST_KEY);
      const accountLocalHistory = readStoredHistory(storageKey);
      const { res, data } = await apiJsonFetch<SearchHistory[]>("/me/search-history", [], {}, token);
      if (!res.ok) return;

      const remoteHistory = Array.isArray(data) ? data : [];
      const mergedHistory = mergeHistoryEntries([
        ...remoteHistory,
        ...accountLocalHistory,
        ...guestHistory,
      ]);

      for (const entry of [...mergedHistory].reverse()) {
        await apiFetch(
          "/me/search-history",
          {
            method: "POST",
            body: JSON.stringify({
              keyword: entry.keyword,
              province: entry.province,
              district: entry.district,
              category: entry.category,
              roomType: entry.roomType,
              priceMin: entry.priceMin,
              priceMax: entry.priceMax,
            }),
          },
          token,
        );
      }

      if (!cancelled) {
        setHistory(mergedHistory);
        persistHistory(storageKey, mergedHistory);
      }
    };

    loadAccountHistory().catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, storageKey, token]);

  const addSearch = useCallback((search: Omit<SearchHistory, "timestamp">) => {
    const entry: SearchHistory = { ...search, timestamp: Date.now() };
    const nextHistory = mergeHistoryEntries([entry, ...history]);

    setHistory(nextHistory);
    persistHistory(storageKey, nextHistory);

    if (isLoggedIn && token) {
      apiFetch(
        "/me/search-history",
        {
          method: "POST",
          body: JSON.stringify(search),
        },
        token,
      ).catch(() => undefined);
    }
  }, [history, isLoggedIn, storageKey, token]);

  const lastSearch = history[0] ?? null;
  const personalizedSearch = lastSearch;

  const personalizedSearchBuffered = personalizedSearch
    ? { ...personalizedSearch, ...applyPriceBuffer(personalizedSearch) }
    : null;

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(storageKey);

    if (isLoggedIn && token) {
      apiFetch("/me/search-history", { method: "DELETE" }, token).catch(() => undefined);
    }
  }, [isLoggedIn, storageKey, token]);

  return { history, addSearch, personalizedSearch, personalizedSearchBuffered, clearHistory };
}
