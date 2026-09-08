# @kasap/steam-market-sdk

A typed TypeScript client for the public **Steam Community Market** API. It lets you fetch
current buy/sell price overviews for any Steam market item, and (with a caller-supplied login
session) the full historical price chart for that item.

- No API key required for price overviews.
- Zero runtime dependencies — uses the global `fetch` and `AbortController` available in
  Node.js >= 22.5.0.
- Every request is a single attempt with a hard timeout — no automatic retries, out of respect
  for Steam's rate limits.

## Install

This package is part of a pnpm workspace and is consumed as `@kasap/steam-market-sdk` by other
packages in the monorepo.

## Usage

### Price overview (no authentication needed)

```ts
import { SteamMarketClient } from "@kasap/steam-market-sdk";

const client = new SteamMarketClient();

const overview = await client.getPriceOverview({
  appId: 730, // Counter-Strike 2
  marketHashName: "AK-47 | Redline (Field-Tested)",
  currency: 1, // optional, defaults to 1 (USD)
});

console.log(overview);
// {
//   success: true,
//   lowestPrice: "$14.23 USD",
//   medianPrice: "$14.51 USD",
//   volume: "312",
// }
```

`lowestPrice`, `medianPrice`, and `volume` are each **optional** — an item can have only one of
`lowestPrice` / `medianPrice` populated, or neither, if it has no recent market activity.

If Steam can't find the item (invalid `appId` / `marketHashName` combination), the client throws
a `SteamMarketNotFoundError` rather than returning a silent `success: false`.

### Price history (requires your own login session cookie)

> **This endpoint requires you to be logged into steamcommunity.com.** Steam only returns price
> history to authenticated sessions — there is no public or anonymous way to call it. Because of
> this, the `cookie` parameter is **required**, not optional.

```ts
import { SteamMarketClient } from "@kasap/steam-market-sdk";

const client = new SteamMarketClient();

const history = await client.getPriceHistory({
  appId: 730,
  marketHashName: "AK-47 | Redline (Field-Tested)",
  cookie: process.env.STEAM_LOGIN_SECURE!, // see below
});

console.log(history.points[0]);
// { date: "Dec 01 2018 01: +0", price: 1.23, volume: "5" }
```

If the cookie is missing, expired, or invalid, Steam returns `{ success: false }` even for a
perfectly valid item — the client detects this and throws a `SteamMarketNotFoundError` whose
message explicitly calls out the cookie/login requirement as the likely cause.

#### How to obtain your `steamLoginSecure` cookie value

This is **your own personal browser session** for steamcommunity.com — not an API key, and not
something you register for. To find it:

1. Log into <https://steamcommunity.com> in your browser.
2. Open DevTools (F12) → **Application** (Chrome) or **Storage** (Firefox) tab → **Cookies** →
   `https://steamcommunity.com`.
3. Find the cookie named `steamLoginSecure` and copy its value.
4. Pass that value as the `cookie` parameter to `getPriceHistory`.

Treat this value like a password: it grants access to your logged-in Steam session and expires /
rotates periodically. Never commit it to source control or share it publicly.

## Response caching (opt-in)

`SteamMarketClient` can optionally cache successful `getPriceOverview` / `getPriceHistory`
responses in memory, keyed by their request parameters (for `getPriceHistory`, this includes the
`cookie`, so two different logged-in sessions never share a cached entry). This is **entirely
opt-in** — pass `cacheTtlMs` to the constructor to enable it. Without it, every call always hits
the network exactly as before, so existing code is unaffected.

This is especially useful against Steam's aggressively rate-limited market endpoints: repeatedly
looking up the same item (e.g. rendering a price in a UI that re-renders often, or polling a
watchlist) no longer needs a fresh network round-trip every time.

```ts
import { SteamMarketClient } from "@kasap/steam-market-sdk";

const client = new SteamMarketClient({
  cacheTtlMs: 60_000, // cache each response for 60 seconds
});

const a = await client.getPriceOverview({ appId: 730, marketHashName: "AK-47 | Redline (Field-Tested)" });
const b = await client.getPriceOverview({ appId: 730, marketHashName: "AK-47 | Redline (Field-Tested)" });
// `b` is served from the in-memory cache — no second network request was made.

// Force fresh reads on demand (e.g. after refreshing a steamLoginSecure cookie):
client.clearCache();
```

Behavior notes:

- **Concurrent calls are de-duplicated.** If two callers request the exact same `appId` /
  `marketHashName` / `currency` (or, for `getPriceHistory`, `cookie`) combination while a request
  for it is still in flight, both share the single underlying network request instead of each
  triggering their own.
- **Failures are never cached.** If a call throws (`SteamMarketNotFoundError`,
  `SteamMarketHttpError`, etc.), nothing is stored, and the next call retries the network.
- **`cacheTtlMs: 0`** disables storing results (so every non-overlapping call still hits the
  network) but still de-duplicates concurrent in-flight calls for the same key — useful if you
  only want the concurrency protection without any staleness.
- **Omitting `cacheTtlMs`** (the default) disables caching entirely.
- `clearCache()` evicts every cached entry; it's a harmless no-op if caching was never enabled.

## Error handling

All errors extend `SteamMarketApiError` (which carries the `endpoint` that was called and extra
`context`). Specific subclasses let you distinguish failure modes with `instanceof`:

| Error class | Thrown when |
| --- | --- |
| `SteamMarketNetworkError` | `fetch` itself fails (DNS, connection refused, offline, ...) |
| `SteamMarketTimeoutError` | The request exceeds `timeoutMs` (default 10s) |
| `SteamMarketHttpError` | Steam responds with a non-2xx HTTP status |
| `SteamMarketNotFoundError` | Steam responds `{ success: false }` (invalid item, or missing/expired login cookie for `getPriceHistory`) |

## Client options

```ts
new SteamMarketClient({
  baseUrl: "https://steamcommunity.com/market", // default
  timeoutMs: 10_000, // default
  cacheTtlMs: undefined, // default: caching disabled. See "Response caching" below.
  now: undefined, // default: Date.now. Injectable clock, primarily for tests.
});
```

## Design notes

- This SDK intentionally does **not** retry failed requests. Steam's market endpoints are
  aggressively rate-limited; a single attempt with a clear timeout error is the more respectful
  (and predictable) behavior. If you need retries, implement your own backoff policy around this
  client.
