/**
 * Typed shapes for the Steam Community Market public API.
 *
 * The `Raw*` interfaces below mirror the exact JSON Steam returns over the
 * wire (snake_case, as documented in comments). The client parses these into
 * the camelCase, developer-friendly shapes (`SteamPriceOverview`,
 * `SteamPriceHistory`) that this package actually exposes.
 */

/**
 * Raw JSON shape returned by
 * `GET /market/priceoverview/?appid=&market_hash_name=&currency=`.
 *
 * Note that `lowest_price` and `median_price` are each optional: an item can
 * have only one of them populated, or neither if it has no recent market
 * activity. `volume` (a thousands-separated string, e.g. `"1,234"`) is also
 * optional for the same reason.
 */
export interface RawSteamPriceOverview {
  success: boolean;
  lowest_price?: string;
  median_price?: string;
  volume?: string;
}

/**
 * Parsed, camelCased result of {@link SteamMarketClient.getPriceOverview}.
 *
 * `lowestPrice` / `medianPrice` are price strings as formatted by Steam for
 * the requested currency (e.g. `"$1.23 USD"`), not normalized numbers, since
 * Steam does not return a machine-friendly numeric price on this endpoint.
 */
export interface SteamPriceOverview {
  success: true;
  /** Raw Steam field: `lowest_price`. Formatted currency string, e.g. "$1.23 USD". */
  lowestPrice?: string;
  /** Raw Steam field: `median_price`. Formatted currency string, e.g. "$1.19 USD". */
  medianPrice?: string;
  /** Raw Steam field: `volume`. Thousands-separated string, e.g. "1,234". */
  volume?: string;
}

/**
 * One entry in Steam's `price_history` array: a 3-tuple of
 * `[dateString, price, volumeString]`, e.g. `["Dec 01 2018 01: +0", 1.23, "5"]`.
 */
export type RawSteamPriceHistoryPoint = [string, number, string];

/**
 * Raw JSON shape returned by
 * `GET /market/pricehistory/?appid=&market_hash_name=` (requires a valid
 * `steamLoginSecure` session cookie).
 */
export interface RawSteamPriceHistory {
  success: boolean;
  price_history?: RawSteamPriceHistoryPoint[];
}

/** A single, parsed price-history data point. */
export interface SteamPriceHistoryPoint {
  /** Human-readable date string as formatted by Steam, e.g. "Dec 01 2018 01: +0". */
  date: string;
  /** Sale price as a plain number, in the currency of the account's session. */
  price: number;
  /** Number of units sold at this data point, as a string (Steam does not send a number here). */
  volume: string;
}

/** Parsed result of {@link SteamMarketClient.getPriceHistory}. */
export interface SteamPriceHistory {
  points: SteamPriceHistoryPoint[];
}

/** Options accepted by {@link SteamMarketClient.getPriceOverview}. */
export interface GetPriceOverviewParams {
  /** Steam application ID that the item belongs to (e.g. 730 for CS2/CS:GO). */
  appId: number;
  /** Exact market hash name of the item, e.g. "AK-47 | Redline (Field-Tested)". */
  marketHashName: string;
  /** Numeric Steam currency code. Defaults to 1 (USD). */
  currency?: number;
}

/** Options accepted by {@link SteamMarketClient.getPriceHistory}. */
export interface GetPriceHistoryParams {
  /** Steam application ID that the item belongs to (e.g. 730 for CS2/CS:GO). */
  appId: number;
  /** Exact market hash name of the item, e.g. "AK-47 | Redline (Field-Tested)". */
  marketHashName: string;
  /**
   * A valid `steamLoginSecure` cookie value for a logged-in steamcommunity.com
   * session. Required — this endpoint has no anonymous/public access mode.
   * See the TSDoc on {@link SteamMarketClient.getPriceHistory} for details on
   * where to obtain this value.
   */
  cookie: string;
}

/** Options accepted by the {@link SteamMarketClient} constructor. */
export interface SteamMarketClientOptions {
  /** Base URL for the Steam Community Market. Defaults to "https://steamcommunity.com/market". */
  baseUrl?: string;
  /** Per-request timeout, in milliseconds. Defaults to 10_000 (10s). */
  timeoutMs?: number;
}
