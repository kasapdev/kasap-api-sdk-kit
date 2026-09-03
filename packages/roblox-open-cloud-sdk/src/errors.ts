/**
 * Typed error hierarchy for the Roblox Open Cloud SDK.
 *
 * All errors thrown by {@link RobloxOpenCloudClient} extend
 * {@link RobloxOpenCloudError}, which carries the endpoint that was being
 * called, the HTTP status code (when applicable), and an optional `context`
 * object with additional machine-readable details. Callers can use
 * `instanceof` to distinguish between failure modes — invalid configuration,
 * network/timeout failures, or specific HTTP status codes — without parsing
 * message strings.
 */

/** Base class for every error raised by this SDK. */
export class RobloxOpenCloudError extends Error {
  /** The full URL (or logical description) of the request that failed. */
  readonly endpoint: string;
  /** The HTTP status code, when the error resulted from an HTTP response. */
  readonly status?: number;
  /** Arbitrary additional context useful for debugging (response body, headers, etc). */
  readonly context?: Record<string, unknown>;

  constructor(message: string, endpoint: string, status?: number, context?: Record<string, unknown>) {
    super(message);
    this.name = "RobloxOpenCloudError";
    this.endpoint = endpoint;
    this.status = status;
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown synchronously by the {@link RobloxOpenCloudClient} constructor when
 * no API key is available from either the `apiKey` option or the
 * `ROBLOX_OPEN_CLOUD_API_KEY` environment variable.
 */
export class RobloxConfigError extends RobloxOpenCloudError {
  constructor(message: string) {
    super(message, "<constructor>");
    this.name = "RobloxConfigError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the underlying `fetch` call itself fails (DNS failure,
 * connection refused, TLS error, offline, etc) for reasons other than an
 * explicit timeout.
 */
export class RobloxNetworkError extends RobloxOpenCloudError {
  constructor(endpoint: string, cause: unknown) {
    super(
      `Network error while requesting ${endpoint}: ${cause instanceof Error ? cause.message : String(cause)}`,
      endpoint,
      undefined,
      { cause },
    );
    this.name = "RobloxNetworkError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a request does not complete within the configured `timeoutMs`
 * and is aborted via {@link AbortController}.
 */
export class RobloxTimeoutError extends RobloxOpenCloudError {
  constructor(endpoint: string, timeoutMs: number) {
    super(`Request to ${endpoint} timed out after ${timeoutMs}ms`, endpoint, undefined, { timeoutMs });
    this.name = "RobloxTimeoutError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when Roblox responds with a non-2xx HTTP status that does not have
 * a more specific subclass (i.e. anything other than 401 / 403 / 404 / 429).
 */
export class RobloxHttpError extends RobloxOpenCloudError {
  constructor(endpoint: string, status: number, statusText: string, body?: unknown) {
    super(`Request to ${endpoint} failed with HTTP ${status} ${statusText}`, endpoint, status, {
      statusText,
      body,
    });
    this.name = "RobloxHttpError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown on HTTP 401: the API key is missing or invalid.
 */
export class RobloxUnauthorizedError extends RobloxOpenCloudError {
  constructor(endpoint: string, body?: unknown) {
    super(
      `Request to ${endpoint} failed with HTTP 401 Unauthorized — the API key is missing or invalid.`,
      endpoint,
      401,
      { body },
    );
    this.name = "RobloxUnauthorizedError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown on HTTP 403: the API key is valid but lacks the required
 * scope/permission for this universe, data store, or MessagingService topic.
 */
export class RobloxForbiddenError extends RobloxOpenCloudError {
  constructor(endpoint: string, body?: unknown) {
    super(
      `Request to ${endpoint} failed with HTTP 403 Forbidden — the API key lacks the required ` +
        "scope/permission for this universe/data store/topic.",
      endpoint,
      403,
      { body },
    );
    this.name = "RobloxForbiddenError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown on HTTP 404: the universe, data store, or entry does not exist.
 */
export class RobloxNotFoundError extends RobloxOpenCloudError {
  constructor(endpoint: string, body?: unknown) {
    super(
      `Request to ${endpoint} failed with HTTP 404 Not Found — the universe, data store, or entry does not exist.`,
      endpoint,
      404,
      { body },
    );
    this.name = "RobloxNotFoundError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown on HTTP 429: the caller has been rate limited by Roblox. This SDK
 * performs a single request attempt and never retries automatically (see
 * {@link RobloxOpenCloudClient} design notes), so this error always surfaces
 * immediately — it is up to the caller to decide whether/when to retry,
 * optionally honoring `retryAfter`.
 */
export class RobloxRateLimitError extends RobloxOpenCloudError {
  /** Seconds to wait before retrying, parsed from the `Retry-After` response header, if present. */
  readonly retryAfter?: number;

  constructor(endpoint: string, retryAfter?: number, body?: unknown) {
    super(
      `Request to ${endpoint} failed with HTTP 429 Too Many Requests.` +
        (retryAfter !== undefined ? ` Retry after ${retryAfter}s.` : ""),
      endpoint,
      429,
      { retryAfter, body },
    );
    this.name = "RobloxRateLimitError";
    this.retryAfter = retryAfter;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
