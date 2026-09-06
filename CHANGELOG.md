# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## 2026-09-06

### Added

- `discord-webhook-kit`: test for `DiscordWebhookClient.send` rejecting a message with more than
  `EMBED_LIMITS.EMBEDS_PER_MESSAGE` (10) embeds without making a network request.
- `discord-webhook-kit`: boundary tests for `EmbedBuilder`/`finalizeEmbed` — a title exactly at the
  256-character limit does not throw, a field name over 256 characters is rejected, and an
  already-numeric `color` value passes through unchanged.
- `twitch-clip-sdk`: test covering `TwitchClipClient`'s "no further retry loop" guarantee — when the
  single 401-triggered token refresh and retry also comes back 401, exactly two fetch attempts are
  made and a `TwitchHttpError` is thrown (not a third attempt).
- `twitch-clip-sdk`: test verifying `TwitchAppTokenProvider.invalidate()` forces a fresh token fetch
  on the next `getToken()` call even while the previously cached token is still within its validity
  window.
- `roblox-open-cloud-sdk`: test verifying `RobloxOpenCloudClient.getEntry` percent-encodes an
  `entryId` containing spaces and slashes in the request path.
- `steam-market-sdk`: test verifying `SteamMarketClient.getPriceHistory` returns an empty `points`
  array (rather than throwing) when Steam responds with `success: true` but omits `price_history`.

All new tests passed against the existing implementation — no behavioral bugs were found, this is
a test-coverage-only change. `pnpm build`, `pnpm typecheck`, and `pnpm test` all pass across every
workspace package.
