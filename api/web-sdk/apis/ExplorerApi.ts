// @ts-nocheck
/* tslint:disable */
/* eslint-disable */
/**
 * Dual API
 * Dual turns the things your product issues — tickets, warranties, memberships, loyalty cards — into **smart objects**: items that belong to a named owner, look the way you design them, and carry a complete, provable record of everything that has ever happened to them.  Nothing about an object changes quietly. Every change is signed by whoever made it, priced, and written into a history that is later recorded on a public blockchain. That lets you issue a ticket, let its owner transfer it, and still prove months later exactly where it came from.  Most integrations follow the same path:  1. Create a **wallet** to sign with and an **organization** to own the work    and pay for it. 2. Design a **template** — what one of your items is — and a **face**, which    is how it looks. 3. **Mint** items from that template, then transfer, update or redeem them. 4. Read where things stand whenever you like, and let **webhooks** tell you    the moment something happens.  ## Base URL  ``` https://api.dual.network ```  Every path in this reference hangs off that address, and everything is HTTPS.  ## Signing in  There are two ways to identify yourself, and some things need neither.  | What you send | Header | When to use it | | --- | --- | --- | | An access token | `Authorization: Bearer <access_token>` | Anything done on behalf of a signed-in person | | An API key | `x-api-key: <key>` | Backend-to-backend calls with no interactive sign-in | | Nothing | — | Public information, and signing up or in |  Each endpoint below shows which of these it accepts. An endpoint with none shown is open to everyone.  ### Access tokens  Signing in — with a password, a passkey or a crypto wallet — gives you an `access_token` and a `refresh_token`.  The access token is short-lived, about fifteen minutes, and goes on every request. When it runs out, send the refresh token to `POST /auth/refresh-token` and you will get a fresh pair back, without asking the person to sign in again.  Each refresh retires the token you sent and gives you a new one, so always keep the newest pair and discard the old. If an already-used refresh token turns up again, we treat it as stolen and end that session everywhere — so never keep an old one around \"just in case\".  ### API keys  Create a key with `POST /api-keys`. You see the secret once, in that response, and never again — store it at that moment, because a lost key can only be replaced. A key belongs to the organization that made it, does only what its creator was allowed to do, lasts up to a year, and cannot be used to sign anyone in.  ### Permissions  Everything that is not public needs a permission, such as `objects.read` or `webhooks.create`. A signed-in person has the permissions their role gives them; an API key has the ones it was created with. Ask for something you do not have permission for and you get a `401` — the same answer as an expired token — so check the message before assuming the token is the problem.  ## Working in one organization at a time  Authenticated management data — objects, templates, faces, files, webhooks and keys — is scoped to one organization, and you only see organizations your credential may access. Guessing another organization\'s identifier does not cross that boundary: the resource simply reads as missing. Public endpoints are the deliberate exception; they expose only published views and network-wide figures described on those endpoints.  Which organization you are working in is decided by the token or key you send. To move to another one, call `POST /organizations/switch`; it hands back a new access token for that organization, and the refresh token you already hold carries on working.  ## Pagination  Lists come back a page at a time, under a named array, with a `next` marker whenever there is more to fetch.  ```http GET /objects?limit=25 ```  ```json {   \"objects\": [ { \"id\": \"665f1c2d4b1a2c3d4e5f6a7b\" } ],   \"next\": \"7b226964...\" } ```  Send that value back as `?next=` for the following page, keeping every other parameter the same — `sortBy` and `order` are part of what the marker means. No `next` in the response means you have reached the end.  | Parameter | Default | Notes | | --- | --- | --- | | `limit` | 25 | Between 1 and 25 | | `order` | `desc` | Newest first, or `asc` for oldest first | | `sortBy` | `id` | Resource field to sort by; use a field documented by the endpoint | | `next` | — | Treat it as a token: pass it back, never build one |  ## Filtering  Every list has filters of its own, and they all share the same way of asking for a date range:  ```http GET /objects?when_created[$gte]=2026-01-01T00:00:00Z&when_created[$lt]=2026-02-01T00:00:00Z ```  `$gt` and `$gte` set the start of the window, `$lt` and `$lte` set the end; the `e` versions include the moment itself. The `/stats` endpoints use simple `from` and `to` instead. `to` is exclusive there, so back-to-back ranges never count the same record twice.  ## Identifiers, times and amounts  - Resource identifiers are normally 24-character hexadecimal strings. - Times are UTC, written like `2026-01-01T12:00:00Z`. - DUAL balances, fees and other precise amounts are sent as strings rather   than numbers, so nothing is rounded away in transit. A field ending in   `_wei` is in wei, the smallest unit of DUAL. - Blockchain addresses start with `0x`.  ## Errors  Every failure returns the same JSON body, whatever the status:  ```json {   \"code\": 3,   \"message\": \"limit must be 25 or less\",   \"details\": {} } ```  `code` is meant for your code and never changes meaning; `message` is meant for a person reading a log and may be reworded at any time. Make decisions on the status and on `code`.  | Status | What happened | | --- | --- | | `400` | Something in the request is wrong. Fix it before trying again | | `401` | Not signed in, signed in with something expired, or not allowed to do this | | `403` | Signed in, but this particular thing is not yours to touch | | `404` | The resource does not exist or is not visible to you | | `409` | The thing is not in a state where this makes sense right now | | `422` | The request is well formed but breaks a rule | | `429` | Too many requests. Slow down | | `500` | Something went wrong on our side | | `503` | We could not take the request safely. Try again shortly |  ### Error codes  | `code` | Meaning | Usually seen with | | --- | --- | --- | | 3 | Something in the request is wrong | 400, 422 | | 5 | Not found | 404 | | 7 | Not allowed | 403 | | 8 | Too many requests | 429 | | 10 | Another request got there first — try again | 409 | | 12 | Not available | 501 | | 13 | Something went wrong on our side | 500 | | 14 | A required service is temporarily unavailable | 503 | | 16 | Not signed in | 401 |  ## How often you can call  Each token or key gets roughly 5 requests a second, and can burst to 30 for a moment. Callers with no token are counted by network address instead. Go over and you get a `429`; wait a little longer each time before retrying, with a bit of randomness so that everyone does not come back at once.  ## Finding one request again  Every response carries an `x-request-id`. Send your own on the way in and we will keep it; otherwise we make one for you. Quote it when you contact support and we can find the exact call in seconds.  ## Why an action cannot be replayed  Actions are signed by the wallet behind them, not merely sent by someone holding a token. Each signature is tied to that wallet\'s next action number, which you read from `GET /ebus/nonce`, so a copy of an old request is worthless the moment the number moves on. **Actions & fees** walks through the whole sequence.  ## Stability  We add things without warning: a new endpoint, a new optional parameter, a new field in a response. Build your side to ignore anything it does not recognise and those additions will never disturb you.  We do not take things away without warning. Anything being retired is marked `deprecated` here first, keeps working while it carries that mark, and is announced before it goes. 
 *
 * The version of the OpenAPI document: 1.0.0
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */

import * as runtime from '../runtime';
import {
    type Batch,
    BatchFromJSON,
    BatchToJSON,
} from '../models/Batch';
import {
    type BatchStatus,
    BatchStatusFromJSON,
    BatchStatusToJSON,
} from '../models/BatchStatus';
import {
    type Checkpoint,
    CheckpointFromJSON,
    CheckpointToJSON,
} from '../models/Checkpoint';
import {
    type CheckpointStatus,
    CheckpointStatusFromJSON,
    CheckpointStatusToJSON,
} from '../models/CheckpointStatus';
import {
    type DisplayVariant,
    DisplayVariantFromJSON,
    DisplayVariantToJSON,
} from '../models/DisplayVariant';
import {
    type FeesOut,
    FeesOutFromJSON,
    FeesOutToJSON,
} from '../models/FeesOut';
import {
    type ListActionLogsOut,
    ListActionLogsOutFromJSON,
    ListActionLogsOutToJSON,
} from '../models/ListActionLogsOut';
import {
    type ListBatchesOut,
    ListBatchesOutFromJSON,
    ListBatchesOutToJSON,
} from '../models/ListBatchesOut';
import {
    type ListCheckpointsOut,
    ListCheckpointsOutFromJSON,
    ListCheckpointsOutToJSON,
} from '../models/ListCheckpointsOut';
import {
    type ListPublicObjectAttributesOut,
    ListPublicObjectAttributesOutFromJSON,
    ListPublicObjectAttributesOutToJSON,
} from '../models/ListPublicObjectAttributesOut';
import {
    type ListPublicSmartObjectsOut,
    ListPublicSmartObjectsOutFromJSON,
    ListPublicSmartObjectsOutToJSON,
} from '../models/ListPublicSmartObjectsOut';
import {
    type ListPublicTemplatesOut,
    ListPublicTemplatesOutFromJSON,
    ListPublicTemplatesOutToJSON,
} from '../models/ListPublicTemplatesOut';
import {
    type ListStakingOperationsOut,
    ListStakingOperationsOutFromJSON,
    ListStakingOperationsOutToJSON,
} from '../models/ListStakingOperationsOut';
import {
    type ListStateChangesOut,
    ListStateChangesOutFromJSON,
    ListStateChangesOutToJSON,
} from '../models/ListStateChangesOut';
import {
    type ModelError,
    ModelErrorFromJSON,
    ModelErrorToJSON,
} from '../models/ModelError';
import {
    type NetworkConfig,
    NetworkConfigFromJSON,
    NetworkConfigToJSON,
} from '../models/NetworkConfig';
import {
    type NetworkFees,
    NetworkFeesFromJSON,
    NetworkFeesToJSON,
} from '../models/NetworkFees';
import {
    type NetworkInfo,
    NetworkInfoFromJSON,
    NetworkInfoToJSON,
} from '../models/NetworkInfo';
import {
    type NetworkStaking,
    NetworkStakingFromJSON,
    NetworkStakingToJSON,
} from '../models/NetworkStaking';
import {
    type NetworkTokenMarketData,
    NetworkTokenMarketDataFromJSON,
    NetworkTokenMarketDataToJSON,
} from '../models/NetworkTokenMarketData';
import {
    type NetworkTokenPriceHistory,
    NetworkTokenPriceHistoryFromJSON,
    NetworkTokenPriceHistoryToJSON,
} from '../models/NetworkTokenPriceHistory';
import {
    type PublicSmartObject,
    PublicSmartObjectFromJSON,
    PublicSmartObjectToJSON,
} from '../models/PublicSmartObject';
import {
    type PublicSmartObjectMetadata,
    PublicSmartObjectMetadataFromJSON,
    PublicSmartObjectMetadataToJSON,
} from '../models/PublicSmartObjectMetadata';
import {
    type PublicTemplate,
    PublicTemplateFromJSON,
    PublicTemplateToJSON,
} from '../models/PublicTemplate';
import {
    type StakingOperationType,
    StakingOperationTypeFromJSON,
    StakingOperationTypeToJSON,
} from '../models/StakingOperationType';
import {
    type StakingOperationsStats,
    StakingOperationsStatsFromJSON,
    StakingOperationsStatsToJSON,
} from '../models/StakingOperationsStats';
import {
    type StatsOut,
    StatsOutFromJSON,
    StatsOutToJSON,
} from '../models/StatsOut';

export interface GetBatchRequest {
    /**
     * Identifier of the batch.
     */
    batchId: string;
}

export interface GetCheckpointRequest {
    /**
     * Identifier of the checkpoint.
     */
    checkpointId: string;
}

export interface GetNetworkTokenPriceHistoryRequest {
    /**
     * Named time window relative to now. Endpoints that also expose `from` and `to`
     * can use those parameters for an exact window instead.
     * 
     */
    timeRange?: GetNetworkTokenPriceHistoryTimeRangeEnum;
}

export interface GetObjectByIdPublicRequest {
    /**
     * Identifier of the smart object.
     */
    objectId: string;
}

export interface GetObjectMetadataByIdPublicRequest {
    /**
     * Identifier of the smart object.
     */
    objectId: string;
}

export interface GetObjectMetadataByIdPublicLegacyRequest {
    /**
     * Identifier of the smart object.
     */
    objectId: string;
}

export interface GetPublicActionStatsRequest {
    /**
     * Start of the window, inclusive. Omit for "since the beginning".
     * Replaces the when_created[$gt] and when_created[$gte] pair: an aggregate has
     * no use for both an open and a closed lower bound.
     * 
     */
    from?: Date;
    /**
     * End of the window, exclusive. Omit for "up to now". Half-open with from, so
     * adjacent windows tile without double-counting the boundary record.
     * 
     */
    to?: Date;
    /**
     * Which optional parts of the aggregate to compute. The total is always
     * returned; a breakdown and a series each cost a grouping pass, so a caller
     * that only needs the headline number does not pay for them.
     * 
     */
    include?: Array<GetPublicActionStatsIncludeEnum>;
    /**
     * Bucket size for a time series. It fixes how many points the series has over
     * the requested window, so a long window with a small interval is an expensive
     * request.
     * 
     */
    interval?: GetPublicActionStatsIntervalEnum;
    /**
     * How many groups to keep in a breakdown, largest first. Bounds the response
     * for a high-cardinality dimension such as template, where an organization may
     * have thousands.
     * 
     * It does not bound a series. The number of buckets in a series is already
     * fixed by from, to and interval; capping it separately would silently truncate
     * the window a caller explicitly asked for.
     * 
     */
    top?: number;
    /**
     * Split the figures by this. It shapes the breakdown, and with
     * `include=series` it splits the series too — one line per group, with the
     * group named in each point's `key`. Only the values listed here work;
     * anything else is refused.
     * 
     */
    groupBy?: GetPublicActionStatsGroupByEnum;
}

