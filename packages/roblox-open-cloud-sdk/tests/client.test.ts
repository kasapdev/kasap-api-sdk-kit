import { afterEach, describe, expect, it, vi } from "vitest";

import { RobloxOpenCloudClient } from "../src/client.js";
import {
  RobloxConfigError,
  RobloxForbiddenError,
  RobloxHttpError,
  RobloxNetworkError,
  RobloxNotFoundError,
  RobloxRateLimitError,
  RobloxTimeoutError,
  RobloxUnauthorizedError,
} from "../src/errors.js";

const API_KEY = "test-api-key";

/** Builds a minimal fake `Response` for a mocked `fetch`, with a `.headers.get()` backed by a plain record. */
function fakeResponse(status: number, body?: unknown, headers: Record<string, string> = {}): Response {
  const text = body === undefined ? "" : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "Error",
    headers: { get: (name: string) => headers[name] ?? null },
    text: async () => text,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RobloxOpenCloudClient constructor", () => {
  it("throws RobloxConfigError when no API key is available from options or env", () => {
    const original = process.env["ROBLOX_OPEN_CLOUD_API_KEY"];
    delete process.env["ROBLOX_OPEN_CLOUD_API_KEY"];
    try {
      expect(() => new RobloxOpenCloudClient()).toThrow(RobloxConfigError);
    } finally {
      if (original !== undefined) {
        process.env["ROBLOX_OPEN_CLOUD_API_KEY"] = original;
      }
    }
  });

  it("uses the API key from the environment variable when options.apiKey is omitted", async () => {
    const original = process.env["ROBLOX_OPEN_CLOUD_API_KEY"];
    process.env["ROBLOX_OPEN_CLOUD_API_KEY"] = "env-api-key";
    try {
      const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, entryBody()));
      vi.stubGlobal("fetch", fetchMock);

      const client = new RobloxOpenCloudClient();
      await client.getEntry({ universeId: "1", dataStoreId: "store", entryId: "e1" });

      const [, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      const headers = calledInit.headers as Record<string, string>;
      expect(headers["x-api-key"]).toBe("env-api-key");
    } finally {
      if (original !== undefined) {
        process.env["ROBLOX_OPEN_CLOUD_API_KEY"] = original;
      } else {
        delete process.env["ROBLOX_OPEN_CLOUD_API_KEY"];
      }
    }
  });
});

function entryBody(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    path: "universes/1/data-stores/store/entries/e1",
    state: "ACTIVE",
    etag: "etag-1",
    createTime: "2024-01-01T00:00:00Z",
    revisionId: "rev-1",
    revisionCreateTime: "2024-01-01T00:00:00Z",
    value: { coins: 100 },
    ...overrides,
  };
}

describe("RobloxOpenCloudClient.getEntry", () => {
  it("parses a successful response into the typed shape, with a generic value", async () => {
    interface PlayerData {
      coins: number;
    }
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, entryBody({ value: { coins: 42 } })));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY });
    const result = await client.getEntry<PlayerData>({
      universeId: "1",
      dataStoreId: "store",
      entryId: "e1",
    });

    expect(result).toEqual({
      path: "universes/1/data-stores/store/entries/e1",
      state: "ACTIVE",
      etag: "etag-1",
      createTime: "2024-01-01T00:00:00Z",
      revisionId: "rev-1",
      revisionCreateTime: "2024-01-01T00:00:00Z",
      value: { coins: 42 },
    });
    expect(result.value.coins).toBe(42);

    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(
      "https://apis.roblox.com/cloud/v2/universes/1/data-stores/store/entries/e1",
    );
    expect(calledInit.method).toBe("GET");
  });

  it("includes the scope query parameter when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, entryBody()));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY });
    await client.getEntry({ universeId: "1", dataStoreId: "store", entryId: "e1", scope: "custom" });

    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain("scope=custom");
  });

  it("sends the x-api-key header with the configured key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, entryBody()));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY });
    await client.getEntry({ universeId: "1", dataStoreId: "store", entryId: "e1" });

    const [, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = calledInit.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe(API_KEY);
  });
});

describe("RobloxOpenCloudClient.setEntry", () => {
  it("sends the correct JSON body, path, and method, and parses the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, entryBody({ value: { coins: 200 } })));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY });
    const result = await client.setEntry({
      universeId: "1",
      dataStoreId: "store",
      entryId: "e1",
      value: { coins: 200 },
    });

    expect(result.value).toEqual({ coins: 200 });

    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(
      "https://apis.roblox.com/cloud/v2/universes/1/data-stores/store/entries/e1",
    );
    expect(calledInit.method).toBe("POST");
    expect(calledInit.body).toBe(JSON.stringify({ value: { coins: 200 } }));
  });

  it("sends an If-Match header when etagMatch is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, entryBody()));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY });
    await client.setEntry({
      universeId: "1",
      dataStoreId: "store",
      entryId: "e1",
      value: { coins: 1 },
      etagMatch: "etag-1",
    });

    const [, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = calledInit.headers as Record<string, string>;
    expect(headers["If-Match"]).toBe("etag-1");
  });
});

