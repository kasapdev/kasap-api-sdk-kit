import { TtlCache } from "./cache.js";
import {
  SteamMarketHttpError,
  SteamMarketNetworkError,
  SteamMarketNotFoundError,
  SteamMarketTimeoutError,
} from "./errors.js";
import type {
  GetPriceHistoryParams,
  GetPriceOverviewParams,
  RawSteamPriceHistory,
  RawSteamPriceOverview,
  SteamMarketClientOptions,
  SteamPriceHistory,
  SteamPriceHistoryPoint,
  SteamPriceOverview,
} from "./types.js";

const DEFAULT_BASE_URL = "https://steamcommunity.com/market";
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Typed client for the public Steam Community Market API.
 *
 * Design notes:
 * - Every request is a single attempt with a hard timeout (no automatic
 *   retries). Steam's market endpoints are aggressively rate-limited, and
 *   retrying on failure would be antisocial to Steam's infrastructure and
 *   likely to get the caller's IP throttled further. Callers that need retry
 *   behavior should implement it themselves with their own backoff policy.
 * - `getPriceOverview` needs no authentication.
 * - `getPriceHistory` requires a logged-in session cookie — see its TSDoc.
 * - Response caching is entirely opt-in via `cacheTtlMs` — see
 *   {@link SteamMarketClientOptions.cacheTtlMs}. By default, every call
 *   always hits the network.
 */
export class SteamMarketClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly overviewCache?: TtlCache<SteamPriceOverview>;
  private readonly historyCache?: TtlCache<SteamPriceHistory>;

  constructor(options: SteamMarketClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (options.cacheTtlMs !== undefined) {
      this.overviewCache = new TtlCache<SteamPriceOverview>({ ttlMs: options.cacheTtlMs, now: options.now });
      this.historyCache = new TtlCache<SteamPriceHistory>({ ttlMs: options.cacheTtlMs, now: options.now });
    }
  }

  /**
   * Fetches the current price overview (lowest price, median price, and sale
   * volume) for a single market item. No authentication required.
   *
   * @throws {SteamMarketNotFoundError} if Steam responds with `success: false`
   *   (typically an invalid `appId` / `marketHashName` combination).
   * @throws {SteamMarketHttpError} on a non-2xx HTTP status.
   * @throws {SteamMarketTimeoutError} if the request exceeds `timeoutMs`.
   * @throws {SteamMarketNetworkError} on any other fetch-level failure.
   */
  async getPriceOverview(params: GetPriceOverviewParams): Promise<SteamPriceOverview> {
    const { appId, marketHashName, currency = 1 } = params;
    const fetchOverview = (): Promise<SteamPriceOverview> => this.fetchPriceOverview(appId, marketHashName, currency);

    if (!this.overviewCache) {
      return fetchOverview();
    }
    const cacheKey = JSON.stringify({ appId, marketHashName, currency });
    return this.overviewCache.wrap(cacheKey, fetchOverview);
  }

  private async fetchPriceOverview(
    appId: number,
    marketHashName: string,
    currency: number,
  ): Promise<SteamPriceOverview> {
    // Built manually with encodeURIComponent (rather than URLSearchParams,
    // which encodes spaces as "+") so market hash names containing spaces,
    // "|", "(", ")", etc. (e.g. "AK-47 | Redline (Field-Tested)") are
    // percent-encoded exactly as Steam expects.
    const endpoint =
      `${this.baseUrl}/priceoverview/` +
      `?appid=${encodeURIComponent(String(appId))}` +
      `&market_hash_name=${encodeURIComponent(marketHashName)}` +
      `&currency=${encodeURIComponent(String(currency))}`;
    const raw = await this.requestJson<RawSteamPriceOverview>(endpoint);

    if (!raw.success) {
      throw new SteamMarketNotFoundError(
        endpoint,
        `Steam reported no price overview for appId=${appId}, marketHashName="${marketHashName}". ` +
          "This usually means the appId/marketHashName combination is invalid or the item does not exist.",
        { appId, marketHashName, currency, raw },
      );
    }

    return {
      success: true,
      lowestPrice: raw.lowest_price,
      medianPrice: raw.median_price,
      volume: raw.volume,
    };
  }

  /**
   * Fetches the full sale price history for a single market item.
   *
   * IMPORTANT: this endpoint requires the caller to be logged into
   * steamcommunity.com and to supply a valid `steamLoginSecure` session
   * cookie. There is no public/anonymous way to call it — Steam returns
   * `{ success: false }` even for perfectly valid items if the cookie is
   * missing, expired, or invalid. Because of this, `cookie` is a required
   * parameter rather than optional, so callers cannot invoke this method
   * without being aware of the limitation.
   *
   * @throws {SteamMarketNotFoundError} if Steam responds with `success: false`
   *   (most commonly caused by a missing/expired/invalid login cookie).
   * @throws {SteamMarketHttpError} on a non-2xx HTTP status.
   * @throws {SteamMarketTimeoutError} if the request exceeds `timeoutMs`.
   * @throws {SteamMarketNetworkError} on any other fetch-level failure.
   */
  async getPriceHistory(params: GetPriceHistoryParams): Promise<SteamPriceHistory> {
    const { appId, marketHashName, cookie } = params;
    const fetchHistory = (): Promise<SteamPriceHistory> => this.fetchPriceHistory(appId, marketHashName, cookie);

    if (!this.historyCache) {
      return fetchHistory();
    }
    // The cookie is part of the key (not just appId/marketHashName) so that
    // two different logged-in sessions never share a cached entry.
    const cacheKey = JSON.stringify({ appId, marketHashName, cookie });
    return this.historyCache.wrap(cacheKey, fetchHistory);
  }

  private async fetchPriceHistory(appId: number, marketHashName: string, cookie: string): Promise<SteamPriceHistory> {
    const endpoint =
      `${this.baseUrl}/pricehistory/` +
      `?appid=${encodeURIComponent(String(appId))}` +
      `&market_hash_name=${encodeURIComponent(marketHashName)}`;
    const raw = await this.requestJson<RawSteamPriceHistory>(endpoint, {
      headers: { Cookie: `steamLoginSecure=${cookie}` },
    });

    if (!raw.success) {
      throw new SteamMarketNotFoundError(
        endpoint,
        `Steam reported no price history for appId=${appId}, marketHashName="${marketHashName}". ` +
          "This endpoint requires a valid, non-expired 'steamLoginSecure' session cookie for a logged-in " +
          "steamcommunity.com account — the most likely cause is a missing, expired, or invalid login cookie.",
        { appId, marketHashName, raw },
      );
    }

    const points: SteamPriceHistoryPoint[] = (raw.price_history ?? []).map((tuple) => {
      const [date, price, volume] = tuple;
      return { date, price, volume };
    });

    return { points };
  }

  /**
   * Evicts every cached `getPriceOverview` / `getPriceHistory` entry. A no-op
   * if `cacheTtlMs` wasn't set (caching disabled). Useful after refreshing a
   * `steamLoginSecure` cookie, or to force fresh reads on demand.
   */
  clearCache(): void {
    this.overviewCache?.clear();
    this.historyCache?.clear();
  }

  /**
   * Performs a single GET request with a timeout, and parses the JSON body.
   * Centralizes the network/timeout/HTTP-status error handling shared by
   * both public methods.
   */
  private async requestJson<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(endpoint, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new SteamMarketTimeoutError(endpoint, this.timeoutMs);
      }
      throw new SteamMarketNetworkError(endpoint, error);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new SteamMarketHttpError(endpoint, response.status, response.statusText);
    }

    return (await response.json()) as T;
  }
}
