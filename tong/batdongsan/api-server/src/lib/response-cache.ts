type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

export function createResponseCache<T>(maxEntries = 200) {
  const entries = new Map<string, CacheEntry<T>>();

  function get(key: string) {
    const now = Date.now();
    const entry = entries.get(key);

    if (!entry) return null;
    if (entry.expiresAt <= now) {
      entries.delete(key);
      return null;
    }

    return entry.value;
  }

  function set(key: string, value: T, ttlMs: number) {
    entries.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });

    if (entries.size <= maxEntries) return;

    const oldestKey = entries.keys().next().value;
    if (oldestKey) {
      entries.delete(oldestKey);
    }
  }

  function clear() {
    entries.clear();
  }

  return {
    get,
    set,
    clear,
  };
}
