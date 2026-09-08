import { describe, expect, it } from "vitest";

import { TtlCache } from "../src/cache.js";

describe("TtlCache", () => {
  it("returns undefined for a key that was never set", () => {
    const cache = new TtlCache<string>({ ttlMs: 1000 });
    expect(cache.get("missing")).toBeUndefined();
  });

  it("returns a stored value while it is still within its TTL", () => {
    let currentTime = 0;
    const cache = new TtlCache<string>({ ttlMs: 1000, now: () => currentTime });

    cache.set("k", "v");
    currentTime = 999;
    expect(cache.get("k")).toBe("v");
  });

  it("expires a stored value exactly at the TTL boundary (now === expiresAt is expired)", () => {
    let currentTime = 0;
    const cache = new TtlCache<string>({ ttlMs: 1000, now: () => currentTime });

    cache.set("k", "v");
    currentTime = 1000; // set at t=0, ttlMs=1000 => expiresAt=1000
    expect(cache.get("k")).toBeUndefined();
  });

  it("returns a live value one millisecond before the TTL boundary", () => {
    let currentTime = 0;
    const cache = new TtlCache<string>({ ttlMs: 1000, now: () => currentTime });

    cache.set("k", "v");
    currentTime = 999;
    expect(cache.get("k")).toBe("v");
  });

  it("evicts an expired entry as a side effect of get(), reducing size", () => {
    let currentTime = 0;
    const cache = new TtlCache<string>({ ttlMs: 1000, now: () => currentTime });

    cache.set("k", "v");
    expect(cache.size).toBe(1);
    currentTime = 5000;
    expect(cache.get("k")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("never stores anything when ttlMs is 0", () => {
    const cache = new TtlCache<string>({ ttlMs: 0 });
    cache.set("k", "v");
    expect(cache.get("k")).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("never stores anything when ttlMs is negative", () => {
    const cache = new TtlCache<string>({ ttlMs: -100 });
    cache.set("k", "v");
    expect(cache.get("k")).toBeUndefined();
  });

  it("clear() removes every stored entry", () => {
    const cache = new TtlCache<string>({ ttlMs: 1000 });
    cache.set("a", "1");
    cache.set("b", "2");
    expect(cache.size).toBe(2);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBeUndefined();
  });

  describe("wrap()", () => {
    it("calls fetcher on a miss and caches the resolved value", async () => {
      const cache = new TtlCache<string>({ ttlMs: 1000 });
      let calls = 0;
      const fetcher = async () => {
        calls += 1;
        return `value-${calls}`;
      };

      const result1 = await cache.wrap("k", fetcher);
      const result2 = await cache.wrap("k", fetcher);

      expect(result1).toBe("value-1");
      expect(result2).toBe("value-1");
      expect(calls).toBe(1);
    });

    it("calls fetcher again once the cached entry expires", async () => {
      let currentTime = 0;
      const cache = new TtlCache<string>({ ttlMs: 1000, now: () => currentTime });
      let calls = 0;
      const fetcher = async () => {
        calls += 1;
        return `value-${calls}`;
      };

      const result1 = await cache.wrap("k", fetcher);
      currentTime = 1000;
      const result2 = await cache.wrap("k", fetcher);

      expect(result1).toBe("value-1");
      expect(result2).toBe("value-2");
      expect(calls).toBe(2);
    });

    it("de-duplicates concurrent calls for the same key into a single fetcher invocation (single-flight)", async () => {
      const cache = new TtlCache<string>({ ttlMs: 1000 });
      let resolveFetch!: (value: string) => void;
      let calls = 0;
      const fetcher = () => {
        calls += 1;
        return new Promise<string>((resolve) => {
          resolveFetch = resolve;
        });
      };

      const p1 = cache.wrap("k", fetcher);
      const p2 = cache.wrap("k", fetcher);
      const p3 = cache.wrap("k", fetcher);

      resolveFetch("shared-value");
      const results = await Promise.all([p1, p2, p3]);

      expect(results).toEqual(["shared-value", "shared-value", "shared-value"]);
      expect(calls).toBe(1);
    });

    it("does not cache a rejected fetcher call, and retries on the next wrap()", async () => {
      const cache = new TtlCache<string>({ ttlMs: 1000 });
      let calls = 0;
      const fetcher = async () => {
        calls += 1;
        if (calls === 1) {
          throw new Error("boom");
        }
        return "recovered";
      };

      await expect(cache.wrap("k", fetcher)).rejects.toThrow("boom");
      const result = await cache.wrap("k", fetcher);

      expect(result).toBe("recovered");
      expect(calls).toBe(2);
    });

    it("still de-duplicates concurrent in-flight calls when ttlMs is 0 (storage disabled, single-flight retained)", async () => {
      const cache = new TtlCache<string>({ ttlMs: 0 });
      let resolveFetch!: (value: string) => void;
      let calls = 0;
      const fetcher = () => {
        calls += 1;
        return new Promise<string>((resolve) => {
          resolveFetch = resolve;
        });
      };

      const p1 = cache.wrap("k", fetcher);
      const p2 = cache.wrap("k", fetcher);
      resolveFetch("v");
      await Promise.all([p1, p2]);
      expect(calls).toBe(1);

      // Once the first pair has settled and nothing is stored (ttlMs=0), a
      // fresh (non-overlapping) call must hit the fetcher again.
      const result3 = await cache.wrap("k", async () => {
        calls += 1;
        return "v2";
      });
      expect(result3).toBe("v2");
      expect(calls).toBe(2);
    });

    it("keeps different keys independent", async () => {
      const cache = new TtlCache<string>({ ttlMs: 1000 });
      const resultA = await cache.wrap("a", async () => "value-a");
      const resultB = await cache.wrap("b", async () => "value-b");

      expect(resultA).toBe("value-a");
      expect(resultB).toBe("value-b");
    });
  });
});
