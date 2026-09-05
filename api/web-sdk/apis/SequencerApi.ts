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
    type BatchStatsOut,
    BatchStatsOutFromJSON,
    BatchStatsOutToJSON,
} from '../models/BatchStatsOut';
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
    type ModelError,
    ModelErrorFromJSON,
    ModelErrorToJSON,
} from '../models/ModelError';
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

export interface GetPublicBatchStatsRequest {
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
    include?: Array<GetPublicBatchStatsIncludeEnum>;
    /**
     * Bucket size for a time series. It fixes how many points the series has over
     * the requested window, so a long window with a small interval is an expensive
     * request.
     * 
     */
    interval?: GetPublicBatchStatsIntervalEnum;
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
     * Group the optional breakdown by each batch's current pipeline `status`.
     * This does not split the time series, which always counts all new batches
     * in each interval.
     * 
     */
    groupBy?: GetPublicBatchStatsGroupByEnum;
}

export interface GetPublicCheckpointStatsRequest {
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
     * Optional aggregate to compute. This endpoint supports only a creation series.
     */
    include?: Array<GetPublicCheckpointStatsIncludeEnum>;
    /**
     * Bucket size for a time series. It fixes how many points the series has over
     * the requested window, so a long window with a small interval is an expensive
     * request.
     * 
     */
    interval?: GetPublicCheckpointStatsIntervalEnum;
}

export interface ListBatchesRequest {
    /**
     * Return only the resource with this identifier. Equivalent to fetching it by
     * path, but usable together with the other list filters.
     * 
     */
    id?: string;
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
     * Return the batch with this hash.
     */
    hash?: string;
    /**
     * Return only batches in this pipeline stage.
     */
    status?: BatchStatus;
    /**
     * Return the batch containing this action identifier.
     */
    actionId?: string;
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
}

/**
 * 
 */
export class SequencerApi extends runtime.BaseAPI {

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


