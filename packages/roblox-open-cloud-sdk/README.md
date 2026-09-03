# @kasap/roblox-open-cloud-sdk

A typed TypeScript client for Roblox's **Open Cloud v2** API. It covers the two most common
server-to-server integrations for a Roblox experience: reading/writing/listing/deleting
**DataStore** entries, and publishing messages via **MessagingService**.

- Zero runtime dependencies — uses the global `fetch` and `AbortController` available in
  Node.js >= 22.5.0.
- Every request is a single attempt with a hard timeout — no automatic retries (see
  [Design notes](#design-notes)).
- Fully typed requests/responses, including a generic type parameter for your own DataStore value
  shapes.

## Install

This package is part of a pnpm workspace and is consumed as `@kasap/roblox-open-cloud-sdk` by
other packages in the monorepo.

## Getting an API key

1. Go to <https://create.roblox.com/dashboard/credentials> (or open your experience's own
   **Open Cloud** settings from the Creator Dashboard).
2. Create a new API key.
3. Scope it to only the specific universe(s), and within each universe only the specific
   data store(s) and/or MessagingService topic(s) you actually need — Open Cloud permissions are
   granted per-resource, and a key with broader scope than necessary is a needless security risk
   if it ever leaks.
4. Copy the key value into `ROBLOX_OPEN_CLOUD_API_KEY` (see `.env.example`), or pass it directly
   as `apiKey` to the client constructor.

## Usage

```ts
import { RobloxOpenCloudClient } from "@kasap/roblox-open-cloud-sdk";

// Reads ROBLOX_OPEN_CLOUD_API_KEY from process.env by default.
const client = new RobloxOpenCloudClient();

// Or pass the key explicitly:
// const client = new RobloxOpenCloudClient({ apiKey: "...", timeoutMs: 10_000 });
```

### Get a DataStore entry

```ts
interface PlayerData {
  coins: number;
  level: number;
}

const entry = await client.getEntry<PlayerData>({
  universeId: "123456789",
  dataStoreId: "PlayerData",
  entryId: "player_42",
});

console.log(entry.value.coins, entry.etag);
```

### Set (create or update) a DataStore entry

```ts
const updated = await client.setEntry<PlayerData>({
  universeId: "123456789",
  dataStoreId: "PlayerData",
  entryId: "player_42",
  value: { coins: 150, level: 3 },
  // Optional: only apply the write if the entry's current etag still matches
  // (optimistic concurrency control).
  etagMatch: entry.etag,
});
```

### List entries in a DataStore

```ts
const page = await client.listEntries({
  universeId: "123456789",
  dataStoreId: "PlayerData",
  prefix: "player_",
  maxPageSize: 50,
});

for (const item of page.entries) {
  console.log(item.id, item.path);
}

if (page.nextPageToken) {
  const nextPage = await client.listEntries({
    universeId: "123456789",
    dataStoreId: "PlayerData",
    pageToken: page.nextPageToken,
  });
}
```

### Delete an entry

```ts
await client.deleteEntry({
  universeId: "123456789",
  dataStoreId: "PlayerData",
  entryId: "player_42",
});
```

### Publish a MessagingService message

```ts
// A plain string is sent as-is.
await client.publishMessage({
  universeId: "123456789",
  topic: "GlobalAnnouncements",
  message: "Server restarting in 5 minutes",
});

// An object is JSON.stringify-ed automatically, since Roblox requires the
// published message to be a string.
await client.publishMessage({
  universeId: "123456789",
  topic: "GlobalAnnouncements",
  message: { type: "restart", secondsUntil: 300 },
});
```

## Error handling

All errors extend `RobloxOpenCloudError` (which carries the `endpoint`, HTTP `status` when
applicable, and extra `context`). Specific subclasses let you distinguish failure modes with
`instanceof`, so you can decide what to do without inspecting message strings:

| Error class | Thrown when |
| --- | --- |
| `RobloxConfigError` | No API key was provided via `apiKey` or `ROBLOX_OPEN_CLOUD_API_KEY` (thrown synchronously from the constructor) |
| `RobloxUnauthorizedError` | HTTP 401 — the API key is missing or invalid |
| `RobloxForbiddenError` | HTTP 403 — the API key is valid but lacks the required scope/permission for this universe/data store/topic |
| `RobloxNotFoundError` | HTTP 404 — the universe, data store, or entry does not exist |
| `RobloxRateLimitError` | HTTP 429 — rate limited; `retryAfter` (seconds) is populated when Roblox sends a `Retry-After` header |
| `RobloxHttpError` | Any other non-2xx HTTP status |
| `RobloxTimeoutError` | The request exceeds `timeoutMs` (default 10s) |
| `RobloxNetworkError` | `fetch` itself fails (DNS, connection refused, offline, ...) |

```ts
import { RobloxForbiddenError, RobloxNotFoundError, RobloxRateLimitError } from "@kasap/roblox-open-cloud-sdk";

try {
  await client.getEntry({ universeId: "123456789", dataStoreId: "PlayerData", entryId: "player_42" });
} catch (error) {
  if (error instanceof RobloxNotFoundError) {
    // entry doesn't exist yet — treat as "no save data"
  } else if (error instanceof RobloxForbiddenError) {
    // API key isn't scoped for this data store
  } else if (error instanceof RobloxRateLimitError) {
    console.log("retry after", error.retryAfter, "seconds");
  } else {
    throw error;
  }
}
```

## Client options

```ts
new RobloxOpenCloudClient({
  apiKey: process.env.ROBLOX_OPEN_CLOUD_API_KEY, // default source when apiKey is omitted
  timeoutMs: 10_000, // default
});
```

## Design notes

- This SDK intentionally does **not** retry failed requests. Retrying a DataStore write whose
  response was lost to a network blip risks double-applying a caller's read-modify-write (e.g. an
  increment), and a generic client has no way to know whether a given write is safe to repeat.
  `RobloxRateLimitError` (429) surfaces immediately with `retryAfter` populated so *you* — the
  caller — can decide whether and when to retry, rather than this SDK silently backing off on
  your behalf.
- Resource paths follow Open Cloud v2's REST shape, nested under a universe:
  `universes/{universeId}/data-stores/{dataStoreId}/entries/{entryId}`. Path segments (universe
  id, data store id, entry id, topic) are percent-encoded individually so ids containing spaces,
  slashes, or other special characters round-trip correctly.
