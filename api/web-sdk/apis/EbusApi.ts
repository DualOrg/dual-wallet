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
    type BalanceHistoryOut,
    BalanceHistoryOutFromJSON,
    BalanceHistoryOutToJSON,
} from '../models/BalanceHistoryOut';
import {
    type BalanceOut,
    BalanceOutFromJSON,
    BalanceOutToJSON,
} from '../models/BalanceOut';
import {
    type ExecuteRequest,
    ExecuteRequestFromJSON,
    ExecuteRequestToJSON,
} from '../models/ExecuteRequest';
import {
    type ExecuteResult,
    ExecuteResultFromJSON,
    ExecuteResultToJSON,
} from '../models/ExecuteResult';
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
    type ModelError,
    ModelErrorFromJSON,
    ModelErrorToJSON,
} from '../models/ModelError';
import {
    type NetworkFees,
    NetworkFeesFromJSON,
    NetworkFeesToJSON,
} from '../models/NetworkFees';
import {
    type NonceOut,
    NonceOutFromJSON,
    NonceOutToJSON,
} from '../models/NonceOut';
import {
    type PrepareExecuteOut,
    PrepareExecuteOutFromJSON,
    PrepareExecuteOutToJSON,
} from '../models/PrepareExecuteOut';
import {
    type PrepareExecuteRequest,
    PrepareExecuteRequestFromJSON,
    PrepareExecuteRequestToJSON,
} from '../models/PrepareExecuteRequest';
import {
    type StatsOut,
    StatsOutFromJSON,
    StatsOutToJSON,
} from '../models/StatsOut';

export interface ExecuteActionRequest {
    /**
     * 
     */
    executeRequest: ExecuteRequest;
}

export interface GetAuthNonceRequest {
    /**
     * The wallet address to look up.
     */
    address: string;
}

export interface GetOrganizationActionStatsRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
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
    include?: Array<GetOrganizationActionStatsIncludeEnum>;
    /**
     * Bucket size for a time series. It fixes how many points the series has over
     * the requested window, so a long window with a small interval is an expensive
     * request.
     * 
     */
    interval?: GetOrganizationActionStatsIntervalEnum;
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
    groupBy?: GetOrganizationActionStatsGroupByEnum;
}

export interface GetOrganizationBalanceRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
}

export interface GetOrganizationBalanceHistoryRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
    /**
     * Bucket size for a time series. It fixes how many points the series has over
     * the requested window, so a long window with a small interval is an expensive
     * request.
     * 
     */
    interval?: GetOrganizationBalanceHistoryIntervalEnum;
    /**
     * Named time window relative to now. Endpoints that also expose `from` and `to`
     * can use those parameters for an exact window instead.
     * 
     */
    timeRange?: GetOrganizationBalanceHistoryTimeRangeEnum;
    /**
     * Include changes strictly after this moment.
     */
    whenCreated$gt?: Date;
    /**
     * Include changes strictly before this moment.
     */
    whenCreated$lt?: Date;
    /**
     * Include changes at or after this moment.
     */
    whenCreated$gte?: Date;
    /**
     * Include changes at or before this moment.
     */
    whenCreated$lte?: Date;
}

export interface GetOrganizationFeeStatsRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
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
    include?: Array<GetOrganizationFeeStatsIncludeEnum>;
    /**
     * Bucket size for a time series. It fixes how many points the series has over
     * the requested window, so a long window with a small interval is an expensive
     * request.
     * 
     */
    interval?: GetOrganizationFeeStatsIntervalEnum;
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
    groupBy?: GetOrganizationFeeStatsGroupByEnum;
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

export interface ListActionLogsPublicRequest {
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
    order?: ListActionLogsPublicOrderEnum;
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

export interface PrepareActionRequest {
    /**
     * 
     */
    prepareExecuteRequest: PrepareExecuteRequest;
}

/**
 * 
 */
export class EbusApi extends runtime.BaseAPI {

    /**
     * Creates request options for executeAction without sending the request
     */
    async executeActionRequestOpts(requestParameters: ExecuteActionRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['executeRequest'] == null) {
            throw new runtime.RequiredError(
                'executeRequest',
                'Required parameter "executeRequest" was null or undefined when calling executeAction().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';

        if (this.configuration && this.configuration.apiKey) {
            headerParameters["x-api-key"] = await this.configuration.apiKey("x-api-key"); // api-key-auth authentication
        }

        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("bearer-auth", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }

        let urlPath = `/ebus/execute`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: ExecuteRequestToJSON(requestParameters['executeRequest']),
        };
    }

