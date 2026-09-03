import type { AssetDetail, AssetSummary } from "./types.js";

/**
 * Pure formatting helpers for rendering search results and asset detail as
 * human-readable plain text. Kept separate from `cli.ts` so they can be unit
 * tested without spinning up the commander CLI.
 */

const TABLE_COLUMNS = ["Title", "Author", "Rating", "Id"] as const;
/** Minimum spacing between adjacent table columns. */
const COLUMN_GAP = 2;

/**
 * Renders a list of {@link AssetSummary} items as an aligned, plain-text
 * table with columns: Title, Author, Rating, Id.
 *
 * Returns a friendly "no results" message (rather than an empty/header-only
 * table) when `items` is empty.
 */
export function formatAssetTable(items: AssetSummary[]): string {
  if (items.length === 0) {
    return "No assets found.";
  }

  const rows = items.map((item) => [item.title, item.author, item.rating, item.asset_id]);

  const widths = TABLE_COLUMNS.map((header, columnIndex) => {
    const cellWidths = rows.map((row) => (row[columnIndex] ?? "").length);
    return Math.max(header.length, ...cellWidths);
  });

  const formatRow = (cells: readonly string[]): string =>
    cells
      .map((cell, columnIndex) => {
        const width = widths[columnIndex] ?? cell.length;
        return cell.padEnd(width + COLUMN_GAP);
      })
      .join("")
      .trimEnd();

  const lines = [formatRow(TABLE_COLUMNS), ...rows.map((row) => formatRow(row))];
  return lines.join("\n");
}

/**
 * Renders a single {@link AssetDetail} object as readable, labeled lines
 * (Title, Author, Category, Godot Version, Rating, Download URL,
 * Description, ...).
 */
export function formatAssetDetail(asset: AssetDetail): string {
  const lines = [
    `Title:          ${asset.title}`,
    `Id:             ${asset.asset_id}`,
    `Type:           ${asset.type}`,
    `Author:         ${asset.author} (id: ${asset.author_id})`,
    `Category:       ${asset.category}`,
    `Godot Version:  ${asset.godot_version}`,
    `Version:        ${asset.version_string}`,
    `Rating:         ${asset.rating}`,
    `License:        ${asset.cost}`,
    `Support Level:  ${asset.support_level}`,
    `Download URL:   ${asset.download_url}`,
    `Browse URL:     ${asset.browse_url}`,
    `Issues URL:     ${asset.issues_url}`,
    `Modified:       ${asset.modify_date}`,
    "",
    "Description:",
    asset.description,
  ];
  return lines.join("\n");
}
