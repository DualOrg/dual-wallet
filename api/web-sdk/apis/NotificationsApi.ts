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
    type Language,
    LanguageFromJSON,
    LanguageToJSON,
} from '../models/Language';
import {
    type ListNotificationMessagesOut,
    ListNotificationMessagesOutFromJSON,
    ListNotificationMessagesOutToJSON,
} from '../models/ListNotificationMessagesOut';
import {
    type ListNotificationTemplatesOut,
    ListNotificationTemplatesOutFromJSON,
    ListNotificationTemplatesOutToJSON,
} from '../models/ListNotificationTemplatesOut';
import {
    type MessageCreate,
    MessageCreateFromJSON,
    MessageCreateToJSON,
} from '../models/MessageCreate';
import {
    type MessageQuota,
    MessageQuotaFromJSON,
    MessageQuotaToJSON,
} from '../models/MessageQuota';
import {
    type MessageStatus,
    MessageStatusFromJSON,
    MessageStatusToJSON,
} from '../models/MessageStatus';
import {
    type ModelError,
    ModelErrorFromJSON,
    ModelErrorToJSON,
} from '../models/ModelError';
import {
    type SendMessage200Response,
    SendMessage200ResponseFromJSON,
    SendMessage200ResponseToJSON,
} from '../models/SendMessage200Response';
import {
    type System,
    SystemFromJSON,
    SystemToJSON,
} from '../models/System';
import {
    type TemplateMessage,
    TemplateMessageFromJSON,
    TemplateMessageToJSON,
} from '../models/TemplateMessage';
import {
    type TemplateMessageCreate,
    TemplateMessageCreateFromJSON,
    TemplateMessageCreateToJSON,
} from '../models/TemplateMessageCreate';
import {
    type TemplateMessageUpdate,
    TemplateMessageUpdateFromJSON,
    TemplateMessageUpdateToJSON,
} from '../models/TemplateMessageUpdate';

export interface CreateNotificationTemplateRequest {
    /**
     * 
     */
    templateMessageCreate: TemplateMessageCreate;
}

export interface DeleteNotificationTemplateRequest {
    /**
     * Identifier of the template.
     */
    templateId: string;
}

export interface GetMessageQuotaRequest {
    /**
     * Also report what is left for this address. Omit it to get the organization's
     * allowance on its own.
     * 
     */
    recipient?: string;
}

export interface GetNotificationTemplateRequest {
    /**
     * Identifier of the template.
     */
    templateId: string;
}

export interface ListMessagesRequest {
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
    order?: ListMessagesOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
    /**
     * Return only messages rendered from this template.
     */
    templateId?: string;
    /**
     * Return only messages sent to this recipient.
     */
    to?: string;
    /**
     * Return only messages rendered in this language.
     */
    language?: Language;
    /**
     * Return only messages sent over this channel. Email is the only channel in service.
     */
    system?: System;
    /**
     * Return only messages of this action type.
     */
    actionType?: string;
    /**
     * Return only messages in this delivery state.
     */
    status?: MessageStatus;
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

export interface ListNotificationTemplatesRequest {
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
     * Search the endpoint's supported text and identifier fields. Matching may be
     * an exact identifier lookup or a case-insensitive prefix search, depending on
     * the resource. Alphanumeric characters only.
     * 
     */
    autocomplete?: string;
    /**
     * Sort direction. Defaults to `desc`, newest first.
     */
    order?: ListNotificationTemplatesOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
    /**
     * Return only templates for this language.
     */
    language?: Language;
    /**
     * Return only templates for this channel.
     */
    system?: System;
    /**
     * Return only templates for this action type.
     */
    type?: string;
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

export interface SendMessageRequest {
    /**
     * 
     */
    messageCreate: MessageCreate;
    /**
     * Your own identifier for this send. Repeat it to retry a call safely: a second
     * request carrying a key we have already accepted returns the first message
     * rather than sending a second one. Any string you can regenerate for the same
     * send works; a UUID is the usual choice.
     * 
     */
    idempotencyKey?: string;
}

export interface UpdateNotificationTemplateRequest {
    /**
     * Identifier of the template.
     */
    templateId: string;
    /**
     * 
     */
    templateMessageUpdate: TemplateMessageUpdate;
}

/**
 * 
 */
export class NotificationsApi extends runtime.BaseAPI {

