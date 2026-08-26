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
    type ListPublicTemplatesOut,
    ListPublicTemplatesOutFromJSON,
    ListPublicTemplatesOutToJSON,
} from '../models/ListPublicTemplatesOut';
import {
    type ListTemplatesOut,
    ListTemplatesOutFromJSON,
    ListTemplatesOutToJSON,
} from '../models/ListTemplatesOut';
import {
    type ModelError,
    ModelErrorFromJSON,
    ModelErrorToJSON,
} from '../models/ModelError';
import {
    type PublicTemplate,
    PublicTemplateFromJSON,
    PublicTemplateToJSON,
} from '../models/PublicTemplate';
import {
    type Template,
    TemplateFromJSON,
    TemplateToJSON,
} from '../models/Template';
import {
    type TemplateCreate,
    TemplateCreateFromJSON,
    TemplateCreateToJSON,
} from '../models/TemplateCreate';
import {
    type TemplateUpdate,
    TemplateUpdateFromJSON,
    TemplateUpdateToJSON,
} from '../models/TemplateUpdate';

export interface CreateTemplateRequest {
    /**
     * 
     */
    templateCreate: TemplateCreate;
}

export interface DeleteTemplateRequest {
    /**
     * Identifier of the template.
     */
    templateId: string;
}

export interface GetTemplateRequest {
    /**
     * Identifier of the template.
     */
    templateId: string;
}

export interface GetTemplatePublicRequest {
    /**
     * Identifier of the template.
     */
    templateId: string;
}

export interface ListTemplatesRequest {
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
    order?: ListTemplatesOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
    /**
     * Return only templates whose name starts with this text. `autocomplete`
     * does the same thing and is the one to reach for.
     * 
     */
    prefix?: string;
    /**
     * Return only templates published under this domain name, for
     * organizations that use one.
     * 
     */
    fqdn?: string;
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

export interface UpdateTemplateRequest {
    /**
     * Identifier of the template.
     */
    templateId: string;
    /**
     * 
     */
    templateUpdate: TemplateUpdate;
}

/**
 * 
 */
export class TemplatesApi extends runtime.BaseAPI {

    /**
     * Creates request options for createTemplate without sending the request
     */
    async createTemplateRequestOpts(requestParameters: CreateTemplateRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['templateCreate'] == null) {
            throw new runtime.RequiredError(
                'templateCreate',
                'Required parameter "templateCreate" was null or undefined when calling createTemplate().'
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

        let urlPath = `/templates`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: TemplateCreateToJSON(requestParameters['templateCreate']),
        };
    }

    /**
     * Design a new kind of object: what it is called, what it carries, how it looks, what can be done with it and by whom.  **What it carries.** `object.metadata` is the name and description people see. `object.custom` is your own data — seat numbers, tiers, expiry dates — and every object made from this template starts with these values and can change them later.  **What can be done with it.** `actions` lists the moves this object allows, such as `mint`, `transfer`, `redeem` or `burn`, and each one says who may make it. Leave `actions` out and you get minting, transferring and burning, open to anyone.  **How many, and when.** `factory.max_supply` caps how many objects can ever exist, and `start_time` and `end_time` open and close the window in which they can be created. A start time in the past means \"from now\".  **What the public sees.** Templates are visible to everyone at `/public/templates`, but only the custom fields you name in `public_access.custom` are shown there. Everything else stays between you and the object\'s owner.  Names have to be unique within your organization; reusing one comes back as `400`.  Requires the `templates.create` permission. 
     * Create a template
     */
    async createTemplateRaw(requestParameters: CreateTemplateRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<InlineObject>> {
        const requestOptions = await this.createTemplateRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => InlineObjectFromJSON(jsonValue));
    }

