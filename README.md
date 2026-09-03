# Kasap API SDK Kit

[![CI](https://github.com/kasapdev/kasap-api-sdk-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/kasapdev/kasap-api-sdk-kit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A collection of small, typed TypeScript API/SDK clients for real public APIs, built by
[kasapdev](https://github.com/kasapdev). Each package is independent, ships its own tests
(no real network calls — `fetch` is mocked), and has its own README with setup instructions.
Open source — use it, fork it, adapt it.

Managed as a pnpm workspace monorepo, following the same conventions as
[kasap-ai-tools](https://github.com/kasapdev/kasap-ai-tools): TypeScript + ESM throughout,
strict compiler settings, vitest for tests, and a GitHub Actions CI pipeline that installs,
builds, typechecks, and tests every package on every push.

## Packages

| Package | Description | Auth required |
| --- | --- | --- |
| [`@kasap/steam-market-sdk`](packages/steam-market-sdk) | Typed client for the Steam Community Market public price API (current price + price history). | None for price overview; a personal login cookie for price history. |
| [`@kasap/discord-webhook-kit`](packages/discord-webhook-kit) | Typed Discord webhook client with an embed builder (limits enforced in code), file attachments, and automatic 429 rate-limit handling. | A webhook URL (no bot/OAuth). |
| [`@kasap/twitch-clip-sdk`](packages/twitch-clip-sdk) | Typed Twitch Helix client for clip/VOD search with an app-access-token (client-credentials) auth helper. | Twitch app Client ID + Secret. |
| [`@kasap/roblox-open-cloud-sdk`](packages/roblox-open-cloud-sdk) | Typed client for Roblox Open Cloud v2 DataStore entries (get/set/list/delete) and MessagingService publish. | A scoped Open Cloud API key. |
| [`@kasap/godot-asset-cli`](packages/godot-asset-cli) | CLI + typed client for the Godot Asset Library (search assets, show asset detail, `--json` output). | None (public API). |

## Structure

```
packages/
  steam-market-sdk/        @kasap/steam-market-sdk       - Steam Community Market price API client
  discord-webhook-kit/     @kasap/discord-webhook-kit     - Discord webhook execution + embed builder
  twitch-clip-sdk/         @kasap/twitch-clip-sdk         - Twitch Helix clips/videos client
  roblox-open-cloud-sdk/   @kasap/roblox-open-cloud-sdk   - Roblox Open Cloud v2 DataStore/Messaging client
  godot-asset-cli/         @kasap/godot-asset-cli         - Godot Asset Library search CLI + client
```

## Setup

```bash
pnpm install
pnpm -r build
pnpm -r test
```

Each package that needs credentials ships a `.env.example` with a comment on where to obtain
the real value — copy it to `.env` in that package and fill it in. No real credentials are
committed anywhere in this repository, and no test or build step makes a real network call.

## Conventions

- TypeScript + ESM (`"type": "module"`, `module`/`moduleResolution: "NodeNext"`), strict mode
  with `noUncheckedIndexedAccess`.
- Every client uses the global `fetch`/`AbortController` (Node >= 22.5.0) — no HTTP dependency.
- Every client throws typed, named error subclasses (network failure vs. timeout vs. non-2xx
  HTTP vs. API-specific error payloads) instead of leaking raw `fetch`/`JSON` exceptions.
- Tests use `vitest` and mock `fetch` via `vi.stubGlobal` — no real network calls in CI.

## License

MIT - see [LICENSE](LICENSE).