    /**
     * Do something to an object: create one, hand it over, update it, redeem it, destroy it. This is the only endpoint that changes an object, and everything it does is signed, priced and recorded.  **What to send.** One action — `mint`, `transfer`, `redeem` and the rest are listed on the request below, and exactly one of them is set. Along with it, the wallet\'s action number, and the signature over what `POST /ebus/prepare` gave you.  **What happens.** We check the signature, work out who signed, check they are allowed to do this to this object, price the action, take the fee from the organization\'s balance and apply the change — all together, so an action either happens completely or not at all. Nothing is charged for an action that is refused.  **What you get back.** The action\'s identifier and what it did — for a `mint`, the identifiers of the objects it created. The action then appears in `GET /ebus/action-logs`, reaches every webhook watching for it, and is settled on chain shortly afterwards in a batch.  **Custodial accounts.** Where Dual holds the keys, you can leave the signature out and we sign on the account\'s behalf. Accounts with their own passkey or crypto wallet must sign for themselves.  The HTTP credential is optional when `auth` contains a valid self-custodial signature; this lets a relayer submit a signed action without receiving the owner\'s access token. A custodial action must use an access token or API key with the `ebus.actions.create` permission. 
     * Run an action
     */
    async executeActionRaw(requestParameters: ExecuteActionRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ExecuteResult>> {
        const requestOptions = await this.executeActionRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ExecuteResultFromJSON(jsonValue));
    }