        let urlPath = `/public/batches/{batchId}`;
        urlPath = urlPath.replace('{batchId}', encodeURIComponent(String(requestParameters['batchId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Retrieve one batch by its Dual identifier. The response shows its position in the batch chain, the actions it contains, the network-state roots before and after those actions, and its proof and on-chain settlement details.  This is what you need to check a batch for yourself. `commitment` is the value written on chain, `integrity_root` and `prev_integrity_root` fingerprint the network\'s state after and before the batch, `actions_hash` pins the exact list of actions, and `ipfs_url` points to the published data all of it was computed from.  Recent batches may still be moving through the pipeline. Proof, storage and transaction fields appear as those stages complete; use `status` to decide which fields should be present. A `finalized` batch has completed its challenge window and includes its finalization transaction.  Open to everyone. No sign-in needed. 
     * Get a batch
     */
    async getBatchRaw(requestParameters: GetBatchRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Batch>> {
        const requestOptions = await this.getBatchRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => BatchFromJSON(jsonValue));
    }

    /**
     * Retrieve one batch by its Dual identifier. The response shows its position in the batch chain, the actions it contains, the network-state roots before and after those actions, and its proof and on-chain settlement details.  This is what you need to check a batch for yourself. `commitment` is the value written on chain, `integrity_root` and `prev_integrity_root` fingerprint the network\'s state after and before the batch, `actions_hash` pins the exact list of actions, and `ipfs_url` points to the published data all of it was computed from.  Recent batches may still be moving through the pipeline. Proof, storage and transaction fields appear as those stages complete; use `status` to decide which fields should be present. A `finalized` batch has completed its challenge window and includes its finalization transaction.  Open to everyone. No sign-in needed. 
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


        let urlPath = `/public/checkpoints/{checkpointId}`;
        urlPath = urlPath.replace('{checkpointId}', encodeURIComponent(String(requestParameters['checkpointId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Retrieve one checkpoint by its Dual identifier. The response identifies the first and last batch in the covered range, the checkpoint\'s position in its own sequence, and the proof, published data and transaction produced as it moves through the pipeline.  Recent checkpoints may not have a proof, `ipfs_url` or `l2_tx_hash` yet. These fields appear as their corresponding stages complete; a `finalized` checkpoint has been anchored on chain.  Open to everyone. No sign-in needed. 
     * Get a checkpoint
     */
    async getCheckpointRaw(requestParameters: GetCheckpointRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Checkpoint>> {
        const requestOptions = await this.getCheckpointRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => CheckpointFromJSON(jsonValue));
    }

    /**
     * Retrieve one checkpoint by its Dual identifier. The response identifies the first and last batch in the covered range, the checkpoint\'s position in its own sequence, and the proof, published data and transaction produced as it moves through the pipeline.  Recent checkpoints may not have a proof, `ipfs_url` or `l2_tx_hash` yet. These fields appear as their corresponding stages complete; a `finalized` checkpoint has been anchored on chain.  Open to everyone. No sign-in needed. 
     * Get a checkpoint
     */
    async getCheckpoint(requestParameters: GetCheckpointRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Checkpoint> {
        const response = await this.getCheckpointRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getPublicBatchStats without sending the request
     */
    async getPublicBatchStatsRequestOpts(requestParameters: GetPublicBatchStatsRequest): Promise<runtime.RequestOpts> {
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


        let urlPath = `/public/stats/batches`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Summarize batches created in a selected time window. `from` is inclusive and `to` is exclusive; omit both to cover the network\'s complete batch history.  The response always includes `total`. When the window is not empty it also reports its highest sequence number, average actions per batch and average creation interval. Finalized batches contribute an average duration from batch creation to finalization.  Add `include=breakdown&group_by=status` to count the selected batches by their current pipeline stage. Add `include=series` to count batch creation by time bucket. These optional aggregations require extra work, so they are omitted by default.  These figures cover the whole network and take no sign-in. 
     * Batch statistics
     */
    async getPublicBatchStatsRaw(requestParameters: GetPublicBatchStatsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<BatchStatsOut>> {
        const requestOptions = await this.getPublicBatchStatsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => BatchStatsOutFromJSON(jsonValue));
    }

    /**
     * Summarize batches created in a selected time window. `from` is inclusive and `to` is exclusive; omit both to cover the network\'s complete batch history.  The response always includes `total`. When the window is not empty it also reports its highest sequence number, average actions per batch and average creation interval. Finalized batches contribute an average duration from batch creation to finalization.  Add `include=breakdown&group_by=status` to count the selected batches by their current pipeline stage. Add `include=series` to count batch creation by time bucket. These optional aggregations require extra work, so they are omitted by default.  These figures cover the whole network and take no sign-in. 
     * Batch statistics
     */
    async getPublicBatchStats(requestParameters: GetPublicBatchStatsRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<BatchStatsOut> {
        const response = await this.getPublicBatchStatsRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getPublicCheckpointStats without sending the request
     */
    async getPublicCheckpointStatsRequestOpts(requestParameters: GetPublicCheckpointStatsRequest): Promise<runtime.RequestOpts> {
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

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/public/stats/checkpoints`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Count checkpoints created in a selected time window. `from` is inclusive and `to` is exclusive; omit both to cover the network\'s complete checkpoint history.  The response always includes `total`. Add `include=series` to count checkpoint creation by time bucket; because that aggregation requires extra work, the series is omitted by default.  These figures cover the whole network and take no sign-in. 
     * Checkpoint statistics
     */
    async getPublicCheckpointStatsRaw(requestParameters: GetPublicCheckpointStatsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<StatsOut>> {
        const requestOptions = await this.getPublicCheckpointStatsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => StatsOutFromJSON(jsonValue));
    }

    /**
     * Count checkpoints created in a selected time window. `from` is inclusive and `to` is exclusive; omit both to cover the network\'s complete checkpoint history.  The response always includes `total`. Add `include=series` to count checkpoint creation by time bucket; because that aggregation requires extra work, the series is omitted by default.  These figures cover the whole network and take no sign-in. 
     * Checkpoint statistics
     */
    async getPublicCheckpointStats(requestParameters: GetPublicCheckpointStatsRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<StatsOut> {
        const response = await this.getPublicCheckpointStatsRaw(requestParameters, initOverrides);
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

        if (requestParameters['hash'] != null) {
            queryParameters['hash'] = requestParameters['hash'];
        }

        if (requestParameters['status'] != null) {
            queryParameters['status'] = requestParameters['status'];
        }

        if (requestParameters['actionId'] != null) {
            queryParameters['action_id'] = requestParameters['actionId'];
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


        let urlPath = `/public/batches`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Browse the batches that turn individual actions into permanent network history. Each batch contains an ordered group of actions, a proof of their state changes, and the commitment anchored on chain. Results are newest first unless you change `sortBy` or `order`.  `status` tells you how far along a batch is:  ``` building → requesting → proving → storing → anchoring → nfts → settling → finalized ```  `finalized` means the challenge window has closed and the batch is settled. `failed` is terminal; every other value means processing is still under way, which is normal for a recent batch.  To find the batch behind one of your actions, look the action up in `GET /public/action-logs` and follow the batch it names, or filter here with `action_id`.  Open to everyone. No sign-in needed. 
     * List batches
     */
    async listBatchesRaw(requestParameters: ListBatchesRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListBatchesOut>> {
        const requestOptions = await this.listBatchesRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListBatchesOutFromJSON(jsonValue));
    }

    /**
     * Browse the batches that turn individual actions into permanent network history. Each batch contains an ordered group of actions, a proof of their state changes, and the commitment anchored on chain. Results are newest first unless you change `sortBy` or `order`.  `status` tells you how far along a batch is:  ``` building → requesting → proving → storing → anchoring → nfts → settling → finalized ```  `finalized` means the challenge window has closed and the batch is settled. `failed` is terminal; every other value means processing is still under way, which is normal for a recent batch.  To find the batch behind one of your actions, look the action up in `GET /public/action-logs` and follow the batch it names, or filter here with `action_id`.  Open to everyone. No sign-in needed. 
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


        let urlPath = `/public/checkpoints`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Browse checkpoints, newest first unless you change `sortBy` or `order`. A checkpoint commits to a consecutive range of finalized batches, making it possible to verify a long stretch of history without processing every batch individually.  Each one names the first and last batch it covers, so the range it speaks for is `start_sequence` to `end_sequence`.  A checkpoint goes through the same proof-and-anchor stages as a batch, without the NFT and challenge-window settlement stages:  ``` building → requesting → proving → storing → anchoring → finalized ```  `finalized` means the checkpoint commitment has been anchored. `failed` is terminal; every other value means the checkpoint is still being processed.  Open to everyone. No sign-in needed. 
     * List checkpoints
     */
    async listCheckpointsRaw(requestParameters: ListCheckpointsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListCheckpointsOut>> {
        const requestOptions = await this.listCheckpointsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListCheckpointsOutFromJSON(jsonValue));
    }

    /**
     * Browse checkpoints, newest first unless you change `sortBy` or `order`. A checkpoint commits to a consecutive range of finalized batches, making it possible to verify a long stretch of history without processing every batch individually.  Each one names the first and last batch it covers, so the range it speaks for is `start_sequence` to `end_sequence`.  A checkpoint goes through the same proof-and-anchor stages as a batch, without the NFT and challenge-window settlement stages:  ``` building → requesting → proving → storing → anchoring → finalized ```  `finalized` means the checkpoint commitment has been anchored. `failed` is terminal; every other value means the checkpoint is still being processed.  Open to everyone. No sign-in needed. 
     * List checkpoints
     */
    async listCheckpoints(requestParameters: ListCheckpointsRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListCheckpointsOut> {
        const response = await this.listCheckpointsRaw(requestParameters, initOverrides);
        return await response.value();
    }

}

/**
 * @export
 */
export const GetPublicBatchStatsIncludeEnum = {
    Breakdown: 'breakdown',
    Series: 'series',
} as const;
export type GetPublicBatchStatsIncludeEnum = typeof GetPublicBatchStatsIncludeEnum[keyof typeof GetPublicBatchStatsIncludeEnum];
/**
 * @export
 */
export const GetPublicBatchStatsIntervalEnum = {
    Hour: 'hour',
    Day: 'day',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetPublicBatchStatsIntervalEnum = typeof GetPublicBatchStatsIntervalEnum[keyof typeof GetPublicBatchStatsIntervalEnum];
/**
 * @export
 */
export const GetPublicBatchStatsGroupByEnum = {
    Status: 'status',
} as const;
export type GetPublicBatchStatsGroupByEnum = typeof GetPublicBatchStatsGroupByEnum[keyof typeof GetPublicBatchStatsGroupByEnum];
/**
 * @export
 */
export const GetPublicCheckpointStatsIncludeEnum = {
    Series: 'series',
} as const;
export type GetPublicCheckpointStatsIncludeEnum = typeof GetPublicCheckpointStatsIncludeEnum[keyof typeof GetPublicCheckpointStatsIncludeEnum];
/**
 * @export
 */
export const GetPublicCheckpointStatsIntervalEnum = {
    Hour: 'hour',
    Day: 'day',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetPublicCheckpointStatsIntervalEnum = typeof GetPublicCheckpointStatsIntervalEnum[keyof typeof GetPublicCheckpointStatsIntervalEnum];
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
