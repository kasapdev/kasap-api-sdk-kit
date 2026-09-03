import { TwitchAppTokenProvider } from "./auth.js";
import { TwitchAuthError, TwitchHttpError, TwitchNetworkError, TwitchTimeoutError } from "./errors.js";
import type { TwitchErrorBody } from "./errors.js";
import type {
  GetVideosParams,
  SearchClipsParams,
  TwitchClip,
  TwitchClipClientOptions,
  TwitchPaginationEnvelope,
  TwitchPagedResult,
  TwitchTokenProvider,
  TwitchVideo,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.twitch.tv/helix";
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Typed client for the Twitch Helix Clips and Videos endpoints, authenticated
 * via the app-access-token (client-credentials) flow.
 *
 * Design notes:
 * - Every request sends `Client-Id` and `Authorization: Bearer <token>`
 *   headers, obtaining the token from a {@link TwitchTokenProvider} (a
 *   `TwitchAppTokenProvider` by default, built internally from
 *   `clientId`/`clientSecret`).
 * - On a 401 response, this client assumes the cached token was invalidated
 *   server-side (e.g. the app's client secret was rotated, or Twitch revoked
 *   the token early) rather than that the credentials are fundamentally
 *   invalid. It force-refreshes the token via `tokenProvider.invalidate()`
 *   and retries the request exactly once with the new token. If the retry
 *   also fails, a `TwitchHttpError` is thrown — there is no further retry
 *   loop, to avoid hammering Twitch with bad credentials.
 * - All other non-2xx statuses throw `TwitchHttpError` immediately (no
 *   retry), network failures throw `TwitchNetworkError`, and timeouts throw
 *   `TwitchTimeoutError` — none of which are retried automatically, since
 *   blind retries on those failure modes are not safe to do generically.
 */
export class TwitchClipClient {
  private readonly clientId?: string;
  private readonly tokenProvider: TwitchTokenProvider;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: TwitchClipClientOptions = {}) {
    this.clientId = options.clientId ?? process.env.TWITCH_CLIENT_ID;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.tokenProvider =
      options.tokenProvider ??
      new TwitchAppTokenProvider({
        clientId: options.clientId,
        clientSecret: options.clientSecret,
        timeoutMs: this.timeoutMs,
      });
  }

  /**
   * Searches for clips via `GET /helix/clips`.
   *
   * Exactly one of `broadcasterId`, `gameId`, or `id` should be provided,
   * per the Twitch API contract; `broadcasterId` is the primary search mode.
   *
   * @throws {TwitchAuthError} if no `clientId` is available.
   * @throws {TwitchHttpError} on a non-2xx HTTP status (after the one 401 retry, if applicable).
   * @throws {TwitchTimeoutError} if a request exceeds `timeoutMs`.
   * @throws {TwitchNetworkError} on any other fetch-level failure.
   */
  async searchClips(params: SearchClipsParams): Promise<TwitchPagedResult<TwitchClip>> {
    const query = new URLSearchParams();
    appendParam(query, "broadcaster_id", params.broadcasterId);
    appendParam(query, "game_id", params.gameId);
    appendParam(query, "id", params.id);
    appendParam(query, "first", params.first);
    appendParam(query, "after", params.after);
    appendParam(query, "before", params.before);
    appendParam(query, "started_at", params.startedAt);
    appendParam(query, "ended_at", params.endedAt);

    return this.requestPaged<TwitchClip>(`${this.baseUrl}/clips?${query.toString()}`);
  }

  /**
   * Fetches videos via `GET /helix/videos`.
   *
   * Exactly one of `id`, `userId`, or `gameId` should be provided, per the
   * Twitch API contract.
   *
   * @throws {TwitchAuthError} if no `clientId` is available.
   * @throws {TwitchHttpError} on a non-2xx HTTP status (after the one 401 retry, if applicable).
   * @throws {TwitchTimeoutError} if a request exceeds `timeoutMs`.
   * @throws {TwitchNetworkError} on any other fetch-level failure.
   */
  async getVideos(params: GetVideosParams): Promise<TwitchPagedResult<TwitchVideo>> {
    const query = new URLSearchParams();
    appendParam(query, "id", params.id);
    appendParam(query, "user_id", params.userId);
    appendParam(query, "game_id", params.gameId);
    appendParam(query, "first", params.first);
    appendParam(query, "after", params.after);
    appendParam(query, "before", params.before);
    appendParam(query, "type", params.type);
    appendParam(query, "period", params.period);
    appendParam(query, "sort", params.sort);

    return this.requestPaged<TwitchVideo>(`${this.baseUrl}/videos?${query.toString()}`);
  }

  /**
   * Performs a GET request against a Helix endpoint that returns a
   * `{ data, pagination }` envelope, handling auth headers, the one-retry-
   * after-401-refresh policy, and error translation. Flattens
   * `pagination.cursor` into a top-level `cursor` for ergonomics.
   */
  private async requestPaged<T>(url: string): Promise<TwitchPagedResult<T>> {
    if (!this.clientId) {
      throw new TwitchAuthError(
        "Missing Twitch client ID: provide `clientId` (explicitly, or via the TWITCH_CLIENT_ID " +
          "environment variable). Register an app at https://dev.twitch.tv/console/apps to obtain one.",
        url,
      );
    }

    let token = await this.tokenProvider.getToken();
    let response = await this.doFetch(url, token);

    if (response.status === 401) {
      // The cached token was likely invalidated server-side (e.g. revoked,
      // or a secret rotation) rather than the app's credentials being
      // fundamentally wrong. Force a refresh and retry exactly once.
      this.tokenProvider.invalidate();
      token = await this.tokenProvider.getToken();
      response = await this.doFetch(url, token);
    }

    if (!response.ok) {
      throw new TwitchHttpError(url, response.status, await parseErrorBody(response));
    }

    const payload = (await response.json()) as TwitchPaginationEnvelope<T>;
    const result: TwitchPagedResult<T> = { data: payload.data };
    if (payload.pagination?.cursor) {
      result.cursor = payload.pagination.cursor;
    }
    return result;
  }

  /** Performs a single GET request with a hard timeout. Never inspects `response.ok` itself. */
  private async doFetch(url: string, token: string): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(url, {
        method: "GET",
        headers: {
          "Client-Id": this.clientId as string,
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new TwitchTimeoutError(url, this.timeoutMs);
      }
      throw new TwitchNetworkError(url, error);
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Appends a query param, skipping `undefined`/`null`, and repeating the key for array values. */
function appendParam(qs: URLSearchParams, key: string, value: string | number | string[] | undefined): void {
  if (value === undefined || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      qs.append(key, item);
    }
    return;
  }
  qs.append(key, String(value));
}

/** Best-effort parse of a non-2xx Helix response body into Twitch's `{ error, status, message }` shape. */
async function parseErrorBody(response: Response): Promise<TwitchErrorBody | string | undefined> {
  const text = await response.text().catch(() => undefined);
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as TwitchErrorBody;
  } catch {
    return text;
  }
}
