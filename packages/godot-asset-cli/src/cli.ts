#!/usr/bin/env node
import { Command } from "commander";

import { GodotAssetLibraryClient } from "./client.js";
import {
  GodotAssetLibraryError,
  GodotAssetLibraryHttpError,
  GodotAssetLibraryNetworkError,
  GodotAssetLibraryNotFoundError,
  GodotAssetLibraryTimeoutError,
} from "./errors.js";
import { formatAssetDetail, formatAssetTable } from "./format.js";

const client = new GodotAssetLibraryClient();

/** Renders a caught error as a single, clear line printed to stderr. */
function describeError(error: unknown): string {
  if (error instanceof GodotAssetLibraryNotFoundError) {
    return `Asset not found: ${error.message}`;
  }
  if (error instanceof GodotAssetLibraryTimeoutError) {
    return `Request timed out: ${error.message}`;
  }
  if (error instanceof GodotAssetLibraryHttpError) {
    return `Request failed: ${error.message}`;
  }
  if (error instanceof GodotAssetLibraryNetworkError) {
    return `Network error: ${error.message}`;
  }
  if (error instanceof GodotAssetLibraryError) {
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

interface SearchCommandOptions {
  category?: string;
  godotVersion?: string;
  type?: string;
  sort?: string;
  page?: number;
  maxResults?: number;
  json?: boolean;
}

interface ShowCommandOptions {
  json?: boolean;
}

const program = new Command();

program
  .name("godot-asset-cli")
  .description("CLI for the public Godot Asset Library REST API")
  .version("0.1.0");

program
  .command("search")
  .description("Search the Godot Asset Library")
  .argument("<query>", "free-text search query")
  .option("--category <category>", "restrict results to a category name")
  .option("--godot-version <version>", "restrict results to a Godot engine version")
  .option("--type <type>", "restrict results to an asset type (e.g. addon, project)")
  .option("--sort <sort>", "sort order (e.g. updated, name, cost)")
  .option("--page <n>", "zero-based page index", (value) => Number.parseInt(value, 10))
  .option("--max-results <n>", "number of results per page", (value) => Number.parseInt(value, 10))
  .option("--json", "print raw JSON instead of a formatted table", false)
  .action(async (query: string, options: SearchCommandOptions) => {
    try {
      const result = await client.searchAssets({
        query,
        category: options.category,
        godotVersion: options.godotVersion,
        type: options.type,
        sort: options.sort,
        page: options.page,
        maxResults: options.maxResults,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatAssetTable(result.items));
      }
    } catch (error) {
      console.error(describeError(error));
      process.exitCode = 1;
    }
  });

program
  .command("show")
  .description("Show detail for a single asset")
  .argument("<id>", "asset id")
  .option("--json", "print raw JSON instead of formatted detail", false)
  .action(async (id: string, options: ShowCommandOptions) => {
    try {
      const asset = await client.getAsset(id);

      if (options.json) {
        console.log(JSON.stringify(asset, null, 2));
      } else {
        console.log(formatAssetDetail(asset));
      }
    } catch (error) {
      console.error(describeError(error));
      process.exitCode = 1;
    }
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
