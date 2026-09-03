import { afterEach, describe, expect, it, vi } from "vitest";
import { TwitchClipClient } from "../src/client.js";
import { TwitchHttpError, TwitchNetworkError, TwitchTimeoutError } from "../src/errors.js";
import type { TwitchClip, TwitchTokenProvider, TwitchVideo } from "../src/types.js";

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

/** A `TwitchTokenProvider` test double that hands out a fixed sequence of tokens, in order. */
function fakeTokenProvider(...tokens: string[]): TwitchTokenProvider & { getToken: ReturnType<typeof vi.fn> } {
  const getToken = vi.fn();
  for (const token of tokens) {
    getToken.mockResolvedValueOnce(token);
  }
  const lastToken = tokens[tokens.length - 1] ?? "";
  getToken.mockResolvedValue(lastToken);
  return { getToken, invalidate: vi.fn() };
}

function sampleClip(id = "clip-1"): TwitchClip {
  return {
    id,
    url: `https://clips.twitch.tv/${id}`,
    embed_url: `https://clips.twitch.tv/embed?clip=${id}`,
    broadcaster_id: "123",
    broadcaster_name: "SomeStreamer",
    creator_id: "456",
    creator_name: "SomeViewer",
    video_id: "789",
    game_id: "509658",
    language: "en",
    title: "Great play",
    view_count: 42,
    created_at: "2024-01-01T00:00:00Z",
    thumbnail_url: `https://clips-media.twitch.tv/${id}.jpg`,
    duration: 30,
    vod_offset: 120,
  };
}

function sampleVideo(id = "video-1"): TwitchVideo {
  return {
    id,
    stream_id: "999",
    user_id: "123",
    user_login: "somestreamer",
    user_name: "SomeStreamer",
    title: "Full stream VOD",
    description: "",
    created_at: "2024-01-01T00:00:00Z",
    published_at: "2024-01-01T00:05:00Z",
    url: `https://www.twitch.tv/videos/${id}`,
    thumbnail_url: `https://static-cdn.jtvnw.net/${id}-%{width}x%{height}.jpg`,
    viewable: "public",
    view_count: 1000,
    language: "en",
    type: "archive",
    duration: "3h2m1s",
    muted_segments: null,
  };
}

function headersOf(call: unknown[]): Record<string, string> {
  const init = call[1] as RequestInit;
  return init.headers as Record<string, string>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TwitchClipClient.searchClips", () => {
  it("sends the correct URL, query params, and headers, and parses data/cursor", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      fakeResponse(200, {
        data: [sampleClip()],
        pagination: { cursor: "cursor-1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const tokenProvider = fakeTokenProvider("token-abc");
    const client = new TwitchClipClient({ clientId: "client-1", tokenProvider });

    const result = await client.searchClips({ broadcasterId: "123", first: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0] as unknown[];
    const url = new URL(call[0] as string);
    expect(url.origin + url.pathname).toBe("https://api.twitch.tv/helix/clips");
    expect(url.searchParams.get("broadcaster_id")).toBe("123");
    expect(url.searchParams.get("first")).toBe("5");

    const headers = headersOf(call);
    expect(headers["Client-Id"]).toBe("client-1");
    expect(headers["Authorization"]).toBe("Bearer token-abc");

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe("clip-1");
    expect(result.cursor).toBe("cursor-1");
  });

  it("pages forward using the cursor returned from a previous call", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(200, { data: [sampleClip("clip-1")], pagination: { cursor: "cursor-1" } }))
      .mockResolvedValueOnce(fakeResponse(200, { data: [sampleClip("clip-2")], pagination: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const tokenProvider = fakeTokenProvider("token-abc");
    const client = new TwitchClipClient({ clientId: "client-1", tokenProvider });

    const page1 = await client.searchClips({ broadcasterId: "123" });
    expect(page1.cursor).toBe("cursor-1");

    const page2 = await client.searchClips({ broadcasterId: "123", after: page1.cursor });
    expect(page2.data[0]?.id).toBe("clip-2");
    expect(page2.cursor).toBeUndefined();

    const secondCall = fetchMock.mock.calls[1] as unknown[];
    const secondUrl = new URL(secondCall[0] as string);
    expect(secondUrl.searchParams.get("after")).toBe("cursor-1");
  });
});

describe("TwitchClipClient.getVideos", () => {
  it("sends the correct query params and parses the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { data: [sampleVideo()], pagination: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const tokenProvider = fakeTokenProvider("token-abc");
    const client = new TwitchClipClient({ clientId: "client-1", tokenProvider });

    const result = await client.getVideos({ userId: "999", type: "archive" });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe("video-1");
    expect(result.cursor).toBeUndefined();

    const call = fetchMock.mock.calls[0] as unknown[];
    const url = new URL(call[0] as string);
    expect(url.origin + url.pathname).toBe("https://api.twitch.tv/helix/videos");
    expect(url.searchParams.get("user_id")).toBe("999");
    expect(url.searchParams.get("type")).toBe("archive");
  });
});

describe("TwitchClipClient error handling", () => {
  it("force-refreshes the token and retries once on a 401, succeeding on retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(fakeResponse(401, { error: "Unauthorized", status: 401, message: "Invalid OAuth token" }))
      .mockResolvedValueOnce(fakeResponse(200, { data: [sampleClip()], pagination: {} }));
    vi.stubGlobal("fetch", fetchMock);

    const tokenProvider = fakeTokenProvider("token-old", "token-new");
    const client = new TwitchClipClient({ clientId: "client-1", tokenProvider });

    const result = await client.searchClips({ broadcasterId: "123" });

    expect(result.data).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tokenProvider.getToken).toHaveBeenCalledTimes(2);
    expect(tokenProvider.invalidate).toHaveBeenCalledTimes(1);

    const secondCall = fetchMock.mock.calls[1] as unknown[];
    expect(headersOf(secondCall)["Authorization"]).toBe("Bearer token-new");
  });

  it("throws TwitchHttpError on other non-2xx statuses", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(fakeResponse(500, { error: "Internal Server Error", status: 500, message: "oops" }));
    vi.stubGlobal("fetch", fetchMock);

    const tokenProvider = fakeTokenProvider("token-abc");
    const client = new TwitchClipClient({ clientId: "client-1", tokenProvider });

    await expect(client.searchClips({ broadcasterId: "123" })).rejects.toBeInstanceOf(TwitchHttpError);
    // Non-401 statuses are not retried.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws TwitchTimeoutError when the request is aborted", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const abortError = new Error("This operation was aborted");
          abortError.name = "AbortError";
          reject(abortError);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const tokenProvider = fakeTokenProvider("token-abc");
    const client = new TwitchClipClient({ clientId: "client-1", tokenProvider, timeoutMs: 5 });

    await expect(client.searchClips({ broadcasterId: "123" })).rejects.toBeInstanceOf(TwitchTimeoutError);
  });

  it("throws TwitchNetworkError on a generic fetch rejection", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND api.twitch.tv"));
    vi.stubGlobal("fetch", fetchMock);

    const tokenProvider = fakeTokenProvider("token-abc");
    const client = new TwitchClipClient({ clientId: "client-1", tokenProvider });

    await expect(client.searchClips({ broadcasterId: "123" })).rejects.toBeInstanceOf(TwitchNetworkError);
  });
});
