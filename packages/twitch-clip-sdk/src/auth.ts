import { TwitchAuthError } from "./errors.js";
import type { RawTwitchAppTokenResponse, TwitchAppTokenProviderOptions, TwitchTokenProvider } from "./types.js";

const DEFAULT_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Safety margin, in milliseconds, subtracted from a token's real expiry when
 * deciding whether the cached token is still usable. Without this margin, a
 * token could pass the "is it valid?" check and then expire server-side a
 * few hundred milliseconds later, mid-request, causing an avoidable 401.
 */
export const TOKEN_EXPIRY_SAFETY_MARGIN_MS = 60_000;

interface CachedToken {
  token: string;
  /** Epoch milliseconds (per the injectable `now()` clock) at which the token actually expires. */
  expiresAt: number;
}

/**
 * Obtains and caches a Twitch "app access token" via the OAuth2
 * client-credentials grant (`POST https://id.twitch.tv/oauth2/token`).
 *
 * This flow requires no per-user login — it authenticates the *application*,
 * not a user — and is the right choice for server-side/bot use cases that
 * only need public, app-scoped endpoints (like Get Clips / Get Videos).
 *
 * `clientId`/`clientSecret` validation is deferred to the first `getToken()`
 * call rather than thrown from the constructor. This keeps constructing a
 * `TwitchAppTokenProvider` (or a `TwitchClipClient`, which builds one
 * internally) cheap and side-effect-free even if the caller supplies
 * credentials through some other path before actually making a request.
 */
export class TwitchAppTokenProvider implements TwitchTokenProvider {
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly tokenUrl: string;
  private readonly timeoutMs: number;
  private readonly now: () => number;

  private cached?: CachedToken;
  /**
   * The in-flight token fetch, if one is currently underway. Concurrent
   * `getToken()` callers share this single promise ("single-flight") instead
   * of each triggering their own `POST /oauth2/token` request.
   */
  private inFlight?: Promise<string>;

  constructor(options: TwitchAppTokenProviderOptions = {}) {
    this.clientId = options.clientId ?? process.env.TWITCH_CLIENT_ID;
    this.clientSecret = options.clientSecret ?? process.env.TWITCH_CLIENT_SECRET;
    this.tokenUrl = options.tokenUrl ?? DEFAULT_TOKEN_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.now = options.now ?? Date.now;
  }

  /**
   * Returns a valid app access token, fetching (and caching) a new one if
   * there is no cached token or the cached one is within
   * {@link TOKEN_EXPIRY_SAFETY_MARGIN_MS} of expiring.
   *
   * @throws {TwitchAuthError} if `clientId`/`clientSecret` are both missing,
   *   the token endpoint responds with a non-2xx status, or the request
   *   fails at the network/timeout level.
   */
  async getToken(): Promise<string> {
    if (this.cached && this.now() < this.cached.expiresAt - TOKEN_EXPIRY_SAFETY_MARGIN_MS) {
      return this.cached.token;
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    const fetchPromise = this.fetchToken().finally(() => {
      this.inFlight = undefined;
    });
    this.inFlight = fetchPromise;
    return fetchPromise;
  }

  /** Discards any cached token, forcing the next `getToken()` call to fetch a fresh one. */
  invalidate(): void {
    this.cached = undefined;
  }

  private async fetchToken(): Promise<string> {
    if (!this.clientId || !this.clientSecret) {
      throw new TwitchAuthError(
        "Missing Twitch client credentials: provide both `clientId` and `clientSecret` " +
          "(explicitly, or via the TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET environment variables). " +
          "Register an app at https://dev.twitch.tv/console/apps to obtain them.",
        this.tokenUrl,
      );
    }

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: "client_credentials",
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await fetch(this.tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new TwitchAuthError(`Token request to ${this.tokenUrl} timed out after ${this.timeoutMs}ms`, this.tokenUrl, {
          timeoutMs: this.timeoutMs,
        });
      }
      throw new TwitchAuthError(
        `Network error while requesting an app access token: ${error instanceof Error ? error.message : String(error)}`,
        this.tokenUrl,
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => undefined);
      throw new TwitchAuthError(
        `Failed to obtain a Twitch app access token: HTTP ${response.status}${bodyText ? ` - ${bodyText}` : ""}`,
        this.tokenUrl,
        { status: response.status, body: bodyText },
      );
    }

    const payload = (await response.json()) as RawTwitchAppTokenResponse;
    const token: CachedToken = {
      token: payload.access_token,
      expiresAt: this.now() + payload.expires_in * 1000,
    };
    this.cached = token;
    return token.token;
  }
}
