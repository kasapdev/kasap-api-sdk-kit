import {
  RobloxConfigError,
  RobloxForbiddenError,
  RobloxHttpError,
  RobloxNetworkError,
  RobloxNotFoundError,
  RobloxRateLimitError,
  RobloxTimeoutError,
  RobloxUnauthorizedError,
} from "./errors.js";
import type {
  DeleteEntryParams,
  GetEntryParams,
  ListEntriesParams,
  ListEntriesResult,
  PublishMessageParams,
  RawListEntriesResponse,
  RobloxDataStoreEntry,
  RobloxOpenCloudClientOptions,
  SetEntryParams,
} from "./types.js";

const DEFAULT_BASE_URL = "https://apis.roblox.com/cloud/v2";
const DEFAULT_TIMEOUT_MS = 10_000;

/** Internal shape used to describe a single request to the private `request` helper. */
interface RequestOptions {
  method: "GET" | "POST" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
}

/**
 * Typed client for Roblox's Open Cloud v2 API, covering DataStore entry
 * CRUD/list operations and MessagingService message publishing.
 *
 * Design notes:
 * - Every request is a single attempt with a hard timeout (default 10s) —
 *   there is no built-in retry loop. This is deliberate: blindly retrying a
 *   DataStore write whose response was lost to a network blip risks
 *   double-applying a caller's read-modify-write (e.g. an increment), and a
 *   generic client has no way to know whether a given write is safe to
 *   repeat. `RobloxRateLimitError` (HTTP 429) likewise surfaces immediately
 *   with `retryAfter` populated so the *caller* can decide whether and when
 *   to retry, rather than this SDK silently backing off and retrying on
 *   their behalf.
 * - Resource paths follow Open Cloud v2's REST shape, nested under a
 *   universe: `universes/{universeId}/data-stores/{dataStoreId}/entries/{entryId}`.
 *   Path segments (universe id, data store id, entry id, topic) are
 *   percent-encoded individually so entry ids containing arbitrary
 *   characters (spaces, slashes, etc) round-trip correctly.
 */
export class RobloxOpenCloudClient {
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(options: RobloxOpenCloudClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env["ROBLOX_OPEN_CLOUD_API_KEY"];
    if (!apiKey) {
      throw new RobloxConfigError(
        "No Roblox Open Cloud API key provided. Pass { apiKey } to the RobloxOpenCloudClient " +
          "constructor, or set the ROBLOX_OPEN_CLOUD_API_KEY environment variable. " +
          "Create a key at https://create.roblox.com/dashboard/credentials.",
      );
    }
    this.apiKey = apiKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.baseUrl = DEFAULT_BASE_URL;
  }

  /**
   * Fetches a single DataStore entry.
   *
   * Endpoint: `GET /universes/{universeId}/data-stores/{dataStoreId}/entries/{entryId}`
   *
   * @typeParam T - Expected shape of the stored value. Defaults to `unknown`.
   * @throws {RobloxUnauthorizedError} on HTTP 401.
   * @throws {RobloxForbiddenError} on HTTP 403.
   * @throws {RobloxNotFoundError} on HTTP 404 (entry/data store/universe not found).
   * @throws {RobloxRateLimitError} on HTTP 429.
   * @throws {RobloxHttpError} on any other non-2xx HTTP status.
   * @throws {RobloxTimeoutError} if the request exceeds `timeoutMs`.
   * @throws {RobloxNetworkError} on any other fetch-level failure.
   */
  async getEntry<T = unknown>(params: GetEntryParams): Promise<RobloxDataStoreEntry<T>> {
    const { universeId, dataStoreId, entryId, scope } = params;
    const path = this.entryPath(universeId, dataStoreId, entryId);
    const url = this.buildUrl(path, { scope });
    return this.request<RobloxDataStoreEntry<T>>(url, { method: "GET" });
  }

