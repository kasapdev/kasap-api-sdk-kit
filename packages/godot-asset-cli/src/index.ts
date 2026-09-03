/**
 * Programmatic entry point for `@kasap/godot-asset-cli`.
 *
 * Re-exports the typed client, error hierarchy, and response types so this
 * package can be used as a library, independent of the `godot-asset-cli`
 * binary.
 */
export { GodotAssetLibraryClient } from "./client.js";
export {
  GodotAssetLibraryError,
  GodotAssetLibraryHttpError,
  GodotAssetLibraryNetworkError,
  GodotAssetLibraryNotFoundError,
  GodotAssetLibraryTimeoutError,
} from "./errors.js";
export { formatAssetDetail, formatAssetTable } from "./format.js";
export type {
  AssetDetail,
  AssetPreview,
  AssetSummary,
  GodotAssetLibraryClientOptions,
  GodotAssetSearchResult,
  RawAssetNotFoundResponse,
  RawAssetSearchResponse,
  SearchAssetsParams,
} from "./types.js";
