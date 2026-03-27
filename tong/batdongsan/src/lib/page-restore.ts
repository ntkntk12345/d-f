const PAGE_RESTORE_SNAPSHOT_PREFIX = "timtro_page_restore_snapshot:";
const PENDING_PAGE_RESTORE_KEY = "timtro_pending_page_restore";
const DEFAULT_STICKY_OFFSET = 120;

export type PageRestoreSnapshotBase = {
  scrollY: number;
  propertyId?: number;
  updatedAt: number;
};

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function getPageRestoreStorageKey(routeKey: string) {
  return `${PAGE_RESTORE_SNAPSHOT_PREFIX}${routeKey}`;
}

export function buildPageRestoreKey(pathname: string, search = "") {
  return `${pathname}${search}`;
}

export function readPageRestoreSnapshot<T extends Record<string, unknown>>(routeKey: string) {
  if (!canUseSessionStorage()) return null;

  try {
    const raw = window.sessionStorage.getItem(getPageRestoreStorageKey(routeKey));
    if (!raw) return null;
    return JSON.parse(raw) as PageRestoreSnapshotBase & T;
  } catch {
    return null;
  }
}

export function savePageRestoreSnapshot<T extends Record<string, unknown>>(
  routeKey: string,
  snapshot: T & Partial<PageRestoreSnapshotBase>,
) {
  if (!canUseSessionStorage()) return;

  try {
    const nextSnapshot = {
      ...snapshot,
      scrollY: snapshot.scrollY ?? window.scrollY,
      updatedAt: Date.now(),
    };

    window.sessionStorage.setItem(getPageRestoreStorageKey(routeKey), JSON.stringify(nextSnapshot));
  } catch {
    // Ignore storage write failures.
  }
}

export function markPendingPageRestore(routeKey: string) {
  if (!canUseSessionStorage()) return;

  try {
    window.sessionStorage.setItem(PENDING_PAGE_RESTORE_KEY, routeKey);
  } catch {
    // Ignore storage write failures.
  }
}

export function consumePendingPageRestore<T extends Record<string, unknown>>(routeKey: string) {
  if (!canUseSessionStorage()) return null;

  try {
    const pendingRouteKey = window.sessionStorage.getItem(PENDING_PAGE_RESTORE_KEY);
    if (pendingRouteKey !== routeKey) return null;

    window.sessionStorage.removeItem(PENDING_PAGE_RESTORE_KEY);
    return readPageRestoreSnapshot<T>(routeKey);
  } catch {
    return null;
  }
}

export function rememberPageForRestore(routeKey: string, snapshot: Record<string, unknown> = {}) {
  if (!canUseSessionStorage()) return;

  const currentSnapshot = readPageRestoreSnapshot<Record<string, unknown>>(routeKey) || {};

  savePageRestoreSnapshot(routeKey, {
    ...currentSnapshot,
    ...snapshot,
    scrollY: window.scrollY,
  });
  markPendingPageRestore(routeKey);
}

export function restorePageScroll(
  snapshot: Pick<PageRestoreSnapshotBase, "scrollY" | "propertyId">,
  stickyOffset = DEFAULT_STICKY_OFFSET,
) {
  if (typeof window === "undefined") return;

  window.scrollTo({
    top: Math.max(snapshot.scrollY || 0, 0),
    left: 0,
    behavior: "auto",
  });

  if (snapshot.propertyId == null) return;

  window.requestAnimationFrame(() => {
    const card = document.querySelector<HTMLElement>(`[data-property-card-id="${snapshot.propertyId}"]`);
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const absoluteTop = window.scrollY + rect.top;
    const isNearPreviousViewport = Math.abs(absoluteTop - snapshot.scrollY) <= window.innerHeight;
    const isOutsideViewport = rect.top < stickyOffset || rect.bottom > window.innerHeight;

    if (!isNearPreviousViewport || !isOutsideViewport) return;

    window.scrollTo({
      top: Math.max(0, window.scrollY + rect.top - stickyOffset - 16),
      left: 0,
      behavior: "auto",
    });
  });
}