  /**
   * Creates or updates a single DataStore entry.
   *
   * Endpoint: `POST /universes/{universeId}/data-stores/{dataStoreId}/entries/{entryId}`
   * Body: `{ "value": <T> }`
   *
   * @typeParam T - Shape of the value being stored. Defaults to `unknown`.
   * @throws {RobloxUnauthorizedError} on HTTP 401.
   * @throws {RobloxForbiddenError} on HTTP 403.
   * @throws {RobloxNotFoundError} on HTTP 404 (data store/universe not found).
   * @throws {RobloxRateLimitError} on HTTP 429.
   * @throws {RobloxHttpError} on any other non-2xx HTTP status (e.g. a failed
   *   `etagMatch` precondition, which Roblox typically reports as HTTP 400/412).
   * @throws {RobloxTimeoutError} if the request exceeds `timeoutMs`.
   * @throws {RobloxNetworkError} on any other fetch-level failure.
   */
  async setEntry<T = unknown>(params: SetEntryParams<T>): Promise<RobloxDataStoreEntry<T>> {
    const { universeId, dataStoreId, entryId, value, scope, etagMatch } = params;
    const path = this.entryPath(universeId, dataStoreId, entryId);
    const url = this.buildUrl(path, { scope });
    const headers: Record<string, string> = {};
    if (etagMatch !== undefined) {
      headers["If-Match"] = etagMatch;
    }
    return this.request<RobloxDataStoreEntry<T>>(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ value }),
    });
  }

  /**
   * Lists entries in a DataStore, optionally filtered by id prefix, paged
   * via `maxPageSize`/`pageToken`.
   *
   * Endpoint: `GET /universes/{universeId}/data-stores/{dataStoreId}/entries`
   *
   * Roblox's raw response nests the page of entries under a
   * `dataStoreEntries` field; this method flattens that to `entries` for
   * ergonomics (see {@link RawListEntriesResponse}).
   *
   * @throws {RobloxUnauthorizedError} on HTTP 401.
   * @throws {RobloxForbiddenError} on HTTP 403.
   * @throws {RobloxNotFoundError} on HTTP 404 (data store/universe not found).
   * @throws {RobloxRateLimitError} on HTTP 429.
   * @throws {RobloxHttpError} on any other non-2xx HTTP status.
   * @throws {RobloxTimeoutError} if the request exceeds `timeoutMs`.
   * @throws {RobloxNetworkError} on any other fetch-level failure.
   */
  async listEntries(params: ListEntriesParams): Promise<ListEntriesResult> {
    const { universeId, dataStoreId, maxPageSize, pageToken, prefix } = params;
    const path = `universes/${this.enc(universeId)}/data-stores/${this.enc(dataStoreId)}/entries`;
    const url = this.buildUrl(path, { maxPageSize, pageToken, prefix });
    const raw = await this.request<RawListEntriesResponse>(url, { method: "GET" });
    return {
      entries: raw.dataStoreEntries ?? [],
      nextPageToken: raw.nextPageToken,
    };
  }

  /**
   * Deletes a single DataStore entry.
   *
   * Endpoint: `DELETE /universes/{universeId}/data-stores/{dataStoreId}/entries/{entryId}`
   *
   * Resolves with no value on a 200 or 204 response.
   *
   * @throws {RobloxUnauthorizedError} on HTTP 401.
   * @throws {RobloxForbiddenError} on HTTP 403.
   * @throws {RobloxNotFoundError} on HTTP 404 (entry/data store/universe not found).
   * @throws {RobloxRateLimitError} on HTTP 429.
   * @throws {RobloxHttpError} on any other non-2xx HTTP status.
   * @throws {RobloxTimeoutError} if the request exceeds `timeoutMs`.
   * @throws {RobloxNetworkError} on any other fetch-level failure.
   */
  async deleteEntry(params: DeleteEntryParams): Promise<void> {
    const { universeId, dataStoreId, entryId, scope } = params;
    const path = this.entryPath(universeId, dataStoreId, entryId);
    const url = this.buildUrl(path, { scope });
    await this.request<unknown>(url, { method: "DELETE" });
  }

  /**
   * Publishes a message to a MessagingService topic, delivered to any
   * `MessagingService:SubscribeAsync` listeners in the running experience.
   *
   * Endpoint: `POST /universes/{universeId}/messaging-service/{topic}:publish`
   * Body: `{ "message": "<string>" }`
   *
   * Roblox requires the published message to be a string. As a convenience,
   * if `message` is an object it is JSON.stringify-ed automatically so
   * callers can publish structured payloads without doing that themselves;
   * a string `message` is sent as-is.
   *
   * @throws {RobloxUnauthorizedError} on HTTP 401.
   * @throws {RobloxForbiddenError} on HTTP 403.
   * @throws {RobloxNotFoundError} on HTTP 404 (universe not found).
   * @throws {RobloxRateLimitError} on HTTP 429.
   * @throws {RobloxHttpError} on any other non-2xx HTTP status.
   * @throws {RobloxTimeoutError} if the request exceeds `timeoutMs`.
   * @throws {RobloxNetworkError} on any other fetch-level failure.
   */
  async publishMessage(params: PublishMessageParams): Promise<void> {
    const { universeId, topic, message } = params;
    const path = `universes/${this.enc(universeId)}/messaging-service/${this.enc(topic)}:publish`;
    const url = this.buildUrl(path);
    const messageString = typeof message === "string" ? message : JSON.stringify(message);
    await this.request<unknown>(url, {
      method: "POST",
      body: JSON.stringify({ message: messageString }),
    });
  }

  /** Builds the `universes/.../entries/{entryId}` resource path shared by getEntry/setEntry/deleteEntry. */
  private entryPath(universeId: string, dataStoreId: string, entryId: string): string {
    return (
      `universes/${this.enc(universeId)}/data-stores/${this.enc(dataStoreId)}` +
      `/entries/${this.enc(entryId)}`
    );
  }

  /** Percent-encodes a single path segment so arbitrary characters (spaces, slashes, etc) round-trip correctly. */
  private enc(segment: string): string {
    return encodeURIComponent(segment);
  }

  /** Joins the base URL with a resource path and an optional set of query parameters, omitting undefined values. */
  private buildUrl(path: string, query?: Record<string, string | number | undefined>): string {
    const url = new URL(`${this.baseUrl}/${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  /**
   * Performs a single HTTP request with a timeout, attaches the required
   * `x-api-key` header, maps error responses to typed error subclasses, and
   * parses the (possibly empty) JSON response body.
   */
  private async request<T>(url: string, options: RequestOptions): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      "content-type": "application/json",
      ...options.headers,
    };

    let response: Response;
    try {
      response = await fetch(url, {
        method: options.method,
        headers,
        body: options.body,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new RobloxTimeoutError(url, this.timeoutMs);
      }
      throw new RobloxNetworkError(url, error);
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      await this.throwForStatus(url, response);
    }

    const text = await response.text();
    if (text.length === 0) {
      return undefined as T;
    }
    return JSON.parse(text) as T;
  }

  /** Reads the response body (if any) and throws the appropriate typed error for a non-2xx status. */
  private async throwForStatus(url: string, response: Response): Promise<never> {
    let body: unknown;
    try {
      const text = await response.text();
      body = text.length > 0 ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }

    switch (response.status) {
      case 401:
        throw new RobloxUnauthorizedError(url, body);
      case 403:
        throw new RobloxForbiddenError(url, body);
      case 404:
        throw new RobloxNotFoundError(url, body);
      case 429: {
        const header = response.headers.get("Retry-After");
        let retryAfter: number | undefined;
        if (header !== null) {
          const parsed = Number(header);
          retryAfter = Number.isFinite(parsed) ? parsed : undefined;
        }
        throw new RobloxRateLimitError(url, retryAfter, body);
      }
      default:
        throw new RobloxHttpError(url, response.status, response.statusText, body);
    }
  }
}
