import { afterEach, describe, expect, it, vi } from "vitest";

import { SteamMarketClient } from "../src/client.js";
import {
  SteamMarketHttpError,
  SteamMarketNetworkError,
  SteamMarketNotFoundError,
  SteamMarketTimeoutError,
} from "../src/errors.js";

/** Builds a minimal fake `Response` for a mocked `fetch`. */
function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SteamMarketClient.getPriceOverview", () => {
  it("parses a successful response with both lowest_price and median_price", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse(200, {
        success: true,
        lowest_price: "$1.23 USD",
        median_price: "$1.19 USD",
        volume: "1,234",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient();
    const result = await client.getPriceOverview({
      appId: 730,
      marketHashName: "AK-47 | Redline (Field-Tested)",
    });

    expect(result).toEqual({
      success: true,
      lowestPrice: "$1.23 USD",
      medianPrice: "$1.19 USD",
      volume: "1,234",
    });
  });

  it("parses a successful response when only lowest_price is present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse(200, {
        success: true,
        lowest_price: "$5.00 USD",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient();
    const result = await client.getPriceOverview({
      appId: 730,
      marketHashName: "P250 | Sand Dune",
    });

    expect(result.lowestPrice).toBe("$5.00 USD");
    expect(result.medianPrice).toBeUndefined();
    expect(result.volume).toBeUndefined();
  });

  it("parses a successful response when only median_price is present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse(200, {
        success: true,
        median_price: "$0.50 USD",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient();
    const result = await client.getPriceOverview({
      appId: 730,
      marketHashName: "Glock-18 | Sand Dune",
    });

    expect(result.medianPrice).toBe("$0.50 USD");
    expect(result.lowestPrice).toBeUndefined();
    expect(result.volume).toBeUndefined();
  });

  it("throws SteamMarketNotFoundError when Steam responds with success: false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { success: false }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient();

    await expect(
      client.getPriceOverview({ appId: 1, marketHashName: "Nonexistent Item" }),
    ).rejects.toBeInstanceOf(SteamMarketNotFoundError);
  });

  it("throws SteamMarketHttpError on a non-2xx HTTP status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(500, {}));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient();

    await expect(
      client.getPriceOverview({ appId: 730, marketHashName: "AK-47 | Redline (Field-Tested)" }),
    ).rejects.toBeInstanceOf(SteamMarketHttpError);
  });

  it("throws SteamMarketTimeoutError when the request aborts", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient({ timeoutMs: 5 });

    await expect(
      client.getPriceOverview({ appId: 730, marketHashName: "AK-47 | Redline (Field-Tested)" }),
    ).rejects.toBeInstanceOf(SteamMarketTimeoutError);
  });

  it("throws SteamMarketNetworkError when fetch rejects with a generic error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient();

    await expect(
      client.getPriceOverview({ appId: 730, marketHashName: "AK-47 | Redline (Field-Tested)" }),
    ).rejects.toBeInstanceOf(SteamMarketNetworkError);
  });

  it("percent-encodes the market_hash_name query parameter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { success: true, lowest_price: "$1.00 USD" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient();
    await client.getPriceOverview({ appId: 730, marketHashName: "AK-47 | Redline (Field-Tested)" });

    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain(encodeURIComponent("AK-47 | Redline (Field-Tested)"));
    expect(calledUrl).toContain("%20");
    expect(calledUrl).toContain("%7C");
    expect(calledUrl).not.toContain(" ");
  });

  it("defaults the currency query parameter to 1 (USD) when omitted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { success: true, lowest_price: "$1.00 USD" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient();
    await client.getPriceOverview({ appId: 730, marketHashName: "Item" });

    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("&currency=1");
  });

  it("throws SteamMarketHttpError carrying the real status/statusText/endpoint (not just an instanceof match)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(503, {}));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient({ baseUrl: "https://example.test/market" });

    try {
      await client.getPriceOverview({ appId: 730, marketHashName: "Item" });
      expect.unreachable("expected getPriceOverview to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SteamMarketHttpError);
      const httpError = error as SteamMarketHttpError;
      expect(httpError.status).toBe(503);
      expect(httpError.statusText).toBe("Error");
      expect(httpError.endpoint).toContain("https://example.test/market/priceoverview/");
      expect(httpError.context).toEqual({ status: 503, statusText: "Error" });
    }
  });

  it("throws SteamMarketNotFoundError carrying the raw Steam payload in .context", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { success: false }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient();

    try {
      await client.getPriceOverview({ appId: 730, marketHashName: "Item", currency: 3 });
      expect.unreachable("expected getPriceOverview to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(SteamMarketNotFoundError);
      const notFoundError = error as SteamMarketNotFoundError;
      expect(notFoundError.context).toMatchObject({
        appId: 730,
        marketHashName: "Item",
        currency: 3,
        raw: { success: false },
      });
    }
  });
});