    /**
     * Creates request options for createNotificationTemplate without sending the request
     */
    async createNotificationTemplateRequestOpts(requestParameters: CreateNotificationTemplateRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['templateMessageCreate'] == null) {
            throw new runtime.RequiredError(
                'templateMessageCreate',
                'Required parameter "templateMessageCreate" was null or undefined when calling createNotificationTemplate().'
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

        let urlPath = `/messages/templates`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: TemplateMessageCreateToJSON(requestParameters['templateMessageCreate']),
        };
    }

    /**
     * Write an email template your organization can send from.  **One per kind of message.** A template covers one kind of message, in one language, on one channel. If you already have one for that combination, a second comes back as `409` — edit the first instead.  **Leaving blanks.** Write `{{.first_name}}` anywhere in the subject or the body and it is filled in from the `values` you supply when you send. We check the template before saving it, so a mistake is caught now rather than during a live delivery later.  Anything you put in `values` here acts as a fallback, used when the same name is missing at send time.  Requires the `notifications.templates.create` permission. 
     * Create a message template
     */
    async createNotificationTemplateRaw(requestParameters: CreateNotificationTemplateRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<InlineObject>> {
        const requestOptions = await this.createNotificationTemplateRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => InlineObjectFromJSON(jsonValue));
    }

