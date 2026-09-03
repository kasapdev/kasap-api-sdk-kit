/**
 * Typed shapes for the public Godot Asset Library REST API
 * (`https://godotengine.org/asset-library/api`).
 *
 * These interfaces were written against the REAL, live responses of the API
 * (observed via `GET /asset?filter=...`, `GET /asset` and `GET /asset/{id}`),
 * not guessed from documentation. Notable, easy-to-miss quirks confirmed by
 * that research:
 *
 * - Almost every scalar field on both the search-result summary and the
 *   asset detail object is sent as a STRING by the API, including ones that
 *   look numeric (`asset_id`, `author_id`, `category_id`, `rating`,
 *   `version`, `searchable`). Only the pagination fields on the search
 *   envelope (`page`, `pages`, `page_length`, `total_items`) are actual JSON
 *   numbers. The types below match the wire format exactly rather than
 *   "helpfully" coercing to `number`, so callers are not surprised by a
 *   runtime string where a type suggested a number.
 * - `cost` is NOT a price — it is the asset's license identifier (e.g.
 *   `"MIT"`). This is confusing but is exactly what the API returns.
 * - The search summary does NOT include a `type` field, even when the
 *   request itself was filtered with `type=addon`. `type` (e.g. `"addon"`,
 *   `"project"`) only appears on the single-asset detail response.
 * - A request for an asset id that does not exist returns HTTP 404 with a
 *   JSON body shaped like `{ "error": "Couldn't find asset with id X!" }`.
 */

/**
 * One entry in a search result's `result` array, as returned by
 * `GET /asset`. Field names are kept close to the raw API response (the
 * library's public contract) rather than renamed to camelCase, since this
 * is what the API actually calls them.
 */
export interface AssetSummary {
  asset_id: string;
  title: string;
  author: string;
  author_id: string;
  category: string;
  category_id: string;
  godot_version: string;
  /** Numeric rating, sent as a string (e.g. `"0"`). */
  rating: string;
  /** The asset's license identifier (e.g. `"MIT"`), NOT a monetary price. */
  cost: string;
  support_level: string;
  icon_url: string;
  /** Internal version counter, sent as a string (e.g. `"10"`). */
  version: string;
  /** Human-readable version label (e.g. `"1.0.0"`). */
  version_string: string;
  /** Last-modified timestamp, e.g. `"2019-10-09 21:06:17"`. */
  modify_date: string;
}

/**
 * Raw JSON envelope returned by `GET /asset?filter=...&...`.
 */
export interface RawAssetSearchResponse {
  result: AssetSummary[];
  page: number;
  pages: number;
  page_length: number;
  total_items: number;
}

/**
 * Parsed, camelCase result of {@link GodotAssetLibraryClient.searchAssets}.
 * Pagination fields are camelCased for ergonomics; each item in `items`
 * keeps the raw `AssetSummary` shape (see its TSDoc for why).
 */
export interface GodotAssetSearchResult {
  items: AssetSummary[];
  /** Raw API field: `page`. Zero-based current page index. */
  page: number;
  /** Raw API field: `pages`. Total number of pages available. */
  totalPages: number;
  /** Raw API field: `total_items`. Total number of matching assets. */
  totalItems: number;
}

/** One preview entry (image or video) attached to an asset's detail page. */
export interface AssetPreview {
  preview_id: string;
  /** e.g. `"image"` or `"video"`. */
  type: string;
  link: string;
  thumbnail: string;
}

/**
 * Full detail object returned by `GET /asset/{id}`. Keeps raw API field
 * names for the same reason as {@link AssetSummary}.
 */
export interface AssetDetail {
  asset_id: string;
  /** e.g. `"addon"` or `"project"`. Only present on the detail response. */
  type: string;
  title: string;
  author: string;
  author_id: string;
  version: string;
  version_string: string;
  category: string;
  category_id: string;
  godot_version: string;
  rating: string;
  /** The asset's license identifier (e.g. `"MIT"`), NOT a monetary price. */
  cost: string;
  description: string;
  support_level: string;
  /** Where the download is hosted, e.g. `"GitHub"`. */
  download_provider: string;
  /** Commit hash / ref the download archive was built from, if applicable. */
  download_commit: string;
  browse_url: string;
  issues_url: string;
  icon_url: string;
  /** `"1"` / `"0"` flag, sent as a string. */
  searchable: string;
  modify_date: string;
  /** Direct URL to download the asset archive (usually a GitHub zip). */
  download_url: string;
  previews: AssetPreview[];
  /** Optional checksum of the download archive; often an empty string. */
  download_hash: string;
}

/** Raw JSON body returned on a 404 from `GET /asset/{id}`. */
export interface RawAssetNotFoundResponse {
  error: string;
}

/** Parameters accepted by {@link GodotAssetLibraryClient.searchAssets}. */
export interface SearchAssetsParams {
  /** Free-text search filter (maps to the API's `filter` query parameter). */
  query: string;
  /** Restrict results to a category name (e.g. `"2D Tools"`). */
  category?: string;
  /** Restrict results to a specific Godot engine version (e.g. `"4.2"`). */
  godotVersion?: string;
  /** Restrict results to an asset type (e.g. `"addon"`, `"project"`). */
  type?: string;
  /** Sort order understood by the API (e.g. `"updated"`, `"name"`, `"cost"`). */
  sort?: string;
  /** Zero-based page index. */
  page?: number;
  /** Number of results per page. */
  maxResults?: number;
}

/** Options accepted by the {@link GodotAssetLibraryClient} constructor. */
export interface GodotAssetLibraryClientOptions {
  /** Base URL for the Asset Library API. Defaults to the public production endpoint. */
  baseUrl?: string;
  /** Per-request timeout, in milliseconds. Defaults to 10_000 (10s). */
  timeoutMs?: number;
}
