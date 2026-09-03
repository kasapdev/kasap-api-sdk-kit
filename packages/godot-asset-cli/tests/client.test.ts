import { afterEach, describe, expect, it, vi } from "vitest";

import { GodotAssetLibraryClient } from "../src/client.js";
import {
  GodotAssetLibraryHttpError,
  GodotAssetLibraryNetworkError,
  GodotAssetLibraryNotFoundError,
  GodotAssetLibraryTimeoutError,
} from "../src/errors.js";
import type { AssetDetail, AssetSummary, RawAssetSearchResponse } from "../src/types.js";

/** Builds a minimal fake `Response` for a mocked `fetch`. */
function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : status === 404 ? "Not Found" : "Error",
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const sampleSummary: AssetSummary = {
  asset_id: "4",
  title: "Terrain Editor",
  author: "Zylann",
  author_id: "12",
  category: "3D Tools",
  category_id: "2",
  godot_version: "2.1",
  rating: "0",
  cost: "MIT",
  support_level: "community",
  icon_url: "https://zylannprods.fr/lab/godot/terrain_plugin/assetlib_icon.png",
  version: "10",
  version_string: "0.4",
  modify_date: "2019-10-09 21:06:17",
};

describe("GodotAssetLibraryClient.searchAssets", () => {
  it("builds the correct query string, including omitting undefined optional params", async () => {
    const raw: RawAssetSearchResponse = {
      result: [sampleSummary],
      page: 0,
      pages: 1,
      page_length: 40,
      total_items: 1,
    };
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, raw));
    vi.stubGlobal("fetch", fetchMock);

    const client = new GodotAssetLibraryClient();
    await client.searchAssets({ query: "terrain" });

    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("filter=terrain");
    expect(calledUrl).not.toContain("category=");
    expect(calledUrl).not.toContain("godot_version=");
    expect(calledUrl).not.toContain("type=");
    expect(calledUrl).not.toContain("sort=");
    expect(calledUrl).not.toContain("page=");
    expect(calledUrl).not.toContain("max_results=");
  });

  it("includes optional params in the query string when provided", async () => {
    const raw: RawAssetSearchResponse = {
      result: [],
      page: 2,
      pages: 5,
      page_length: 10,
      total_items: 42,
    };
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, raw));
    vi.stubGlobal("fetch", fetchMock);

    const client = new GodotAssetLibraryClient();
    await client.searchAssets({
      query: "dodge",
      category: "2D Tools",
      godotVersion: "4.2",
      type: "addon",
      sort: "updated",
      page: 2,
      maxResults: 10,
    });

    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("filter=dodge");
    expect(calledUrl).toContain("category=2D+Tools");
    expect(calledUrl).toContain("godot_version=4.2");
    expect(calledUrl).toContain("type=addon");
    expect(calledUrl).toContain("sort=updated");
    expect(calledUrl).toContain("page=2");
    expect(calledUrl).toContain("max_results=10");
  });

  it("parses a successful response into the typed result shape", async () => {
    const raw: RawAssetSearchResponse = {
      result: [sampleSummary],
      page: 0,
      pages: 1,
      page_length: 40,
      total_items: 1,
    };
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, raw));
    vi.stubGlobal("fetch", fetchMock);

    const client = new GodotAssetLibraryClient();
    const result = await client.searchAssets({ query: "terrain" });

    expect(result).toEqual({
      items: [sampleSummary],
      page: 0,
      totalPages: 1,
      totalItems: 1,
    });
  });

  it("throws GodotAssetLibraryHttpError on a non-2xx HTTP status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(500, {}));
    vi.stubGlobal("fetch", fetchMock);

    const client = new GodotAssetLibraryClient();

    await expect(client.searchAssets({ query: "terrain" })).rejects.toBeInstanceOf(
      GodotAssetLibraryHttpError,
    );
  });

  it("throws GodotAssetLibraryTimeoutError when the request aborts", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", fetchMock);

    const client = new GodotAssetLibraryClient({ timeoutMs: 5 });

    await expect(client.searchAssets({ query: "terrain" })).rejects.toBeInstanceOf(
      GodotAssetLibraryTimeoutError,
    );
  });

  it("throws GodotAssetLibraryNetworkError when fetch rejects with a generic error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    vi.stubGlobal("fetch", fetchMock);

    const client = new GodotAssetLibraryClient();

    await expect(client.searchAssets({ query: "terrain" })).rejects.toBeInstanceOf(
      GodotAssetLibraryNetworkError,
    );
  });
});