export interface GetPublicFeeStatsRequest {
    /**
     * Start of the window, inclusive. Omit for "since the beginning".
     * Replaces the when_created[$gt] and when_created[$gte] pair: an aggregate has
     * no use for both an open and a closed lower bound.
     * 
     */
    from?: Date;
    /**
     * End of the window, exclusive. Omit for "up to now". Half-open with from, so
     * adjacent windows tile without double-counting the boundary record.
     * 
     */
    to?: Date;
    /**
     * Which optional parts of the aggregate to compute. The total is always
     * returned; a breakdown and a series each cost a grouping pass, so a caller
     * that only needs the headline number does not pay for them.
     * 
     */
    include?: Array<GetPublicFeeStatsIncludeEnum>;
    /**
     * Bucket size for a time series. It fixes how many points the series has over
     * the requested window, so a long window with a small interval is an expensive
     * request.
     * 
     */
    interval?: GetPublicFeeStatsIntervalEnum;
    /**
     * How many groups to keep in a breakdown, largest first. Bounds the response
     * for a high-cardinality dimension such as template, where an organization may
     * have thousands.
     * 
     * It does not bound a series. The number of buckets in a series is already
     * fixed by from, to and interval; capping it separately would silently truncate
     * the window a caller explicitly asked for.
     * 
     */
    top?: number;
    /**
     * Split the figures by this. It shapes the breakdown, and with
     * `include=series` it splits the series too — one line per group, with the
     * group named in each point's `key`. Only the values listed here work;
     * anything else is refused.
     * 
     */
    groupBy?: GetPublicFeeStatsGroupByEnum;
}

export interface GetPublicObjectStatsRequest {
    /**
     * Start of the window, inclusive. Omit for "since the beginning".
     * Replaces the when_created[$gt] and when_created[$gte] pair: an aggregate has
     * no use for both an open and a closed lower bound.
     * 
     */
    from?: Date;
    /**
     * End of the window, exclusive. Omit for "up to now". Half-open with from, so
     * adjacent windows tile without double-counting the boundary record.
     * 
     */
    to?: Date;
    /**
     * Which optional parts of the aggregate to compute. The total is always
     * returned; a breakdown and a series each cost a grouping pass, so a caller
     * that only needs the headline number does not pay for them.
     * 
     */
    include?: Array<GetPublicObjectStatsIncludeEnum>;
    /**
     * Bucket size for a time series. It fixes how many points the series has over
     * the requested window, so a long window with a small interval is an expensive
     * request.
     * 
     */
    interval?: GetPublicObjectStatsIntervalEnum;
    /**
     * How many groups to keep in a breakdown, largest first. Bounds the response
     * for a high-cardinality dimension such as template, where an organization may
     * have thousands.
     * 
     * It does not bound a series. The number of buckets in a series is already
     * fixed by from, to and interval; capping it separately would silently truncate
     * the window a caller explicitly asked for.
     * 
     */
    top?: number;
    /**
     * Group the breakdown by the template each object was minted from. It shapes the breakdown only;
     * this aggregate cannot split its series. Only
     * the dimensions listed here are accepted; anything else is rejected
     * rather than passed through to the aggregation.
     * 
     */
    groupBy?: GetPublicObjectStatsGroupByEnum;
    /**
     * Count only objects minted from this template
     */
    templateId?: string;
}

export interface GetPublicWalletStatsRequest {
    /**
     * Start of the window, inclusive. Omit for "since the beginning".
     * Replaces the when_created[$gt] and when_created[$gte] pair: an aggregate has
     * no use for both an open and a closed lower bound.
     * 
     */
    from?: Date;
    /**
     * End of the window, exclusive. Omit for "up to now". Half-open with from, so
     * adjacent windows tile without double-counting the boundary record.
     * 
     */
    to?: Date;
    /**
     * Which optional parts of the aggregate to compute. The total is always
     * returned; a breakdown and a series each cost a grouping pass, so a caller
     * that only needs the headline number does not pay for them.
     * 
     */
    include?: Array<GetPublicWalletStatsIncludeEnum>;
    /**
     * Bucket size for a time series. It fixes how many points the series has over
     * the requested window, so a long window with a small interval is an expensive
     * request.
     * 
     */
    interval?: GetPublicWalletStatsIntervalEnum;
    /**
     * How many groups to keep in a breakdown, largest first. Bounds the response
     * for a high-cardinality dimension such as template, where an organization may
     * have thousands.
     * 
     * It does not bound a series. The number of buckets in a series is already
     * fixed by from, to and interval; capping it separately would silently truncate
     * the window a caller explicitly asked for.
     * 
     */
    top?: number;
    /**
     * Group the breakdown by activation state. It shapes the breakdown only;
     * this aggregate cannot split its series. Only the dimensions listed
     * here are accepted; anything else is rejected rather than passed
     * through to the aggregation.
     * 
     */
    groupBy?: GetPublicWalletStatsGroupByEnum;
}

export interface GetStakingOperationsStatsRequest {
    /**
     * Bucket size for a time series. It fixes how many points the series has over
     * the requested window, so a long window with a small interval is an expensive
     * request.
     * 
     */
    interval?: GetStakingOperationsStatsIntervalEnum;
    /**
     * Named time window relative to now. Endpoints that also expose `from` and `to`
     * can use those parameters for an exact window instead.
     * 
     */
    timeRange?: GetStakingOperationsStatsTimeRangeEnum;
    /**
     * How many items to return in one page. The default and the maximum are both
     * 25; a larger value is rejected with `400`.
     * 
     */
    limit?: number;
    /**
     * Count only operations indexed strictly after this instant.
     */
    whenCreated$gt?: Date;
    /**
     * Count only operations indexed strictly before this instant.
     */
    whenCreated$lt?: Date;
    /**
     * Count only operations indexed at or after this instant.
     */
    whenCreated$gte?: Date;
    /**
     * Count only operations indexed at or before this instant.
     */
    whenCreated$lte?: Date;
}

export interface GetStakingOperationsTotalRequest {
    /**
     * Bucket size for a time series. It fixes how many points the series has over
     * the requested window, so a long window with a small interval is an expensive
     * request.
     * 
     */
    interval?: GetStakingOperationsTotalIntervalEnum;
    /**
     * How many items to return in one page. The default and the maximum are both
     * 25; a larger value is rejected with `400`.
     * 
     */
    limit?: number;
    /**
     * Include only operations indexed strictly after this instant.
     */
    whenCreated$gt?: Date;
    /**
     * Include only operations indexed strictly before this instant.
     */
    whenCreated$lt?: Date;
    /**
     * Include only operations indexed at or after this instant.
     */
    whenCreated$gte?: Date;
    /**
     * Include only operations indexed at or before this instant.
     */
    whenCreated$lte?: Date;
}

export interface GetTemplatePublicRequest {
    /**
     * Identifier of the template.
     */
    templateId: string;
}

export interface ListActionLogsRequest {
    /**
     * Return only the resource with this identifier. Equivalent to fetching it by
     * path, but usable together with the other list filters.
     * 
     */
    id?: string;
    /**
     * Return only resources associated with this organization. On protected
     * endpoints, authorization may restrict or replace this value with the
     * credential's active organization.
     * 
     */
    orgId?: string;
    /**
     * How many items to return in one page. The default and the maximum are both
     * 25; a larger value is rejected with `400`.
     * 
     */
    limit?: number;
    /**
     * Search the endpoint's supported text and identifier fields. Matching may be
     * an exact identifier lookup or a case-insensitive prefix search, depending on
     * the resource. Alphanumeric characters only.
     * 
     */
    autocomplete?: string;
    /**
     * Cursor for the next page, taken verbatim from the `next` field of the previous
     * response. Keep every other query parameter the same between pages: `sortBy`
     * and `order` are part of what the cursor means. An absent or empty `next` in a
     * response means there are no more pages.
     * 
     * The value is opaque. Do not parse it or build one yourself.
     * 
     */
    next?: string;
    /**
     * Sort direction. Defaults to `desc`, newest first.
     */
    order?: ListActionLogsOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
    /**
     * Return only this action.
     */
    actionId?: string;
    /**
     * Return only the action with this hash.
     */
    hash?: string;
    /**
     * Return only actions settled in this batch.
     */
    batchId?: string;
    /**
     * Return only actions run by this wallet.
     */
    walletId?: string;
    /**
     * Return only actions that touched this object.
     */
    objectId?: string;
    /**
     * Return only actions run from this address.
     */
    account?: string;
    /**
     * Return only actions in this state: `pending`, `completed` or `failed`.
     * 
     */
    status?: string;
    /**
     * Run strictly after this moment.
     */
    whenCreated$gt?: Date;
    /**
     * Run strictly before this moment.
     */
    whenCreated$lt?: Date;
    /**
     * Run at or after this moment.
     */
    whenCreated$gte?: Date;
    /**
     * Run at or before this moment.
     */
    whenCreated$lte?: Date;
}

export interface ListBatchesRequest {
    /**
     * Return only the resource with this identifier. Equivalent to fetching it by
     * path, but usable together with the other list filters.
     * 
     */
    id?: string;
    /**
     * An organization identifier.
     */
    orgId?: string;
    /**
     * Look up one batch by id or by hash. A 24-character hexadecimal value is
     * treated as an id, anything else as a batch hash.
     * 
     */
    autocomplete?: string;
    /**
     * How many items to return in one page. The default and the maximum are both
     * 25; a larger value is rejected with `400`.
     * 
     */
    limit?: number;
    /**
     * Cursor for the next page, taken verbatim from the `next` field of the previous
     * response. Keep every other query parameter the same between pages: `sortBy`
     * and `order` are part of what the cursor means. An absent or empty `next` in a
     * response means there are no more pages.
     * 
     * The value is opaque. Do not parse it or build one yourself.
     * 
     */
    next?: string;
    /**
     * Sort direction. Defaults to `desc`, newest first.
     */
    order?: ListBatchesOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
    /**
     * Return the batch with this sequence number. Sequence numbers are contiguous and increasing.
     */
    sequence?: number;
    /**
     * An action identifier.
     */
    actionId?: string;
    /**
     * A batch identifier.
     */
    batchId?: string;
    /**
     * Return the batch with this hash.
     */
    hash?: string;
    /**
     * Return only batches in this pipeline stage.
     */
    status?: BatchStatus;
    /**
     * A signer address.
     */
    signer?: string;
    /**
     * Built strictly after this instant.
     */
    whenCreated$gt?: Date;
    /**
     * Built strictly before this instant.
     */
    whenCreated$lt?: Date;
    /**
     * Built at or after this instant.
     */
    whenCreated$gte?: Date;
    /**
     * Built at or before this instant.
     */
    whenCreated$lte?: Date;
    /**
     * Last advanced strictly after this instant.
     */
    whenModified$gt?: Date;
    /**
     * Last advanced strictly before this instant.
     */
    whenModified$lt?: Date;
    /**
     * Last advanced at or after this instant.
     */
    whenModified$gte?: Date;
    /**
     * Last advanced at or before this instant.
     */
    whenModified$lte?: Date;
    /**
     * Challenge window ends strictly after this instant.
     */
    challengeWindowEnd$gt?: Date;
    /**
     * Challenge window ends strictly before this instant.
     */
    challengeWindowEnd$lt?: Date;
    /**
     * Challenge window ends at or after this instant.
     */
    challengeWindowEnd$gte?: Date;
    /**
     * Challenge window ends at or before this instant.
     */
    challengeWindowEnd$lte?: Date;
}

