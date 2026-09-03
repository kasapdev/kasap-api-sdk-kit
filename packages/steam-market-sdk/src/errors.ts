/**
 * Typed error hierarchy for the Steam Community Market SDK.
 *
 * All errors thrown by {@link SteamMarketClient} extend {@link SteamMarketApiError},
 * which carries the endpoint that was being called and an optional `context`
 * object with additional machine-readable details. Callers can use
 * `instanceof` to distinguish between failure modes (network vs. timeout vs.
 * HTTP status vs. Steam-reported failure) without parsing message strings.
 */

/**
 * Base class for every error raised by this SDK.
 */
export class SteamMarketApiError extends Error {
  /** The full URL (or logical endpoint name) that was being requested. */
  readonly endpoint: string;
  /** Arbitrary additional context useful for debugging (status codes, raw bodies, etc). */
  readonly context?: Record<string, unknown>;

  constructor(message: string, endpoint: string, context?: Record<string, unknown>) {
    super(message);
    this.name = "SteamMarketApiError";
    this.endpoint = endpoint;
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the underlying `fetch` call itself fails (DNS failure, connection
 * refused, TLS error, offline, etc) for reasons other than an explicit timeout.
 */
export class SteamMarketNetworkError extends SteamMarketApiError {
  constructor(endpoint: string, cause: unknown) {
    super(
      `Network error while requesting ${endpoint}: ${cause instanceof Error ? cause.message : String(cause)}`,
      endpoint,
      { cause },
    );
    this.name = "SteamMarketNetworkError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a request does not complete within the configured `timeoutMs`
 * and is aborted via {@link AbortController}.
 */
export class SteamMarketTimeoutError extends SteamMarketApiError {
  constructor(endpoint: string, timeoutMs: number) {
    super(`Request to ${endpoint} timed out after ${timeoutMs}ms`, endpoint, { timeoutMs });
    this.name = "SteamMarketTimeoutError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when Steam responds with a non-2xx HTTP status code.
 */
export class SteamMarketHttpError extends SteamMarketApiError {
  readonly status: number;
  readonly statusText: string;

  constructor(endpoint: string, status: number, statusText: string) {
    super(`Request to ${endpoint} failed with HTTP ${status} ${statusText}`, endpoint, {
      status,
      statusText,
    });
    this.name = "SteamMarketHttpError";
    this.status = status;
    this.statusText = statusText;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when Steam responds with HTTP 200 but a JSON payload indicating
 * `success: false` (or a missing/falsy `success` field). This is Steam's way
 * of signalling an application-level failure (e.g. invalid appid /
 * market_hash_name combination, or a missing login session for endpoints
 * that require one) while still returning a successful HTTP status.
 */
export class SteamMarketNotFoundError extends SteamMarketApiError {
  constructor(endpoint: string, message: string, context?: Record<string, unknown>) {
    super(message, endpoint, context);
    this.name = "SteamMarketNotFoundError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
