/**
 * Typed request/response shapes for the subset of Roblox's Open Cloud v2 API
 * covered by this SDK: DataStore entries and MessagingService message
 * publishing.
 *
 * Roblox's Open Cloud v2 surface models resources as REST paths nested under
 * a universe, e.g. `universes/{universeId}/data-stores/{dataStoreId}/entries/{entryId}`.
 * The shapes below mirror the JSON Roblox returns for those resources as
 * closely as practical; where this SDK flattens or renames a field for
 * ergonomics, the original wire field name is noted in a comment.
 */

/** Lifecycle state of a DataStore entry as reported by Roblox. */
export type RobloxDataStoreEntryState = "ACTIVE" | "DELETED";

/**
 * A single DataStore entry, as returned by the "get entry" and "set entry"
 * endpoints:
 *   GET/POST /universes/{universeId}/data-stores/{dataStoreId}/entries/{entryId}
 *
 * `T` is the shape of the caller-defined value stored under this entry;
 * it defaults to `unknown` since Roblox does not constrain it.
 */
export interface RobloxDataStoreEntry<T = unknown> {
  /** Resource path Roblox returns, e.g. "universes/123/data-stores/my-store/entries/my-entry". */
  path: string;
  /** Lifecycle state of the entry. */
  state: RobloxDataStoreEntryState;
  /** Opaque version tag for optimistic concurrency control (pair with `etagMatch` on `setEntry`). */
  etag: string;
  /** ISO-8601 timestamp the entry was first created. */
  createTime: string;
  /** Identifier of the entry's current revision. */
  revisionId: string;
  /** ISO-8601 timestamp the current revision was created. */
  revisionCreateTime: string;
  /** The stored value. Pass a type parameter to `getEntry`/`setEntry` for a stronger type than `unknown`. */
  value: T;
}

/**
 * A single row returned by the "list entries" endpoint:
 *   GET /universes/{universeId}/data-stores/{dataStoreId}/entries
 *
 * Roblox's raw wire response nests these under a `dataStoreEntries` field
 * (see {@link RawListEntriesResponse}); `listEntries` flattens that to
 * `entries` for ergonomics.
 */
export interface RobloxDataStoreEntryListItem {
  /** Resource path of the entry, e.g. "universes/123/data-stores/my-store/entries/my-entry". */
  path: string;
  /** The entry's id (the final path segment, after `entries/`). */
  id: string;
}

/** Raw wire shape of Roblox's "list entries" response, before flattening. */
export interface RawListEntriesResponse {
  /** Raw field name used by Roblox for the page of entries. */
  dataStoreEntries?: RobloxDataStoreEntryListItem[];
  /** Opaque token to pass as `pageToken` to fetch the next page, if any. */
  nextPageToken?: string;
}

/** Options accepted by the {@link RobloxOpenCloudClient} constructor. */
export interface RobloxOpenCloudClientOptions {
  /**
   * Open Cloud API key. Defaults to `process.env.ROBLOX_OPEN_CLOUD_API_KEY`
   * when omitted. If neither is available, the constructor throws
   * synchronously.
   */
  apiKey?: string;
  /** Per-request timeout in milliseconds. Defaults to 10000 (10s). */
  timeoutMs?: number;
}

/** Parameters for {@link RobloxOpenCloudClient.getEntry}. */
export interface GetEntryParams {
  universeId: string;
  dataStoreId: string;
  entryId: string;
  /** Optional DataStore scope (Roblox's DataStore entries default to scope "global" when omitted). */
  scope?: string;
}

/** Parameters for {@link RobloxOpenCloudClient.setEntry}. */
export interface SetEntryParams<T = unknown> {
  universeId: string;
  dataStoreId: string;
  entryId: string;
  /** The value to store. Serialized as JSON in the request body: `{ "value": ... }`. */
  value: T;
  /** Optional DataStore scope. */
  scope?: string;
  /**
   * Optional etag to send as an `If-Match` header for optimistic concurrency
   * control — the write is expected to be rejected by Roblox if the entry's
   * current etag does not match.
   */
  etagMatch?: string;
}

/** Parameters for {@link RobloxOpenCloudClient.listEntries}. */
export interface ListEntriesParams {
  universeId: string;
  dataStoreId: string;
  /** Maximum number of entries to return per page. */
  maxPageSize?: number;
  /** Opaque page token from a previous `listEntries` call's `nextPageToken`. */
  pageToken?: string;
  /** Only return entries whose id starts with this prefix. */
  prefix?: string;
}

/** Ergonomic (flattened) result of {@link RobloxOpenCloudClient.listEntries}. */
export interface ListEntriesResult {
  entries: RobloxDataStoreEntryListItem[];
  nextPageToken?: string;
}

/** Parameters for {@link RobloxOpenCloudClient.deleteEntry}. */
export interface DeleteEntryParams {
  universeId: string;
  dataStoreId: string;
  entryId: string;
  /** Optional DataStore scope. */
  scope?: string;
}

/** Parameters for {@link RobloxOpenCloudClient.publishMessage}. */
export interface PublishMessageParams {
  universeId: string;
  topic: string;
  /**
   * The message payload. Roblox's MessagingService requires the published
   * message to be a string; if an object is passed here, it is
   * JSON.stringify-ed automatically as a convenience so callers can publish
   * structured payloads without doing that themselves.
   */
  message: string | Record<string, unknown>;
}
