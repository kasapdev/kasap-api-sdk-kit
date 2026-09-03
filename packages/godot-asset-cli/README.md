# @kasap/godot-asset-cli

A CLI and typed programmatic client for the public
[Godot Asset Library](https://godotengine.org/asset-library/) REST API. The
Asset Library API is fully public and read-only — **no API key, token, or
credentials of any kind are required.**

## What it is

- `godot-asset-cli` — a command-line tool to search the Asset Library and
  inspect individual asset listings, straight from your terminal.
- `GodotAssetLibraryClient` — the same functionality as a typed TypeScript
  client, for use in your own scripts/tools.

## Install

```bash
npx @kasap/godot-asset-cli search "dodge" --category addon
```

Or add it to a project:

```bash
pnpm add @kasap/godot-asset-cli
```

## CLI usage

### Search

```bash
godot-asset-cli search "dodge" --category addon
godot-asset-cli search "terrain" --godot-version 4.2 --sort updated
godot-asset-cli search "dialogue" --json
```

Prints an aligned table of results (Title, Author, Rating, Id) by default, or
raw JSON with `--json`.

### Show asset detail

```bash
godot-asset-cli show 4
godot-asset-cli show 4 --json
```

Prints full detail for a single asset (title, author, category, Godot
version, rating, download URL, description, and more) as readable labeled
lines by default, or raw JSON with `--json`.

### Flags

| Flag | Applies to | Description |
| --- | --- | --- |
| `--category <category>` | `search` | Restrict results to a category name (e.g. `"2D Tools"`) |
| `--godot-version <version>` | `search` | Restrict results to a specific Godot engine version |
| `--type <type>` | `search` | Restrict results to an asset type (e.g. `addon`, `project`) |
| `--sort <sort>` | `search` | Sort order (e.g. `updated`, `name`, `cost`) |
| `--page <n>` | `search` | Zero-based page index |
| `--max-results <n>` | `search` | Number of results per page |
| `--json` | `search`, `show` | Print raw JSON instead of formatted output |

On a network error, HTTP error, or timeout, the CLI prints a one-line error
message to stderr and exits with a non-zero status code. Looking up an
unknown asset id with `show` prints an "asset not found" message.

## Programmatic usage

```ts
import { GodotAssetLibraryClient } from "@kasap/godot-asset-cli";

const client = new GodotAssetLibraryClient();

const results = await client.searchAssets({ query: "terrain", type: "addon" });
console.log(results.items.map((asset) => asset.title));

const detail = await client.getAsset(4);
console.log(detail.title, detail.download_url);
```

The client, its typed request/response interfaces, and its typed error
hierarchy (`GodotAssetLibraryError` and subclasses for network, timeout, HTTP,
and not-found failures) are all exported from the package's main entry point
for use outside the CLI.

## Notes on the underlying API

- Base URL: `https://godotengine.org/asset-library/api`.
- Almost every scalar field the API returns is a string, even ones that look
  numeric (`asset_id`, `rating`, `version`, etc). This package's types match
  the wire format exactly rather than silently coercing types.
- The `cost` field is the asset's license identifier (e.g. `"MIT"`), not a
  monetary price.
- Requesting an asset id that doesn't exist returns HTTP 404, which this
  package surfaces as a typed `GodotAssetLibraryNotFoundError`.

No `.env` file or credentials are needed to use this package.
