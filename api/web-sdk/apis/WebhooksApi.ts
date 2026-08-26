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
    type ListWebhookEventsOut,
    ListWebhookEventsOutFromJSON,
    ListWebhookEventsOutToJSON,
} from '../models/ListWebhookEventsOut';
import {
    type ListWebhooksOut,
    ListWebhooksOutFromJSON,
    ListWebhooksOutToJSON,
} from '../models/ListWebhooksOut';
import {
    type ModelError,
    ModelErrorFromJSON,
    ModelErrorToJSON,
} from '../models/ModelError';
import {
    type Webhook,
    WebhookFromJSON,
    WebhookToJSON,
} from '../models/Webhook';
import {
    type WebhookCreate,
    WebhookCreateFromJSON,
    WebhookCreateToJSON,
} from '../models/WebhookCreate';
import {
    type WebhookCreateOut,
    WebhookCreateOutFromJSON,
    WebhookCreateOutToJSON,
} from '../models/WebhookCreateOut';
import {
    type WebhookEvent,
    WebhookEventFromJSON,
    WebhookEventToJSON,
} from '../models/WebhookEvent';
import {
    type WebhookQuota,
    WebhookQuotaFromJSON,
    WebhookQuotaToJSON,
} from '../models/WebhookQuota';
import {
    type WebhookType,
    WebhookTypeFromJSON,
    WebhookTypeToJSON,
} from '../models/WebhookType';
import {
    type WebhookUpdate,
    WebhookUpdateFromJSON,
    WebhookUpdateToJSON,
} from '../models/WebhookUpdate';

export interface CreateWebhookRequest {
    /**
     * 
     */
    webhookCreate: WebhookCreate;
}

export interface DeleteWebhookRequest {
    /**
     * Identifier of the webhook, the same value sent as the `X-Webhook-ID` header.
     */
    webhookId: string;
}

export interface GetWebhookRequest {
    /**
     * Identifier of the webhook, the same value sent as the `X-Webhook-ID` header.
     */
    webhookId: string;
}

export interface ListWebhookEventsRequest {
    /**
     * Identifier of the webhook, the same value sent as the `X-Webhook-ID` header.
     */
    webhookId: string;
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
    order?: ListWebhookEventsOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
    /**
     * A webhook identifier.
     */
    webhookId2?: string;
    /**
     * Narrow to one organization. Results are already restricted to the
     * caller's active organization.
     * 
     */
    orgId?: string;
    /**
     * Return only deliveries of this webhook type.
     */
    type?: WebhookType;
    /**
     * Return only deliveries in this state: `pending`, `retrying`,
     * `delivered` or `failed`.
     * 
     */
    status?: string;
    /**
     * Created strictly after this instant.
     */
    whenCreated$gt?: Date;
    /**
     * Created strictly before this instant.
     */
    whenCreated$lt?: Date;
    /**
     * Created at or after this instant.
     */
    whenCreated$gte?: Date;
    /**
     * Created at or before this instant.
     */
    whenCreated$lte?: Date;
}

export interface ListWebhooksRequest {
    /**
     * Return only the resource with this identifier. Equivalent to fetching it by
     * path, but usable together with the other list filters.
     * 
     */
    id?: string;
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
    order?: ListWebhooksOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
    /**
     * Return only webhooks with a rule for this template. Hexadecimal letters are case-insensitive.
     */
    templateId?: string;
    /**
     * Return only webhooks with a rule restricted to this action name.
     */
    action?: string;
    /**
     * Return only webhooks with a rule restricted to this signer address. Matching is case-insensitive.
     */
    address?: string;
    /**
     * Return only active (`true`) or only deactivated (`false`) webhooks. A
     * webhook is deactivated automatically after repeated delivery failures.
     * 
     */
    isActive?: boolean;
    /**
     * Return only webhooks created by this wallet.
     */
    walletId?: string;
    /**
     * Created strictly after this instant.
     */
    whenCreated$gt?: Date;
    /**
     * Created strictly before this instant.
     */
    whenCreated$lt?: Date;
    /**
     * Created at or after this instant.
     */
    whenCreated$gte?: Date;
    /**
     * Created at or before this instant.
     */
    whenCreated$lte?: Date;
}

