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
    type DisplayVariant,
    DisplayVariantFromJSON,
    DisplayVariantToJSON,
} from '../models/DisplayVariant';
import {
    type ListObjectAttributesOut,
    ListObjectAttributesOutFromJSON,
    ListObjectAttributesOutToJSON,
} from '../models/ListObjectAttributesOut';
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
    type ListSmartObjectsOut,
    ListSmartObjectsOutFromJSON,
    ListSmartObjectsOutToJSON,
} from '../models/ListSmartObjectsOut';
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
    type SmartObject,
    SmartObjectFromJSON,
    SmartObjectToJSON,
} from '../models/SmartObject';
import {
    type StatsOut,
    StatsOutFromJSON,
    StatsOutToJSON,
} from '../models/StatsOut';

export interface GetObjectByIdRequest {
    /**
     * Identifier of the smart object.
     */
    objectId: string;
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

export interface GetOrganizationObjectStatsRequest {
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
    include?: Array<GetOrganizationObjectStatsIncludeEnum>;
    /**
     * Bucket size for a time series. It fixes how many points the series has over
     * the requested window, so a long window with a small interval is an expensive
     * request.
     * 
     */
    interval?: GetOrganizationObjectStatsIntervalEnum;
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
     * Group the breakdown by the template each object was minted from. It
     * shapes the breakdown only; this aggregate cannot split its series. Only
     * the dimensions listed here are accepted; anything else is rejected
     * rather than passed through to the aggregation.
     * 
     */
    groupBy?: GetOrganizationObjectStatsGroupByEnum;
    /**
     * Count only objects minted from this template.
     */
    templateId?: string;
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

export interface ListObjectAttributesRequest {
    /**
     * Identifier of the smart object.
     */
    objectId: string;
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

export interface ListObjectsRequest {
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
    order?: ListObjectsOrderEnum;
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
     * `include=display`, which returns a ready-made display for the variant
     * you ask for.
     * 
     * @deprecated
     */
    faces?: boolean;
    /**
     * Ask for extras alongside each object. `display` adds a ready-made way to
     * show it, in the variant named by `display_variant`.
     * 
     */
    include?: Array<ListObjectsIncludeEnum>;
    /**
     * Which look to resolve when you ask for `include=display`: a tile
     * (`card`), a full page (`detail`) or a link preview (`share`).
     * 
     */
    displayVariant?: ListObjectsDisplayVariantEnum;
    /**
     * Also return, for each object, what its template allows to be done with
     * it.
     * 
     */
    actions?: boolean;
    /**
     * Return only objects held by this address.
     */
    owner?: string;
    /**
     * Return only objects whose template is published under this domain name.
     * 
     */
    fqdn?: string;
    /**
     * Return only objects that have been left at a place for someone to pick
     * up (`true`), or only objects that have not (`false`).
     * 
     */
    dropped?: boolean;
    /**
     * Return only objects dropped in this area. The longer the value, the
     * smaller the area it covers.
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
     * Created at or after this moment.
     */
    whenCreated$gte?: Date;
    /**
     * Created strictly before this moment.
     */
    whenCreated$lt?: Date;
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

export interface ListStateChangesPublicRequest {
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
    order?: ListStateChangesPublicOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
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
export class ObjectsApi extends runtime.BaseAPI {