describe("RobloxOpenCloudClient.listEntries", () => {
  it("builds correct query params and parses nextPageToken", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse(200, {
        dataStoreEntries: [
          { path: "universes/1/data-stores/store/entries/a", id: "a" },
          { path: "universes/1/data-stores/store/entries/b", id: "b" },
        ],
        nextPageToken: "next-token",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY });
    const result = await client.listEntries({
      universeId: "1",
      dataStoreId: "store",
      maxPageSize: 50,
      pageToken: "prev-token",
      prefix: "player-",
    });

    expect(result.entries).toEqual([
      { path: "universes/1/data-stores/store/entries/a", id: "a" },
      { path: "universes/1/data-stores/store/entries/b", id: "b" },
    ]);
    expect(result.nextPageToken).toBe("next-token");

    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain("universes/1/data-stores/store/entries");
    expect(calledUrl).toContain("maxPageSize=50");
    expect(calledUrl).toContain("pageToken=prev-token");
    expect(calledUrl).toContain("prefix=player-");
  });

  it("returns an empty array and undefined nextPageToken when the response omits them", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY });
    const result = await client.listEntries({ universeId: "1", dataStoreId: "store" });

    expect(result.entries).toEqual([]);
    expect(result.nextPageToken).toBeUndefined();
  });
});

describe("RobloxOpenCloudClient.deleteEntry", () => {
  it("sends DELETE and resolves with no return value on 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY });
    const result = await client.deleteEntry({ universeId: "1", dataStoreId: "store", entryId: "e1" });

    expect(result).toBeUndefined();
    const [, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledInit.method).toBe("DELETE");
  });

  it("sends DELETE and resolves with no return value on 204 (empty body)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(204, undefined));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY });
    const result = await client.deleteEntry({ universeId: "1", dataStoreId: "store", entryId: "e1" });

    expect(result).toBeUndefined();
  });
});

describe("RobloxOpenCloudClient.publishMessage", () => {
  it("JSON-stringifies an object message automatically", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY });
    await client.publishMessage({ universeId: "1", topic: "chat", message: { type: "greeting", text: "hi" } });

    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe("https://apis.roblox.com/cloud/v2/universes/1/messaging-service/chat:publish");
    expect(calledInit.body).toBe(
      JSON.stringify({ message: JSON.stringify({ type: "greeting", text: "hi" }) }),
    );
  });

  it("sends a plain string message as-is", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY });
    await client.publishMessage({ universeId: "1", topic: "chat", message: "hello world" });

    const [, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledInit.body).toBe(JSON.stringify({ message: "hello world" }));
  });
});

describe("RobloxOpenCloudClient error mapping", () => {
  it("throws RobloxUnauthorizedError on 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(401, { message: "invalid key" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY });
    await expect(
      client.getEntry({ universeId: "1", dataStoreId: "store", entryId: "e1" }),
    ).rejects.toBeInstanceOf(RobloxUnauthorizedError);
  });

  it("throws RobloxForbiddenError on 403", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(403, { message: "missing scope" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY });
    await expect(
      client.getEntry({ universeId: "1", dataStoreId: "store", entryId: "e1" }),
    ).rejects.toBeInstanceOf(RobloxForbiddenError);
  });

  it("throws RobloxNotFoundError on 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(404, { message: "not found" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY });
    await expect(
      client.getEntry({ universeId: "1", dataStoreId: "store", entryId: "e1" }),
    ).rejects.toBeInstanceOf(RobloxNotFoundError);
  });

  it("throws RobloxRateLimitError on 429 and parses retryAfter from the Retry-After header", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(fakeResponse(429, { message: "too many requests" }, { "Retry-After": "30" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY });
    let caught: unknown;
    try {
      await client.getEntry({ universeId: "1", dataStoreId: "store", entryId: "e1" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RobloxRateLimitError);
    expect((caught as RobloxRateLimitError).retryAfter).toBe(30);
  });

  it("omits retryAfter on 429 when the Retry-After header is absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(429, { message: "too many requests" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY });
    let caught: unknown;
    try {
      await client.getEntry({ universeId: "1", dataStoreId: "store", entryId: "e1" });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RobloxRateLimitError);
    expect((caught as RobloxRateLimitError).retryAfter).toBeUndefined();
  });

  it("throws generic RobloxHttpError on other non-2xx statuses (e.g. 500)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(500, { message: "internal error" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY });
    await expect(
      client.getEntry({ universeId: "1", dataStoreId: "store", entryId: "e1" }),
    ).rejects.toBeInstanceOf(RobloxHttpError);
  });

  it("throws RobloxTimeoutError when the fetch is aborted", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY, timeoutMs: 5 });
    await expect(
      client.getEntry({ universeId: "1", dataStoreId: "store", entryId: "e1" }),
    ).rejects.toBeInstanceOf(RobloxTimeoutError);
  });

  it("throws RobloxNetworkError when fetch rejects with a generic error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    vi.stubGlobal("fetch", fetchMock);

    const client = new RobloxOpenCloudClient({ apiKey: API_KEY });
    await expect(
      client.getEntry({ universeId: "1", dataStoreId: "store", entryId: "e1" }),
    ).rejects.toBeInstanceOf(RobloxNetworkError);
  });
});
