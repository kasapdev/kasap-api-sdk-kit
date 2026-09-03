import { describe, expect, it } from "vitest";

import { formatAssetDetail, formatAssetTable } from "../src/format.js";
import type { AssetDetail, AssetSummary } from "../src/types.js";

const assets: AssetSummary[] = [
  {
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
    icon_url: "https://example.com/icon.png",
    version: "10",
    version_string: "0.4",
    modify_date: "2019-10-09 21:06:17",
  },
  {
    asset_id: "431",
    title: "chart-gd",
    author: "binogure",
    author_id: "209",
    category: "2D Tools",
    category_id: "1",
    godot_version: "2.1",
    rating: "5",
    cost: "MIT",
    support_level: "community",
    icon_url: "https://example.com/icon2.png",
    version: "2",
    version_string: "1.0.0",
    modify_date: "2021-08-17 15:07:10",
  },
];

describe("formatAssetTable", () => {
  it("returns a friendly message for an empty list", () => {
    const result = formatAssetTable([]);
    expect(result.toLowerCase()).toContain("no");
    expect(result).not.toContain("\n");
  });

  it("includes a header row and one row per asset", () => {
    const result = formatAssetTable(assets);
    const lines = result.split("\n");

    // header + one row per asset
    expect(lines).toHaveLength(1 + assets.length);
    expect(lines[0]).toContain("Title");
    expect(lines[0]).toContain("Author");
    expect(lines[0]).toContain("Rating");
    expect(lines[0]).toContain("Id");
  });

  it("includes every asset's title, author, rating, and id", () => {
    const result = formatAssetTable(assets);
    for (const asset of assets) {
      expect(result).toContain(asset.title);
      expect(result).toContain(asset.author);
      expect(result).toContain(asset.rating);
      expect(result).toContain(asset.asset_id);
    }
  });

  it("aligns columns: each header's start offset matches the corresponding cell's start offset on every row", () => {
    const result = formatAssetTable(assets);
    const lines = result.split("\n");
    const header = lines[0] ?? "";

    const titleStart = header.indexOf("Title");
    const authorStart = header.indexOf("Author");
    const ratingStart = header.indexOf("Rating");
    const idStart = header.indexOf("Id");

    assets.forEach((asset, index) => {
      const row = lines[index + 1] ?? "";
      expect(row.startsWith(asset.title, titleStart)).toBe(true);
      expect(row.startsWith(asset.author, authorStart)).toBe(true);
      expect(row.startsWith(asset.rating, ratingStart)).toBe(true);
      expect(row.startsWith(asset.asset_id, idStart)).toBe(true);
    });
  });
});

describe("formatAssetDetail", () => {
  const detail: AssetDetail = {
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
    download_commit: "abc123",
    browse_url: "https://github.com/Zylann/godot_terrain_plugin",
    issues_url: "https://github.com/Zylann/godot_terrain_plugin/issues",
    icon_url: "https://example.com/icon.png",
    searchable: "1",
    modify_date: "2019-10-09 21:06:17",
    download_url: "https://github.com/Zylann/godot_terrain_plugin/archive/abc123.zip",
    previews: [],
    download_hash: "",
  };

  it("includes all key fields in its output", () => {
    const result = formatAssetDetail(detail);

    expect(result).toContain(detail.title);
    expect(result).toContain(detail.author);
    expect(result).toContain(detail.category);
    expect(result).toContain(detail.godot_version);
    expect(result).toContain(detail.rating);
    expect(result).toContain(detail.download_url);
    expect(result).toContain(detail.description);
    expect(result).toContain(detail.browse_url);
    expect(result).toContain(detail.version_string);
  });
});