describe("GodotAssetLibraryClient.getAsset", () => {
  const sampleDetail: AssetDetail = {
    asset_id: "4",
    type: "addon",
    title: "Terrain Editor",
    author: "Zylann",
    author_id: "12",
    version: "10",
    version_string: "0.4",
    category: "3D Tools",
    category_id: "2",
    godot_version: "2.1",
    rating: "0",
    cost: "MIT",
    description: "A heightmap-based terrain node for Godot Engine.",
    support_level: "community",
    download_provider: "GitHub",
    download_commit: "d3475733baadec3e7910994326771a55eb860005",
    browse_url: "https://github.com/Zylann/godot_terrain_plugin",
    issues_url: "https://github.com/Zylann/godot_terrain_plugin/issues",
    icon_url: "https://zylannprods.fr/lab/godot/terrain_plugin/assetlib_icon.png",
    searchable: "1",
    modify_date: "2019-10-09 21:06:17",
    download_url:
      "https://github.com/Zylann/godot_terrain_plugin/archive/d3475733baadec3e7910994326771a55eb860005.zip",
    previews: [
      {
        preview_id: "4",
        type: "image",
        link: "https://zylannprods.fr/lab/godot/terrain_plugin/assetlib_icon.png",
        thumbnail: "https://zylannprods.fr/lab/godot/terrain_plugin/assetlib_icon.png",
      },
    ],
    download_hash: "",
  };

  it("parses a successful detail response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, sampleDetail));
    vi.stubGlobal("fetch", fetchMock);

    const client = new GodotAssetLibraryClient();
    const result = await client.getAsset(4);

    expect(result).toEqual(sampleDetail);
    const calledUrl = fetchMock.mock.calls[0]?.[0] as string;
    expect(calledUrl).toContain("/asset/4");
  });

  it("throws GodotAssetLibraryNotFoundError for a 404", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(fakeResponse(404, { error: "Couldn't find asset with id 999999999!" }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new GodotAssetLibraryClient();

    await expect(client.getAsset(999999999)).rejects.toBeInstanceOf(
      GodotAssetLibraryNotFoundError,
    );
    await expect(client.getAsset(999999999)).rejects.toThrow(/999999999/);
  });

  it("throws GodotAssetLibraryHttpError on a non-404 non-2xx HTTP status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(500, {}));
    vi.stubGlobal("fetch", fetchMock);

    const client = new GodotAssetLibraryClient();

    await expect(client.getAsset(4)).rejects.toBeInstanceOf(GodotAssetLibraryHttpError);
  });

  it("throws GodotAssetLibraryTimeoutError when the request aborts", async () => {
    const abortError = new Error("The operation was aborted");
    abortError.name = "AbortError";
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", fetchMock);

    const client = new GodotAssetLibraryClient({ timeoutMs: 5 });

    await expect(client.getAsset(4)).rejects.toBeInstanceOf(GodotAssetLibraryTimeoutError);
  });

  it("throws GodotAssetLibraryNetworkError when fetch rejects with a generic error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    vi.stubGlobal("fetch", fetchMock);

    const client = new GodotAssetLibraryClient();

    await expect(client.getAsset(4)).rejects.toBeInstanceOf(GodotAssetLibraryNetworkError);
  });
});
