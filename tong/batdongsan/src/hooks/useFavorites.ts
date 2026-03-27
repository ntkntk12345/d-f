import { useCallback, useEffect, useSyncExternalStore } from "react";
import { apiFetch, apiJsonFetch, useAuth } from "@/context/AuthContext";

const STORAGE_KEY = "bds_favorites";

type FavoritesListener = () => void;

const listeners = new Set<FavoritesListener>();

let favoritesState: number[] | null = null;
let lastSyncedToken: string | null = null;
let currentSyncPromise: Promise<void> | null = null;

function getStoredFavorites(): number[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getFavoritesState(): number[] {
  if (favoritesState === null) {
    favoritesState = getStoredFavorites();
  }

  return favoritesState;
}

function persistFavorites(next: number[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function emitFavoritesChange() {
  listeners.forEach((listener) => listener());
}

function setFavoritesState(next: number[]) {
  const dedupedFavorites = Array.from(new Set(next));
  const previous = getFavoritesState();

  if (
    previous.length === dedupedFavorites.length &&
    previous.every((favoriteId, index) => favoriteId === dedupedFavorites[index])
  ) {
    return;
  }

  favoritesState = dedupedFavorites;
  persistFavorites(dedupedFavorites);
  emitFavoritesChange();
}

function subscribe(listener: FavoritesListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getFavoritesSnapshot() {
  return getFavoritesState();
}

async function syncFavoritesWithServer(token: string) {
  const localFavorites = getStoredFavorites();
  const { res, data } = await apiJsonFetch<number[]>("/me/favorites", [], {}, token);
  if (!res.ok) return;

  const remoteFavorites = Array.isArray(data) ? data : [];
  const mergedFavorites = Array.from(new Set([...remoteFavorites, ...localFavorites]));

  setFavoritesState(mergedFavorites);

  const missingRemoteFavorites = localFavorites.filter((favoriteId) => !remoteFavorites.includes(favoriteId));
  await Promise.all(
    missingRemoteFavorites.map((propertyId) =>
      apiFetch(
        "/me/favorites",
        {
          method: "POST",
          body: JSON.stringify({ propertyId }),
        },
        token,
      ),
    ),
  );
}

export function useFavoritesSync() {
  const { token, isLoggedIn } = useAuth();

  useEffect(() => {
    if (!isLoggedIn || !token) {
      lastSyncedToken = null;
      setFavoritesState(getStoredFavorites());
      return;
    }

    if (lastSyncedToken === token && currentSyncPromise === null) {
      return;
    }

    if (currentSyncPromise) {
      return;
    }

    lastSyncedToken = token;
    currentSyncPromise = syncFavoritesWithServer(token)
      .catch(() => undefined)
      .finally(() => {
        currentSyncPromise = null;
      });
  }, [isLoggedIn, token]);
}

export function useFavoriteIds() {
  return useSyncExternalStore(subscribe, getFavoritesSnapshot, () => []);
}

export function useIsFavorite(id: number) {
  return useSyncExternalStore(
    subscribe,
    () => getFavoritesState().includes(id),
    () => false,
  );
}

export function useFavoritesActions() {
  const { token, isLoggedIn } = useAuth();

  const toggle = useCallback(
    async (id: number) => {
      const previousFavorites = getFavoritesState();
      const currentlyFavorite = previousFavorites.includes(id);
      const nextFavorites = currentlyFavorite
        ? previousFavorites.filter((favoriteId) => favoriteId !== id)
        : [...previousFavorites, id];

      setFavoritesState(nextFavorites);

      if (!isLoggedIn || !token) return;

      const response = await apiFetch(
        currentlyFavorite ? `/me/favorites/${id}` : "/me/favorites",
        currentlyFavorite
          ? { method: "DELETE" }
          : {
              method: "POST",
              body: JSON.stringify({ propertyId: id }),
            },
        token,
      );

      if (!response.ok) {
        setFavoritesState(previousFavorites);
      }
    },
    [isLoggedIn, token],
  );

  const clearAll = useCallback(async () => {
    const previousFavorites = getFavoritesState();
    setFavoritesState([]);

    if (!isLoggedIn || !token) return;

    const response = await apiFetch("/me/favorites", { method: "DELETE" }, token);
    if (!response.ok) {
      setFavoritesState(previousFavorites);
    }
  }, [isLoggedIn, token]);

  return { toggle, clearAll };
}

export function useFavorites() {
  const favorites = useFavoriteIds();
  const { toggle, clearAll } = useFavoritesActions();

  const isFavorite = useCallback((id: number) => favorites.includes(id), [favorites]);

  return {
    favorites,
    toggle,
    clearAll,
    isFavorite,
  };
}