    /**
     * Write an email template your organization can send from.  **One per kind of message.** A template covers one kind of message, in one language, on one channel. If you already have one for that combination, a second comes back as `409` — edit the first instead.  **Leaving blanks.** Write `{{.first_name}}` anywhere in the subject or the body and it is filled in from the `values` you supply when you send. We check the template before saving it, so a mistake is caught now rather than during a live delivery later.  Anything you put in `values` here acts as a fallback, used when the same name is missing at send time.  Requires the `notifications.templates.create` permission. 
     * Create a message template
     */
    async createNotificationTemplate(requestParameters: CreateNotificationTemplateRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<InlineObject> {
        const response = await this.createNotificationTemplateRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for deleteNotificationTemplate without sending the request
     */
    async deleteNotificationTemplateRequestOpts(requestParameters: DeleteNotificationTemplateRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['templateId'] == null) {
            throw new runtime.RequiredError(
                'templateId',
                'Required parameter "templateId" was null or undefined when calling deleteNotificationTemplate().'
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

        let urlPath = `/messages/templates/{templateId}`;
        urlPath = urlPath.replace('{templateId}', encodeURIComponent(String(requestParameters['templateId'])));

        return {
            path: urlPath,
            method: 'DELETE',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Delete a template for good.  Messages that would have used it fall back to our standard template for the same kind of message, or to plain text if there is none. Anything already sent is unaffected.  Requires the `notifications.templates.delete` permission. 
     * Delete a message template
     */
    async deleteNotificationTemplateRaw(requestParameters: DeleteNotificationTemplateRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.deleteNotificationTemplateRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Delete a template for good.  Messages that would have used it fall back to our standard template for the same kind of message, or to plain text if there is none. Anything already sent is unaffected.  Requires the `notifications.templates.delete` permission. 
     * Delete a message template
     */
    async deleteNotificationTemplate(requestParameters: DeleteNotificationTemplateRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.deleteNotificationTemplateRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getMessageQuota without sending the request
     */
    async getMessageQuotaRequestOpts(requestParameters: GetMessageQuotaRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        if (requestParameters['recipient'] != null) {
            queryParameters['recipient'] = requestParameters['recipient'];
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

        let urlPath = `/messages/quota`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Return how much of the sending allowance is left for the organization you are working in. It is the same limit `POST /messages/send` enforces, so a `remaining` of `0` is what a `429` from that call means.  The allowance is a rolling window rather than a daily reset: a message stops counting once it is `window_seconds` old, so `remaining` climbs back on its own. `used` counts messages accepted, not delivered.  Pass `recipient` to also see what is left for one address. A bucket that has no cap configured is left out of the response entirely.  Requires the `notifications.messages.read` permission. 
     * Get send quota
     */
    async getMessageQuotaRaw(requestParameters: GetMessageQuotaRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<MessageQuota>> {
        const requestOptions = await this.getMessageQuotaRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => MessageQuotaFromJSON(jsonValue));
    }

    /**
     * Return how much of the sending allowance is left for the organization you are working in. It is the same limit `POST /messages/send` enforces, so a `remaining` of `0` is what a `429` from that call means.  The allowance is a rolling window rather than a daily reset: a message stops counting once it is `window_seconds` old, so `remaining` climbs back on its own. `used` counts messages accepted, not delivered.  Pass `recipient` to also see what is left for one address. A bucket that has no cap configured is left out of the response entirely.  Requires the `notifications.messages.read` permission. 
     * Get send quota
     */
    async getMessageQuota(requestParameters: GetMessageQuotaRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<MessageQuota> {
        const response = await this.getMessageQuotaRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getNotificationTemplate without sending the request
     */
    async getNotificationTemplateRequestOpts(requestParameters: GetNotificationTemplateRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['templateId'] == null) {
            throw new runtime.RequiredError(
                'templateId',
                'Required parameter "templateId" was null or undefined when calling getNotificationTemplate().'
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

        let urlPath = `/messages/templates/{templateId}`;
        urlPath = urlPath.replace('{templateId}', encodeURIComponent(String(requestParameters['templateId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * One of your templates, with its subject and body exactly as written — blanks and all, not filled in.  Requires the `notifications.templates.read` permission. 
     * Get a message template
     */
    async getNotificationTemplateRaw(requestParameters: GetNotificationTemplateRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<TemplateMessage>> {
        const requestOptions = await this.getNotificationTemplateRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => TemplateMessageFromJSON(jsonValue));
    }

    /**
     * One of your templates, with its subject and body exactly as written — blanks and all, not filled in.  Requires the `notifications.templates.read` permission. 
     * Get a message template
     */
    async getNotificationTemplate(requestParameters: GetNotificationTemplateRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<TemplateMessage> {
        const response = await this.getNotificationTemplateRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listMessages without sending the request
     */
    async listMessagesRequestOpts(requestParameters: ListMessagesRequest): Promise<runtime.RequestOpts> {
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

        if (requestParameters['templateId'] != null) {
            queryParameters['template_id'] = requestParameters['templateId'];
        }

        if (requestParameters['to'] != null) {
            queryParameters['to'] = requestParameters['to'];
        }

        if (requestParameters['language'] != null) {
            queryParameters['language'] = requestParameters['language'];
        }

        if (requestParameters['system'] != null) {
            queryParameters['system'] = requestParameters['system'];
        }

        if (requestParameters['actionType'] != null) {
            queryParameters['action_type'] = requestParameters['actionType'];
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

        let urlPath = `/messages`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Everything your organization has sent, newest first: who it went to, when, and whether it arrived.  The words themselves are not repeated back — this is the record of the sending, not a copy of the email. Filter by `status` to find what went wrong, and read `error` on those rows for the reason.  Requires the `notifications.messages.read` permission. 
     * List messages
     */
    async listMessagesRaw(requestParameters: ListMessagesRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListNotificationMessagesOut>> {
        const requestOptions = await this.listMessagesRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListNotificationMessagesOutFromJSON(jsonValue));
    }

    /**
     * Everything your organization has sent, newest first: who it went to, when, and whether it arrived.  The words themselves are not repeated back — this is the record of the sending, not a copy of the email. Filter by `status` to find what went wrong, and read `error` on those rows for the reason.  Requires the `notifications.messages.read` permission. 
     * List messages
     */
    async listMessages(requestParameters: ListMessagesRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListNotificationMessagesOut> {
        const response = await this.listMessagesRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listNotificationTemplates without sending the request
     */
    async listNotificationTemplatesRequestOpts(requestParameters: ListNotificationTemplatesRequest): Promise<runtime.RequestOpts> {
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

        if (requestParameters['autocomplete'] != null) {
            queryParameters['autocomplete'] = requestParameters['autocomplete'];
        }

        if (requestParameters['order'] != null) {
            queryParameters['order'] = requestParameters['order'];
        }

        if (requestParameters['sortBy'] != null) {
            queryParameters['sortBy'] = requestParameters['sortBy'];
        }

        if (requestParameters['language'] != null) {
            queryParameters['language'] = requestParameters['language'];
        }

        if (requestParameters['system'] != null) {
            queryParameters['system'] = requestParameters['system'];
        }

        if (requestParameters['type'] != null) {
            queryParameters['type'] = requestParameters['type'];
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

        let urlPath = `/messages/templates`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * The email templates your organization has written, newest first.  Only your own appear here. Our standard templates, which are used whenever you have not written your own, are not listed.  Requires the `notifications.templates.read` permission. 
     * List message templates
     */
    async listNotificationTemplatesRaw(requestParameters: ListNotificationTemplatesRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListNotificationTemplatesOut>> {
        const requestOptions = await this.listNotificationTemplatesRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListNotificationTemplatesOutFromJSON(jsonValue));
    }

    /**
     * The email templates your organization has written, newest first.  Only your own appear here. Our standard templates, which are used whenever you have not written your own, are not listed.  Requires the `notifications.templates.read` permission. 
     * List message templates
     */
    async listNotificationTemplates(requestParameters: ListNotificationTemplatesRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListNotificationTemplatesOut> {
        const response = await this.listNotificationTemplatesRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for sendMessage without sending the request
     */
    async sendMessageRequestOpts(requestParameters: SendMessageRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['messageCreate'] == null) {
            throw new runtime.RequiredError(
                'messageCreate',
                'Required parameter "messageCreate" was null or undefined when calling sendMessage().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';

        if (requestParameters['idempotencyKey'] != null) {
            headerParameters['Idempotency-Key'] = String(requestParameters['idempotencyKey']);
        }

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

        let urlPath = `/messages/send`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: MessageCreateToJSON(requestParameters['messageCreate']),
        };
    }

    /**
     * Send an email. The call comes back as soon as the message is safely accepted and the sending itself follows a moment later, so watch `GET /messages` to see how it went.  **Where the words come from.** Send `content` and `content_type` and we send exactly that. Otherwise we look for a template, in this order:  1. The template you named in `template_id`. 2. Your own template for this kind of message, language and channel. 3. Our standard template for that kind of message. 4. Nothing found — the `values` you sent go out as plain text.  **Filling in the blanks.** A template has blanks like `{{.first_name}}`, and `values` supplies what goes in them. A `url` is filled in for you where the message has somewhere to point, unless your template sets its own.  **Two things to know.** Email is the only way to reach people at the moment, so asking for another channel comes back as `422`. Sending later is not available either: a `scheduled_at` in the future is refused rather than quietly sent now.  The message is sent on behalf of the organization you are working in.  **Retrying safely.** Send an `Idempotency-Key` header and a repeat of the same call returns the message you already queued instead of sending a second one.  **How much you may send.** Sending is capped per hour, per organization and per recipient. Over either cap comes back as `429`.  Requires the `notifications.messages.create` permission. 
     * Send a message
     */
    async sendMessageRaw(requestParameters: SendMessageRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<SendMessage200Response>> {
        const requestOptions = await this.sendMessageRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => SendMessage200ResponseFromJSON(jsonValue));
    }

    /**
     * Send an email. The call comes back as soon as the message is safely accepted and the sending itself follows a moment later, so watch `GET /messages` to see how it went.  **Where the words come from.** Send `content` and `content_type` and we send exactly that. Otherwise we look for a template, in this order:  1. The template you named in `template_id`. 2. Your own template for this kind of message, language and channel. 3. Our standard template for that kind of message. 4. Nothing found — the `values` you sent go out as plain text.  **Filling in the blanks.** A template has blanks like `{{.first_name}}`, and `values` supplies what goes in them. A `url` is filled in for you where the message has somewhere to point, unless your template sets its own.  **Two things to know.** Email is the only way to reach people at the moment, so asking for another channel comes back as `422`. Sending later is not available either: a `scheduled_at` in the future is refused rather than quietly sent now.  The message is sent on behalf of the organization you are working in.  **Retrying safely.** Send an `Idempotency-Key` header and a repeat of the same call returns the message you already queued instead of sending a second one.  **How much you may send.** Sending is capped per hour, per organization and per recipient. Over either cap comes back as `429`.  Requires the `notifications.messages.create` permission. 
     * Send a message
     */
    async sendMessage(requestParameters: SendMessageRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<SendMessage200Response> {
        const response = await this.sendMessageRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for updateNotificationTemplate without sending the request
     */
    async updateNotificationTemplateRequestOpts(requestParameters: UpdateNotificationTemplateRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['templateId'] == null) {
            throw new runtime.RequiredError(
                'templateId',
                'Required parameter "templateId" was null or undefined when calling updateNotificationTemplate().'
            );
        }

        if (requestParameters['templateMessageUpdate'] == null) {
            throw new runtime.RequiredError(
                'templateMessageUpdate',
                'Required parameter "templateMessageUpdate" was null or undefined when calling updateNotificationTemplate().'
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

        let urlPath = `/messages/templates/{templateId}`;
        urlPath = urlPath.replace('{templateId}', encodeURIComponent(String(requestParameters['templateId'])));

        return {
            path: urlPath,
            method: 'PATCH',
            headers: headerParameters,
            query: queryParameters,
            body: TemplateMessageUpdateToJSON(requestParameters['templateMessageUpdate']),
        };
    }

    /**
     * Edit a template. Send only the fields you want to change.  A new subject or body is checked before it is saved, so a mistake is caught here rather than on every email that follows.  The change applies to what you send from now on; messages already sent keep the wording they went out with. Allow up to a minute for the new wording to be picked up everywhere.  Requires the `notifications.templates.update` permission. 
     * Update a message template
     */
    async updateNotificationTemplateRaw(requestParameters: UpdateNotificationTemplateRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.updateNotificationTemplateRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Edit a template. Send only the fields you want to change.  A new subject or body is checked before it is saved, so a mistake is caught here rather than on every email that follows.  The change applies to what you send from now on; messages already sent keep the wording they went out with. Allow up to a minute for the new wording to be picked up everywhere.  Requires the `notifications.templates.update` permission. 
     * Update a message template
     */
    async updateNotificationTemplate(requestParameters: UpdateNotificationTemplateRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.updateNotificationTemplateRaw(requestParameters, initOverrides);
        return await response.value();
    }

}

/**
 * @export
 */
export const ListMessagesOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListMessagesOrderEnum = typeof ListMessagesOrderEnum[keyof typeof ListMessagesOrderEnum];
/**
 * @export
 */
export const ListNotificationTemplatesOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListNotificationTemplatesOrderEnum = typeof ListNotificationTemplatesOrderEnum[keyof typeof ListNotificationTemplatesOrderEnum];
