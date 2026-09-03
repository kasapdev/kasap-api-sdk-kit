/**
 * Typed error hierarchy for the Discord webhook SDK.
 *
 * Every error this package can throw is either:
 *  - a {@link DiscordEmbedValidationError}, thrown *synchronously* by
 *    {@link EmbedBuilder.build} / `finalizeEmbed` (and by
 *    `DiscordWebhookClient.send` for the "max 10 embeds per message" rule)
 *    when a payload violates one of Discord's documented embed limits — this
 *    never involves the network, so it is deliberately kept separate from
 *    the client's async error classes below; or
 *  - one of the async {@link DiscordWebhookError} subclasses thrown by
 *    {@link DiscordWebhookClient.send} while actually talking to Discord.
 *
 * Callers can use `instanceof` to branch on failure mode without parsing
 * message strings.
 */

/**
 * Base class for every error raised while executing a webhook request.
 */
export class DiscordWebhookError extends Error {
  /** Arbitrary additional context useful for debugging (status codes, raw bodies, etc). */
  readonly context?: Record<string, unknown>;

  constructor(message: string, context?: Record<string, unknown>) {
    super(message);
    this.name = "DiscordWebhookError";
    this.context = context;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the underlying `fetch` call itself rejects (DNS failure,
 * connection refused, TLS error, offline, etc) for reasons other than an
 * explicit timeout. Not retried — an ambiguous network failure could mean
 * the request was never sent, or that it succeeded but the response was
 * lost, so blindly retrying could double-post the message.
 */
export class DiscordNetworkError extends DiscordWebhookError {
  constructor(cause: unknown) {
    super(
      `Network error while sending the Discord webhook request: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
      { cause },
    );
    this.name = "DiscordNetworkError";
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a request does not complete within the configured `timeoutMs`
 * and is aborted via {@link AbortController}. Not retried, for the same
 * reason as {@link DiscordNetworkError}.
 */
export class DiscordTimeoutError extends DiscordWebhookError {
  readonly timeoutMs: number;

  constructor(timeoutMs: number) {
    super(`Discord webhook request timed out after ${timeoutMs}ms`, { timeoutMs });
    this.name = "DiscordTimeoutError";
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when Discord responds with a non-2xx, non-429 HTTP status. This is
 * thrown immediately, with no retry — only HTTP 429 (rate limiting) is
 * retried by this client; a generic 4xx/5xx is treated as a real failure
 * (bad payload, deleted webhook, Discord outage, etc) that retrying blindly
 * would not fix.
 */
export class DiscordHttpError extends DiscordWebhookError {
  readonly status: number;
  readonly statusText: string;
  /** Discord's parsed JSON error body, if the response had one (usually `{ message, code }`). */
  readonly discordError?: { message?: string; code?: number };

  constructor(status: number, statusText: string, discordError?: { message?: string; code?: number }) {
    const detail = discordError?.message
      ? ` - ${discordError.message}${discordError.code !== undefined ? ` (code ${discordError.code})` : ""}`
      : "";
    super(`Discord webhook request failed with HTTP ${status} ${statusText}${detail}`, {
      status,
      statusText,
      discordError,
    });
    this.name = "DiscordHttpError";
    this.status = status;
    this.statusText = statusText;
    this.discordError = discordError;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when Discord keeps responding with HTTP 429 (Too Many Requests)
 * after `maxRetries` retry attempts have been exhausted.
 */
export class DiscordRateLimitError extends DiscordWebhookError {
  /** The `retry_after` value (seconds) from the last 429 response received. */
  readonly retryAfter: number;
  /** How many retry attempts were made before giving up. */
  readonly attempts: number;

  constructor(retryAfter: number, attempts: number) {
    super(
      `Discord webhook request was rate-limited after ${attempts} attempt(s); last retry_after was ${retryAfter}s`,
      { retryAfter, attempts },
    );
    this.name = "DiscordRateLimitError";
    this.retryAfter = retryAfter;
    this.attempts = attempts;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown synchronously when an embed (or a webhook message's embed list)
 * violates one of Discord's documented limits. Raised by
 * {@link EmbedBuilder.build} / `finalizeEmbed`, and by
 * `DiscordWebhookClient.send` for the "max 10 embeds per message" rule.
 * Deliberately not a subclass of {@link DiscordWebhookError} - this is a
 * client-side payload construction bug, not a failure of the webhook
 * request itself.
 */
export class DiscordEmbedValidationError extends Error {
  /** Every limit violation found, in case more than one was accumulated. */
  readonly violations: string[];

  constructor(violations: string[]) {
    super(
      violations.length === 1
        ? (violations[0] ?? "Embed validation failed.")
        : `Embed validation failed with ${violations.length} violations:\n- ${violations.join("\n- ")}`,
    );
    this.name = "DiscordEmbedValidationError";
    this.violations = violations;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
