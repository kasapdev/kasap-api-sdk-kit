import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscordWebhookClient } from "../src/client.js";
import { EMBED_LIMITS } from "../src/embed.js";
import {
  DiscordEmbedValidationError,
  DiscordHttpError,
  DiscordNetworkError,
  DiscordRateLimitError,
  DiscordTimeoutError,
} from "../src/errors.js";
import type { FinalizedEmbed } from "../src/types.js";

function fakeResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `status-${status}`,
    json: async () => body,
    headers: {
      get: (name: string) => headers[name] ?? null,
    },
  } as unknown as Response;
}

function newClient(overrides: Partial<ConstructorParameters<typeof DiscordWebhookClient>[0]> = {}) {
  return new DiscordWebhookClient({
    id: "123456789",
    token: "webhook-token",
    maxRetries: 3,
    sleepFn: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as ConstructorParameters<typeof DiscordWebhookClient>[0]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DiscordWebhookClient", () => {
  it("sends a plain content-only message with the correct URL, method, JSON body, and headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(204, undefined));
    vi.stubGlobal("fetch", fetchMock);

    const client = newClient();
    const result = await client.send({ content: "hello world" });

    expect(result).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://discord.com/api/webhooks/123456789/webhook-token");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ content: "hello world" }));
  });

  it("appends ?wait=true and returns the parsed message when wait is requested", async () => {
    const createdMessage = { id: "999", content: "hi", channel_id: "1" };
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, createdMessage));
    vi.stubGlobal("fetch", fetchMock);

    const client = newClient();
    const result = await client.send({ content: "hi" }, { wait: true });

    expect(result).toEqual(createdMessage);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://discord.com/api/webhooks/123456789/webhook-token?wait=true");
  });

  it("sends a message with files as multipart/form-data with a payload_json part and a files[0] part", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(204, undefined));
    vi.stubGlobal("fetch", fetchMock);

    const client = newClient();
    await client.send({
      content: "see attached",
      files: [{ name: "report.txt", data: new TextEncoder().encode("hello file"), contentType: "text/plain" }],
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;

    expect(form.has("payload_json")).toBe(true);
    expect(form.get("payload_json")).toBe(JSON.stringify({ content: "see attached" }));

    expect(form.has("files[0]")).toBe(true);
    const filePart = form.get("files[0]") as File;
    expect(filePart.name).toBe("report.txt");
    expect(filePart.type).toBe("text/plain");

    // No explicit Content-Type header - fetch sets the multipart boundary itself.
    expect(init.headers).toEqual({});
  });

  it("waits retry_after on a 429 and retries, succeeding on the second attempt", async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        fakeResponse(
          429,
          { message: "You are being rate limited.", retry_after: 0.5, global: false },
          { "X-RateLimit-Reset-After": "0.5" },
        ),
      )
      .mockResolvedValueOnce(fakeResponse(204, undefined));
    vi.stubGlobal("fetch", fetchMock);

    const client = newClient({ sleepFn });
    await client.send({ content: "hi" });

    expect(sleepFn).toHaveBeenCalledTimes(1);
    expect(sleepFn).toHaveBeenCalledWith(500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws DiscordRateLimitError after exhausting maxRetries on repeated 429s", async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(fakeResponse(429, { message: "rate limited", retry_after: 1, global: false }));
    vi.stubGlobal("fetch", fetchMock);

    const client = newClient({ maxRetries: 2, sleepFn });
    await expect(client.send({ content: "hi" })).rejects.toThrow(DiscordRateLimitError);

    // initial attempt + 2 retries = 3 fetch calls, but only 2 sleeps (no sleep after the final failed attempt)
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledTimes(2);
  });

  it("throws DiscordHttpError immediately (no retry) on a non-429 4xx/5xx", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(400, { message: "Invalid payload", code: 50006 }));
    vi.stubGlobal("fetch", fetchMock);

    const client = newClient();
    await expect(client.send({ content: "hi" })).rejects.toThrow(DiscordHttpError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws DiscordTimeoutError when the request aborts", async () => {
    const abortError = Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    const client = newClient();
    await expect(client.send({ content: "hi" })).rejects.toThrow(DiscordTimeoutError);
  });

  it("throws DiscordNetworkError on a generic fetch rejection, without retrying", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND discord.com"));
    vi.stubGlobal("fetch", fetchMock);

    const client = newClient();
    await expect(client.send({ content: "hi" })).rejects.toThrow(DiscordNetworkError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws DiscordEmbedValidationError when the message contains more than 10 embeds, without making a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const client = newClient();
    const embeds = Array.from(
      { length: EMBED_LIMITS.EMBEDS_PER_MESSAGE + 1 },
      (): FinalizedEmbed => ({ __finalized: true }),
    );

    await expect(client.send({ embeds })).rejects.toThrow(DiscordEmbedValidationError);
    await expect(client.send({ embeds })).rejects.toThrow(/exceeding the max of 10 embeds/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a full webhook URL as an alternative to id + token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(204, undefined));
    vi.stubGlobal("fetch", fetchMock);

    const client = new DiscordWebhookClient({
      url: "https://discord.com/api/webhooks/111/aaa",
      sleepFn: vi.fn().mockResolvedValue(undefined),
    });
    await client.send({ content: "hi" });

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://discord.com/api/webhooks/111/aaa");
  });
});