    /**
     * Do something to an object: create one, hand it over, update it, redeem it, destroy it. This is the only endpoint that changes an object, and everything it does is signed, priced and recorded.  **What to send.** One action — `mint`, `transfer`, `redeem` and the rest are listed on the request below, and exactly one of them is set. Along with it, the wallet\'s action number, and the signature over what `POST /ebus/prepare` gave you.  **What happens.** We check the signature, work out who signed, check they are allowed to do this to this object, price the action, take the fee from the organization\'s balance and apply the change — all together, so an action either happens completely or not at all. Nothing is charged for an action that is refused.  **What you get back.** The action\'s identifier and what it did — for a `mint`, the identifiers of the objects it created. The action then appears in `GET /ebus/action-logs`, reaches every webhook watching for it, and is settled on chain shortly afterwards in a batch.  **Custodial accounts.** Where Dual holds the keys, you can leave the signature out and we sign on the account\'s behalf. Accounts with their own passkey or crypto wallet must sign for themselves.  The HTTP credential is optional when `auth` contains a valid self-custodial signature; this lets a relayer submit a signed action without receiving the owner\'s access token. A custodial action must use an access token or API key with the `ebus.actions.create` permission. 
     * Run an action
     */
    async executeAction(requestParameters: ExecuteActionRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ExecuteResult> {
        const response = await this.executeActionRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getAuthNonce without sending the request
     */
    async getAuthNonceRequestOpts(requestParameters: GetAuthNonceRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['address'] == null) {
            throw new runtime.RequiredError(
                'address',
                'Required parameter "address" was null or undefined when calling getAuthNonce().'
            );
        }

        const queryParameters: any = {};

        if (requestParameters['address'] != null) {
            queryParameters['address'] = requestParameters['address'];
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/ebus/nonce`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Every wallet has a counter that goes up by one with each action it takes. Whatever it signs is tied to the number it had at the time, so a copy of an old request is worthless once the counter has moved on. That is what makes a signed action safe to send over the internet.  Read the number here, include it when you sign, and send it with the action. Between reading and sending, the wallet must not do anything else, or the number will have moved and the action will be refused — read it fresh for each action rather than keeping one around.  `POST /ebus/prepare` returns the same number along with everything else you need, so most integrations never call this directly.  No sign-in needed. The counter is public, and knowing it grants nothing. 
     * Get a wallet\'s next action number
     */
    async getAuthNonceRaw(requestParameters: GetAuthNonceRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<NonceOut>> {
        const requestOptions = await this.getAuthNonceRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => NonceOutFromJSON(jsonValue));
    }

    /**
     * Every wallet has a counter that goes up by one with each action it takes. Whatever it signs is tied to the number it had at the time, so a copy of an old request is worthless once the counter has moved on. That is what makes a signed action safe to send over the internet.  Read the number here, include it when you sign, and send it with the action. Between reading and sending, the wallet must not do anything else, or the number will have moved and the action will be refused — read it fresh for each action rather than keeping one around.  `POST /ebus/prepare` returns the same number along with everything else you need, so most integrations never call this directly.  No sign-in needed. The counter is public, and knowing it grants nothing. 
     * Get a wallet\'s next action number
     */
    async getAuthNonce(requestParameters: GetAuthNonceRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<NonceOut> {
        const response = await this.getAuthNonceRaw(requestParameters, initOverrides);
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
     * Creates request options for getOrganizationActionStats without sending the request
     */
    async getOrganizationActionStatsRequestOpts(requestParameters: GetOrganizationActionStatsRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling getOrganizationActionStats().'
            );
        }

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

        if (this.configuration && this.configuration.apiKey) {
            headerParameters["x-api-key"] = await this.configuration.apiKey("x-api-key"); // api-key-auth authentication
        }

        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("bearer-auth", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }

        let urlPath = `/organizations/{organizationId}/stats/actions`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * How many actions your organization has run — the headline number behind an activity dashboard.  Ask for `include=breakdown` to split it by one dimension, and `include=series` to get it over time; both are extra work, so the plain total is what you get by default.  You have to be a member of the organization in the path. The figures never quietly widen to the whole network if a token is missing or expired — the request fails instead, so a dashboard cannot show network numbers under your own name.  For network-wide figures, use the matching endpoint under `/public/stats/`.  Requires the `stats.actions.read` permission. 
     * Your action statistics
     */
    async getOrganizationActionStatsRaw(requestParameters: GetOrganizationActionStatsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<StatsOut>> {
        const requestOptions = await this.getOrganizationActionStatsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => StatsOutFromJSON(jsonValue));
    }

    /**
     * How many actions your organization has run — the headline number behind an activity dashboard.  Ask for `include=breakdown` to split it by one dimension, and `include=series` to get it over time; both are extra work, so the plain total is what you get by default.  You have to be a member of the organization in the path. The figures never quietly widen to the whole network if a token is missing or expired — the request fails instead, so a dashboard cannot show network numbers under your own name.  For network-wide figures, use the matching endpoint under `/public/stats/`.  Requires the `stats.actions.read` permission. 
     * Your action statistics
     */
    async getOrganizationActionStats(requestParameters: GetOrganizationActionStatsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<StatsOut> {
        const response = await this.getOrganizationActionStatsRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getOrganizationBalance without sending the request
     */
    async getOrganizationBalanceRequestOpts(requestParameters: GetOrganizationBalanceRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling getOrganizationBalance().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        if (this.configuration && this.configuration.apiKey) {
            headerParameters["x-api-key"] = await this.configuration.apiKey("x-api-key"); // api-key-auth authentication
        }

        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("bearer-auth", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }

        let urlPath = `/organizations/{organizationId}/balance`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * How much DUAL the organization has left to spend on actions.  Every action costs something, and it comes out of this balance. Top it up by sending DUAL on chain; payments appear in `GET /payments/deposits` and are added here once credited.  Watch this figure and warn people before it runs out — an action fails when there is not enough left to pay for it.  Requires the `organizations.read` permission. 
     * Get an organization\'s balance
     */
    async getOrganizationBalanceRaw(requestParameters: GetOrganizationBalanceRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<BalanceOut>> {
        const requestOptions = await this.getOrganizationBalanceRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => BalanceOutFromJSON(jsonValue));
    }

    /**
     * How much DUAL the organization has left to spend on actions.  Every action costs something, and it comes out of this balance. Top it up by sending DUAL on chain; payments appear in `GET /payments/deposits` and are added here once credited.  Watch this figure and warn people before it runs out — an action fails when there is not enough left to pay for it.  Requires the `organizations.read` permission. 
     * Get an organization\'s balance
     */
    async getOrganizationBalance(requestParameters: GetOrganizationBalanceRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<BalanceOut> {
        const response = await this.getOrganizationBalanceRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getOrganizationBalanceHistory without sending the request
     */
    async getOrganizationBalanceHistoryRequestOpts(requestParameters: GetOrganizationBalanceHistoryRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling getOrganizationBalanceHistory().'
            );
        }

        const queryParameters: any = {};

        if (requestParameters['interval'] != null) {
            queryParameters['interval'] = requestParameters['interval'];
        }

        if (requestParameters['timeRange'] != null) {
            queryParameters['time_range'] = requestParameters['timeRange'];
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

        if (this.configuration && this.configuration.apiKey) {
            headerParameters["x-api-key"] = await this.configuration.apiKey("x-api-key"); // api-key-auth authentication
        }

        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("bearer-auth", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }

        let urlPath = `/organizations/{organizationId}/balance/history`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * How the balance has moved, one point per period — the line behind a spending chart.  Choose the period with `interval` and the range with `time_range` or the `when_created` dates. Each point is the balance as it stood at the end of that period.  Requires the `organizations.read` permission. 
     * Get an organization\'s balance over time
     */
    async getOrganizationBalanceHistoryRaw(requestParameters: GetOrganizationBalanceHistoryRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<BalanceHistoryOut>> {
        const requestOptions = await this.getOrganizationBalanceHistoryRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => BalanceHistoryOutFromJSON(jsonValue));
    }

    /**
     * How the balance has moved, one point per period — the line behind a spending chart.  Choose the period with `interval` and the range with `time_range` or the `when_created` dates. Each point is the balance as it stood at the end of that period.  Requires the `organizations.read` permission. 
     * Get an organization\'s balance over time
     */
    async getOrganizationBalanceHistory(requestParameters: GetOrganizationBalanceHistoryRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<BalanceHistoryOut> {
        const response = await this.getOrganizationBalanceHistoryRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getOrganizationFeeStats without sending the request
     */
    async getOrganizationFeeStatsRequestOpts(requestParameters: GetOrganizationFeeStatsRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling getOrganizationFeeStats().'
            );
        }

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

        if (this.configuration && this.configuration.apiKey) {
            headerParameters["x-api-key"] = await this.configuration.apiKey("x-api-key"); // api-key-auth authentication
        }

        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("bearer-auth", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }

        let urlPath = `/organizations/{organizationId}/stats/fees`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * What your organization has spent on fees, in DUAL and in wei.  Ask for `include=breakdown` to split it by one dimension, and `include=series` to get it over time; both are extra work, so the plain total is what you get by default.  You have to be a member of the organization in the path. The figures never quietly widen to the whole network if a token is missing or expired — the request fails instead, so a dashboard cannot show network numbers under your own name.  For network-wide figures, use the matching endpoint under `/public/stats/`.  Requires the `stats.actions.read` permission. 
     * Your fee statistics
     */
    async getOrganizationFeeStatsRaw(requestParameters: GetOrganizationFeeStatsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<FeesOut>> {
        const requestOptions = await this.getOrganizationFeeStatsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => FeesOutFromJSON(jsonValue));
    }

    /**
     * What your organization has spent on fees, in DUAL and in wei.  Ask for `include=breakdown` to split it by one dimension, and `include=series` to get it over time; both are extra work, so the plain total is what you get by default.  You have to be a member of the organization in the path. The figures never quietly widen to the whole network if a token is missing or expired — the request fails instead, so a dashboard cannot show network numbers under your own name.  For network-wide figures, use the matching endpoint under `/public/stats/`.  Requires the `stats.actions.read` permission. 
     * Your fee statistics
     */
    async getOrganizationFeeStats(requestParameters: GetOrganizationFeeStatsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<FeesOut> {
        const response = await this.getOrganizationFeeStatsRaw(requestParameters, initOverrides);
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

        if (this.configuration && this.configuration.apiKey) {
            headerParameters["x-api-key"] = await this.configuration.apiKey("x-api-key"); // api-key-auth authentication
        }

        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("bearer-auth", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }

        let urlPath = `/ebus/action-logs`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Everything your organization has done, newest first — the audit trail. Each entry records what was done, who signed it, what it affected, what it cost, and which batch settled it.  `status` follows an action to the chain: `pending` while it is waiting to be settled, `completed` once its batch is anchored, `failed` if settling could not be completed.  The answer is scoped to the organization your token or key belongs to, so `org_id` is not needed and changes nothing for an ordinary caller. Use `account`, `wallet_id` or the other filters to narrow it further.  For the whole network, with no sign-in, call `GET /public/action-logs`. 
     * List actions
     */
    async listActionLogsRaw(requestParameters: ListActionLogsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListActionLogsOut>> {
        const requestOptions = await this.listActionLogsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListActionLogsOutFromJSON(jsonValue));
    }

    /**
     * Everything your organization has done, newest first — the audit trail. Each entry records what was done, who signed it, what it affected, what it cost, and which batch settled it.  `status` follows an action to the chain: `pending` while it is waiting to be settled, `completed` once its batch is anchored, `failed` if settling could not be completed.  The answer is scoped to the organization your token or key belongs to, so `org_id` is not needed and changes nothing for an ordinary caller. Use `account`, `wallet_id` or the other filters to narrow it further.  For the whole network, with no sign-in, call `GET /public/action-logs`. 
     * List actions
     */
    async listActionLogs(requestParameters: ListActionLogsRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListActionLogsOut> {
        const response = await this.listActionLogsRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listActionLogsPublic without sending the request
     */
    async listActionLogsPublicRequestOpts(requestParameters: ListActionLogsPublicRequest): Promise<runtime.RequestOpts> {
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


        let urlPath = `/public/action-logs`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Everything the network has done, newest first — the audit trail behind a public explorer. Each entry records what was done, who signed it, what it affected, what it cost, and which batch settled it.  `status` follows an action to the chain: `pending` while it is waiting to be settled, `completed` once its batch is anchored, `failed` if settling could not be completed.  This is the whole network, and it has no organization filter. To read the actions of one organization, sign in and call `GET /ebus/action-logs` instead; that endpoint answers for the organization your token belongs to.  Open to everyone. No sign-in needed. 
     * List public actions
     */
    async listActionLogsPublicRaw(requestParameters: ListActionLogsPublicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListActionLogsOut>> {
        const requestOptions = await this.listActionLogsPublicRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListActionLogsOutFromJSON(jsonValue));
    }

    /**
     * Everything the network has done, newest first — the audit trail behind a public explorer. Each entry records what was done, who signed it, what it affected, what it cost, and which batch settled it.  `status` follows an action to the chain: `pending` while it is waiting to be settled, `completed` once its batch is anchored, `failed` if settling could not be completed.  This is the whole network, and it has no organization filter. To read the actions of one organization, sign in and call `GET /ebus/action-logs` instead; that endpoint answers for the organization your token belongs to.  Open to everyone. No sign-in needed. 
     * List public actions
     */
    async listActionLogsPublic(requestParameters: ListActionLogsPublicRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListActionLogsOut> {
        const response = await this.listActionLogsPublicRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for prepareAction without sending the request
     */
    async prepareActionRequestOpts(requestParameters: PrepareActionRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['prepareExecuteRequest'] == null) {
            throw new runtime.RequiredError(
                'prepareExecuteRequest',
                'Required parameter "prepareExecuteRequest" was null or undefined when calling prepareAction().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';

        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("bearer-auth", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }

        let urlPath = `/ebus/prepare`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: PrepareExecuteRequestToJSON(requestParameters['prepareExecuteRequest']),
        };
    }

    /**
     * Describe the action you want to take, and get back exactly what needs to be signed — along with the wallet\'s current action number.  Signing the wrong bytes is the most common way an integration goes wrong, so this endpoint removes the guesswork: whatever it hands you is what the server will check against when you send the action.  ```js const { nonce, challenge } = await prepare({ action: { mint: { template_id, num: 1 } } }); const assertion = await navigator.credentials.get({   publicKey: { challenge: base64urlToBytes(challenge) }, }); await execute({ action, nonce, auth: { type: \'webauthn\', /_* … *_/ } }); ```  Preparing changes nothing and costs nothing. It does not reserve the action number and does not hold anything open, so a prepared action you never send simply evaporates. If the wallet does something else in between, prepare again.  Requires the `ebus.actions.create` permission. 
     * Prepare an action for signing
     */
    async prepareActionRaw(requestParameters: PrepareActionRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<PrepareExecuteOut>> {
        const requestOptions = await this.prepareActionRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => PrepareExecuteOutFromJSON(jsonValue));
    }

    /**
     * Describe the action you want to take, and get back exactly what needs to be signed — along with the wallet\'s current action number.  Signing the wrong bytes is the most common way an integration goes wrong, so this endpoint removes the guesswork: whatever it hands you is what the server will check against when you send the action.  ```js const { nonce, challenge } = await prepare({ action: { mint: { template_id, num: 1 } } }); const assertion = await navigator.credentials.get({   publicKey: { challenge: base64urlToBytes(challenge) }, }); await execute({ action, nonce, auth: { type: \'webauthn\', /_* … *_/ } }); ```  Preparing changes nothing and costs nothing. It does not reserve the action number and does not hold anything open, so a prepared action you never send simply evaporates. If the wallet does something else in between, prepare again.  Requires the `ebus.actions.create` permission. 
     * Prepare an action for signing
     */
    async prepareAction(requestParameters: PrepareActionRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<PrepareExecuteOut> {
        const response = await this.prepareActionRaw(requestParameters, initOverrides);
        return await response.value();
    }

}

/**
 * @export
 */
export const GetOrganizationActionStatsIncludeEnum = {
    Breakdown: 'breakdown',
    Series: 'series',
} as const;
export type GetOrganizationActionStatsIncludeEnum = typeof GetOrganizationActionStatsIncludeEnum[keyof typeof GetOrganizationActionStatsIncludeEnum];
/**
 * @export
 */
export const GetOrganizationActionStatsIntervalEnum = {
    Hour: 'hour',
    Day: 'day',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetOrganizationActionStatsIntervalEnum = typeof GetOrganizationActionStatsIntervalEnum[keyof typeof GetOrganizationActionStatsIntervalEnum];
/**
 * @export
 */
export const GetOrganizationActionStatsGroupByEnum = {
    Action: 'action',
} as const;
export type GetOrganizationActionStatsGroupByEnum = typeof GetOrganizationActionStatsGroupByEnum[keyof typeof GetOrganizationActionStatsGroupByEnum];
/**
 * @export
 */
export const GetOrganizationBalanceHistoryIntervalEnum = {
    Hour: 'hour',
    Day: 'day',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetOrganizationBalanceHistoryIntervalEnum = typeof GetOrganizationBalanceHistoryIntervalEnum[keyof typeof GetOrganizationBalanceHistoryIntervalEnum];
/**
 * @export
 */
export const GetOrganizationBalanceHistoryTimeRangeEnum = {
    All: 'all',
    Today: 'today',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetOrganizationBalanceHistoryTimeRangeEnum = typeof GetOrganizationBalanceHistoryTimeRangeEnum[keyof typeof GetOrganizationBalanceHistoryTimeRangeEnum];
/**
 * @export
 */
export const GetOrganizationFeeStatsIncludeEnum = {
    Breakdown: 'breakdown',
    Series: 'series',
} as const;
export type GetOrganizationFeeStatsIncludeEnum = typeof GetOrganizationFeeStatsIncludeEnum[keyof typeof GetOrganizationFeeStatsIncludeEnum];
/**
 * @export
 */
export const GetOrganizationFeeStatsIntervalEnum = {
    Hour: 'hour',
    Day: 'day',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetOrganizationFeeStatsIntervalEnum = typeof GetOrganizationFeeStatsIntervalEnum[keyof typeof GetOrganizationFeeStatsIntervalEnum];
/**
 * @export
 */
export const GetOrganizationFeeStatsGroupByEnum = {
    Action: 'action',
} as const;
export type GetOrganizationFeeStatsGroupByEnum = typeof GetOrganizationFeeStatsGroupByEnum[keyof typeof GetOrganizationFeeStatsGroupByEnum];
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
export const ListActionLogsOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListActionLogsOrderEnum = typeof ListActionLogsOrderEnum[keyof typeof ListActionLogsOrderEnum];
/**
 * @export
 */
export const ListActionLogsPublicOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListActionLogsPublicOrderEnum = typeof ListActionLogsPublicOrderEnum[keyof typeof ListActionLogsPublicOrderEnum];