    /**
     * Creates request options for getObjectById without sending the request
     */
    async getObjectByIdRequestOpts(requestParameters: GetObjectByIdRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['objectId'] == null) {
            throw new runtime.RequiredError(
                'objectId',
                'Required parameter "objectId" was null or undefined when calling getObjectById().'
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

        let urlPath = `/objects/{objectId}`;
        urlPath = urlPath.replace('{objectId}', encodeURIComponent(String(requestParameters['objectId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * One object in full: who holds it, what it carries, and the fingerprints that let its history be checked.  `custom` is your own data as it stands right now. `nonce` counts how many times the object has changed. The `*_hash` fields are what gets proved on chain — you rarely need them, but they are what makes the history trustworthy.  To see how it got here, read `GET /objects/{objectId}/state-changes`.  Requires the `objects.read` permission. 
     * Get an object
     */
    async getObjectByIdRaw(requestParameters: GetObjectByIdRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<SmartObject>> {
        const requestOptions = await this.getObjectByIdRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => SmartObjectFromJSON(jsonValue));
    }

    /**
     * One object in full: who holds it, what it carries, and the fingerprints that let its history be checked.  `custom` is your own data as it stands right now. `nonce` counts how many times the object has changed. The `*_hash` fields are what gets proved on chain — you rarely need them, but they are what makes the history trustworthy.  To see how it got here, read `GET /objects/{objectId}/state-changes`.  Requires the `objects.read` permission. 
     * Get an object
     */
    async getObjectById(requestParameters: GetObjectByIdRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<SmartObject> {
        const response = await this.getObjectByIdRaw(requestParameters, initOverrides);
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
     * Creates request options for getOrganizationObjectStats without sending the request
     */
    async getOrganizationObjectStatsRequestOpts(requestParameters: GetOrganizationObjectStatsRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling getOrganizationObjectStats().'
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

        if (requestParameters['templateId'] != null) {
            queryParameters['template_id'] = requestParameters['templateId'];
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

        let urlPath = `/organizations/{organizationId}/stats/objects`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * How many objects your organization has issued.  Ask for `include=breakdown` to split it by one dimension, and `include=series` to get it over time; both are extra work, so the plain total is what you get by default.  You have to be a member of the organization in the path. The figures never quietly widen to the whole network if a token is missing or expired — the request fails instead, so a dashboard cannot show network numbers under your own name.  For network-wide figures, use the matching endpoint under `/public/stats/`.  Requires the `stats.objects.read` permission. 
     * Your object statistics
     */
    async getOrganizationObjectStatsRaw(requestParameters: GetOrganizationObjectStatsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<StatsOut>> {
        const requestOptions = await this.getOrganizationObjectStatsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => StatsOutFromJSON(jsonValue));
    }

    /**
     * How many objects your organization has issued.  Ask for `include=breakdown` to split it by one dimension, and `include=series` to get it over time; both are extra work, so the plain total is what you get by default.  You have to be a member of the organization in the path. The figures never quietly widen to the whole network if a token is missing or expired — the request fails instead, so a dashboard cannot show network numbers under your own name.  For network-wide figures, use the matching endpoint under `/public/stats/`.  Requires the `stats.objects.read` permission. 
     * Your object statistics
     */
    async getOrganizationObjectStats(requestParameters: GetOrganizationObjectStatsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<StatsOut> {
        const response = await this.getOrganizationObjectStatsRaw(requestParameters, initOverrides);
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
     * Creates request options for listObjectAttributes without sending the request
     */
    async listObjectAttributesRequestOpts(requestParameters: ListObjectAttributesRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['objectId'] == null) {
            throw new runtime.RequiredError(
                'objectId',
                'Required parameter "objectId" was null or undefined when calling listObjectAttributes().'
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

        let urlPath = `/objects/{objectId}/attributes`;
        urlPath = urlPath.replace('{objectId}', encodeURIComponent(String(requestParameters['objectId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * The named attributes attached to one object as they stand today — the extra details added after it was created, such as a seat upgrade, a stamp, or a verification result.  Each attribute says which action last changed it, so you can trace any value back to the moment it was set. `public: true` means the attribute is also visible to anyone, through the public view of the object.  Attributes are set and removed with the `set_attributes` and `delete_attributes` actions.  Requires the `objects.read` permission. 
     * List an object\'s attributes
     */
    async listObjectAttributesRaw(requestParameters: ListObjectAttributesRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListObjectAttributesOut>> {
        const requestOptions = await this.listObjectAttributesRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListObjectAttributesOutFromJSON(jsonValue));
    }

    /**
     * The named attributes attached to one object as they stand today — the extra details added after it was created, such as a seat upgrade, a stamp, or a verification result.  Each attribute says which action last changed it, so you can trace any value back to the moment it was set. `public: true` means the attribute is also visible to anyone, through the public view of the object.  Attributes are set and removed with the `set_attributes` and `delete_attributes` actions.  Requires the `objects.read` permission. 
     * List an object\'s attributes
     */
    async listObjectAttributes(requestParameters: ListObjectAttributesRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListObjectAttributesOut> {
        const response = await this.listObjectAttributesRaw(requestParameters, initOverrides);
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
     * Creates request options for listObjects without sending the request
     */
    async listObjectsRequestOpts(requestParameters: ListObjectsRequest): Promise<runtime.RequestOpts> {
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

        if (requestParameters['fqdn'] != null) {
            queryParameters['fqdn'] = requestParameters['fqdn'];
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

        if (requestParameters['whenCreated$gte'] != null) {
            queryParameters['when_created[$gte]'] = (requestParameters['whenCreated$gte'] as any).toISOString();
        }

        if (requestParameters['whenCreated$lt'] != null) {
            queryParameters['when_created[$lt]'] = (requestParameters['whenCreated$lt'] as any).toISOString();
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

        let urlPath = `/objects`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Your organization\'s objects, newest first — every ticket, card or warranty it has issued.  When a user is signed in as an individual rather than as a company account, they see only the objects they own, which makes this the endpoint behind a personal wallet screen as well as an admin list.  **Showing them.** Add `include=display` and each object comes back with a ready-made way to show it: an address to load, the shape it draws in, and whether it is interactive. `display_variant` picks which look you want — `card` for a list, `detail` for a page, `share` for a link preview.  **Finding them.** Narrow by template, by owner, by whether an object has been left somewhere to be picked up, or by when it was created or last changed.  Requires the `objects.read` permission. 
     * List objects
     */
    async listObjectsRaw(requestParameters: ListObjectsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListSmartObjectsOut>> {
        const requestOptions = await this.listObjectsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListSmartObjectsOutFromJSON(jsonValue));
    }

    /**
     * Your organization\'s objects, newest first — every ticket, card or warranty it has issued.  When a user is signed in as an individual rather than as a company account, they see only the objects they own, which makes this the endpoint behind a personal wallet screen as well as an admin list.  **Showing them.** Add `include=display` and each object comes back with a ready-made way to show it: an address to load, the shape it draws in, and whether it is interactive. `display_variant` picks which look you want — `card` for a list, `detail` for a page, `share` for a link preview.  **Finding them.** Narrow by template, by owner, by whether an object has been left somewhere to be picked up, or by when it was created or last changed.  Requires the `objects.read` permission. 
     * List objects
     */
    async listObjects(requestParameters: ListObjectsRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListSmartObjectsOut> {
        const response = await this.listObjectsRaw(requestParameters, initOverrides);
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
     * Creates request options for listStateChanges without sending the request
     * @deprecated
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
     * Deprecated: use `GET /public/objects/{objectId}/state-changes` instead. This path keeps working while it carries this notice.  Everything that has ever happened to one object, newest first: what was done, by whom, when, and which batch made it permanent.  Each entry records the owner before and after, the fingerprints of the object before and after, and the batch that settled it — enough to follow a ticket from the moment it was issued to the moment it was used, and to prove every step along the way.  This is the object\'s public audit history. No sign-in is needed. 
     * List an object\'s history
     * @deprecated
     */
    async listStateChangesRaw(requestParameters: ListStateChangesRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListStateChangesOut>> {
        const requestOptions = await this.listStateChangesRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListStateChangesOutFromJSON(jsonValue));
    }

    /**
     * Deprecated: use `GET /public/objects/{objectId}/state-changes` instead. This path keeps working while it carries this notice.  Everything that has ever happened to one object, newest first: what was done, by whom, when, and which batch made it permanent.  Each entry records the owner before and after, the fingerprints of the object before and after, and the batch that settled it — enough to follow a ticket from the moment it was issued to the moment it was used, and to prove every step along the way.  This is the object\'s public audit history. No sign-in is needed. 
     * List an object\'s history
     * @deprecated
     */
    async listStateChanges(requestParameters: ListStateChangesRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListStateChangesOut> {
        const response = await this.listStateChangesRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listStateChangesPublic without sending the request
     */
    async listStateChangesPublicRequestOpts(requestParameters: ListStateChangesPublicRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['objectId'] == null) {
            throw new runtime.RequiredError(
                'objectId',
                'Required parameter "objectId" was null or undefined when calling listStateChangesPublic().'
            );
        }

        const queryParameters: any = {};

        if (requestParameters['id'] != null) {
            queryParameters['id'] = requestParameters['id'];
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


        let urlPath = `/public/objects/{objectId}/state-changes`;
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
    async listStateChangesPublicRaw(requestParameters: ListStateChangesPublicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListStateChangesOut>> {
        const requestOptions = await this.listStateChangesPublicRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListStateChangesOutFromJSON(jsonValue));
    }

    /**
     * Everything that has ever happened to one object, newest first: what was done, by whom, when, and which batch made it permanent.  Each entry records the owner before and after, the fingerprints of the object before and after, and the batch that settled it — enough to follow a ticket from the moment it was issued to the moment it was used, and to prove every step along the way.  This is the object\'s public audit history. No sign-in is needed. 
     * List an object\'s history
     */
    async listStateChangesPublic(requestParameters: ListStateChangesPublicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListStateChangesOut> {
        const response = await this.listStateChangesPublicRaw(requestParameters, initOverrides);
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
export const GetOrganizationObjectStatsIncludeEnum = {
    Breakdown: 'breakdown',
    Series: 'series',
} as const;
export type GetOrganizationObjectStatsIncludeEnum = typeof GetOrganizationObjectStatsIncludeEnum[keyof typeof GetOrganizationObjectStatsIncludeEnum];
/**
 * @export
 */
export const GetOrganizationObjectStatsIntervalEnum = {
    Hour: 'hour',
    Day: 'day',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetOrganizationObjectStatsIntervalEnum = typeof GetOrganizationObjectStatsIntervalEnum[keyof typeof GetOrganizationObjectStatsIntervalEnum];
/**
 * @export
 */
export const GetOrganizationObjectStatsGroupByEnum = {
    Template: 'template',
} as const;
export type GetOrganizationObjectStatsGroupByEnum = typeof GetOrganizationObjectStatsGroupByEnum[keyof typeof GetOrganizationObjectStatsGroupByEnum];
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
export const ListObjectsOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListObjectsOrderEnum = typeof ListObjectsOrderEnum[keyof typeof ListObjectsOrderEnum];
/**
 * @export
 */
export const ListObjectsIncludeEnum = {
    Display: 'display',
} as const;
export type ListObjectsIncludeEnum = typeof ListObjectsIncludeEnum[keyof typeof ListObjectsIncludeEnum];
/**
 * @export
 */
export const ListObjectsDisplayVariantEnum = {
    Card: 'card',
    Detail: 'detail',
    Share: 'share',
} as const;
export type ListObjectsDisplayVariantEnum = typeof ListObjectsDisplayVariantEnum[keyof typeof ListObjectsDisplayVariantEnum];
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
export const ListStateChangesOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListStateChangesOrderEnum = typeof ListStateChangesOrderEnum[keyof typeof ListStateChangesOrderEnum];
/**
 * @export
 */
export const ListStateChangesPublicOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListStateChangesPublicOrderEnum = typeof ListStateChangesPublicOrderEnum[keyof typeof ListStateChangesPublicOrderEnum];