export interface ListCheckpointsRequest {
    /**
     * Return only the resource with this identifier. Equivalent to fetching it by
     * path, but usable together with the other list filters.
     * 
     */
    id?: string;
    /**
     * An organization identifier.
     */
    orgId?: string;
    /**
     * Look up one checkpoint by id or by hash. A 24-character hexadecimal
     * value is treated as an id, anything else as a checkpoint hash.
     * 
     */
    autocomplete?: string;
    /**
     * How many items to return in one page. The default and the maximum are both
     * 25; a larger value is rejected with `400`.
     * 
     */
    limit?: number;
    /**
     * Cursor for the next page, taken verbatim from the `next` field of the previous
     * response. Keep every other query parameter the same between pages: `sortBy`
     * and `order` are part of what the cursor means. An absent or empty `next` in a
     * response means there are no more pages.
     * 
     * The value is opaque. Do not parse it or build one yourself.
     * 
     */
    next?: string;
    /**
     * Sort direction. Defaults to `desc`, newest first.
     */
    order?: ListCheckpointsOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
    /**
     * Return the checkpoint with this hash.
     */
    hash?: string;
    /**
     * Return only checkpoints in this pipeline stage.
     */
    status?: CheckpointStatus;
    /**
     * A signer address.
     */
    signer?: string;
    /**
     * Built after this instant.
     */
    whenCreated$gt?: Date;
    /**
     * Built before this instant.
     */
    whenCreated$lt?: Date;
    /**
     * Built at or after this instant.
     */
    whenCreated$gte?: Date;
    /**
     * Built at or before this instant.
     */
    whenCreated$lte?: Date;
    /**
     * Last advanced after this instant.
     */
    whenModified$gt?: Date;
    /**
     * Last advanced before this instant.
     */
    whenModified$lt?: Date;
    /**
     * Last advanced at or after this instant.
     */
    whenModified$gte?: Date;
    /**
     * Last advanced at or before this instant.
     */
    whenModified$lte?: Date;
}

export interface ListObjectAttributesPublicRequest {
    /**
     * Identifier of the smart object.
     */
    objectId: string;
    /**
     * How many items to return in one page. The default and the maximum are both
     * 25; a larger value is rejected with `400`.
     * 
     */
    limit?: number;
    /**
     * Cursor for the next page, taken verbatim from the `next` field of the previous
     * response. Keep every other query parameter the same between pages: `sortBy`
     * and `order` are part of what the cursor means. An absent or empty `next` in a
     * response means there are no more pages.
     * 
     * The value is opaque. Do not parse it or build one yourself.
     * 
     */
    next?: string;
    /**
     * Return only public attributes in this category.
     */
    category?: string;
}

export interface ListObjectsPublicRequest {
    /**
     * Return only the resource with this identifier. Equivalent to fetching it by
     * path, but usable together with the other list filters.
     * 
     */
    id?: string;
    /**
     * How many items to return in one page. The default and the maximum are both
     * 25; a larger value is rejected with `400`.
     * 
     */
    limit?: number;
    /**
     * Search the endpoint's supported text and identifier fields. Matching may be
     * an exact identifier lookup or a case-insensitive prefix search, depending on
     * the resource. Alphanumeric characters only.
     * 
     */
    autocomplete?: string;
    /**
     * Cursor for the next page, taken verbatim from the `next` field of the previous
     * response. Keep every other query parameter the same between pages: `sortBy`
     * and `order` are part of what the cursor means. An absent or empty `next` in a
     * response means there are no more pages.
     * 
     * The value is opaque. Do not parse it or build one yourself.
     * 
     */
    next?: string;
    /**
     * Sort direction. Defaults to `desc`, newest first.
     */
    order?: ListObjectsPublicOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
    /**
     * An older way of asking for how each object looks. Use
     * `include=display` instead.
     * 
     * @deprecated
     */
    faces?: boolean;
    /**
     * Ask for extras alongside each object. `display` adds a ready-made way to
     * show it.
     * 
     */
    include?: Array<ListObjectsPublicIncludeEnum>;
    /**
     * Which look to resolve when you ask for `include=display`: a tile
     * (`card`), a full page (`detail`) or a link preview (`share`).
     * 
     */
    displayVariant?: ListObjectsPublicDisplayVariantEnum;
    /**
     * Also return what can be done with each object.
     */
    actions?: boolean;
    /**
     * Return only objects held by this address.
     */
    owner?: string;
    /**
     * Return only objects left somewhere to be picked up (`true`), or only
     * objects that have not been (`false`).
     * 
     */
    dropped?: boolean;
    /**
     * Return only objects dropped in this area. The longer the value, the
     * smaller the area.
     * 
     */
    geoHash?: string;
    /**
     * Return only objects made from this template.
     */
    templateId?: string;
    /**
     * Created strictly after this moment.
     */
    whenCreated$gt?: Date;
    /**
     * Created strictly before this moment.
     */
    whenCreated$lt?: Date;
    /**
     * Created at or after this moment.
     */
    whenCreated$gte?: Date;
    /**
     * Created at or before this moment.
     */
    whenCreated$lte?: Date;
    /**
     * Last changed strictly after this moment.
     */
    whenModified$gt?: Date;
    /**
     * Last changed strictly before this moment.
     */
    whenModified$lt?: Date;
    /**
     * Last changed at or after this moment.
     */
    whenModified$gte?: Date;
    /**
     * Last changed at or before this moment.
     */
    whenModified$lte?: Date;
}

export interface ListStakingOperationsRequest {
    /**
     * Return only the resource with this identifier. Equivalent to fetching it by
     * path, but usable together with the other list filters.
     * 
     */
    id?: string;
    /**
     * Search the endpoint's supported text and identifier fields. Matching may be
     * an exact identifier lookup or a case-insensitive prefix search, depending on
     * the resource. Alphanumeric characters only.
     * 
     */
    autocomplete?: string;
    /**
     * How many items to return in one page. The default and the maximum are both
     * 25; a larger value is rejected with `400`.
     * 
     */
    limit?: number;
    /**
     * Cursor for the next page, taken verbatim from the `next` field of the previous
     * response. Keep every other query parameter the same between pages: `sortBy`
     * and `order` are part of what the cursor means. An absent or empty `next` in a
     * response means there are no more pages.
     * 
     * The value is opaque. Do not parse it or build one yourself.
     * 
     */
    next?: string;
    /**
     * Sort direction. Defaults to `desc`, newest first.
     */
    order?: ListStakingOperationsOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
    /**
     * Return only operations by this staker address.
     */
    address?: string;
    /**
     * Return only operations from this transaction.
     */
    txHash?: string;
    /**
     * Return only operations of this kind.
     */
    type?: StakingOperationType;
    /**
     * Indexed strictly after this instant.
     */
    whenCreated$gt?: Date;
    /**
     * Indexed at or after this instant.
     */
    whenCreated$gte?: Date;
    /**
     * Indexed strictly before this instant.
     */
    whenCreated$lt?: Date;
    /**
     * Indexed at or before this instant.
     */
    whenCreated$lte?: Date;
}

export interface ListStateChangesRequest {
    /**
     * Identifier of the smart object.
     */
    objectId: string;
    /**
     * Return only the resource with this identifier. Equivalent to fetching it by
     * path, but usable together with the other list filters.
     * 
     */
    id?: string;
    /**
     * Return only resources associated with this organization. On protected
     * endpoints, authorization may restrict or replace this value with the
     * credential's active organization.
     * 
     */
    orgId?: string;
    /**
     * Search the endpoint's supported text and identifier fields. Matching may be
     * an exact identifier lookup or a case-insensitive prefix search, depending on
     * the resource. Alphanumeric characters only.
     * 
     */
    autocomplete?: string;
    /**
     * How many items to return in one page. The default and the maximum are both
     * 25; a larger value is rejected with `400`.
     * 
     */
    limit?: number;
    /**
     * Cursor for the next page, taken verbatim from the `next` field of the previous
     * response. Keep every other query parameter the same between pages: `sortBy`
     * and `order` are part of what the cursor means. An absent or empty `next` in a
     * response means there are no more pages.
     * 
     * The value is opaque. Do not parse it or build one yourself.
     * 
     */
    next?: string;
    /**
     * Sort direction. Defaults to `desc`, newest first.
     */
    order?: ListStateChangesOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
    /**
     * Return only changes made by this wallet.
     */
    walletId?: string;
    /**
     * Return only the change made by this action.
     */
    actionId?: string;
    /**
     * Return only changes settled in this batch.
     */
    batchId?: string;
    /**
     * Return only changes of this kind: `create` when the object came into
     * being, `update` when it changed, `delete` when it was destroyed.
     * 
     */
    changeType?: string;
    /**
     * Return only changes made by this action, such as `transfer` or `redeem`.
     * 
     */
    actionType?: string;
    /**
     * Return only changes after this point in the object's life. Each change
     * raises the object's count by one, so this walks its history in order.
     * 
     */
    nonce$gt?: number;
    /**
     * Return only changes before this point in the object's life.
     */
    nonce$lt?: number;
    /**
     * Return the change that started from this fingerprint.
     */
    prevStateRoot?: string;
    /**
     * Return the change that produced this fingerprint.
     */
    nextStateRoot?: string;
    /**
     * Happened strictly after this moment.
     */
    whenCreated$gt?: Date;
    /**
     * Happened strictly before this moment.
     */
    whenCreated$lt?: Date;
    /**
     * Happened at or after this moment.
     */
    whenCreated$gte?: Date;
    /**
     * Happened at or before this moment.
     */
    whenCreated$lte?: Date;
}

export interface ListTemplatesPublicRequest {
    /**
     * Return only the resource with this identifier. Equivalent to fetching it by
     * path, but usable together with the other list filters.
     * 
     */
    id?: string;
    /**
     * Return only resources associated with this organization. On protected
     * endpoints, authorization may restrict or replace this value with the
     * credential's active organization.
     * 
     */
    orgId?: string;
    /**
     * Return only resources whose name matches this value exactly.
     */
    name?: string;
    /**
     * Search the endpoint's supported text and identifier fields. Matching may be
     * an exact identifier lookup or a case-insensitive prefix search, depending on
     * the resource. Alphanumeric characters only.
     * 
     */
    autocomplete?: string;
    /**
     * How many items to return in one page. The default and the maximum are both
     * 25; a larger value is rejected with `400`.
     * 
     */
    limit?: number;
    /**
     * Cursor for the next page, taken verbatim from the `next` field of the previous
     * response. Keep every other query parameter the same between pages: `sortBy`
     * and `order` are part of what the cursor means. An absent or empty `next` in a
     * response means there are no more pages.
     * 
     * The value is opaque. Do not parse it or build one yourself.
     * 
     */
    next?: string;
    /**
     * Sort direction. Defaults to `desc`, newest first.
     */
    order?: ListTemplatesPublicOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
    /**
     * Created after this moment.
     */
    whenCreated$gt?: Date;
    /**
     * Created before this moment.
     */
    whenCreated$lt?: Date;
    /**
     * Created at or after this moment.
     */
    whenCreated$gte?: Date;
    /**
     * Created at or before this moment.
     */
    whenCreated$lte?: Date;
}

export interface RenderObjectDisplayByIdPublicRequest {
    /**
     * Identifier of the smart object.
     */
    objectId: string;
    /**
     * Which look to draw.
     */
    variant: DisplayVariant;
}

export interface RenderObjectViewByIdPublicRequest {
    /**
     * Identifier of the smart object.
     */
    objectId: string;
}

/**
 * 
 */
export class ExplorerApi extends runtime.BaseAPI {

