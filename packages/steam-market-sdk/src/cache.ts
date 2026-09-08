/**
 * A minimal in-memory, TTL-based cache keyed by string, with single-flight
 * de-duplication of concurrent lookups for the same key.
 *
 * This backs the opt-in `cacheTtlMs` option on {@link SteamMarketClient}. It
 * has no knowledge of Steam or HTTP — it's a small, generic building block:
 * `wrap(key, fetcher)` returns a live (non-expired) cached value if one
 * exists, otherwise calls `fetcher()` exactly once (even if multiple callers
 * ask for the same key while the fetch is still in flight) and caches the
 * resolved value for `ttlMs` milliseconds.
 */

export interface TtlCacheOptions {
  /**
   * Time-to-live for cache entries, in milliseconds. A value of `0` (or
   * negative) means entries are never actually stored — `wrap()` still
   * de-duplicates concurrent in-flight calls for the same key, but every
   * call that doesn't overlap with another in-flight one hits `fetcher()`.
   */
  ttlMs: number;
  /** Injectable clock, primarily for tests. Defaults to `Date.now`. */
  now?: () => number;
}

interface CacheEntry<T> {
  value: T;
  /** Epoch milliseconds (per the injectable `now()` clock) at which this entry stops being live. */
  expiresAt: number;
}

export class TtlCache<T> {
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly entries = new Map<string, CacheEntry<T>>();
  /** In-flight `fetcher()` calls, keyed the same way as `entries`, used to single-flight concurrent lookups. */
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(options: TtlCacheOptions) {
    this.ttlMs = options.ttlMs;
    this.now = options.now ?? Date.now;
  }

  /**
   * Returns the live cached value for `key`, or `undefined` if there is no
   * entry or the entry has expired. An expired entry is evicted as a
   * side effect of this lookup.
   */
  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /** Stores `value` under `key`, live for `ttlMs` milliseconds. A no-op when `ttlMs <= 0`. */
  set(key: string, value: T): void {
    if (this.ttlMs <= 0) {
      return;
    }
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }

  /**
   * Returns the live cached value for `key` if one exists. Otherwise, calls
   * `fetcher()` to produce it, caches the resolved value, and returns it.
   *
   * If `wrap()` is called again for the same `key` while a prior call's
   * `fetcher()` is still pending, the second call reuses the first call's
   * in-flight promise instead of invoking `fetcher()` a second time.
   */
  async wrap(key: string, fetcher: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const pending = this.inFlight.get(key);
    if (pending) {
      return pending;
    }

    const promise = fetcher()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, promise);
    return promise;
  }

  /** Removes every cached entry. Any already in-flight `fetcher()` calls are left to settle on their own. */
  clear(): void {
    this.entries.clear();
  }

  /** Number of entries currently stored (may include entries that have since expired but weren't yet evicted). */
  get size(): number {
    return this.entries.size;
  }
}
