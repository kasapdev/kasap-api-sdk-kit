# @kasap/discord-webhook-kit

A typed TypeScript client for **Discord incoming webhooks**
(https://discord.com/developers/docs/resources/webhook#execute-webhook) — send plain
messages, rich embeds, and file attachments to a Discord channel with no bot, no OAuth, and
no gateway connection required.

## Getting a webhook URL

1. In Discord, open **Server Settings -> Integrations -> Webhooks**.
2. Click **New Webhook** (or edit an existing one), pick the target channel.
3. Click **Copy Webhook URL**.

That URL is all you need — it looks like
`https://discord.com/api/webhooks/<id>/<token>`. This package accepts either the full URL or
the `id`/`token` pair separately.

## Installation

This package is part of the `kasap-api-sdk-kit` pnpm workspace:

```bash
pnpm install
pnpm --filter @kasap/discord-webhook-kit build
```

## Configuration

A webhook URL is normally something a consuming application supplies at runtime (e.g. from
its own config or secrets store), so this package does not read environment variables
itself. The conventional way to store it in a consuming app is a `.env` file — see
[`.env.example`](.env.example):

```
# Get this from: Discord Server Settings -> Integrations -> Webhooks -> New Webhook -> Copy Webhook URL
DISCORD_WEBHOOK_URL=
```

## Usage

### Sending plain content

```ts
import { DiscordWebhookClient } from "@kasap/discord-webhook-kit";

const client = new DiscordWebhookClient({ url: process.env.DISCORD_WEBHOOK_URL! });
// or: new DiscordWebhookClient({ id: "1234567890", token: "abcDEF..." });

await client.send({ content: "Deployment finished successfully." });
```

### Sending an embed

```ts
import { DiscordWebhookClient, EmbedBuilder } from "@kasap/discord-webhook-kit";

const client = new DiscordWebhookClient({ url: process.env.DISCORD_WEBHOOK_URL! });

const embed = new EmbedBuilder()
  .setTitle("Deploy finished")
  .setDescription("All checks passed.")
  .setColor("#5865F2") // hex strings are converted to Discord's integer color format
  .addField({ name: "Environment", value: "production", inline: true })
  .addField({ name: "Duration", value: "42s", inline: true })
  .setFooter({ text: "kasap-api-sdk-kit" })
  .setTimestamp() // defaults to `new Date()`; always serialized to ISO 8601
  .build(); // validates against Discord's documented embed limits, throws DiscordEmbedValidationError on violation

await client.send({ embeds: [embed] });
```

`EmbedBuilder.build()` enforces every documented Discord embed limit — title (256 chars),
description (4096), up to 25 fields (256 chars per name, 1024 per value), footer text (2048),
author name (256), and a combined 6000-character budget across all of the above. A single
webhook message may contain at most 10 embeds; `send()` enforces that limit itself.

### Sending a file attachment

```ts
import { readFile } from "node:fs/promises";
import { DiscordWebhookClient } from "@kasap/discord-webhook-kit";

const client = new DiscordWebhookClient({ url: process.env.DISCORD_WEBHOOK_URL! });

await client.send({
  content: "Here's the latest report.",
  files: [
    {
      name: "report.csv",
      data: await readFile("report.csv"),
      contentType: "text/csv",
    },
  ],
});
```

Attachments are sent as real `multipart/form-data` (a `payload_json` part plus one `files[N]`
part per file), Discord's documented convention for combining a JSON payload with files.

### Waiting for the created message

By default Discord responds `204 No Content` and `send()` resolves to `undefined`. Pass
`{ wait: true }` to have Discord create the message synchronously and return it:

```ts
const message = await client.send({ content: "hi" }, { wait: true });
console.log(message?.id);
```

### Automatic rate-limit handling

When Discord responds `429 Too Many Requests`, the client reads the `retry_after` value
(from the JSON body, falling back to the `X-RateLimit-Reset-After` header), waits that long,
and retries — up to `maxRetries` times (default 3). If it's still rate-limited after that, it
throws a typed `DiscordRateLimitError` with the last known `retryAfter`.

This retry behavior applies **only** to HTTP 429. Any other non-2xx status throws
`DiscordHttpError` immediately with no retry, a network failure throws `DiscordNetworkError`,
and a request that exceeds `timeoutMs` (default 10s) throws `DiscordTimeoutError` — all
single-attempt, since blindly retrying an ambiguous failure risks posting the same message
twice.

```ts
const client = new DiscordWebhookClient({
  url: process.env.DISCORD_WEBHOOK_URL!,
  timeoutMs: 10_000,
  maxRetries: 3,
});
```

## Error handling

```ts
import {
  DiscordEmbedValidationError,
  DiscordHttpError,
  DiscordNetworkError,
  DiscordRateLimitError,
  DiscordTimeoutError,
} from "@kasap/discord-webhook-kit";

try {
  await client.send({ embeds: [embed] });
} catch (error) {
  if (error instanceof DiscordRateLimitError) {
    // exhausted retries while rate-limited
  } else if (error instanceof DiscordHttpError) {
    // Discord rejected the payload (bad request, unknown webhook, etc.)
  } else if (error instanceof DiscordTimeoutError) {
    // request exceeded timeoutMs
  } else if (error instanceof DiscordNetworkError) {
    // fetch itself failed (DNS, connection refused, offline, ...)
  }
  throw error;
}
```

`DiscordEmbedValidationError` is thrown synchronously from `EmbedBuilder.build()` (or from
`send()` for the "max 10 embeds per message" rule) — it's a payload construction error, not a
network failure, so it is not part of the async error hierarchy above.

## Test

```bash
pnpm --filter @kasap/discord-webhook-kit test
```

All embed-limit validation and all of the client's request/retry/error-classification logic
is covered with `fetch` mocked via `vi.stubGlobal` — no real network calls are made, and the
429-retry tests use an injectable `sleepFn` so they run instantly instead of actually
waiting.
