/**
 * Typed error hierarchy for the Twitch Clip SDK.
 *
 * All errors thrown by {@link TwitchAppTokenProvider} and `TwitchClipClient`
 * extend {@link TwitchApiError}, which carries the endpoint that was being
 * called plus an optional `context` object with additional machine-readable
 * details and the original `cause` (when applicable). Callers can use
 * `instanceof` to distinguish between failure modes (auth vs. network vs.
 * timeout vs. HTTP status) without parsing message strings.
 */

/**
 * Base class for every error raised by this SDK.
 */
export class TwitchApiError extends Error {
  /** The full URL (or logical endpoint name) that was being requested. */
  readonly endpoint: string;
  /** Arbitrary additional context useful for debugging (status codes, raw bodies, etc). */
  readonly context?: Record<string, unknown>;

  constructor(message: string, endpoint: string, context?: Record<string, unknown>) {
    super(message);
    this.name = "TwitchApiError";
    this.endpoint = endpoint;
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the underlying `fetch` call itself fails (DNS failure, connection
 * refused, TLS error, offline, etc) for reasons other than an explicit timeout.
 */
export class TwitchNetworkError extends TwitchApiError {
  constructor(endpoint: string, cause: unknown) {
    super(
      `Network error while requesting ${endpoint}: ${cause instanceof Error ? cause.message : String(cause)}`,
      endpoint,
      { cause },
    );
    this.name = "TwitchNetworkError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a request does not complete within the configured `timeoutMs`
 * and is aborted via {@link AbortController}.
 */
export class TwitchTimeoutError extends TwitchApiError {
  readonly timeoutMs: number;

  constructor(endpoint: string, timeoutMs: number) {
    super(`Request to ${endpoint} timed out after ${timeoutMs}ms`, endpoint, { timeoutMs });
    this.name = "TwitchTimeoutError";
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the Twitch Helix API responds with a non-2xx HTTP status code
 * for a clips/videos request. Carries Twitch's parsed error body when it was
 * possible to parse one (`{ error, status, message }`), falling back to the
 * raw response text otherwise.
 */
export class TwitchHttpError extends TwitchApiError {
  readonly status: number;
  readonly body?: TwitchErrorBody | string;

  constructor(endpoint: string, status: number, body?: TwitchErrorBody | string) {
    const bodyMessage =
      typeof body === "string" ? body : (body?.message ?? (body ? JSON.stringify(body) : undefined));
    super(
      `Request to ${endpoint} failed with HTTP ${status}${bodyMessage ? `: ${bodyMessage}` : ""}`,
      endpoint,
      { status, body },
    );
    this.name = "TwitchHttpError";
    this.status = status;
    this.body = body;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * The JSON error body Twitch's Helix API returns on non-2xx responses, e.g.
 * `{ "error": "Unauthorized", "status": 401, "message": "Invalid OAuth token" }`.
 */
export interface TwitchErrorBody {
  error?: string;
  status?: number;
  message?: string;
}

/**
 * Thrown for any failure specific to obtaining an app access token: missing
 * `clientId`/`clientSecret`, a non-2xx response from the OAuth2 token
 * endpoint, or a network/timeout failure while fetching a token.
 */
export class TwitchAuthError extends TwitchApiError {
  constructor(message: string, endpoint: string, context?: Record<string, unknown>) {
    super(message, endpoint, context);
    this.name = "TwitchAuthError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
