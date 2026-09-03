/**
 * Typed shapes for the Twitch Helix Clips and Videos APIs.
 *
 * See https://dev.twitch.tv/docs/api/reference/#get-clips and
 * https://dev.twitch.tv/docs/api/reference/#get-videos for the authoritative
 * field documentation. Twitch's wire format is already close to idiomatic
 * (mostly snake_case field names); this SDK exposes it close to verbatim
 * rather than re-casing it, so it stays easy to cross-reference against the
 * official docs.
 */

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** Options accepted by the {@link TwitchAppTokenProvider} constructor. */
export interface TwitchAppTokenProviderOptions {
  /** Twitch application client ID. Defaults to `process.env.TWITCH_CLIENT_ID`. */
  clientId?: string;
  /** Twitch application client secret. Defaults to `process.env.TWITCH_CLIENT_SECRET`. */
  clientSecret?: string;
  /** Base URL for the Twitch OAuth2 token endpoint. Defaults to "https://id.twitch.tv/oauth2/token". */
  tokenUrl?: string;
  /** Per-request timeout, in milliseconds, for the token fetch. Defaults to 10_000 (10s). */
  timeoutMs?: number;
  /**
   * Injectable clock, returning the current time in epoch milliseconds.
   * Defaults to `Date.now`. Primarily useful for deterministic tests.
   */
  now?: () => number;
}

/**
 * Raw JSON response body from `POST https://id.twitch.tv/oauth2/token`
 * under the client-credentials grant.
 */
export interface RawTwitchAppTokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/** Minimal interface the client depends on for obtaining bearer tokens. */
export interface TwitchTokenProvider {
  getToken(): Promise<string>;
  /** Force the next `getToken()` call to fetch a fresh token instead of reusing the cache. */
  invalidate(): void;
}

/** Options accepted by the `TwitchClipClient` constructor. */
export interface TwitchClipClientOptions {
  /** Twitch application client ID. Defaults to `process.env.TWITCH_CLIENT_ID`. */
  clientId?: string;
  /** Twitch application client secret. Defaults to `process.env.TWITCH_CLIENT_SECRET`. */
  clientSecret?: string;
  /**
   * Pre-built token provider to use instead of constructing one internally
   * from `clientId`/`clientSecret`. Useful for sharing a single provider
   * across multiple clients, or for injecting a test double.
   */
  tokenProvider?: TwitchTokenProvider;
  /** Base URL for the Twitch Helix API. Defaults to "https://api.twitch.tv/helix". */
  baseUrl?: string;
  /** Per-request timeout, in milliseconds. Defaults to 10_000 (10s). */
  timeoutMs?: number;
}

/** Generic paged result shape returned by this SDK's list methods. */
export interface TwitchPagedResult<T> {
  data: T[];
  /**
   * Cursor to pass as `after` on a follow-up call to fetch the next page.
   * Absent when there are no more pages.
   */
  cursor?: string;
}

/** Raw Twitch Helix pagination envelope, shared by both `/clips` and `/videos`. */
export interface TwitchPaginationEnvelope<T> {
  data: T[];
  pagination: { cursor?: string };
}

// ---------------------------------------------------------------------------
// Clips
// ---------------------------------------------------------------------------

/**
 * Query params for `GET /helix/clips`.
 *
 * Exactly one of `broadcasterId`, `gameId`, or `id` should be provided per
 * the Twitch API contract (they are alternative search modes, not
 * composable filters) — this is not enforced at the type level since Twitch
 * itself only documents it as a runtime requirement.
 */
export interface SearchClipsParams {
  /** Returns clips from this broadcaster's channel. Primary search mode. */
  broadcasterId?: string;
  /** Returns clips from this game/category. */
  gameId?: string;
  /** Returns the specific clip(s) with these IDs. */
  id?: string | string[];
  /** Maximum number of objects to return per page. Default 20, max 100. */
  first?: number;
  /** Cursor for forward pagination, from a previous response's `cursor`. */
  after?: string;
  /** Cursor for backward pagination. */
  before?: string;
  /** RFC3339 timestamp; only clips created at or after this time are returned. */
  startedAt?: string;
  /** RFC3339 timestamp; only clips created at or before this time are returned. */
  endedAt?: string;
}

/** A single clip, as returned in the `data` array of `GET /helix/clips`. */
export interface TwitchClip {
  id: string;
  url: string;
  embed_url: string;
  broadcaster_id: string;
  broadcaster_name: string;
  creator_id: string;
  creator_name: string;
  video_id: string;
  game_id: string;
  language: string;
  title: string;
  view_count: number;
  created_at: string;
  thumbnail_url: string;
  duration: number;
  vod_offset: number | null;
}

// ---------------------------------------------------------------------------
// Videos
// ---------------------------------------------------------------------------

/** The `type` filter accepted by `GET /helix/videos`. */
export type TwitchVideoType = "all" | "upload" | "archive" | "highlight";

/**
 * Query params for `GET /helix/videos`.
 *
 * Exactly one of `id`, `userId`, or `gameId` should be provided per the
 * Twitch API contract (they are alternative search modes) — `period`/`sort`
 * only apply when searching by `userId` or `gameId`.
 */
export interface GetVideosParams {
  /** Returns the specific video(s) with these IDs. */
  id?: string | string[];
  /** Returns videos owned by this broadcaster/user. */
  userId?: string;
  /** Returns the most recent videos from this game/category. */
  gameId?: string;
  /** Maximum number of objects to return per page. Default 20, max 100. */
  first?: number;
  /** Cursor for forward pagination, from a previous response's `cursor`. */
  after?: string;
  /** Cursor for backward pagination. */
  before?: string;
  /** Filters by video type. Defaults to "all" on Twitch's side when omitted. */
  type?: TwitchVideoType;
  /** Filters by recency window, e.g. "day" | "week" | "month" | "all". Only applies to userId/gameId lookups. */
  period?: "all" | "day" | "week" | "month";
  /** Sort order, e.g. "time" | "trending" | "views". Only applies to userId/gameId lookups. */
  sort?: "time" | "trending" | "views";
}

/** One entry in a video's `muted_segments` array. */
export interface TwitchMutedSegment {
  duration: number;
  offset: number;
}

/** A single video, as returned in the `data` array of `GET /helix/videos`. */
export interface TwitchVideo {
  id: string;
  stream_id: string | null;
  user_id: string;
  user_login: string;
  user_name: string;
  title: string;
  description: string;
  created_at: string;
  published_at: string;
  url: string;
  thumbnail_url: string;
  viewable: string;
  view_count: number;
  language: string;
  type: string;
  duration: string;
  muted_segments: TwitchMutedSegment[] | null;
}
