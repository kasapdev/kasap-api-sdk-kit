import {
  GodotAssetLibraryHttpError,
  GodotAssetLibraryNetworkError,
  GodotAssetLibraryNotFoundError,
  GodotAssetLibraryTimeoutError,
} from "./errors.js";
import type {
  AssetDetail,
  GodotAssetLibraryClientOptions,
  GodotAssetSearchResult,
  RawAssetNotFoundResponse,
  RawAssetSearchResponse,
  SearchAssetsParams,
} from "./types.js";

const DEFAULT_BASE_URL = "https://godotengine.org/asset-library/api";
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Typed client for the public Godot Asset Library REST API.
 *
 * Design notes:
 * - No authentication is required — the entire Asset Library API is public
 *   and read-only.
 * - Every request is a single attempt with a hard timeout (no automatic
 *   retries), since this is a simple public read-only API and retry policy
 *   is left to the caller.
 */
export class GodotAssetLibraryClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: GodotAssetLibraryClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /**
   * Searches the Asset Library for addons/projects matching `params.query`.
   *
   * Maps to `GET /asset?filter=&category=&godot_version=&type=&sort=&page=&max_results=`.
   * Optional parameters that are `undefined` are simply omitted from the
   * query string rather than sent as empty/literal-"undefined" values.
   *
   * @throws {GodotAssetLibraryHttpError} on a non-2xx HTTP status.
   * @throws {GodotAssetLibraryTimeoutError} if the request exceeds `timeoutMs`.
   * @throws {GodotAssetLibraryNetworkError} on any other fetch-level failure.
   */
  async searchAssets(params: SearchAssetsParams): Promise<GodotAssetSearchResult> {
    const { query, category, godotVersion, type, sort, page, maxResults } = params;

    const search = new URLSearchParams();
    search.set("filter", query);
    if (category !== undefined) search.set("category", category);
    if (godotVersion !== undefined) search.set("godot_version", godotVersion);
    if (type !== undefined) search.set("type", type);
    if (sort !== undefined) search.set("sort", sort);
    if (page !== undefined) search.set("page", String(page));
    if (maxResults !== undefined) search.set("max_results", String(maxResults));

    const endpoint = `${this.baseUrl}/asset?${search.toString()}`;
    const raw = await this.requestJson<RawAssetSearchResponse>(endpoint);

    return {
      items: raw.result,
      page: raw.page,
      totalPages: raw.pages,
      totalItems: raw.total_items,
    };
  }

  /**
   * Fetches full detail for a single asset by id.
   *
   * Maps to `GET /asset/{id}`.
   *
   * @throws {GodotAssetLibraryNotFoundError} if no asset exists with the given id.
   * @throws {GodotAssetLibraryHttpError} on any other non-2xx HTTP status.
   * @throws {GodotAssetLibraryTimeoutError} if the request exceeds `timeoutMs`.
   * @throws {GodotAssetLibraryNetworkError} on any other fetch-level failure.
   */
  async getAsset(id: number | string): Promise<AssetDetail> {
    const endpoint = `${this.baseUrl}/asset/${encodeURIComponent(String(id))}`;
    return this.requestJson<AssetDetail>(endpoint, {}, id);
  }

  /**
   * Performs a single GET request with a timeout, and parses the JSON body.
   * Centralizes the network/timeout/HTTP-status/not-found error handling
   * shared by both public methods. `notFoundAssetId` is passed only by
   * {@link getAsset}, to enable the 404 -> {@link GodotAssetLibraryNotFoundError}
   * translation confirmed by manual research against the live API.
   */
  private async requestJson<T>(
    endpoint: string,
    init: RequestInit = {},
    notFoundAssetId?: number | string,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(endpoint, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new GodotAssetLibraryTimeoutError(endpoint, this.timeoutMs);
      }
      throw new GodotAssetLibraryNetworkError(endpoint, error);
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 404 && notFoundAssetId !== undefined) {
      let apiMessage: string | undefined;
      try {
        const body = (await response.json()) as RawAssetNotFoundResponse;
        apiMessage = body.error;
      } catch {
        // Body wasn't JSON / didn't match the expected shape; fall back to a generic message.
      }
      throw new GodotAssetLibraryNotFoundError(endpoint, notFoundAssetId, apiMessage);
    }

    if (!response.ok) {
      throw new GodotAssetLibraryHttpError(endpoint, response.status, response.statusText);
    }

    return (await response.json()) as T;
  }
}