export interface RedeliverWebhookEventRequest {
    /**
     * Identifier of the webhook, the same value sent as the `X-Webhook-ID` header.
     */
    webhookId: string;
    /**
     * Identifier of the webhook delivery, the same value sent as the `X-Event-ID` header.
     */
    eventId: string;
}

export interface UpdateWebhookRequest {
    /**
     * Identifier of the webhook, the same value sent as the `X-Webhook-ID` header.
     */
    webhookId: string;
    /**
     * 
     */
    webhookUpdate: WebhookUpdate;
}

/**
 * 
 */
export class WebhooksApi extends runtime.BaseAPI {

    /**
     * Creates request options for createWebhook without sending the request
     */
    async createWebhookRequestOpts(requestParameters: CreateWebhookRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['webhookCreate'] == null) {
            throw new runtime.RequiredError(
                'webhookCreate',
                'Required parameter "webhookCreate" was null or undefined when calling createWebhook().'
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

        let urlPath = `/webhooks`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: WebhookCreateToJSON(requestParameters['webhookCreate']),
        };
    }

    /**
     * Point an address of yours at the things happening in your organization, and we will tell you about them as they happen.  **Choosing what you hear about.** Add one rule for every template you want to watch. Inside a rule, use `actions` and `addresses` to narrow it to particular action names or signers. Empty action and address lists mean all actions and all signers for that template. Rules are ORed; fields inside a rule are ANDed. There is no organization-wide webhook.  **Keep the signing key.** The response includes a `signing_key`, and this is the only time it is ever shown — there is no way to read it back and no way to roll it over. Save it now, and use it to check that each delivery really came from us; the section introduction shows how.  **About your address.** It has to be an ordinary public `https` address with no username or password built into it. Literal private addresses are turned away immediately. Hostnames are resolved and checked when each delivery is made, which also protects against later DNS changes.  An organization can have five webhooks. A sixth comes back as `400`.  Requires the `webhooks.create` permission. 
     * Create a webhook
     */
    async createWebhookRaw(requestParameters: CreateWebhookRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<WebhookCreateOut>> {
        const requestOptions = await this.createWebhookRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => WebhookCreateOutFromJSON(jsonValue));
    }

