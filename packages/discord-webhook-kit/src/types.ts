/**
 * Typed shapes for the Discord webhook execute API
 * (https://discord.com/developers/docs/resources/webhook#execute-webhook).
 */

/** One field in an embed's `fields` array. */
export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

/** An embed's `footer` object. */
export interface DiscordEmbedFooter {
  text: string;
  icon_url?: string;
}

/** An embed's `author` object. */
export interface DiscordEmbedAuthor {
  name: string;
  url?: string;
  icon_url?: string;
}

/** An embed's `image` object. */
export interface DiscordEmbedImage {
  url: string;
}

/** An embed's `thumbnail` object. */
export interface DiscordEmbedThumbnail {
  url: string;
}

/**
 * The shape accepted while *building* an embed, before it has been
 * validated and finalized. `timestamp` may be a `Date` or an ISO 8601
 * string; `color` may be an integer or a `"#RRGGBB"` hex string - both are
 * normalized by {@link EmbedBuilder.build} / `finalizeEmbed`.
 */
export interface DiscordEmbedInput {
  title?: string;
  description?: string;
  url?: string;
  color?: number | string;
  timestamp?: Date | string;
  footer?: DiscordEmbedFooter;
  image?: DiscordEmbedImage;
  thumbnail?: DiscordEmbedThumbnail;
  author?: DiscordEmbedAuthor;
  fields?: DiscordEmbedField[];
}

/**
 * A fully validated embed, ready to be sent in a {@link WebhookMessage}.
 * Identical to {@link DiscordEmbedInput} except `color` is always a
 * normalized integer and `timestamp` is always an ISO 8601 string, as
 * required by Discord.
 */
export interface FinalizedEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  timestamp?: string;
  footer?: DiscordEmbedFooter;
  image?: DiscordEmbedImage;
  thumbnail?: DiscordEmbedThumbnail;
  author?: DiscordEmbedAuthor;
  fields?: DiscordEmbedField[];
  /** Marker so `FinalizedEmbed` values can only originate from `finalizeEmbed`/`EmbedBuilder.build`. */
  readonly __finalized: true;
}

/** A file attachment to send alongside (or instead of) message content. */
export interface WebhookFile {
  /** File name, e.g. "screenshot.png". Sent as the multipart part's filename. */
  name: string;
  data: Uint8Array | Buffer;
  /** MIME type, e.g. "image/png". Defaults to "application/octet-stream" if omitted. */
  contentType?: string;
}

/**
 * The message payload accepted by {@link DiscordWebhookClient.send}, mirroring
 * Discord's execute-webhook JSON body plus an optional `files` array for
 * multipart uploads.
 */
export interface WebhookMessage {
  content?: string;
  username?: string;
  avatar_url?: string;
  tts?: boolean;
  embeds?: FinalizedEmbed[];
  files?: WebhookFile[];
}

/** Options accepted by {@link DiscordWebhookClient.send}. */
export interface SendOptions {
  /**
   * When `true`, appends `?wait=true` to the request URL so Discord waits
   * for the message to be created and returns it in the response body
   * (parsed and returned by `send`). When `false`/omitted, Discord responds
   * `204 No Content` and `send` resolves to `undefined`.
   */
  wait?: boolean;
}

/**
 * Discord's message object, as returned when `wait=true` is used. Only the
 * fields consumers are realistically likely to need are typed here; Discord
 * documents many more (reactions, message_reference, components, ...).
 */
export interface DiscordWebhookExecuteResponse {
  id: string;
  type: number;
  channel_id: string;
  content: string;
  author: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string | null;
    bot?: boolean;
  };
  attachments: Array<{
    id: string;
    filename: string;
    size: number;
    url: string;
    proxy_url: string;
    content_type?: string;
  }>;
  embeds: FinalizedEmbed[];
  timestamp: string;
  edited_timestamp: string | null;
  tts: boolean;
  mention_everyone: boolean;
  webhook_id?: string;
  [key: string]: unknown;
}

/** Options accepted by the {@link DiscordWebhookClient} constructor. */
export type DiscordWebhookClientOptions = (
  | { url: string; id?: never; token?: never }
  | { id: string; token: string; url?: never }
) & {
  /** Per-request timeout, in milliseconds. Defaults to 10_000 (10s). */
  timeoutMs?: number;
  /**
   * Maximum number of retries used ONLY for HTTP 429 (rate-limit) backoff.
   * Generic 4xx/5xx responses and network/timeout failures are never
   * retried. Defaults to 3.
   */
  maxRetries?: number;
  /**
   * Injectable sleep function, used while waiting out a 429's `retry_after`.
   * Defaults to a real `setTimeout`-based sleep. Tests can pass a fake that
   * resolves immediately to avoid actually waiting.
   */
  sleepFn?: (ms: number) => Promise<void>;
}
