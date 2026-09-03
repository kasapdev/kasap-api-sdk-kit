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
});
```

## Design notes

- This SDK intentionally does **not** retry failed requests. Steam's market endpoints are
  aggressively rate-limited; a single attempt with a clear timeout error is the more respectful
  (and predictable) behavior. If you need retries, implement your own backoff policy around this
  client.