    /**
     * Creates request options for getBatch without sending the request
     */
    async getBatchRequestOpts(requestParameters: GetBatchRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['batchId'] == null) {
            throw new runtime.RequiredError(
                'batchId',
                'Required parameter "batchId" was null or undefined when calling getBatch().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/batches/{batchId}`;
        urlPath = urlPath.replace('{batchId}', encodeURIComponent(String(requestParameters['batchId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Everything about one batch: where it sits in the chain of batches, which actions it carried, the fingerprints of network state before and after it, and the on-chain transactions that recorded and settled it.  This is what you need to check a batch for yourself. `commitment` is the value written on chain, `integrity_root` and `prev_integrity_root` fingerprint the network\'s state after and before the batch, `actions_hash` pins the exact list of actions, and `ipfs_url` points to the published data all of it was computed from.  Open to everyone. No sign-in needed. 
     * Get a batch
     */
    async getBatchRaw(requestParameters: GetBatchRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Batch>> {
        const requestOptions = await this.getBatchRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => BatchFromJSON(jsonValue));
    }

    /**
     * Everything about one batch: where it sits in the chain of batches, which actions it carried, the fingerprints of network state before and after it, and the on-chain transactions that recorded and settled it.  This is what you need to check a batch for yourself. `commitment` is the value written on chain, `integrity_root` and `prev_integrity_root` fingerprint the network\'s state after and before the batch, `actions_hash` pins the exact list of actions, and `ipfs_url` points to the published data all of it was computed from.  Open to everyone. No sign-in needed. 
     * Get a batch
     */
    async getBatch(requestParameters: GetBatchRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Batch> {
        const response = await this.getBatchRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getCheckpoint without sending the request
     */
    async getCheckpointRequestOpts(requestParameters: GetCheckpointRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['checkpointId'] == null) {
            throw new runtime.RequiredError(
                'checkpointId',
                'Required parameter "checkpointId" was null or undefined when calling getCheckpoint().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/checkpoints/{checkpointId}`;
        urlPath = urlPath.replace('{checkpointId}', encodeURIComponent(String(requestParameters['checkpointId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * One checkpoint: which batches it covers, the fingerprints at each end of that range, where it sits among the other checkpoints, and the transaction that recorded it on chain.  Open to everyone. No sign-in needed. 
     * Get a checkpoint
     */
    async getCheckpointRaw(requestParameters: GetCheckpointRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Checkpoint>> {
        const requestOptions = await this.getCheckpointRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => CheckpointFromJSON(jsonValue));
    }

    /**
     * One checkpoint: which batches it covers, the fingerprints at each end of that range, where it sits among the other checkpoints, and the transaction that recorded it on chain.  Open to everyone. No sign-in needed. 
     * Get a checkpoint
     */
    async getCheckpoint(requestParameters: GetCheckpointRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Checkpoint> {
        const response = await this.getCheckpointRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getNetworkConfig without sending the request
     */
    async getNetworkConfigRequestOpts(): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network/config`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Where everything lives on chain: which node to talk to, which block explorers to link people to, and the addresses of the contracts behind staking, deposits, the batch record, bridged collectibles, governance and network fees.  Ask for these rather than writing them into your code. They differ between test and live, and an address can change when a contract is replaced.  Open to everyone. No sign-in needed. 
     * Get network configuration
     */
    async getNetworkConfigRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<NetworkConfig>> {
        const requestOptions = await this.getNetworkConfigRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => NetworkConfigFromJSON(jsonValue));
    }

    /**
     * Where everything lives on chain: which node to talk to, which block explorers to link people to, and the addresses of the contracts behind staking, deposits, the batch record, bridged collectibles, governance and network fees.  Ask for these rather than writing them into your code. They differ between test and live, and an address can change when a contract is replaced.  Open to everyone. No sign-in needed. 
     * Get network configuration
     */
    async getNetworkConfig(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<NetworkConfig> {
        const response = await this.getNetworkConfigRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getNetworkFees without sending the request
     */
    async getNetworkFeesRequestOpts(): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network/fees`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * What one action costs right now.  The price has two parts: a fixed base fee, and a moving part that follows what it currently costs the network to prove and settle work. Both are given in DUAL and in wei, alongside the token price they were worked out from.  Quote this before committing a user to a price. The price moves, so read it fresh rather than caching it for long.  Open to everyone. No sign-in needed. 
     * Get the current fee
     */
    async getNetworkFeesRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<NetworkFees>> {
        const requestOptions = await this.getNetworkFeesRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => NetworkFeesFromJSON(jsonValue));
    }

    /**
     * What one action costs right now.  The price has two parts: a fixed base fee, and a moving part that follows what it currently costs the network to prove and settle work. Both are given in DUAL and in wei, alongside the token price they were worked out from.  Quote this before committing a user to a price. The price moves, so read it fresh rather than caching it for long.  Open to everyone. No sign-in needed. 
     * Get the current fee
     */
    async getNetworkFees(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<NetworkFees> {
        const response = await this.getNetworkFeesRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getNetworkInfo without sending the request
     */
    async getNetworkInfoRequestOpts(): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * A quick health check: is the Dual network up, and which version is running? Poll it from a status page or before a batch of work.  Open to everyone. No sign-in needed. 
     * Get network status
     */
    async getNetworkInfoRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<NetworkInfo>> {
        const requestOptions = await this.getNetworkInfoRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => NetworkInfoFromJSON(jsonValue));
    }

    /**
     * A quick health check: is the Dual network up, and which version is running? Poll it from a status page or before a batch of work.  Open to everyone. No sign-in needed. 
     * Get network status
     */
    async getNetworkInfo(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<NetworkInfo> {
        const response = await this.getNetworkInfoRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getNetworkStakingInfo without sending the request
     */
    async getNetworkStakingInfoRequestOpts(): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network/staking`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * A snapshot of staking on the Dual network: how much DUAL is staked right now, how fast rewards are being paid out and when the current reward period ends, how much has been paid and claimed since the beginning, and whether staking is currently paused.  These figures come straight from the staking contract, so they are always up to the minute. That also makes this one of the slower calls here — cache the answer rather than polling it hard.  Amounts are given in wei, the smallest unit of DUAL.  Open to everyone. No sign-in needed. 
     * Get staking contract state
     */
    async getNetworkStakingInfoRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<NetworkStaking>> {
        const requestOptions = await this.getNetworkStakingInfoRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => NetworkStakingFromJSON(jsonValue));
    }

    /**
     * A snapshot of staking on the Dual network: how much DUAL is staked right now, how fast rewards are being paid out and when the current reward period ends, how much has been paid and claimed since the beginning, and whether staking is currently paused.  These figures come straight from the staking contract, so they are always up to the minute. That also makes this one of the slower calls here — cache the answer rather than polling it hard.  Amounts are given in wei, the smallest unit of DUAL.  Open to everyone. No sign-in needed. 
     * Get staking contract state
     */
    async getNetworkStakingInfo(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<NetworkStaking> {
        const response = await this.getNetworkStakingInfoRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getNetworkTokenCirculatingSupply without sending the request
     */
    async getNetworkTokenCirculatingSupplyRequestOpts(): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network/token/circulating-supply`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * How many DUAL are in circulation right now, as a plain number of whole tokens — no JSON wrapper, nothing else in the response:  Circulating supply is the total supply minus everything still locked up and releasing gradually over time, using the deployment\'s configured supply schedule and worked out fresh for each request. The bare number is deliberate: it is the shape price and market trackers expect.  Open to everyone. No sign-in needed. 
     * Get circulating supply
     */
    async getNetworkTokenCirculatingSupplyRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<string>> {
        const requestOptions = await this.getNetworkTokenCirculatingSupplyRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        if (this.isJsonMime(response.headers.get('content-type'))) {
            return new runtime.JSONApiResponse<string>(response);
        } else {
            return new runtime.TextApiResponse(response) as any;
        }
    }

    /**
     * How many DUAL are in circulation right now, as a plain number of whole tokens — no JSON wrapper, nothing else in the response:  Circulating supply is the total supply minus everything still locked up and releasing gradually over time, using the deployment\'s configured supply schedule and worked out fresh for each request. The bare number is deliberate: it is the shape price and market trackers expect.  Open to everyone. No sign-in needed. 
     * Get circulating supply
     */
    async getNetworkTokenCirculatingSupply(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<string> {
        const response = await this.getNetworkTokenCirculatingSupplyRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getNetworkTokenMarketData without sending the request
     */
    async getNetworkTokenMarketDataRequestOpts(): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network/token/market-data`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * What DUAL is worth today: its price, market capitalisation, the last 24 hours of trading and movement, its all-time high and low, and how many tokens exist.  Anything with a price is given per currency — look up `usd`, `eur` or whichever you need by name. The figures come from market data providers and move at their pace, not with every request you make.  Open to everyone. No sign-in needed. 
     * Get token market data
     */
    async getNetworkTokenMarketDataRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<NetworkTokenMarketData>> {
        const requestOptions = await this.getNetworkTokenMarketDataRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => NetworkTokenMarketDataFromJSON(jsonValue));
    }

    /**
     * What DUAL is worth today: its price, market capitalisation, the last 24 hours of trading and movement, its all-time high and low, and how many tokens exist.  Anything with a price is given per currency — look up `usd`, `eur` or whichever you need by name. The figures come from market data providers and move at their pace, not with every request you make.  Open to everyone. No sign-in needed. 
     * Get token market data
     */
    async getNetworkTokenMarketData(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<NetworkTokenMarketData> {
        const response = await this.getNetworkTokenMarketDataRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getNetworkTokenPriceHistory without sending the request
     */
    async getNetworkTokenPriceHistoryRequestOpts(requestParameters: GetNetworkTokenPriceHistoryRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['timeRange'] != null) {
            queryParameters['time_range'] = requestParameters['timeRange'];
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network/token/price-history`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * The DUAL price over time, oldest point first — the line behind a price chart.  `time_range` chooses both how far back to go and how closely to sample, so that every range comes back with a sensible number of points rather than thousands:  | `time_range` | Window | Sampling | | --- | --- | --- | | `today` | Last 24 hours | Every observation, roughly every 5 minutes | | `week` | Last 7 days | Hourly | | `month` | Last 30 days | Hourly | | `year` | Last 12 months | Daily | | `all` | Everything stored | Hourly |  `week` is the default. Prices are given as strings so nothing is rounded away.  Open to everyone. No sign-in needed. 
     * Get token price history
     */
    async getNetworkTokenPriceHistoryRaw(requestParameters: GetNetworkTokenPriceHistoryRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<NetworkTokenPriceHistory>> {
        const requestOptions = await this.getNetworkTokenPriceHistoryRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => NetworkTokenPriceHistoryFromJSON(jsonValue));
    }

    /**
     * The DUAL price over time, oldest point first — the line behind a price chart.  `time_range` chooses both how far back to go and how closely to sample, so that every range comes back with a sensible number of points rather than thousands:  | `time_range` | Window | Sampling | | --- | --- | --- | | `today` | Last 24 hours | Every observation, roughly every 5 minutes | | `week` | Last 7 days | Hourly | | `month` | Last 30 days | Hourly | | `year` | Last 12 months | Daily | | `all` | Everything stored | Hourly |  `week` is the default. Prices are given as strings so nothing is rounded away.  Open to everyone. No sign-in needed. 
     * Get token price history
     */
    async getNetworkTokenPriceHistory(requestParameters: GetNetworkTokenPriceHistoryRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<NetworkTokenPriceHistory> {
        const response = await this.getNetworkTokenPriceHistoryRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getObjectByIdPublic without sending the request
     */
    async getObjectByIdPublicRequestOpts(requestParameters: GetObjectByIdPublicRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['objectId'] == null) {
            throw new runtime.RequiredError(
                'objectId',
                'Required parameter "objectId" was null or undefined when calling getObjectByIdPublic().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/objects/{objectId}`;
        urlPath = urlPath.replace('{objectId}', encodeURIComponent(String(requestParameters['objectId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * One object as anyone can see it: its name, description, picture, current owner, and the details its template publishes.  This is what a marketplace or a shared link shows. For your own organization\'s full view, use `GET /objects/{objectId}`.  Open to everyone. No sign-in needed. 
     * Get a public object
     */
    async getObjectByIdPublicRaw(requestParameters: GetObjectByIdPublicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<PublicSmartObject>> {
        const requestOptions = await this.getObjectByIdPublicRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => PublicSmartObjectFromJSON(jsonValue));
    }

    /**
     * One object as anyone can see it: its name, description, picture, current owner, and the details its template publishes.  This is what a marketplace or a shared link shows. For your own organization\'s full view, use `GET /objects/{objectId}`.  Open to everyone. No sign-in needed. 
     * Get a public object
     */
    async getObjectByIdPublic(requestParameters: GetObjectByIdPublicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<PublicSmartObject> {
        const response = await this.getObjectByIdPublicRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getObjectMetadataByIdPublic without sending the request
     */
    async getObjectMetadataByIdPublicRequestOpts(requestParameters: GetObjectMetadataByIdPublicRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['objectId'] == null) {
            throw new runtime.RequiredError(
                'objectId',
                'Required parameter "objectId" was null or undefined when calling getObjectMetadataByIdPublic().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/objects/{objectId}/metadata`;
        urlPath = urlPath.replace('{objectId}', encodeURIComponent(String(requestParameters['objectId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * An object described in the shape wallets and marketplaces expect for a collectible: `name`, `description`, `image`, `external_url` and a list of `attributes` as trait and value pairs.  Point a collection\'s metadata at this address and the object shows up correctly wherever collectibles are displayed.  Open to everyone. No sign-in needed. 
     * Get an object\'s collectible metadata
     */
    async getObjectMetadataByIdPublicRaw(requestParameters: GetObjectMetadataByIdPublicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<PublicSmartObjectMetadata>> {
        const requestOptions = await this.getObjectMetadataByIdPublicRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => PublicSmartObjectMetadataFromJSON(jsonValue));
    }

    /**
     * An object described in the shape wallets and marketplaces expect for a collectible: `name`, `description`, `image`, `external_url` and a list of `attributes` as trait and value pairs.  Point a collection\'s metadata at this address and the object shows up correctly wherever collectibles are displayed.  Open to everyone. No sign-in needed. 
     * Get an object\'s collectible metadata
     */
    async getObjectMetadataByIdPublic(requestParameters: GetObjectMetadataByIdPublicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<PublicSmartObjectMetadata> {
        const response = await this.getObjectMetadataByIdPublicRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getObjectMetadataByIdPublicLegacy without sending the request
     * @deprecated
     */
    async getObjectMetadataByIdPublicLegacyRequestOpts(requestParameters: GetObjectMetadataByIdPublicLegacyRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['objectId'] == null) {
            throw new runtime.RequiredError(
                'objectId',
                'Required parameter "objectId" was null or undefined when calling getObjectMetadataByIdPublicLegacy().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/metadata/{objectId}`;
        urlPath = urlPath.replace('{objectId}', encodeURIComponent(String(requestParameters['objectId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Legacy path for the same response as `/public/objects/{objectId}/metadata`. It remains available for collections that already reference it. New integrations should use the canonical path. 
     * Get collectible metadata from the legacy path
     * @deprecated
     */
    async getObjectMetadataByIdPublicLegacyRaw(requestParameters: GetObjectMetadataByIdPublicLegacyRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<PublicSmartObjectMetadata>> {
        const requestOptions = await this.getObjectMetadataByIdPublicLegacyRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => PublicSmartObjectMetadataFromJSON(jsonValue));
    }

    /**
     * Legacy path for the same response as `/public/objects/{objectId}/metadata`. It remains available for collections that already reference it. New integrations should use the canonical path. 
     * Get collectible metadata from the legacy path
     * @deprecated
     */
    async getObjectMetadataByIdPublicLegacy(requestParameters: GetObjectMetadataByIdPublicLegacyRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<PublicSmartObjectMetadata> {
        const response = await this.getObjectMetadataByIdPublicLegacyRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getPublicActionStats without sending the request
     */
    async getPublicActionStatsRequestOpts(requestParameters: GetPublicActionStatsRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['from'] != null) {
            queryParameters['from'] = (requestParameters['from'] as any).toISOString();
        }

        if (requestParameters['to'] != null) {
            queryParameters['to'] = (requestParameters['to'] as any).toISOString();
        }

        if (requestParameters['include'] != null) {
            queryParameters['include'] = requestParameters['include']!.join(runtime.COLLECTION_FORMATS["csv"]);
        }

        if (requestParameters['interval'] != null) {
            queryParameters['interval'] = requestParameters['interval'];
        }

        if (requestParameters['top'] != null) {
            queryParameters['top'] = requestParameters['top'];
        }

        if (requestParameters['groupBy'] != null) {
            queryParameters['group_by'] = requestParameters['groupBy'];
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/stats/actions`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * How many actions have been run — the headline number behind an activity dashboard.  Ask for `include=breakdown` to split it by one dimension, and `include=series` to get it over time; both are extra work, so the plain total is what you get by default.  These figures cover the whole network and take no sign-in. For your own organization\'s numbers, use the matching endpoint under `/organizations/{organizationId}/stats/`. 
     * Action statistics
     */
    async getPublicActionStatsRaw(requestParameters: GetPublicActionStatsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<StatsOut>> {
        const requestOptions = await this.getPublicActionStatsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => StatsOutFromJSON(jsonValue));
    }

    /**
     * How many actions have been run — the headline number behind an activity dashboard.  Ask for `include=breakdown` to split it by one dimension, and `include=series` to get it over time; both are extra work, so the plain total is what you get by default.  These figures cover the whole network and take no sign-in. For your own organization\'s numbers, use the matching endpoint under `/organizations/{organizationId}/stats/`. 
     * Action statistics
     */
    async getPublicActionStats(requestParameters: GetPublicActionStatsRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<StatsOut> {
        const response = await this.getPublicActionStatsRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getPublicFeeStats without sending the request
     */
    async getPublicFeeStatsRequestOpts(requestParameters: GetPublicFeeStatsRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['from'] != null) {
            queryParameters['from'] = (requestParameters['from'] as any).toISOString();
        }

        if (requestParameters['to'] != null) {
            queryParameters['to'] = (requestParameters['to'] as any).toISOString();
        }

        if (requestParameters['include'] != null) {
            queryParameters['include'] = requestParameters['include']!.join(runtime.COLLECTION_FORMATS["csv"]);
        }

        if (requestParameters['interval'] != null) {
            queryParameters['interval'] = requestParameters['interval'];
        }

        if (requestParameters['top'] != null) {
            queryParameters['top'] = requestParameters['top'];
        }

        if (requestParameters['groupBy'] != null) {
            queryParameters['group_by'] = requestParameters['groupBy'];
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/stats/fees`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * What has been spent on fees, in DUAL and in wei.  Ask for `include=breakdown` to split it by one dimension, and `include=series` to get it over time; both are extra work, so the plain total is what you get by default.  These figures cover the whole network and take no sign-in. For your own organization\'s numbers, use the matching endpoint under `/organizations/{organizationId}/stats/`. 
     * Fee statistics
     */
    async getPublicFeeStatsRaw(requestParameters: GetPublicFeeStatsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<FeesOut>> {
        const requestOptions = await this.getPublicFeeStatsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => FeesOutFromJSON(jsonValue));
    }

    /**
     * What has been spent on fees, in DUAL and in wei.  Ask for `include=breakdown` to split it by one dimension, and `include=series` to get it over time; both are extra work, so the plain total is what you get by default.  These figures cover the whole network and take no sign-in. For your own organization\'s numbers, use the matching endpoint under `/organizations/{organizationId}/stats/`. 
     * Fee statistics
     */
    async getPublicFeeStats(requestParameters: GetPublicFeeStatsRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<FeesOut> {
        const response = await this.getPublicFeeStatsRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getPublicObjectStats without sending the request
     */
    async getPublicObjectStatsRequestOpts(requestParameters: GetPublicObjectStatsRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['from'] != null) {
            queryParameters['from'] = (requestParameters['from'] as any).toISOString();
        }

        if (requestParameters['to'] != null) {
            queryParameters['to'] = (requestParameters['to'] as any).toISOString();
        }

        if (requestParameters['include'] != null) {
            queryParameters['include'] = requestParameters['include']!.join(runtime.COLLECTION_FORMATS["csv"]);
        }

        if (requestParameters['interval'] != null) {
            queryParameters['interval'] = requestParameters['interval'];
        }

        if (requestParameters['top'] != null) {
            queryParameters['top'] = requestParameters['top'];
        }

        if (requestParameters['groupBy'] != null) {
            queryParameters['group_by'] = requestParameters['groupBy'];
        }

        if (requestParameters['templateId'] != null) {
            queryParameters['template_id'] = requestParameters['templateId'];
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/stats/objects`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * How many objects exist — tickets issued, cards created, and so on.  Ask for `include=breakdown` to split it by one dimension, and `include=series` to get it over time; both are extra work, so the plain total is what you get by default.  These figures cover the whole network and take no sign-in. For your own organization\'s numbers, use the matching endpoint under `/organizations/{organizationId}/stats/`. 
     * Object statistics
     */
    async getPublicObjectStatsRaw(requestParameters: GetPublicObjectStatsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<StatsOut>> {
        const requestOptions = await this.getPublicObjectStatsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => StatsOutFromJSON(jsonValue));
    }

    /**
     * How many objects exist — tickets issued, cards created, and so on.  Ask for `include=breakdown` to split it by one dimension, and `include=series` to get it over time; both are extra work, so the plain total is what you get by default.  These figures cover the whole network and take no sign-in. For your own organization\'s numbers, use the matching endpoint under `/organizations/{organizationId}/stats/`. 
     * Object statistics
     */
    async getPublicObjectStats(requestParameters: GetPublicObjectStatsRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<StatsOut> {
        const response = await this.getPublicObjectStatsRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getPublicWalletStats without sending the request
     */
    async getPublicWalletStatsRequestOpts(requestParameters: GetPublicWalletStatsRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['from'] != null) {
            queryParameters['from'] = (requestParameters['from'] as any).toISOString();
        }

        if (requestParameters['to'] != null) {
            queryParameters['to'] = (requestParameters['to'] as any).toISOString();
        }

        if (requestParameters['include'] != null) {
            queryParameters['include'] = requestParameters['include']!.join(runtime.COLLECTION_FORMATS["csv"]);
        }

        if (requestParameters['interval'] != null) {
            queryParameters['interval'] = requestParameters['interval'];
        }

        if (requestParameters['top'] != null) {
            queryParameters['top'] = requestParameters['top'];
        }

        if (requestParameters['groupBy'] != null) {
            queryParameters['group_by'] = requestParameters['groupBy'];
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/stats/wallets`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * How many wallets there are — the people and accounts on the network.  Ask for `include=breakdown` to split it by one dimension, and `include=series` to get it over time; both are extra work, so the plain total is what you get by default.  These figures cover the whole network and take no sign-in. For your own organization\'s numbers, use the matching endpoint under `/organizations/{organizationId}/stats/`. 
     * Wallet statistics
     */
    async getPublicWalletStatsRaw(requestParameters: GetPublicWalletStatsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<StatsOut>> {
        const requestOptions = await this.getPublicWalletStatsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => StatsOutFromJSON(jsonValue));
    }

    /**
     * How many wallets there are — the people and accounts on the network.  Ask for `include=breakdown` to split it by one dimension, and `include=series` to get it over time; both are extra work, so the plain total is what you get by default.  These figures cover the whole network and take no sign-in. For your own organization\'s numbers, use the matching endpoint under `/organizations/{organizationId}/stats/`. 
     * Wallet statistics
     */
    async getPublicWalletStats(requestParameters: GetPublicWalletStatsRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<StatsOut> {
        const response = await this.getPublicWalletStatsRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getStakingOperationsStats without sending the request
     */
    async getStakingOperationsStatsRequestOpts(requestParameters: GetStakingOperationsStatsRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['interval'] != null) {
            queryParameters['interval'] = requestParameters['interval'];
        }

        if (requestParameters['timeRange'] != null) {
            queryParameters['time_range'] = requestParameters['timeRange'];
        }

        if (requestParameters['limit'] != null) {
            queryParameters['limit'] = requestParameters['limit'];
        }

        if (requestParameters['whenCreated$gt'] != null) {
            queryParameters['when_created[$gt]'] = (requestParameters['whenCreated$gt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lt'] != null) {
            queryParameters['when_created[$lt]'] = (requestParameters['whenCreated$lt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$gte'] != null) {
            queryParameters['when_created[$gte]'] = (requestParameters['whenCreated$gte'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lte'] != null) {
            queryParameters['when_created[$lte]'] = (requestParameters['whenCreated$lte'] as any).toISOString();
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network/staking/operations/stats`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Staking activity over time, ready to plot. Each point covers one period and one kind of event, and tells you which kind it was (`key`), how many there were (`count`) and how much DUAL they moved (`amount`, in wei). `total` counts every event in the range you asked for.  Choose a period with `interval`, and a range with either `time_range` or the `when_created` dates — not both, as `time_range` wins.  For a running \"total staked\" line use `/public/network/staking/operations/total`. For how things stand right now use `/public/network/staking`.  Open to everyone. No sign-in needed. 
     * Get staking operation statistics
     */
    async getStakingOperationsStatsRaw(requestParameters: GetStakingOperationsStatsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<StakingOperationsStats>> {
        const requestOptions = await this.getStakingOperationsStatsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => StakingOperationsStatsFromJSON(jsonValue));
    }

    /**
     * Staking activity over time, ready to plot. Each point covers one period and one kind of event, and tells you which kind it was (`key`), how many there were (`count`) and how much DUAL they moved (`amount`, in wei). `total` counts every event in the range you asked for.  Choose a period with `interval`, and a range with either `time_range` or the `when_created` dates — not both, as `time_range` wins.  For a running \"total staked\" line use `/public/network/staking/operations/total`. For how things stand right now use `/public/network/staking`.  Open to everyone. No sign-in needed. 
     * Get staking operation statistics
     */
    async getStakingOperationsStats(requestParameters: GetStakingOperationsStatsRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<StakingOperationsStats> {
        const response = await this.getStakingOperationsStatsRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getStakingOperationsTotal without sending the request
     */
    async getStakingOperationsTotalRequestOpts(requestParameters: GetStakingOperationsTotalRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['interval'] != null) {
            queryParameters['interval'] = requestParameters['interval'];
        }

        if (requestParameters['limit'] != null) {
            queryParameters['limit'] = requestParameters['limit'];
        }

        if (requestParameters['whenCreated$gt'] != null) {
            queryParameters['when_created[$gt]'] = (requestParameters['whenCreated$gt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lt'] != null) {
            queryParameters['when_created[$lt]'] = (requestParameters['whenCreated$lt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$gte'] != null) {
            queryParameters['when_created[$gte]'] = (requestParameters['whenCreated$gte'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lte'] != null) {
            queryParameters['when_created[$lte]'] = (requestParameters['whenCreated$lte'] as any).toISOString();
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network/staking/operations/total`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * The line behind a \"total staked\" chart: how much DUAL was staked in total at each point in time. Each point is the running total at that moment, not the amount that moved during it.  `total` tells you how many points came back.  Amounts are in wei, the smallest unit of DUAL. Figures settle within a minute or two, so something that just happened may not show yet.  Open to everyone. No sign-in needed. 
     * Get cumulative staking totals
     */
    async getStakingOperationsTotalRaw(requestParameters: GetStakingOperationsTotalRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<StakingOperationsStats>> {
        const requestOptions = await this.getStakingOperationsTotalRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => StakingOperationsStatsFromJSON(jsonValue));
    }

    /**
     * The line behind a \"total staked\" chart: how much DUAL was staked in total at each point in time. Each point is the running total at that moment, not the amount that moved during it.  `total` tells you how many points came back.  Amounts are in wei, the smallest unit of DUAL. Figures settle within a minute or two, so something that just happened may not show yet.  Open to everyone. No sign-in needed. 
     * Get cumulative staking totals
     */
    async getStakingOperationsTotal(requestParameters: GetStakingOperationsTotalRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<StakingOperationsStats> {
        const response = await this.getStakingOperationsTotalRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getTemplatePublic without sending the request
     */
    async getTemplatePublicRequestOpts(requestParameters: GetTemplatePublicRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['templateId'] == null) {
            throw new runtime.RequiredError(
                'templateId',
                'Required parameter "templateId" was null or undefined when calling getTemplatePublic().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/templates/{templateId}`;
        urlPath = urlPath.replace('{templateId}', encodeURIComponent(String(requestParameters['templateId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * One template as anyone can see it: its name and description, what can be done with objects made from it, how it looks, and how many exist out of how many were allowed.  Only the details the organization has chosen to show are included. For your own template in full, use `GET /templates/{templateId}`.  Open to everyone. No sign-in needed. 
     * Get a public template
     */
    async getTemplatePublicRaw(requestParameters: GetTemplatePublicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<PublicTemplate>> {
        const requestOptions = await this.getTemplatePublicRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => PublicTemplateFromJSON(jsonValue));
    }

    /**
     * One template as anyone can see it: its name and description, what can be done with objects made from it, how it looks, and how many exist out of how many were allowed.  Only the details the organization has chosen to show are included. For your own template in full, use `GET /templates/{templateId}`.  Open to everyone. No sign-in needed. 
     * Get a public template
     */
    async getTemplatePublic(requestParameters: GetTemplatePublicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<PublicTemplate> {
        const response = await this.getTemplatePublicRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listActionLogs without sending the request
     */
    async listActionLogsRequestOpts(requestParameters: ListActionLogsRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['id'] != null) {
            queryParameters['id'] = requestParameters['id'];
        }

        if (requestParameters['orgId'] != null) {
            queryParameters['org_id'] = requestParameters['orgId'];
        }

        if (requestParameters['limit'] != null) {
            queryParameters['limit'] = requestParameters['limit'];
        }

        if (requestParameters['autocomplete'] != null) {
            queryParameters['autocomplete'] = requestParameters['autocomplete'];
        }

        if (requestParameters['next'] != null) {
            queryParameters['next'] = requestParameters['next'];
        }

        if (requestParameters['order'] != null) {
            queryParameters['order'] = requestParameters['order'];
        }

        if (requestParameters['sortBy'] != null) {
            queryParameters['sortBy'] = requestParameters['sortBy'];
        }

        if (requestParameters['actionId'] != null) {
            queryParameters['action_id'] = requestParameters['actionId'];
        }

        if (requestParameters['hash'] != null) {
            queryParameters['hash'] = requestParameters['hash'];
        }

        if (requestParameters['batchId'] != null) {
            queryParameters['batch_id'] = requestParameters['batchId'];
        }

        if (requestParameters['walletId'] != null) {
            queryParameters['wallet_id'] = requestParameters['walletId'];
        }

        if (requestParameters['objectId'] != null) {
            queryParameters['object_id'] = requestParameters['objectId'];
        }

        if (requestParameters['account'] != null) {
            queryParameters['account'] = requestParameters['account'];
        }

        if (requestParameters['status'] != null) {
            queryParameters['status'] = requestParameters['status'];
        }

        if (requestParameters['whenCreated$gt'] != null) {
            queryParameters['when_created[$gt]'] = (requestParameters['whenCreated$gt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lt'] != null) {
            queryParameters['when_created[$lt]'] = (requestParameters['whenCreated$lt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$gte'] != null) {
            queryParameters['when_created[$gte]'] = (requestParameters['whenCreated$gte'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lte'] != null) {
            queryParameters['when_created[$lte]'] = (requestParameters['whenCreated$lte'] as any).toISOString();
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/ebus/action-logs`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Everything that has been done, newest first — the audit trail. Each entry records what was done, who signed it, what it affected, what it cost, and which batch settled it.  `status` follows an action to the chain: `pending` while it is waiting to be settled, `completed` once its batch is anchored, `failed` if settling could not be completed.  This is a public explorer endpoint. Use `org_id`, `account`, `wallet_id`, or the other filters to narrow the public record. 
     * List actions
     */
    async listActionLogsRaw(requestParameters: ListActionLogsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListActionLogsOut>> {
        const requestOptions = await this.listActionLogsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListActionLogsOutFromJSON(jsonValue));
    }

    /**
     * Everything that has been done, newest first — the audit trail. Each entry records what was done, who signed it, what it affected, what it cost, and which batch settled it.  `status` follows an action to the chain: `pending` while it is waiting to be settled, `completed` once its batch is anchored, `failed` if settling could not be completed.  This is a public explorer endpoint. Use `org_id`, `account`, `wallet_id`, or the other filters to narrow the public record. 
     * List actions
     */
    async listActionLogs(requestParameters: ListActionLogsRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListActionLogsOut> {
        const response = await this.listActionLogsRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listBatches without sending the request
     */
    async listBatchesRequestOpts(requestParameters: ListBatchesRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['id'] != null) {
            queryParameters['id'] = requestParameters['id'];
        }

        if (requestParameters['orgId'] != null) {
            queryParameters['org_id'] = requestParameters['orgId'];
        }

        if (requestParameters['autocomplete'] != null) {
            queryParameters['autocomplete'] = requestParameters['autocomplete'];
        }

        if (requestParameters['limit'] != null) {
            queryParameters['limit'] = requestParameters['limit'];
        }

        if (requestParameters['next'] != null) {
            queryParameters['next'] = requestParameters['next'];
        }

        if (requestParameters['order'] != null) {
            queryParameters['order'] = requestParameters['order'];
        }

        if (requestParameters['sortBy'] != null) {
            queryParameters['sortBy'] = requestParameters['sortBy'];
        }

        if (requestParameters['sequence'] != null) {
            queryParameters['sequence'] = requestParameters['sequence'];
        }

        if (requestParameters['actionId'] != null) {
            queryParameters['action_id'] = requestParameters['actionId'];
        }

        if (requestParameters['batchId'] != null) {
            queryParameters['batch_id'] = requestParameters['batchId'];
        }

        if (requestParameters['hash'] != null) {
            queryParameters['hash'] = requestParameters['hash'];
        }

        if (requestParameters['status'] != null) {
            queryParameters['status'] = requestParameters['status'];
        }

        if (requestParameters['signer'] != null) {
            queryParameters['signer'] = requestParameters['signer'];
        }

        if (requestParameters['whenCreated$gt'] != null) {
            queryParameters['when_created[$gt]'] = (requestParameters['whenCreated$gt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lt'] != null) {
            queryParameters['when_created[$lt]'] = (requestParameters['whenCreated$lt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$gte'] != null) {
            queryParameters['when_created[$gte]'] = (requestParameters['whenCreated$gte'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lte'] != null) {
            queryParameters['when_created[$lte]'] = (requestParameters['whenCreated$lte'] as any).toISOString();
        }

        if (requestParameters['whenModified$gt'] != null) {
            queryParameters['when_modified[$gt]'] = (requestParameters['whenModified$gt'] as any).toISOString();
        }

        if (requestParameters['whenModified$lt'] != null) {
            queryParameters['when_modified[$lt]'] = (requestParameters['whenModified$lt'] as any).toISOString();
        }

        if (requestParameters['whenModified$gte'] != null) {
            queryParameters['when_modified[$gte]'] = (requestParameters['whenModified$gte'] as any).toISOString();
        }

        if (requestParameters['whenModified$lte'] != null) {
            queryParameters['when_modified[$lte]'] = (requestParameters['whenModified$lte'] as any).toISOString();
        }

        if (requestParameters['challengeWindowEnd$gt'] != null) {
            queryParameters['challenge_window_end[$gt]'] = (requestParameters['challengeWindowEnd$gt'] as any).toISOString();
        }

        if (requestParameters['challengeWindowEnd$lt'] != null) {
            queryParameters['challenge_window_end[$lt]'] = (requestParameters['challengeWindowEnd$lt'] as any).toISOString();
        }

        if (requestParameters['challengeWindowEnd$gte'] != null) {
            queryParameters['challenge_window_end[$gte]'] = (requestParameters['challengeWindowEnd$gte'] as any).toISOString();
        }

        if (requestParameters['challengeWindowEnd$lte'] != null) {
            queryParameters['challenge_window_end[$lte]'] = (requestParameters['challengeWindowEnd$lte'] as any).toISOString();
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/batches`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Batches, newest first. A batch is a group of actions that were put in order, proved and written to the blockchain together — the step that makes them permanent.  `status` tells you how far along a batch is:  ``` building → requesting → proving → storing → anchoring → nfts → settling → finalized ```  `finalized` means it is on chain and settled for good. `failed` means it could not be completed. Anything in between is still under way, which is normal for a recent batch.  To find the batch behind one of your actions, look the action up in `GET /ebus/action-logs` and follow the batch it names.  Open to everyone. No sign-in needed. 
     * List batches
     */
    async listBatchesRaw(requestParameters: ListBatchesRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListBatchesOut>> {
        const requestOptions = await this.listBatchesRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListBatchesOutFromJSON(jsonValue));
    }

    /**
     * Batches, newest first. A batch is a group of actions that were put in order, proved and written to the blockchain together — the step that makes them permanent.  `status` tells you how far along a batch is:  ``` building → requesting → proving → storing → anchoring → nfts → settling → finalized ```  `finalized` means it is on chain and settled for good. `failed` means it could not be completed. Anything in between is still under way, which is normal for a recent batch.  To find the batch behind one of your actions, look the action up in `GET /ebus/action-logs` and follow the batch it names.  Open to everyone. No sign-in needed. 
     * List batches
     */
    async listBatches(requestParameters: ListBatchesRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListBatchesOut> {
        const response = await this.listBatchesRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listCheckpoints without sending the request
     */
    async listCheckpointsRequestOpts(requestParameters: ListCheckpointsRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['id'] != null) {
            queryParameters['id'] = requestParameters['id'];
        }

        if (requestParameters['orgId'] != null) {
            queryParameters['org_id'] = requestParameters['orgId'];
        }

        if (requestParameters['autocomplete'] != null) {
            queryParameters['autocomplete'] = requestParameters['autocomplete'];
        }

        if (requestParameters['limit'] != null) {
            queryParameters['limit'] = requestParameters['limit'];
        }

        if (requestParameters['next'] != null) {
            queryParameters['next'] = requestParameters['next'];
        }

        if (requestParameters['order'] != null) {
            queryParameters['order'] = requestParameters['order'];
        }

        if (requestParameters['sortBy'] != null) {
            queryParameters['sortBy'] = requestParameters['sortBy'];
        }

        if (requestParameters['hash'] != null) {
            queryParameters['hash'] = requestParameters['hash'];
        }

        if (requestParameters['status'] != null) {
            queryParameters['status'] = requestParameters['status'];
        }

        if (requestParameters['signer'] != null) {
            queryParameters['signer'] = requestParameters['signer'];
        }

        if (requestParameters['whenCreated$gt'] != null) {
            queryParameters['when_created[$gt]'] = (requestParameters['whenCreated$gt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lt'] != null) {
            queryParameters['when_created[$lt]'] = (requestParameters['whenCreated$lt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$gte'] != null) {
            queryParameters['when_created[$gte]'] = (requestParameters['whenCreated$gte'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lte'] != null) {
            queryParameters['when_created[$lte]'] = (requestParameters['whenCreated$lte'] as any).toISOString();
        }

        if (requestParameters['whenModified$gt'] != null) {
            queryParameters['when_modified[$gt]'] = (requestParameters['whenModified$gt'] as any).toISOString();
        }

        if (requestParameters['whenModified$lt'] != null) {
            queryParameters['when_modified[$lt]'] = (requestParameters['whenModified$lt'] as any).toISOString();
        }

        if (requestParameters['whenModified$gte'] != null) {
            queryParameters['when_modified[$gte]'] = (requestParameters['whenModified$gte'] as any).toISOString();
        }

        if (requestParameters['whenModified$lte'] != null) {
            queryParameters['when_modified[$lte]'] = (requestParameters['whenModified$lte'] as any).toISOString();
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/checkpoints`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Checkpoints, newest first. A checkpoint stands in for a long run of settled batches at once, so that checking a stretch of history does not mean walking through every batch inside it.  Each one names the first and last batch it covers, so the range it speaks for is `start_sequence` to `end_sequence`.  A checkpoint goes through the same stages as a batch, without the on-chain collectible and settlement steps:  ``` building → requesting → proving → storing → anchoring → finalized ```  Open to everyone. No sign-in needed. 
     * List checkpoints
     */
    async listCheckpointsRaw(requestParameters: ListCheckpointsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListCheckpointsOut>> {
        const requestOptions = await this.listCheckpointsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListCheckpointsOutFromJSON(jsonValue));
    }

    /**
     * Checkpoints, newest first. A checkpoint stands in for a long run of settled batches at once, so that checking a stretch of history does not mean walking through every batch inside it.  Each one names the first and last batch it covers, so the range it speaks for is `start_sequence` to `end_sequence`.  A checkpoint goes through the same stages as a batch, without the on-chain collectible and settlement steps:  ``` building → requesting → proving → storing → anchoring → finalized ```  Open to everyone. No sign-in needed. 
     * List checkpoints
     */
    async listCheckpoints(requestParameters: ListCheckpointsRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListCheckpointsOut> {
        const response = await this.listCheckpointsRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listObjectAttributesPublic without sending the request
     */
    async listObjectAttributesPublicRequestOpts(requestParameters: ListObjectAttributesPublicRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['objectId'] == null) {
            throw new runtime.RequiredError(
                'objectId',
                'Required parameter "objectId" was null or undefined when calling listObjectAttributesPublic().'
            );
        }

        const queryParameters: any = {};

        if (requestParameters['limit'] != null) {
            queryParameters['limit'] = requestParameters['limit'];
        }

        if (requestParameters['next'] != null) {
            queryParameters['next'] = requestParameters['next'];
        }

        if (requestParameters['category'] != null) {
            queryParameters['category'] = requestParameters['category'];
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/objects/{objectId}/attributes`;
        urlPath = urlPath.replace('{objectId}', encodeURIComponent(String(requestParameters['objectId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * The extra details on an object that have been marked public — a tier, a stamp, a verification. Everything else stays private.  Open to everyone. No sign-in needed. 
     * List an object\'s public attributes
     */
    async listObjectAttributesPublicRaw(requestParameters: ListObjectAttributesPublicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListPublicObjectAttributesOut>> {
        const requestOptions = await this.listObjectAttributesPublicRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListPublicObjectAttributesOutFromJSON(jsonValue));
    }

    /**
     * The extra details on an object that have been marked public — a tier, a stamp, a verification. Everything else stays private.  Open to everyone. No sign-in needed. 
     * List an object\'s public attributes
     */
    async listObjectAttributesPublic(requestParameters: ListObjectAttributesPublicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListPublicObjectAttributesOut> {
        const response = await this.listObjectAttributesPublicRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listObjectsPublic without sending the request
     */
    async listObjectsPublicRequestOpts(requestParameters: ListObjectsPublicRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['id'] != null) {
            queryParameters['id'] = requestParameters['id'];
        }

        if (requestParameters['limit'] != null) {
            queryParameters['limit'] = requestParameters['limit'];
        }

        if (requestParameters['autocomplete'] != null) {
            queryParameters['autocomplete'] = requestParameters['autocomplete'];
        }

        if (requestParameters['next'] != null) {
            queryParameters['next'] = requestParameters['next'];
        }

        if (requestParameters['order'] != null) {
            queryParameters['order'] = requestParameters['order'];
        }

        if (requestParameters['sortBy'] != null) {
            queryParameters['sortBy'] = requestParameters['sortBy'];
        }

        if (requestParameters['faces'] != null) {
            queryParameters['faces'] = requestParameters['faces'];
        }

        if (requestParameters['include'] != null) {
            queryParameters['include'] = requestParameters['include']!.join(runtime.COLLECTION_FORMATS["csv"]);
        }

        if (requestParameters['displayVariant'] != null) {
            queryParameters['display_variant'] = requestParameters['displayVariant'];
        }

        if (requestParameters['actions'] != null) {
            queryParameters['actions'] = requestParameters['actions'];
        }

        if (requestParameters['owner'] != null) {
            queryParameters['owner'] = requestParameters['owner'];
        }

        if (requestParameters['dropped'] != null) {
            queryParameters['dropped'] = requestParameters['dropped'];
        }

        if (requestParameters['geoHash'] != null) {
            queryParameters['geo_hash'] = requestParameters['geoHash'];
        }

        if (requestParameters['templateId'] != null) {
            queryParameters['template_id'] = requestParameters['templateId'];
        }

        if (requestParameters['whenCreated$gt'] != null) {
            queryParameters['when_created[$gt]'] = (requestParameters['whenCreated$gt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lt'] != null) {
            queryParameters['when_created[$lt]'] = (requestParameters['whenCreated$lt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$gte'] != null) {
            queryParameters['when_created[$gte]'] = (requestParameters['whenCreated$gte'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lte'] != null) {
            queryParameters['when_created[$lte]'] = (requestParameters['whenCreated$lte'] as any).toISOString();
        }

        if (requestParameters['whenModified$gt'] != null) {
            queryParameters['when_modified[$gt]'] = (requestParameters['whenModified$gt'] as any).toISOString();
        }

        if (requestParameters['whenModified$lt'] != null) {
            queryParameters['when_modified[$lt]'] = (requestParameters['whenModified$lt'] as any).toISOString();
        }

        if (requestParameters['whenModified$gte'] != null) {
            queryParameters['when_modified[$gte]'] = (requestParameters['whenModified$gte'] as any).toISOString();
        }

        if (requestParameters['whenModified$lte'] != null) {
            queryParameters['when_modified[$lte]'] = (requestParameters['whenModified$lte'] as any).toISOString();
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/objects`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Objects on the network as anyone can see them — the view behind an explorer, a marketplace listing or a public gallery.  Each object shows its name, description, picture, current owner and the details its template chooses to publish. Anything an organization keeps to itself is left out.  Add `include=display` to get a ready-made way to show each object, in the look you name with `display_variant`.  Open to everyone. No sign-in needed. 
     * List public objects
     */
    async listObjectsPublicRaw(requestParameters: ListObjectsPublicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListPublicSmartObjectsOut>> {
        const requestOptions = await this.listObjectsPublicRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListPublicSmartObjectsOutFromJSON(jsonValue));
    }

    /**
     * Objects on the network as anyone can see them — the view behind an explorer, a marketplace listing or a public gallery.  Each object shows its name, description, picture, current owner and the details its template chooses to publish. Anything an organization keeps to itself is left out.  Add `include=display` to get a ready-made way to show each object, in the look you name with `display_variant`.  Open to everyone. No sign-in needed. 
     * List public objects
     */
    async listObjectsPublic(requestParameters: ListObjectsPublicRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListPublicSmartObjectsOut> {
        const response = await this.listObjectsPublicRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listStakingOperations without sending the request
     */
    async listStakingOperationsRequestOpts(requestParameters: ListStakingOperationsRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['id'] != null) {
            queryParameters['id'] = requestParameters['id'];
        }

        if (requestParameters['autocomplete'] != null) {
            queryParameters['autocomplete'] = requestParameters['autocomplete'];
        }

        if (requestParameters['limit'] != null) {
            queryParameters['limit'] = requestParameters['limit'];
        }

        if (requestParameters['next'] != null) {
            queryParameters['next'] = requestParameters['next'];
        }

        if (requestParameters['order'] != null) {
            queryParameters['order'] = requestParameters['order'];
        }

        if (requestParameters['sortBy'] != null) {
            queryParameters['sortBy'] = requestParameters['sortBy'];
        }

        if (requestParameters['address'] != null) {
            queryParameters['address'] = requestParameters['address'];
        }

        if (requestParameters['txHash'] != null) {
            queryParameters['tx_hash'] = requestParameters['txHash'];
        }

        if (requestParameters['type'] != null) {
            queryParameters['type'] = requestParameters['type'];
        }

        if (requestParameters['whenCreated$gt'] != null) {
            queryParameters['when_created[$gt]'] = (requestParameters['whenCreated$gt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$gte'] != null) {
            queryParameters['when_created[$gte]'] = (requestParameters['whenCreated$gte'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lt'] != null) {
            queryParameters['when_created[$lt]'] = (requestParameters['whenCreated$lt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lte'] != null) {
            queryParameters['when_created[$lte]'] = (requestParameters['whenCreated$lte'] as any).toISOString();
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/network/staking/operations`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Every stake, unstake, reward payout and fee contribution on the network, newest first, each with the address behind it and the transaction that carried it.  Events appear here shortly after their transaction is mined.  Amounts are given in wei, the smallest unit of DUAL.  Open to everyone. No sign-in needed. 
     * List staking operations
     */
    async listStakingOperationsRaw(requestParameters: ListStakingOperationsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListStakingOperationsOut>> {
        const requestOptions = await this.listStakingOperationsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListStakingOperationsOutFromJSON(jsonValue));
    }

    /**
     * Every stake, unstake, reward payout and fee contribution on the network, newest first, each with the address behind it and the transaction that carried it.  Events appear here shortly after their transaction is mined.  Amounts are given in wei, the smallest unit of DUAL.  Open to everyone. No sign-in needed. 
     * List staking operations
     */
    async listStakingOperations(requestParameters: ListStakingOperationsRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListStakingOperationsOut> {
        const response = await this.listStakingOperationsRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listStateChanges without sending the request
     */
    async listStateChangesRequestOpts(requestParameters: ListStateChangesRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['objectId'] == null) {
            throw new runtime.RequiredError(
                'objectId',
                'Required parameter "objectId" was null or undefined when calling listStateChanges().'
            );
        }

        const queryParameters: any = {};

        if (requestParameters['id'] != null) {
            queryParameters['id'] = requestParameters['id'];
        }

        if (requestParameters['orgId'] != null) {
            queryParameters['org_id'] = requestParameters['orgId'];
        }

        if (requestParameters['autocomplete'] != null) {
            queryParameters['autocomplete'] = requestParameters['autocomplete'];
        }

        if (requestParameters['limit'] != null) {
            queryParameters['limit'] = requestParameters['limit'];
        }

        if (requestParameters['next'] != null) {
            queryParameters['next'] = requestParameters['next'];
        }

        if (requestParameters['order'] != null) {
            queryParameters['order'] = requestParameters['order'];
        }

        if (requestParameters['sortBy'] != null) {
            queryParameters['sortBy'] = requestParameters['sortBy'];
        }

        if (requestParameters['walletId'] != null) {
            queryParameters['wallet_id'] = requestParameters['walletId'];
        }

        if (requestParameters['actionId'] != null) {
            queryParameters['action_id'] = requestParameters['actionId'];
        }

        if (requestParameters['batchId'] != null) {
            queryParameters['batch_id'] = requestParameters['batchId'];
        }

        if (requestParameters['changeType'] != null) {
            queryParameters['change_type'] = requestParameters['changeType'];
        }

        if (requestParameters['actionType'] != null) {
            queryParameters['action_type'] = requestParameters['actionType'];
        }

        if (requestParameters['nonce$gt'] != null) {
            queryParameters['nonce[$gt]'] = requestParameters['nonce$gt'];
        }

        if (requestParameters['nonce$lt'] != null) {
            queryParameters['nonce[$lt]'] = requestParameters['nonce$lt'];
        }

        if (requestParameters['prevStateRoot'] != null) {
            queryParameters['prev_state_root'] = requestParameters['prevStateRoot'];
        }

        if (requestParameters['nextStateRoot'] != null) {
            queryParameters['next_state_root'] = requestParameters['nextStateRoot'];
        }

        if (requestParameters['whenCreated$gt'] != null) {
            queryParameters['when_created[$gt]'] = (requestParameters['whenCreated$gt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lt'] != null) {
            queryParameters['when_created[$lt]'] = (requestParameters['whenCreated$lt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$gte'] != null) {
            queryParameters['when_created[$gte]'] = (requestParameters['whenCreated$gte'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lte'] != null) {
            queryParameters['when_created[$lte]'] = (requestParameters['whenCreated$lte'] as any).toISOString();
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/objects/{objectId}/state-changes`;
        urlPath = urlPath.replace('{objectId}', encodeURIComponent(String(requestParameters['objectId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Everything that has ever happened to one object, newest first: what was done, by whom, when, and which batch made it permanent.  Each entry records the owner before and after, the fingerprints of the object before and after, and the batch that settled it — enough to follow a ticket from the moment it was issued to the moment it was used, and to prove every step along the way.  This is the object\'s public audit history. No sign-in is needed. 
     * List an object\'s history
     */
    async listStateChangesRaw(requestParameters: ListStateChangesRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListStateChangesOut>> {
        const requestOptions = await this.listStateChangesRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListStateChangesOutFromJSON(jsonValue));
    }

    /**
     * Everything that has ever happened to one object, newest first: what was done, by whom, when, and which batch made it permanent.  Each entry records the owner before and after, the fingerprints of the object before and after, and the batch that settled it — enough to follow a ticket from the moment it was issued to the moment it was used, and to prove every step along the way.  This is the object\'s public audit history. No sign-in is needed. 
     * List an object\'s history
     */
    async listStateChanges(requestParameters: ListStateChangesRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListStateChangesOut> {
        const response = await this.listStateChangesRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listTemplatesPublic without sending the request
     */
    async listTemplatesPublicRequestOpts(requestParameters: ListTemplatesPublicRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['id'] != null) {
            queryParameters['id'] = requestParameters['id'];
        }

        if (requestParameters['orgId'] != null) {
            queryParameters['org_id'] = requestParameters['orgId'];
        }

        if (requestParameters['name'] != null) {
            queryParameters['name'] = requestParameters['name'];
        }

        if (requestParameters['autocomplete'] != null) {
            queryParameters['autocomplete'] = requestParameters['autocomplete'];
        }

        if (requestParameters['limit'] != null) {
            queryParameters['limit'] = requestParameters['limit'];
        }

        if (requestParameters['next'] != null) {
            queryParameters['next'] = requestParameters['next'];
        }

        if (requestParameters['order'] != null) {
            queryParameters['order'] = requestParameters['order'];
        }

        if (requestParameters['sortBy'] != null) {
            queryParameters['sortBy'] = requestParameters['sortBy'];
        }

        if (requestParameters['whenCreated$gt'] != null) {
            queryParameters['when_created[$gt]'] = (requestParameters['whenCreated$gt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lt'] != null) {
            queryParameters['when_created[$lt]'] = (requestParameters['whenCreated$lt'] as any).toISOString();
        }

        if (requestParameters['whenCreated$gte'] != null) {
            queryParameters['when_created[$gte]'] = (requestParameters['whenCreated$gte'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lte'] != null) {
            queryParameters['when_created[$lte]'] = (requestParameters['whenCreated$lte'] as any).toISOString();
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/templates`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Every template on the network, as anyone can see it: what it is called, what can be done with objects made from it, how it looks and how many may exist.  The details an organization keeps to itself are not here — only the fields it has chosen to show. For your own templates in full, use `GET /templates`.  Open to everyone. No sign-in needed. 
     * List public templates
     */
    async listTemplatesPublicRaw(requestParameters: ListTemplatesPublicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListPublicTemplatesOut>> {
        const requestOptions = await this.listTemplatesPublicRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListPublicTemplatesOutFromJSON(jsonValue));
    }

    /**
     * Every template on the network, as anyone can see it: what it is called, what can be done with objects made from it, how it looks and how many may exist.  The details an organization keeps to itself are not here — only the fields it has chosen to show. For your own templates in full, use `GET /templates`.  Open to everyone. No sign-in needed. 
     * List public templates
     */
    async listTemplatesPublic(requestParameters: ListTemplatesPublicRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListPublicTemplatesOut> {
        const response = await this.listTemplatesPublicRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for renderObjectDisplayByIdPublic without sending the request
     */
    async renderObjectDisplayByIdPublicRequestOpts(requestParameters: RenderObjectDisplayByIdPublicRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['objectId'] == null) {
            throw new runtime.RequiredError(
                'objectId',
                'Required parameter "objectId" was null or undefined when calling renderObjectDisplayByIdPublic().'
            );
        }

        if (requestParameters['variant'] == null) {
            throw new runtime.RequiredError(
                'variant',
                'Required parameter "variant" was null or undefined when calling renderObjectDisplayByIdPublic().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/objects/{objectId}/display/{variant}`;
        urlPath = urlPath.replace('{objectId}', encodeURIComponent(String(requestParameters['objectId'])));
        urlPath = urlPath.replace('{variant}', encodeURIComponent(String(requestParameters['variant'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Draws an object with the face its template gives it, filled in with that object\'s own details — the finished picture or page, ready to embed, link to or share.  Ask for `card` for a tile, `detail` for a full page, or `share` for a link preview. If the face has no design for the look you asked for, the closest one is used instead.  Only the details the template publishes are drawn.  Open to everyone. No sign-in needed. 
     * Show an object
     */
    async renderObjectDisplayByIdPublicRaw(requestParameters: RenderObjectDisplayByIdPublicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<string>> {
        const requestOptions = await this.renderObjectDisplayByIdPublicRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        if (this.isJsonMime(response.headers.get('content-type'))) {
            return new runtime.JSONApiResponse<string>(response);
        } else {
            return new runtime.TextApiResponse(response) as any;
        }
    }

    /**
     * Draws an object with the face its template gives it, filled in with that object\'s own details — the finished picture or page, ready to embed, link to or share.  Ask for `card` for a tile, `detail` for a full page, or `share` for a link preview. If the face has no design for the look you asked for, the closest one is used instead.  Only the details the template publishes are drawn.  Open to everyone. No sign-in needed. 
     * Show an object
     */
    async renderObjectDisplayByIdPublic(requestParameters: RenderObjectDisplayByIdPublicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<string> {
        const response = await this.renderObjectDisplayByIdPublicRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for renderObjectViewByIdPublic without sending the request
     * @deprecated
     */
    async renderObjectViewByIdPublicRequestOpts(requestParameters: RenderObjectViewByIdPublicRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['objectId'] == null) {
            throw new runtime.RequiredError(
                'objectId',
                'Required parameter "objectId" was null or undefined when calling renderObjectViewByIdPublic().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/objects/{objectId}/render`;
        urlPath = urlPath.replace('{objectId}', encodeURIComponent(String(requestParameters['objectId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Legacy path for the same detail page as `/public/objects/{objectId}/display/detail`. It remains available for existing links. New integrations should use the canonical path. 
     * Show an object from the legacy path
     * @deprecated
     */
    async renderObjectViewByIdPublicRaw(requestParameters: RenderObjectViewByIdPublicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<string>> {
        const requestOptions = await this.renderObjectViewByIdPublicRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        if (this.isJsonMime(response.headers.get('content-type'))) {
            return new runtime.JSONApiResponse<string>(response);
        } else {
            return new runtime.TextApiResponse(response) as any;
        }
    }

    /**
     * Legacy path for the same detail page as `/public/objects/{objectId}/display/detail`. It remains available for existing links. New integrations should use the canonical path. 
     * Show an object from the legacy path
     * @deprecated
     */
    async renderObjectViewByIdPublic(requestParameters: RenderObjectViewByIdPublicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<string> {
        const response = await this.renderObjectViewByIdPublicRaw(requestParameters, initOverrides);
        return await response.value();
    }

}

/**
 * @export
 */
export const GetNetworkTokenPriceHistoryTimeRangeEnum = {
    All: 'all',
    Today: 'today',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetNetworkTokenPriceHistoryTimeRangeEnum = typeof GetNetworkTokenPriceHistoryTimeRangeEnum[keyof typeof GetNetworkTokenPriceHistoryTimeRangeEnum];
/**
 * @export
 */
export const GetPublicActionStatsIncludeEnum = {
    Breakdown: 'breakdown',
    Series: 'series',
} as const;
export type GetPublicActionStatsIncludeEnum = typeof GetPublicActionStatsIncludeEnum[keyof typeof GetPublicActionStatsIncludeEnum];
/**
 * @export
 */
export const GetPublicActionStatsIntervalEnum = {
    Hour: 'hour',
    Day: 'day',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetPublicActionStatsIntervalEnum = typeof GetPublicActionStatsIntervalEnum[keyof typeof GetPublicActionStatsIntervalEnum];
/**
 * @export
 */
export const GetPublicActionStatsGroupByEnum = {
    Action: 'action',
} as const;
export type GetPublicActionStatsGroupByEnum = typeof GetPublicActionStatsGroupByEnum[keyof typeof GetPublicActionStatsGroupByEnum];
/**
 * @export
 */
export const GetPublicFeeStatsIncludeEnum = {
    Breakdown: 'breakdown',
    Series: 'series',
} as const;
export type GetPublicFeeStatsIncludeEnum = typeof GetPublicFeeStatsIncludeEnum[keyof typeof GetPublicFeeStatsIncludeEnum];
/**
 * @export
 */
export const GetPublicFeeStatsIntervalEnum = {
    Hour: 'hour',
    Day: 'day',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetPublicFeeStatsIntervalEnum = typeof GetPublicFeeStatsIntervalEnum[keyof typeof GetPublicFeeStatsIntervalEnum];
/**
 * @export
 */
export const GetPublicFeeStatsGroupByEnum = {
    Action: 'action',
} as const;
export type GetPublicFeeStatsGroupByEnum = typeof GetPublicFeeStatsGroupByEnum[keyof typeof GetPublicFeeStatsGroupByEnum];
/**
 * @export
 */
export const GetPublicObjectStatsIncludeEnum = {
    Breakdown: 'breakdown',
    Series: 'series',
} as const;
export type GetPublicObjectStatsIncludeEnum = typeof GetPublicObjectStatsIncludeEnum[keyof typeof GetPublicObjectStatsIncludeEnum];
/**
 * @export
 */
export const GetPublicObjectStatsIntervalEnum = {
    Hour: 'hour',
    Day: 'day',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetPublicObjectStatsIntervalEnum = typeof GetPublicObjectStatsIntervalEnum[keyof typeof GetPublicObjectStatsIntervalEnum];
/**
 * @export
 */
export const GetPublicObjectStatsGroupByEnum = {
    Template: 'template',
} as const;
export type GetPublicObjectStatsGroupByEnum = typeof GetPublicObjectStatsGroupByEnum[keyof typeof GetPublicObjectStatsGroupByEnum];
/**
 * @export
 */
export const GetPublicWalletStatsIncludeEnum = {
    Breakdown: 'breakdown',
    Series: 'series',
} as const;
export type GetPublicWalletStatsIncludeEnum = typeof GetPublicWalletStatsIncludeEnum[keyof typeof GetPublicWalletStatsIncludeEnum];
/**
 * @export
 */
export const GetPublicWalletStatsIntervalEnum = {
    Hour: 'hour',
    Day: 'day',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetPublicWalletStatsIntervalEnum = typeof GetPublicWalletStatsIntervalEnum[keyof typeof GetPublicWalletStatsIntervalEnum];
/**
 * @export
 */
export const GetPublicWalletStatsGroupByEnum = {
    Activated: 'activated',
} as const;
export type GetPublicWalletStatsGroupByEnum = typeof GetPublicWalletStatsGroupByEnum[keyof typeof GetPublicWalletStatsGroupByEnum];
/**
 * @export
 */
export const GetStakingOperationsStatsIntervalEnum = {
    Hour: 'hour',
    Day: 'day',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetStakingOperationsStatsIntervalEnum = typeof GetStakingOperationsStatsIntervalEnum[keyof typeof GetStakingOperationsStatsIntervalEnum];
/**
 * @export
 */
export const GetStakingOperationsStatsTimeRangeEnum = {
    All: 'all',
    Today: 'today',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetStakingOperationsStatsTimeRangeEnum = typeof GetStakingOperationsStatsTimeRangeEnum[keyof typeof GetStakingOperationsStatsTimeRangeEnum];
/**
 * @export
 */
export const GetStakingOperationsTotalIntervalEnum = {
    Hour: 'hour',
    Day: 'day',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetStakingOperationsTotalIntervalEnum = typeof GetStakingOperationsTotalIntervalEnum[keyof typeof GetStakingOperationsTotalIntervalEnum];
/**
 * @export
 */
export const ListActionLogsOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListActionLogsOrderEnum = typeof ListActionLogsOrderEnum[keyof typeof ListActionLogsOrderEnum];
/**
 * @export
 */
export const ListBatchesOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListBatchesOrderEnum = typeof ListBatchesOrderEnum[keyof typeof ListBatchesOrderEnum];
/**
 * @export
 */
export const ListCheckpointsOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListCheckpointsOrderEnum = typeof ListCheckpointsOrderEnum[keyof typeof ListCheckpointsOrderEnum];
/**
 * @export
 */
export const ListObjectsPublicOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListObjectsPublicOrderEnum = typeof ListObjectsPublicOrderEnum[keyof typeof ListObjectsPublicOrderEnum];
/**
 * @export
 */
export const ListObjectsPublicIncludeEnum = {
    Display: 'display',
} as const;
export type ListObjectsPublicIncludeEnum = typeof ListObjectsPublicIncludeEnum[keyof typeof ListObjectsPublicIncludeEnum];
/**
 * @export
 */
export const ListObjectsPublicDisplayVariantEnum = {
    Card: 'card',
    Detail: 'detail',
    Share: 'share',
} as const;
export type ListObjectsPublicDisplayVariantEnum = typeof ListObjectsPublicDisplayVariantEnum[keyof typeof ListObjectsPublicDisplayVariantEnum];
/**
 * @export
 */
export const ListStakingOperationsOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListStakingOperationsOrderEnum = typeof ListStakingOperationsOrderEnum[keyof typeof ListStakingOperationsOrderEnum];
/**
 * @export
 */
export const ListStateChangesOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListStateChangesOrderEnum = typeof ListStateChangesOrderEnum[keyof typeof ListStateChangesOrderEnum];
/**
 * @export
 */
export const ListTemplatesPublicOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListTemplatesPublicOrderEnum = typeof ListTemplatesPublicOrderEnum[keyof typeof ListTemplatesPublicOrderEnum];