    /**
     * Point an address of yours at the things happening in your organization, and we will tell you about them as they happen.  **Choosing what you hear about.** Add one rule for every template you want to watch. Inside a rule, use `actions` and `addresses` to narrow it to particular action names or signers. Empty action and address lists mean all actions and all signers for that template. Rules are ORed; fields inside a rule are ANDed. There is no organization-wide webhook.  **Keep the signing key.** The response includes a `signing_key`, and this is the only time it is ever shown — there is no way to read it back and no way to roll it over. Save it now, and use it to check that each delivery really came from us; the section introduction shows how.  **About your address.** It has to be an ordinary public `https` address with no username or password built into it. Literal private addresses are turned away immediately. Hostnames are resolved and checked when each delivery is made, which also protects against later DNS changes.  An organization can have five webhooks. A sixth comes back as `400`.  Requires the `webhooks.create` permission. 
     * Create a webhook
     */
    async createWebhook(requestParameters: CreateWebhookRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<WebhookCreateOut> {
        const response = await this.createWebhookRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for deleteWebhook without sending the request
     */
    async deleteWebhookRequestOpts(requestParameters: DeleteWebhookRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['webhookId'] == null) {
            throw new runtime.RequiredError(
                'webhookId',
                'Required parameter "webhookId" was null or undefined when calling deleteWebhook().'
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

        let urlPath = `/webhooks/{webhookId}`;
        urlPath = urlPath.replace('{webhookId}', encodeURIComponent(String(requestParameters['webhookId'])));

        return {
            path: urlPath,
            method: 'DELETE',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Remove a webhook for good. Nothing new will be sent to it.  Anything already on its way may still arrive, and its recent history stays readable for a while. If you only want to pause it, switch it off with `is_active: false` instead — deleting also loses the signing key, and a replacement webhook gets a different one, which means changing your code.  Requires the `webhooks.delete` permission. 
     * Delete a webhook
     */
    async deleteWebhookRaw(requestParameters: DeleteWebhookRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.deleteWebhookRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Remove a webhook for good. Nothing new will be sent to it.  Anything already on its way may still arrive, and its recent history stays readable for a while. If you only want to pause it, switch it off with `is_active: false` instead — deleting also loses the signing key, and a replacement webhook gets a different one, which means changing your code.  Requires the `webhooks.delete` permission. 
     * Delete a webhook
     */
    async deleteWebhook(requestParameters: DeleteWebhookRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.deleteWebhookRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getWebhook without sending the request
     */
    async getWebhookRequestOpts(requestParameters: GetWebhookRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['webhookId'] == null) {
            throw new runtime.RequiredError(
                'webhookId',
                'Required parameter "webhookId" was null or undefined when calling getWebhook().'
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

        let urlPath = `/webhooks/{webhookId}`;
        urlPath = urlPath.replace('{webhookId}', encodeURIComponent(String(requestParameters['webhookId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * One of your webhooks: where it points, what it is watching for, and whether it is still switched on.  The signing key is not here. You see it once, when the webhook is created, and it cannot be read back afterwards.  Requires the `webhooks.read` permission. 
     * Get a webhook
     */
    async getWebhookRaw(requestParameters: GetWebhookRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Webhook>> {
        const requestOptions = await this.getWebhookRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => WebhookFromJSON(jsonValue));
    }

    /**
     * One of your webhooks: where it points, what it is watching for, and whether it is still switched on.  The signing key is not here. You see it once, when the webhook is created, and it cannot be read back afterwards.  Requires the `webhooks.read` permission. 
     * Get a webhook
     */
    async getWebhook(requestParameters: GetWebhookRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Webhook> {
        const response = await this.getWebhookRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getWebhookQuota without sending the request
     */
    async getWebhookQuotaRequestOpts(): Promise<runtime.RequestOpts> {
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

        let urlPath = `/webhooks/quota`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Return logical webhook delivery usage for the caller\'s active organization over a rolling window. A source event delivered to two matching webhooks counts as two logical deliveries. Retries and manual redeliveries do not add usage. `remaining` is never negative; ingestion continues if usage exceeds the included allowance.  Requires the `webhooks.read` permission. 
     * Get webhook quota
     */
    async getWebhookQuotaRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<WebhookQuota>> {
        const requestOptions = await this.getWebhookQuotaRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => WebhookQuotaFromJSON(jsonValue));
    }

    /**
     * Return logical webhook delivery usage for the caller\'s active organization over a rolling window. A source event delivered to two matching webhooks counts as two logical deliveries. Retries and manual redeliveries do not add usage. `remaining` is never negative; ingestion continues if usage exceeds the included allowance.  Requires the `webhooks.read` permission. 
     * Get webhook quota
     */
    async getWebhookQuota(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<WebhookQuota> {
        const response = await this.getWebhookQuotaRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listWebhookEvents without sending the request
     */
    async listWebhookEventsRequestOpts(requestParameters: ListWebhookEventsRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['webhookId'] == null) {
            throw new runtime.RequiredError(
                'webhookId',
                'Required parameter "webhookId" was null or undefined when calling listWebhookEvents().'
            );
        }

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

        if (requestParameters['webhookId2'] != null) {
            queryParameters['webhook_id'] = requestParameters['webhookId2'];
        }

        if (requestParameters['orgId'] != null) {
            queryParameters['org_id'] = requestParameters['orgId'];
        }

        if (requestParameters['type'] != null) {
            queryParameters['type'] = requestParameters['type'];
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

        let urlPath = `/webhooks/{webhookId}/events`;
        urlPath = urlPath.replace('{webhookId}', encodeURIComponent(String(requestParameters['webhookId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Everything we have tried to send to one webhook, newest first: what went out, where to, and how it was received. This is the first place to look when a recipient reports that an event never arrived.  A delivery starts as `pending`, may spend time `retrying`, and ends up either `delivered` or `failed`. Nothing retries a `failed` delivery on its own — send it again with `POST /webhooks/{webhookId}/events/{eventId}/redeliver`. When something goes wrong, `error` repeats what your endpoint said back, which is usually enough to see why.  `payload` is the exact body we sent. `signature` is the one that went with the most recent attempt, so it changes each time a delivery is retried.  Requires the `webhooks.read` permission. 
     * List a webhook\'s deliveries
     */
    async listWebhookEventsRaw(requestParameters: ListWebhookEventsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListWebhookEventsOut>> {
        const requestOptions = await this.listWebhookEventsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListWebhookEventsOutFromJSON(jsonValue));
    }

    /**
     * Everything we have tried to send to one webhook, newest first: what went out, where to, and how it was received. This is the first place to look when a recipient reports that an event never arrived.  A delivery starts as `pending`, may spend time `retrying`, and ends up either `delivered` or `failed`. Nothing retries a `failed` delivery on its own — send it again with `POST /webhooks/{webhookId}/events/{eventId}/redeliver`. When something goes wrong, `error` repeats what your endpoint said back, which is usually enough to see why.  `payload` is the exact body we sent. `signature` is the one that went with the most recent attempt, so it changes each time a delivery is retried.  Requires the `webhooks.read` permission. 
     * List a webhook\'s deliveries
     */
    async listWebhookEvents(requestParameters: ListWebhookEventsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListWebhookEventsOut> {
        const response = await this.listWebhookEventsRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listWebhooks without sending the request
     */
    async listWebhooksRequestOpts(requestParameters: ListWebhooksRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['id'] != null) {
            queryParameters['id'] = requestParameters['id'];
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

        if (requestParameters['templateId'] != null) {
            queryParameters['template_id'] = requestParameters['templateId'];
        }

        if (requestParameters['action'] != null) {
            queryParameters['action'] = requestParameters['action'];
        }

        if (requestParameters['address'] != null) {
            queryParameters['address'] = requestParameters['address'];
        }

        if (requestParameters['isActive'] != null) {
            queryParameters['is_active'] = requestParameters['isActive'];
        }

        if (requestParameters['walletId'] != null) {
            queryParameters['wallet_id'] = requestParameters['walletId'];
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

        let urlPath = `/webhooks`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * The webhooks your organization has set up, newest first.  Filters here describe the webhooks themselves — what they watch, where they point, whether they are switched on. To see what has actually been sent to one, open `GET /webhooks/{webhookId}/events`.  Signing keys never appear in a list. You see a key once, when you create the webhook.  Requires the `webhooks.read` permission. 
     * List webhooks
     */
    async listWebhooksRaw(requestParameters: ListWebhooksRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListWebhooksOut>> {
        const requestOptions = await this.listWebhooksRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListWebhooksOutFromJSON(jsonValue));
    }

    /**
     * The webhooks your organization has set up, newest first.  Filters here describe the webhooks themselves — what they watch, where they point, whether they are switched on. To see what has actually been sent to one, open `GET /webhooks/{webhookId}/events`.  Signing keys never appear in a list. You see a key once, when you create the webhook.  Requires the `webhooks.read` permission. 
     * List webhooks
     */
    async listWebhooks(requestParameters: ListWebhooksRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListWebhooksOut> {
        const response = await this.listWebhooksRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for redeliverWebhookEvent without sending the request
     */
    async redeliverWebhookEventRequestOpts(requestParameters: RedeliverWebhookEventRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['webhookId'] == null) {
            throw new runtime.RequiredError(
                'webhookId',
                'Required parameter "webhookId" was null or undefined when calling redeliverWebhookEvent().'
            );
        }

        if (requestParameters['eventId'] == null) {
            throw new runtime.RequiredError(
                'eventId',
                'Required parameter "eventId" was null or undefined when calling redeliverWebhookEvent().'
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

        let urlPath = `/webhooks/{webhookId}/events/{eventId}/redeliver`;
        urlPath = urlPath.replace('{webhookId}', encodeURIComponent(String(requestParameters['webhookId'])));
        urlPath = urlPath.replace('{eventId}', encodeURIComponent(String(requestParameters['eventId'])));

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Send a failed delivery again, with a full set of retries.  We make one initial attempt and retry up to three times. If all four attempts fail, the delivery is marked `failed`. Once your endpoint is healthy, this is how you send it again.  Only a delivery that has `failed` can be sent again; anything else returns `409`. The delivery keeps its identifier, so this is the same event arriving a second time rather than a new one — your endpoint will see the same `X-Event-ID` it saw before, which is exactly why it should be safe to receive twice.  The signature is recalculated for the new attempt, so always check the signature that arrives with the request rather than one you kept.  The response comes back straight away with the delivery marked `pending`; the send itself follows a moment later.  Requires the `webhooks.update` permission. 
     * Redeliver a webhook event
     */
    async redeliverWebhookEventRaw(requestParameters: RedeliverWebhookEventRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<WebhookEvent>> {
        const requestOptions = await this.redeliverWebhookEventRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => WebhookEventFromJSON(jsonValue));
    }

    /**
     * Send a failed delivery again, with a full set of retries.  We make one initial attempt and retry up to three times. If all four attempts fail, the delivery is marked `failed`. Once your endpoint is healthy, this is how you send it again.  Only a delivery that has `failed` can be sent again; anything else returns `409`. The delivery keeps its identifier, so this is the same event arriving a second time rather than a new one — your endpoint will see the same `X-Event-ID` it saw before, which is exactly why it should be safe to receive twice.  The signature is recalculated for the new attempt, so always check the signature that arrives with the request rather than one you kept.  The response comes back straight away with the delivery marked `pending`; the send itself follows a moment later.  Requires the `webhooks.update` permission. 
     * Redeliver a webhook event
     */
    async redeliverWebhookEvent(requestParameters: RedeliverWebhookEventRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<WebhookEvent> {
        const response = await this.redeliverWebhookEventRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for updateWebhook without sending the request
     */
    async updateWebhookRequestOpts(requestParameters: UpdateWebhookRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['webhookId'] == null) {
            throw new runtime.RequiredError(
                'webhookId',
                'Required parameter "webhookId" was null or undefined when calling updateWebhook().'
            );
        }

        if (requestParameters['webhookUpdate'] == null) {
            throw new runtime.RequiredError(
                'webhookUpdate',
                'Required parameter "webhookUpdate" was null or undefined when calling updateWebhook().'
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

        let urlPath = `/webhooks/{webhookId}`;
        urlPath = urlPath.replace('{webhookId}', encodeURIComponent(String(requestParameters['webhookId'])));

        return {
            path: urlPath,
            method: 'PATCH',
            headers: headerParameters,
            query: queryParameters,
            body: WebhookUpdateToJSON(requestParameters['webhookUpdate']),
        };
    }

    /**
     * Move a webhook to a new address, change what it watches, or switch it off and on. Send only the fields you want to change; the rest stay as they are.  **Changing what it watches.** Send the complete replacement `rules` array. It must contain at least one template rule. Empty `actions` or `addresses` inside a rule widen that rule to every action or signer on its template. Leaving `rules` out changes nothing.  **Turning one back on.** A webhook that switched itself off after repeated failures comes back with `is_active: true`. Make sure your endpoint is healthy first, or it will simply switch off again.  A new address has to meet the same conditions as the original: public, `https`, no credentials in the URL.  The signing key stays the same and cannot be changed.  Requires the `webhooks.update` permission. 
     * Update a webhook
     */
    async updateWebhookRaw(requestParameters: UpdateWebhookRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.updateWebhookRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Move a webhook to a new address, change what it watches, or switch it off and on. Send only the fields you want to change; the rest stay as they are.  **Changing what it watches.** Send the complete replacement `rules` array. It must contain at least one template rule. Empty `actions` or `addresses` inside a rule widen that rule to every action or signer on its template. Leaving `rules` out changes nothing.  **Turning one back on.** A webhook that switched itself off after repeated failures comes back with `is_active: true`. Make sure your endpoint is healthy first, or it will simply switch off again.  A new address has to meet the same conditions as the original: public, `https`, no credentials in the URL.  The signing key stays the same and cannot be changed.  Requires the `webhooks.update` permission. 
     * Update a webhook
     */
    async updateWebhook(requestParameters: UpdateWebhookRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.updateWebhookRaw(requestParameters, initOverrides);
        return await response.value();
    }

}

/**
 * @export
 */
export const ListWebhookEventsOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListWebhookEventsOrderEnum = typeof ListWebhookEventsOrderEnum[keyof typeof ListWebhookEventsOrderEnum];
/**
 * @export
 */
export const ListWebhooksOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListWebhooksOrderEnum = typeof ListWebhooksOrderEnum[keyof typeof ListWebhooksOrderEnum];
