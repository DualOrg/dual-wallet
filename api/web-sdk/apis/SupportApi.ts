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
    type InlineObject,
    InlineObjectFromJSON,
    InlineObjectToJSON,
} from '../models/InlineObject';
import {
    type ListMessagesOut,
    ListMessagesOutFromJSON,
    ListMessagesOutToJSON,
} from '../models/ListMessagesOut';
import {
    type ModelError,
    ModelErrorFromJSON,
    ModelErrorToJSON,
} from '../models/ModelError';
import {
    type RequestAccessIn,
    RequestAccessInFromJSON,
    RequestAccessInToJSON,
} from '../models/RequestAccessIn';
import {
    type SupportMessage,
    SupportMessageFromJSON,
    SupportMessageToJSON,
} from '../models/SupportMessage';

export interface GetSupportMessageRequest {
    /**
     * Identifier of the support message.
     */
    messageId: string;
}

export interface ListSupportMessagesRequest {
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
    order?: ListSupportMessagesOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
    /**
     * Return only messages sent by this wallet.
     */
    walletId?: string;
    /**
     * Sent strictly after this instant.
     */
    whenCreated$gt?: Date;
    /**
     * Sent strictly before this instant.
     */
    whenCreated$lt?: Date;
    /**
     * Sent at or after this instant.
     */
    whenCreated$gte?: Date;
    /**
     * Sent at or before this instant.
     */
    whenCreated$lte?: Date;
}

export interface RequestAccessRequest {
    /**
     * 
     */
    requestAccessIn: RequestAccessIn;
}

export interface SendSupportMessageRequest {
    /**
     * 
     */
    supportMessage: Omit<SupportMessage, 'id'|'orgId'|'walletId'|'email'|'orgName'|'whenModified'|'whenCreated'>;
}

/**
 * 
 */
export class SupportApi extends runtime.BaseAPI {

    /**
     * Creates request options for getSupportMessage without sending the request
     */
    async getSupportMessageRequestOpts(requestParameters: GetSupportMessageRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['messageId'] == null) {
            throw new runtime.RequiredError(
                'messageId',
                'Required parameter "messageId" was null or undefined when calling getSupportMessage().'
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

        let urlPath = `/support/{messageId}`;
        urlPath = urlPath.replace('{messageId}', encodeURIComponent(String(requestParameters['messageId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * One message from the support inbox.  Like the inbox itself, only the Dual support team can read it. Everyone else gets a `403`, including the person who sent the message. 
     * Get a support message
     */
    async getSupportMessageRaw(requestParameters: GetSupportMessageRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<SupportMessage>> {
        const requestOptions = await this.getSupportMessageRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => SupportMessageFromJSON(jsonValue));
    }

    /**
     * One message from the support inbox.  Like the inbox itself, only the Dual support team can read it. Everyone else gets a `403`, including the person who sent the message. 
     * Get a support message
     */
    async getSupportMessage(requestParameters: GetSupportMessageRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<SupportMessage> {
        const response = await this.getSupportMessageRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listSupportMessages without sending the request
     */
    async listSupportMessagesRequestOpts(requestParameters: ListSupportMessagesRequest): Promise<runtime.RequestOpts> {
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

        let urlPath = `/support`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * The support inbox, newest first.  Only the Dual support team can read it — even the person who sent a message cannot read it back, and gets a `403`. If you need a record of what you asked, keep your own copy when you send it. 
     * List support messages
     */
    async listSupportMessagesRaw(requestParameters: ListSupportMessagesRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListMessagesOut>> {
        const requestOptions = await this.listSupportMessagesRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListMessagesOutFromJSON(jsonValue));
    }

    /**
     * The support inbox, newest first.  Only the Dual support team can read it — even the person who sent a message cannot read it back, and gets a `403`. If you need a record of what you asked, keep your own copy when you send it. 
     * List support messages
     */
    async listSupportMessages(requestParameters: ListSupportMessagesRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListMessagesOut> {
        const response = await this.listSupportMessagesRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for requestAccess without sending the request
     */
    async requestAccessRequestOpts(requestParameters: RequestAccessRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['requestAccessIn'] == null) {
            throw new runtime.RequiredError(
                'requestAccessIn',
                'Required parameter "requestAccessIn" was null or undefined when calling requestAccess().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';


        let urlPath = `/request-access`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: RequestAccessInToJSON(requestParameters['requestAccessIn']),
        };
    }

    /**
     * Ask to be let in. This is for people who do not have an account yet, so it needs no sign-in — put it behind the sign-up form on your site.  What you send goes straight to the team who handle access and is not kept anywhere you can read back, so there is no request to follow up. The reply comes by email. 
     * Request access
     */
    async requestAccessRaw(requestParameters: RequestAccessRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.requestAccessRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Ask to be let in. This is for people who do not have an account yet, so it needs no sign-in — put it behind the sign-up form on your site.  What you send goes straight to the team who handle access and is not kept anywhere you can read back, so there is no request to follow up. The reply comes by email. 
     * Request access
     */
    async requestAccess(requestParameters: RequestAccessRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.requestAccessRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for sendSupportMessage without sending the request
     */
    async sendSupportMessageRequestOpts(requestParameters: SendSupportMessageRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['supportMessage'] == null) {
            throw new runtime.RequiredError(
                'supportMessage',
                'Required parameter "supportMessage" was null or undefined when calling sendSupportMessage().'
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

        let urlPath = `/support`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: SupportMessageToJSON(requestParameters['supportMessage']),
        };
    }

    /**
     * Ask the Dual team for help.  Send a subject and a message. You can attach files too — upload them with `POST /assets` first, then mention them here. If it is about one particular request that went wrong, include the `x-request-id` from its response; that is the quickest way for us to find it.  The message is filed under the signed-in account, so it cannot be sent in another user\'s name.  You get an identifier back. You will not be able to read the message again afterwards, so keep your own copy if you need one.  There is a limit on how often one account may write in. Go over it and you get a `429`. 
     * Send a support message
     */
    async sendSupportMessageRaw(requestParameters: SendSupportMessageRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<InlineObject>> {
        const requestOptions = await this.sendSupportMessageRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => InlineObjectFromJSON(jsonValue));
    }

    /**
     * Ask the Dual team for help.  Send a subject and a message. You can attach files too — upload them with `POST /assets` first, then mention them here. If it is about one particular request that went wrong, include the `x-request-id` from its response; that is the quickest way for us to find it.  The message is filed under the signed-in account, so it cannot be sent in another user\'s name.  You get an identifier back. You will not be able to read the message again afterwards, so keep your own copy if you need one.  There is a limit on how often one account may write in. Go over it and you get a `429`. 
     * Send a support message
     */
    async sendSupportMessage(requestParameters: SendSupportMessageRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<InlineObject> {
        const response = await this.sendSupportMessageRaw(requestParameters, initOverrides);
        return await response.value();
    }

}

/**
 * @export
 */
export const ListSupportMessagesOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListSupportMessagesOrderEnum = typeof ListSupportMessagesOrderEnum[keyof typeof ListSupportMessagesOrderEnum];