describe("SteamMarketClient.getPriceHistory", () => {
  it("sends the Cookie header and maps raw tuples into typed points", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse(200, {
        success: true,
        price_history: [
          ["Dec 01 2018 01: +0", 1.23, "5"],
          ["Dec 02 2018 01: +0", 1.5, "10"],
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient();
    const result = await client.getPriceHistory({
      appId: 730,
      marketHashName: "AK-47 | Redline (Field-Tested)",
      cookie: "abc123sessiontoken",
    });

    expect(result.points).toEqual([
      { date: "Dec 01 2018 01: +0", price: 1.23, volume: "5" },
      { date: "Dec 02 2018 01: +0", price: 1.5, volume: "10" },
    ]);

    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain(encodeURIComponent("AK-47 | Redline (Field-Tested)"));
    expect(calledUrl).toContain("%20");
    expect(calledUrl).toContain("%7C");
    const headers = calledInit.headers as Record<string, string>;
    expect(headers["Cookie"]).toBe("steamLoginSecure=abc123sessiontoken");
  });

  it("returns an empty points array when success is true but price_history is omitted", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { success: true }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient();
    const result = await client.getPriceHistory({
      appId: 730,
      marketHashName: "AK-47 | Redline (Field-Tested)",
      cookie: "abc123sessiontoken",
    });

    expect(result.points).toEqual([]);
  });

  it("throws with a cookie/login-related message when Steam responds with success: false", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { success: false }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient();

    await expect(
      client.getPriceHistory({
        appId: 730,
        marketHashName: "AK-47 | Redline (Field-Tested)",
        cookie: "expired-or-invalid",
      }),
    ).rejects.toThrow(/cookie/i);

    await expect(
      client.getPriceHistory({
        appId: 730,
        marketHashName: "AK-47 | Redline (Field-Tested)",
        cookie: "expired-or-invalid",
      }),
    ).rejects.toBeInstanceOf(SteamMarketNotFoundError);
  });
});

describe("SteamMarketClient caching (cacheTtlMs)", () => {
  it("does not cache by default (cacheTtlMs omitted): every call hits the network", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { success: true, lowest_price: "$1.00 USD" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient();
    await client.getPriceOverview({ appId: 730, marketHashName: "Item" });
    await client.getPriceOverview({ appId: 730, marketHashName: "Item" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reuses a cached getPriceOverview response within the TTL window (cache hit)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { success: true, lowest_price: "$1.00 USD" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient({ cacheTtlMs: 60_000 });
    const result1 = await client.getPriceOverview({ appId: 730, marketHashName: "Item" });
    const result2 = await client.getPriceOverview({ appId: 730, marketHashName: "Item" });

    expect(result1).toEqual(result2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats different params as different cache keys (currency changes the key)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { success: true, lowest_price: "$1.00 USD" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient({ cacheTtlMs: 60_000 });
    await client.getPriceOverview({ appId: 730, marketHashName: "Item", currency: 1 });
    await client.getPriceOverview({ appId: 730, marketHashName: "Item", currency: 3 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refetches once a cached entry passes its TTL (cache expiry)", async () => {
    let currentTime = 0;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(200, { success: true, lowest_price: "$1.00 USD" }))
      .mockResolvedValueOnce(fakeResponse(200, { success: true, lowest_price: "$2.00 USD" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient({ cacheTtlMs: 1000, now: () => currentTime });
    const result1 = await client.getPriceOverview({ appId: 730, marketHashName: "Item" });
    currentTime = 1000;
    const result2 = await client.getPriceOverview({ appId: 730, marketHashName: "Item" });

    expect(result1.lowestPrice).toBe("$1.00 USD");
    expect(result2.lowestPrice).toBe("$2.00 USD");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("de-duplicates concurrent identical getPriceOverview calls into a single network request", async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient({ cacheTtlMs: 60_000 });
    const p1 = client.getPriceOverview({ appId: 730, marketHashName: "Item" });
    const p2 = client.getPriceOverview({ appId: 730, marketHashName: "Item" });

    resolveFetch(fakeResponse(200, { success: true, lowest_price: "$1.00 USD" }));
    const [result1, result2] = await Promise.all([p1, p2]);

    expect(result1).toEqual(result2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not cache a SteamMarketNotFoundError: the next call retries the network", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(200, { success: false }))
      .mockResolvedValueOnce(fakeResponse(200, { success: true, lowest_price: "$1.00 USD" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient({ cacheTtlMs: 60_000 });

    await expect(
      client.getPriceOverview({ appId: 730, marketHashName: "Item" }),
    ).rejects.toBeInstanceOf(SteamMarketNotFoundError);
    const result = await client.getPriceOverview({ appId: 730, marketHashName: "Item" });

    expect(result.lowestPrice).toBe("$1.00 USD");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("with cacheTtlMs: 0, storage is disabled so every non-overlapping call still hits the network", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { success: true, lowest_price: "$1.00 USD" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient({ cacheTtlMs: 0 });
    await client.getPriceOverview({ appId: 730, marketHashName: "Item" });
    await client.getPriceOverview({ appId: 730, marketHashName: "Item" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clearCache() forces the next call to hit the network again", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { success: true, lowest_price: "$1.00 USD" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient({ cacheTtlMs: 60_000 });
    await client.getPriceOverview({ appId: 730, marketHashName: "Item" });
    client.clearCache();
    await client.getPriceOverview({ appId: 730, marketHashName: "Item" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clearCache() is a harmless no-op when caching was never enabled", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { success: true, lowest_price: "$1.00 USD" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient();
    expect(() => client.clearCache()).not.toThrow();
    await client.getPriceOverview({ appId: 730, marketHashName: "Item" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches getPriceHistory by appId/marketHashName/cookie, and treats a different cookie as a different key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse(200, { success: true, price_history: [["Dec 01 2018 01: +0", 1.23, "5"]] }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new SteamMarketClient({ cacheTtlMs: 60_000 });
    await client.getPriceHistory({ appId: 730, marketHashName: "Item", cookie: "session-a" });
    await client.getPriceHistory({ appId: 730, marketHashName: "Item", cookie: "session-a" });
    await client.getPriceHistory({ appId: 730, marketHashName: "Item", cookie: "session-b" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
