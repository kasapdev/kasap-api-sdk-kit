import { DiscordEmbedValidationError } from "./errors.js";
import type { DiscordEmbedField, DiscordEmbedInput, FinalizedEmbed } from "./types.js";

/**
 * Discord's documented embed limits
 * (https://discord.com/developers/docs/resources/message#embed-object-embed-limits).
 */
export const EMBED_LIMITS = {
  TITLE: 256,
  DESCRIPTION: 4096,
  FIELDS: 25,
  FIELD_NAME: 256,
  FIELD_VALUE: 1024,
  FOOTER_TEXT: 2048,
  AUTHOR_NAME: 256,
  /** Total character budget across title + description + field names/values + footer text + author name. */
  TOTAL: 6000,
  /** Max embeds allowed in a single webhook message (enforced by the client, not this module). */
  EMBEDS_PER_MESSAGE: 10,
} as const;

/**
 * Converts a `"#RRGGBB"` (or `"RRGGBB"`) hex color string to Discord's
 * integer color format. Throws a plain `Error` (not a validation error -
 * this is a programmer error, an obviously malformed literal, not a
 * violation of a Discord content limit) if the string is not a valid hex
 * triplet.
 */
export function hexColorToInt(hex: string): number {
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    throw new Error(`Invalid hex color "${hex}": expected a "#RRGGBB" (or "RRGGBB") string.`);
  }
  return parseInt(normalized, 16);
}

function normalizeTimestamp(timestamp: Date | string): string {
  return timestamp instanceof Date ? timestamp.toISOString() : timestamp;
}

function normalizeColor(color: number | string): number {
  return typeof color === "string" ? hexColorToInt(color) : color;
}

function pushIf(violations: string[], condition: boolean, message: string): void {
  if (condition) violations.push(message);
}

/**
 * Validates and normalizes a raw {@link DiscordEmbedInput} into a
 * {@link FinalizedEmbed}, enforcing every documented Discord embed limit.
 * Throws a {@link DiscordEmbedValidationError} listing ALL violations found
 * (not just the first) if any limit is exceeded.
 */
export function finalizeEmbed(embed: DiscordEmbedInput): FinalizedEmbed {
  const violations: string[] = [];
  const fields: DiscordEmbedField[] = embed.fields ?? [];

  pushIf(
    violations,
    embed.title !== undefined && embed.title.length > EMBED_LIMITS.TITLE,
    `title exceeds ${EMBED_LIMITS.TITLE} characters (got ${embed.title?.length ?? 0})`,
  );
  pushIf(
    violations,
    embed.description !== undefined && embed.description.length > EMBED_LIMITS.DESCRIPTION,
    `description exceeds ${EMBED_LIMITS.DESCRIPTION} characters (got ${embed.description?.length ?? 0})`,
  );
  pushIf(
    violations,
    fields.length > EMBED_LIMITS.FIELDS,
    `fields exceeds ${EMBED_LIMITS.FIELDS} entries (got ${fields.length})`,
  );
  pushIf(
    violations,
    embed.footer !== undefined && embed.footer.text.length > EMBED_LIMITS.FOOTER_TEXT,
    `footer.text exceeds ${EMBED_LIMITS.FOOTER_TEXT} characters (got ${embed.footer?.text.length ?? 0})`,
  );
  pushIf(
    violations,
    embed.author !== undefined && embed.author.name.length > EMBED_LIMITS.AUTHOR_NAME,
    `author.name exceeds ${EMBED_LIMITS.AUTHOR_NAME} characters (got ${embed.author?.name.length ?? 0})`,
  );

  for (const [index, field] of fields.entries()) {
    pushIf(
      violations,
      field.name.length > EMBED_LIMITS.FIELD_NAME,
      `fields[${index}].name exceeds ${EMBED_LIMITS.FIELD_NAME} characters (got ${field.name.length})`,
    );
    pushIf(
      violations,
      field.value.length > EMBED_LIMITS.FIELD_VALUE,
      `fields[${index}].value exceeds ${EMBED_LIMITS.FIELD_VALUE} characters (got ${field.value.length})`,
    );
  }

  const total =
    (embed.title?.length ?? 0) +
    (embed.description?.length ?? 0) +
    fields.reduce((sum, field) => sum + field.name.length + field.value.length, 0) +
    (embed.footer?.text.length ?? 0) +
    (embed.author?.name.length ?? 0);

  pushIf(
    violations,
    total > EMBED_LIMITS.TOTAL,
    `total embed character count exceeds ${EMBED_LIMITS.TOTAL} characters (got ${total})`,
  );

  if (violations.length > 0) {
    throw new DiscordEmbedValidationError(violations);
  }

  const finalized: FinalizedEmbed = {
    ...(embed.title !== undefined ? { title: embed.title } : {}),
    ...(embed.description !== undefined ? { description: embed.description } : {}),
    ...(embed.url !== undefined ? { url: embed.url } : {}),
    ...(embed.color !== undefined ? { color: normalizeColor(embed.color) } : {}),
    ...(embed.timestamp !== undefined ? { timestamp: normalizeTimestamp(embed.timestamp) } : {}),
    ...(embed.footer !== undefined ? { footer: embed.footer } : {}),
    ...(embed.image !== undefined ? { image: embed.image } : {}),
    ...(embed.thumbnail !== undefined ? { thumbnail: embed.thumbnail } : {}),
    ...(embed.author !== undefined ? { author: embed.author } : {}),
    ...(fields.length > 0 ? { fields } : {}),
    __finalized: true,
  };

  return finalized;
}

/**
 * Fluent builder for a Discord embed. Every setter just stores the raw
 * value; all of Discord's documented limits are enforced only once, when
 * {@link EmbedBuilder.build} is called - at that point violations throw a
 * {@link DiscordEmbedValidationError} naming exactly which limit(s) were
 * exceeded.
 */
export class EmbedBuilder {
  private readonly draft: DiscordEmbedInput = {};

  setTitle(title: string): this {
    this.draft.title = title;
    return this;
  }

  setDescription(description: string): this {
    this.draft.description = description;
    return this;
  }

  setUrl(url: string): this {
    this.draft.url = url;
    return this;
  }

  /** Accepts either a Discord integer color or a `"#RRGGBB"` hex string. */
  setColor(color: number | string): this {
    this.draft.color = color;
    return this;
  }

  addField(field: DiscordEmbedField): this {
    this.draft.fields = [...(this.draft.fields ?? []), field];
    return this;
  }

  setFields(fields: DiscordEmbedField[]): this {
    this.draft.fields = fields;
    return this;
  }

  setFooter(footer: { text: string; icon_url?: string }): this {
    this.draft.footer = footer;
    return this;
  }

  setImage(url: string): this {
    this.draft.image = { url };
    return this;
  }

  setThumbnail(url: string): this {
    this.draft.thumbnail = { url };
    return this;
  }

  setAuthor(author: { name: string; url?: string; icon_url?: string }): this {
    this.draft.author = author;
    return this;
  }

  /** Accepts a `Date` or an ISO 8601 string; always serialized to ISO 8601 on build. */
  setTimestamp(timestamp: Date | string = new Date()): this {
    this.draft.timestamp = timestamp;
    return this;
  }

  /** Validates and finalizes the embed. Throws {@link DiscordEmbedValidationError} on any limit violation. */
  build(): FinalizedEmbed {
    return finalizeEmbed(this.draft);
  }
}
