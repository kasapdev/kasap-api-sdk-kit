/**
 * Typed error hierarchy for the Godot Asset Library client.
 *
 * All errors thrown by {@link GodotAssetLibraryClient} extend
 * {@link GodotAssetLibraryError}, which carries the endpoint that was being
 * called and an optional `context` object with additional machine-readable
 * details. Callers can use `instanceof` to distinguish between failure modes
 * (network vs. timeout vs. HTTP status vs. not-found) without parsing
 * message strings.
 */

/**
 * Base class for every error raised by this SDK.
 */
export class GodotAssetLibraryError extends Error {
  /** The full URL that was being requested. */
  readonly endpoint: string;
  /** Arbitrary additional context useful for debugging (status codes, raw bodies, etc). */
  readonly context?: Record<string, unknown>;

  constructor(message: string, endpoint: string, context?: Record<string, unknown>) {
    super(message);
    this.name = "GodotAssetLibraryError";
    this.endpoint = endpoint;
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the underlying `fetch` call itself fails (DNS failure,
 * connection refused, TLS error, offline, etc) for reasons other than an
 * explicit timeout.
 */
export class GodotAssetLibraryNetworkError extends GodotAssetLibraryError {
  constructor(endpoint: string, cause: unknown) {
    super(
      `Network error while requesting ${endpoint}: ${cause instanceof Error ? cause.message : String(cause)}`,
      endpoint,
      { cause },
    );
    this.name = "GodotAssetLibraryNetworkError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a request does not complete within the configured `timeoutMs`
 * and is aborted via {@link AbortController}.
 */
export class GodotAssetLibraryTimeoutError extends GodotAssetLibraryError {
  constructor(endpoint: string, timeoutMs: number) {
    super(`Request to ${endpoint} timed out after ${timeoutMs}ms`, endpoint, { timeoutMs });
    this.name = "GodotAssetLibraryTimeoutError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the API responds with a non-2xx HTTP status code that is not
 * the specific "asset not found" case (see {@link GodotAssetLibraryNotFoundError}).
 */
export class GodotAssetLibraryHttpError extends GodotAssetLibraryError {
  readonly status: number;
  readonly statusText: string;

  constructor(endpoint: string, status: number, statusText: string) {
    super(`Request to ${endpoint} failed with HTTP ${status} ${statusText}`, endpoint, {
      status,
      statusText,
    });
    this.name = "GodotAssetLibraryHttpError";
    this.status = status;
    this.statusText = statusText;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown by {@link GodotAssetLibraryClient.getAsset} when the requested
 * asset id does not exist. Confirmed against the live API: an unknown id
 * returns HTTP 404 with a body shaped like
 * `{ "error": "Couldn't find asset with id X!" }`.
 */
export class GodotAssetLibraryNotFoundError extends GodotAssetLibraryError {
  readonly assetId: number | string;

  constructor(endpoint: string, assetId: number | string, apiMessage?: string) {
    super(
      apiMessage ?? `Asset with id "${assetId}" was not found.`,
      endpoint,
      { assetId, apiMessage },
    );
    this.name = "GodotAssetLibraryNotFoundError";
    this.assetId = assetId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
