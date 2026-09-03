import { EMBED_LIMITS } from "./embed.js";
import {
  DiscordEmbedValidationError,
  DiscordHttpError,
  DiscordNetworkError,
  DiscordRateLimitError,
  DiscordTimeoutError,
} from "./errors.js";
import type {
  DiscordWebhookClientOptions,
  DiscordWebhookExecuteResponse,
  SendOptions,
  WebhookMessage,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 3;

/** No DOM lib is loaded (see tsconfig.base.json's `lib`), so the ambient
 * `BodyInit`/`BlobPart` types aren't available - this package only ever
 * sends a JSON string or a `FormData` body, so a narrow local alias covers
 * everything `fetch`'s `body` option needs here. */
type RequestBody = string | FormData;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Discord's 429 JSON error body: `{ message, retry_after, global }`. */
interface DiscordRateLimitBody {
  message?: string;
  retry_after?: number;
  global?: boolean;
}

/** Discord's generic error body for non-429 failures: `{ message, code }`. */
interface DiscordErrorBody {
  message?: string;
  code?: number;
}

function resolveWebhookUrl(options: DiscordWebhookClientOptions): string {
  const maybeUrl = (options as { url?: string }).url;
  if (typeof maybeUrl === "string") {
    return maybeUrl;
  }
  const { id, token } = options as { id: string; token: string };
  return `https://discord.com/api/webhooks/${id}/${token}`;
}

/**
 * Type-safe client for executing Discord incoming webhooks
 * (https://discord.com/developers/docs/resources/webhook#execute-webhook).
 *
 * Every request gets an `AbortController`-based timeout. Only HTTP 429
 * (rate limiting) is retried, using the `retry_after` Discord reports (with
 * the `X-RateLimit-Reset-After` header as a fallback if the body can't be
 * parsed), up to `maxRetries` attempts total. Generic 4xx/5xx responses,
 * network failures, and timeouts are surfaced immediately as typed errors
 * and are NEVER retried by this client - retrying an ambiguous failure
 * (was the message actually posted or not?) risks double-posting.
 */
export class DiscordWebhookClient {
  private readonly webhookUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(options: DiscordWebhookClientOptions) {
    this.webhookUrl = resolveWebhookUrl(options);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.sleepFn = options.sleepFn ?? defaultSleep;
  }

  /**
   * Sends a message through this webhook.
   *
   * When `sendOptions.wait` is `true`, Discord creates the message
   * synchronously and returns it, which this method parses and returns.
   * Otherwise Discord responds `204 No Content` and this method resolves to
   * `undefined`.
   */
  async send(
    message: WebhookMessage,
    sendOptions: SendOptions = {},
  ): Promise<void | DiscordWebhookExecuteResponse> {
    if (message.embeds !== undefined && message.embeds.length > EMBED_LIMITS.EMBEDS_PER_MESSAGE) {
      throw new DiscordEmbedValidationError([
        `message contains ${message.embeds.length} embeds, exceeding the max of ${EMBED_LIMITS.EMBEDS_PER_MESSAGE} embeds per webhook message`,
      ]);
    }

    const requestUrl = new URL(this.webhookUrl);
    if (sendOptions.wait) {
      requestUrl.searchParams.set("wait", "true");
    }

    const { body, headers } = this.buildRequestBody(message);

    let lastRetryAfter = 0;
    let attempts = 0;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      attempts = attempt + 1;
      const response = await this.performRequest(requestUrl, body, headers);

      if (response.status === 429) {
        lastRetryAfter = await this.readRetryAfter(response);
        if (attempt < this.maxRetries) {
          await this.sleepFn(lastRetryAfter * 1000);
          continue;
        }
        throw new DiscordRateLimitError(lastRetryAfter, attempts);
      }

      if (!response.ok) {
        const discordError = await this.tryParseJson<DiscordErrorBody>(response);
        throw new DiscordHttpError(response.status, response.statusText, discordError);
      }

      if (sendOptions.wait) {
        return (await response.json()) as DiscordWebhookExecuteResponse;
      }
      return undefined;
    }

    // Unreachable in practice: every iteration above either returns or
    // throws. Kept so TypeScript sees an exhaustive return, and as a safe
    // fallback if the loop bounds ever change.
    throw new DiscordRateLimitError(lastRetryAfter, attempts);
  }

  private async performRequest(
    url: URL,
    body: RequestBody,
    headers: Record<string, string>,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await fetch(url.toString(), {
        method: "POST",
        body,
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new DiscordTimeoutError(this.timeoutMs);
      }
      throw new DiscordNetworkError(error);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private async readRetryAfter(response: Response): Promise<number> {
    const body = await this.tryParseJson<DiscordRateLimitBody>(response);
    if (body !== undefined && typeof body.retry_after === "number") {
      return body.retry_after;
    }
    const header = response.headers.get("X-RateLimit-Reset-After");
    const parsed = header !== null ? Number(header) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private async tryParseJson<T>(response: Response): Promise<T | undefined> {
    try {
      return (await response.json()) as T;
    } catch {
      return undefined;
    }
  }

  private buildRequestBody(message: WebhookMessage): { body: RequestBody; headers: Record<string, string> } {
    const { files, ...jsonPayload } = message;

    if (files === undefined || files.length === 0) {
      return {
        body: JSON.stringify(jsonPayload),
        headers: { "Content-Type": "application/json" },
      };
    }

    // Discord's documented convention for combining a JSON payload with file
    // attachments: a `payload_json` part plus one `files[N]` part per file.
    // Deliberately no explicit Content-Type header here - fetch/undici sets
    // the correct `multipart/form-data; boundary=...` header for a FormData body.
    const form = new FormData();
    form.append("payload_json", JSON.stringify(jsonPayload));
    files.forEach((file, index) => {
      const blob = new Blob([new Uint8Array(file.data)], {
        type: file.contentType ?? "application/octet-stream",
      });
      form.append(`files[${index}]`, blob, file.name);
    });

    return { body: form, headers: {} };
  }
}
