import { describe, expect, it } from "vitest";
import { EmbedBuilder, hexColorToInt } from "../src/embed.js";
import { DiscordEmbedValidationError } from "../src/errors.js";

describe("EmbedBuilder", () => {
  it("builds a valid embed successfully", () => {
    const embed = new EmbedBuilder()
      .setTitle("Deploy finished")
      .setDescription("Everything went smoothly.")
      .setColor("#5865F2")
      .addField({ name: "Environment", value: "production", inline: true })
      .addField({ name: "Duration", value: "42s", inline: true })
      .setFooter({ text: "kasap-api-sdk-kit" })
      .setTimestamp(new Date("2026-01-01T00:00:00.000Z"))
      .build();

    expect(embed.title).toBe("Deploy finished");
    expect(embed.description).toBe("Everything went smoothly.");
    expect(embed.color).toBe(0x5865f2);
    expect(embed.fields).toHaveLength(2);
    expect(embed.footer).toEqual({ text: "kasap-api-sdk-kit" });
    expect(embed.timestamp).toBe("2026-01-01T00:00:00.000Z");
    expect(embed.__finalized).toBe(true);
  });

  it("throws DiscordEmbedValidationError when title exceeds 256 characters", () => {
    const builder = new EmbedBuilder().setTitle("a".repeat(257));

    expect(() => builder.build()).toThrow(DiscordEmbedValidationError);
    expect(() => builder.build()).toThrow(/title exceeds 256 characters/);
  });

  it("throws DiscordEmbedValidationError when there are more than 25 fields", () => {
    const builder = new EmbedBuilder();
    for (let i = 0; i < 26; i++) {
      builder.addField({ name: `field-${i}`, value: "value" });
    }

    expect(() => builder.build()).toThrow(DiscordEmbedValidationError);
    expect(() => builder.build()).toThrow(/fields exceeds 25 entries/);
  });

  it("throws DiscordEmbedValidationError when a field value exceeds 1024 characters", () => {
    const builder = new EmbedBuilder().addField({ name: "big", value: "x".repeat(1025) });

    expect(() => builder.build()).toThrow(DiscordEmbedValidationError);
    expect(() => builder.build()).toThrow(/fields\[0\]\.value exceeds 1024 characters/);
  });

  it("throws DiscordEmbedValidationError when the total 6000 character budget is exceeded, even though no single field alone exceeds its own limit", () => {
    const builder = new EmbedBuilder()
      .setTitle("t".repeat(256))
      .setDescription("d".repeat(4096))
      .setFooter({ text: "f".repeat(2048) });
    // 256 + 4096 + 2048 = 6400 > 6000, but each field is individually within its own limit.

    expect(() => builder.build()).toThrow(DiscordEmbedValidationError);
    expect(() => builder.build()).toThrow(/total embed character count exceeds 6000 characters/);
  });

  it("accumulates multiple violations in one thrown error", () => {
    const builder = new EmbedBuilder().setTitle("a".repeat(300));
    for (let i = 0; i < 26; i++) {
      builder.addField({ name: `field-${i}`, value: "value" });
    }

    try {
      builder.build();
      expect.fail("expected build() to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(DiscordEmbedValidationError);
      const validationError = error as DiscordEmbedValidationError;
      expect(validationError.violations.length).toBeGreaterThanOrEqual(2);
      expect(validationError.violations.some((v) => v.includes("title exceeds"))).toBe(true);
      expect(validationError.violations.some((v) => v.includes("fields exceeds"))).toBe(true);
    }
  });

  it("does not throw when title is exactly at the 256-character limit", () => {
    const builder = new EmbedBuilder().setTitle("a".repeat(256));

    expect(() => builder.build()).not.toThrow();
    expect(builder.build().title).toHaveLength(256);
  });

  it("throws DiscordEmbedValidationError when a field name exceeds 256 characters", () => {
    const builder = new EmbedBuilder().addField({ name: "n".repeat(257), value: "value" });

    expect(() => builder.build()).toThrow(DiscordEmbedValidationError);
    expect(() => builder.build()).toThrow(/fields\[0\]\.name exceeds 256 characters/);
  });

  it("passes an already-numeric color through unchanged", () => {
    const embed = new EmbedBuilder().setColor(0x5865f2).build();

    expect(embed.color).toBe(0x5865f2);
  });

  it("converts a hex color string to Discord's integer color format", () => {
    expect(hexColorToInt("#5865F2")).toBe(5793266);
    expect(hexColorToInt("5865F2")).toBe(5793266);
    expect(hexColorToInt("#000000")).toBe(0);
    expect(hexColorToInt("#FFFFFF")).toBe(16777215);
  });

  it("throws a plain Error for an invalid hex color", () => {
    expect(() => hexColorToInt("not-a-color")).toThrow(/Invalid hex color/);
  });
});
