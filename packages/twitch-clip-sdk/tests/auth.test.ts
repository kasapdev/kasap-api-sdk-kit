import { afterEach, describe, expect, it, vi } from "vitest";
import { TOKEN_EXPIRY_SAFETY_MARGIN_MS, TwitchAppTokenProvider } from "../src/auth.js";
import { TwitchAuthError } from "../src/errors.js";

/** Builds a minimal `Response`-shaped object for mocking `fetch`. */
function fakeResponse(status: number, body: unknown): Response {
  const ok = status >= 200 && status < 300;
  return {
    ok,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as Response;
}

const originalEnv = { ...process.env };

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

describe("TwitchAppTokenProvider", () => {
  it("fetches and caches a token, reusing it on a second call within its validity window", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(fakeResponse(200, { access_token: "tok1", expires_in: 3600, token_type: "bearer" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new TwitchAppTokenProvider({ clientId: "id", clientSecret: "secret" });
    const token1 = await provider.getToken();
    const token2 = await provider.getToken();

    expect(token1).toBe("tok1");
    expect(token2).toBe("tok1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches once the cached token is past the expiry safety margin", async () => {
    let currentTime = 0;
    const now = () => currentTime;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(200, { access_token: "tok1", expires_in: 100, token_type: "bearer" }))
      .mockResolvedValueOnce(fakeResponse(200, { access_token: "tok2", expires_in: 100, token_type: "bearer" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new TwitchAppTokenProvider({ clientId: "id", clientSecret: "secret", now });

    const token1 = await provider.getToken();
    expect(token1).toBe("tok1");

    // Token expires at t=100_000ms. Advance to just inside the safety margin
    // (still technically not-yet-expired, but close enough that it should be
    // treated as unusable and refetched).
    currentTime = 100_000 - TOKEN_EXPIRY_SAFETY_MARGIN_MS + 1;
    const token2 = await provider.getToken();

    expect(token2).toBe("tok2");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shares a single in-flight fetch across concurrent getToken() calls (single-flight)", async () => {
    let resolveFetch!: (value: Response) => void;
    const fetchMock = vi.fn().mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new TwitchAppTokenProvider({ clientId: "id", clientSecret: "secret" });

    const p1 = provider.getToken();
    const p2 = provider.getToken();
    const p3 = provider.getToken();

    resolveFetch(fakeResponse(200, { access_token: "tok1", expires_in: 3600, token_type: "bearer" }));

    const results = await Promise.all([p1, p2, p3]);

    expect(results).toEqual(["tok1", "tok1", "tok1"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws TwitchAuthError when client_id/client_secret are both missing", async () => {
    delete process.env.TWITCH_CLIENT_ID;
    delete process.env.TWITCH_CLIENT_SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const provider = new TwitchAppTokenProvider({});

    await expect(provider.getToken()).rejects.toBeInstanceOf(TwitchAuthError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws TwitchAuthError on a non-2xx token response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(400, { message: "invalid client secret" }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new TwitchAppTokenProvider({ clientId: "id", clientSecret: "secret" });

    await expect(provider.getToken()).rejects.toBeInstanceOf(TwitchAuthError);
  });
});