    /**
     * Design a new kind of object: what it is called, what it carries, how it looks, what can be done with it and by whom.  **What it carries.** `object.metadata` is the name and description people see. `object.custom` is your own data — seat numbers, tiers, expiry dates — and every object made from this template starts with these values and can change them later.  **What can be done with it.** `actions` lists the moves this object allows, such as `mint`, `transfer`, `redeem` or `burn`, and each one says who may make it. Leave `actions` out and you get minting, transferring and burning, open to anyone.  **How many, and when.** `factory.max_supply` caps how many objects can ever exist, and `start_time` and `end_time` open and close the window in which they can be created. A start time in the past means \"from now\".  **What the public sees.** Templates are visible to everyone at `/public/templates`, but only the custom fields you name in `public_access.custom` are shown there. Everything else stays between you and the object\'s owner.  Names have to be unique within your organization; reusing one comes back as `400`.  Requires the `templates.create` permission. 
     * Create a template
     */
    async createTemplate(requestParameters: CreateTemplateRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<InlineObject> {
        const response = await this.createTemplateRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for deleteTemplate without sending the request
     */
    async deleteTemplateRequestOpts(requestParameters: DeleteTemplateRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['templateId'] == null) {
            throw new runtime.RequiredError(
                'templateId',
                'Required parameter "templateId" was null or undefined when calling deleteTemplate().'
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

        let urlPath = `/templates/{templateId}`;
        urlPath = urlPath.replace('{templateId}', encodeURIComponent(String(requestParameters['templateId'])));

        return {
            path: urlPath,
            method: 'DELETE',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Delete a template for good.  Objects already created from it are not deleted, and they keep looking for a template that is no longer there — so this is only safe for a template nothing has been made from. To stop new objects being created without disturbing the ones that exist, close the minting window with `end_time` instead.  Requires the `templates.delete` permission. 
     * Delete a template
     */
    async deleteTemplateRaw(requestParameters: DeleteTemplateRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.deleteTemplateRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Delete a template for good.  Objects already created from it are not deleted, and they keep looking for a template that is no longer there — so this is only safe for a template nothing has been made from. To stop new objects being created without disturbing the ones that exist, close the minting window with `end_time` instead.  Requires the `templates.delete` permission. 
     * Delete a template
     */
    async deleteTemplate(requestParameters: DeleteTemplateRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.deleteTemplateRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getTemplate without sending the request
     */
    async getTemplateRequestOpts(requestParameters: GetTemplateRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['templateId'] == null) {
            throw new runtime.RequiredError(
                'templateId',
                'Required parameter "templateId" was null or undefined when calling getTemplate().'
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

        let urlPath = `/templates/{templateId}`;
        urlPath = urlPath.replace('{templateId}', encodeURIComponent(String(requestParameters['templateId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * One of your templates in full: what objects made from it carry, how they look, what can be done with them, how many may exist and how many already do.  Requires the `templates.read` permission. 
     * Get a template
     */
    async getTemplateRaw(requestParameters: GetTemplateRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Template>> {
        const requestOptions = await this.getTemplateRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => TemplateFromJSON(jsonValue));
    }

    /**
     * One of your templates in full: what objects made from it carry, how they look, what can be done with them, how many may exist and how many already do.  Requires the `templates.read` permission. 
     * Get a template
     */
    async getTemplate(requestParameters: GetTemplateRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Template> {
        const response = await this.getTemplateRaw(requestParameters, initOverrides);
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
     * Creates request options for listTemplates without sending the request
     */
    async listTemplatesRequestOpts(requestParameters: ListTemplatesRequest): Promise<runtime.RequestOpts> {
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

        if (requestParameters['prefix'] != null) {
            queryParameters['prefix'] = requestParameters['prefix'];
        }

        if (requestParameters['fqdn'] != null) {
            queryParameters['fqdn'] = requestParameters['fqdn'];
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

        let urlPath = `/templates`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * The templates your organization has designed, newest first — each one the blueprint for a kind of object you issue.  Requires the `templates.read` permission. 
     * List templates
     */
    async listTemplatesRaw(requestParameters: ListTemplatesRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListTemplatesOut>> {
        const requestOptions = await this.listTemplatesRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListTemplatesOutFromJSON(jsonValue));
    }

    /**
     * The templates your organization has designed, newest first — each one the blueprint for a kind of object you issue.  Requires the `templates.read` permission. 
     * List templates
     */
    async listTemplates(requestParameters: ListTemplatesRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListTemplatesOut> {
        const response = await this.listTemplatesRaw(requestParameters, initOverrides);
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
     * Creates request options for updateTemplate without sending the request
     */
    async updateTemplateRequestOpts(requestParameters: UpdateTemplateRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['templateId'] == null) {
            throw new runtime.RequiredError(
                'templateId',
                'Required parameter "templateId" was null or undefined when calling updateTemplate().'
            );
        }

        if (requestParameters['templateUpdate'] == null) {
            throw new runtime.RequiredError(
                'templateUpdate',
                'Required parameter "templateUpdate" was null or undefined when calling updateTemplate().'
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

        let urlPath = `/templates/{templateId}`;
        urlPath = urlPath.replace('{templateId}', encodeURIComponent(String(requestParameters['templateId'])));

        return {
            path: urlPath,
            method: 'PATCH',
            headers: headerParameters,
            query: queryParameters,
            body: TemplateUpdateToJSON(requestParameters['templateUpdate']),
        };
    }

    /**
     * Change a template. Send only the parts you want to change.  Changes reach objects that already exist, because every object keeps looking to its template. Adding an action opens it up for objects already out there; removing one takes it away from them.  **Raising and lowering supply.** `max_supply` can move up or down, but never below the number already created — that comes back as `400`. The count of what has been created is kept for you and cannot be edited. A `start_time` in the past means \"from now\".  Requires the `templates.update` permission. 
     * Update a template
     */
    async updateTemplateRaw(requestParameters: UpdateTemplateRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.updateTemplateRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Change a template. Send only the parts you want to change.  Changes reach objects that already exist, because every object keeps looking to its template. Adding an action opens it up for objects already out there; removing one takes it away from them.  **Raising and lowering supply.** `max_supply` can move up or down, but never below the number already created — that comes back as `400`. The count of what has been created is kept for you and cannot be edited. A `start_time` in the past means \"from now\".  Requires the `templates.update` permission. 
     * Update a template
     */
    async updateTemplate(requestParameters: UpdateTemplateRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.updateTemplateRaw(requestParameters, initOverrides);
        return await response.value();
    }

}

/**
 * @export
 */
export const ListTemplatesOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListTemplatesOrderEnum = typeof ListTemplatesOrderEnum[keyof typeof ListTemplatesOrderEnum];
/**
 * @export
 */
export const ListTemplatesPublicOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListTemplatesPublicOrderEnum = typeof ListTemplatesPublicOrderEnum[keyof typeof ListTemplatesPublicOrderEnum];
