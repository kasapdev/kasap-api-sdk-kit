# @kasap/twitch-clip-sdk

A typed TypeScript client for the [Twitch Helix API](https://dev.twitch.tv/docs/api/reference/)'s
Clips and Videos endpoints, authenticated via the app-access-token
(client-credentials) OAuth2 flow. No runtime dependencies — built on the
global `fetch`/`AbortController` available in Node.js >= 22.5.0.

## What it is

This package covers two read-only Helix endpoints:

- **Get Clips** (`GET /helix/clips`) — search for clips by broadcaster, game, or clip ID.
- **Get Videos** (`GET /helix/videos`) — fetch VODs/highlights/uploads by video ID, user, or game.

Authentication uses Twitch's **app access token** flow (client credentials
grant): the SDK authenticates as your *application*, not as a logged-in
user. This is the right fit for server-side tools, bots, and dashboards that
only need public, app-scoped data.

**This does NOT cover user-token-only scopes** (like *Create Clip*, which
requires a broadcaster to have authorized your app). Those require the
Authorization Code Grant flow (a per-user login/consent redirect), which is
out of scope for this package.

## Getting credentials

1. Go to [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps) and register a new application.
2. Set any OAuth Redirect URL (e.g. `http://localhost`) — it's required by the console but unused by the client-credentials flow.
3. Copy the generated **Client ID**, and generate/copy a **Client Secret**.
4. Copy `.env.example` to `.env` and fill in:

```
TWITCH_CLIENT_ID=your_client_id
TWITCH_CLIENT_SECRET=your_client_secret
```

## Usage

### Searching clips

```ts
import { TwitchClipClient } from "@kasap/twitch-clip-sdk";

// Reads TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET from process.env by default.
const client = new TwitchClipClient();

const { data: clips, cursor } = await client.searchClips({
  broadcasterId: "123456789",
  first: 20,
});

for (const clip of clips) {
  console.log(clip.title, clip.url, clip.view_count);
}
```

### Paginating

```ts
let after: string | undefined;
const allClips = [];

do {
  const page = await client.searchClips({ broadcasterId: "123456789", first: 100, after });
  allClips.push(...page.data);
  after = page.cursor;
} while (after);
```

### Fetching videos

```ts
const { data: videos } = await client.getVideos({
  userId: "123456789",
  type: "archive",
  first: 10,
});

for (const video of videos) {
  console.log(video.title, video.url, video.duration);
}
```

### Explicit credentials / options

```ts
const client = new TwitchClipClient({
  clientId: "...",
  clientSecret: "...",
  timeoutMs: 15_000,
});
```

### Sharing a token provider across clients

```ts
import { TwitchAppTokenProvider, TwitchClipClient } from "@kasap/twitch-clip-sdk";

const tokenProvider = new TwitchAppTokenProvider({ clientId: "...", clientSecret: "..." });
const client = new TwitchClipClient({ clientId: "...", tokenProvider });
```

## Error handling

All errors extend `TwitchApiError` and carry `endpoint` plus a `context`
object with additional details:

- `TwitchAuthError` — missing credentials, or the token endpoint rejected the request.
- `TwitchHttpError` — a non-2xx response from `/clips` or `/videos` (after the one automatic retry on 401, described below). Carries `status` and Twitch's parsed error body (`{ error, status, message }`) when available.
- `TwitchNetworkError` — the underlying `fetch` call failed (DNS, connection refused, etc).
- `TwitchTimeoutError` — the request exceeded `timeoutMs` (default 10s).

```ts
import { TwitchAuthError, TwitchHttpError } from "@kasap/twitch-clip-sdk";

try {
  await client.searchClips({ broadcasterId: "123456789" });
} catch (error) {
  if (error instanceof TwitchHttpError) {
    console.error(`Helix returned ${error.status}`, error.body);
  } else if (error instanceof TwitchAuthError) {
    console.error("Failed to authenticate with Twitch", error.message);
  } else {
    throw error;
  }
}
```

## Behavior notes

- App access tokens are cached in memory and refreshed automatically, with a
  60-second safety margin before actual expiry.
- Concurrent requests that need a token before the first fetch resolves
  share a single in-flight token request ("single-flight") instead of each
  triggering their own call to Twitch's token endpoint.
- On an HTTP 401 from `/clips` or `/videos`, the client assumes the cached
  token was invalidated server-side, force-refreshes it once, and retries
  the request exactly once before giving up. All other non-2xx statuses,
  network failures, and timeouts are not retried.
