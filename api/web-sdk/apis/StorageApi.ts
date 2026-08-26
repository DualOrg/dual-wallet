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
    type AssetURL,
    AssetURLFromJSON,
    AssetURLToJSON,
} from '../models/AssetURL';
import {
    type FolderType,
    FolderTypeFromJSON,
    FolderTypeToJSON,
} from '../models/FolderType';
import {
    type ListAssetsOut,
    ListAssetsOutFromJSON,
    ListAssetsOutToJSON,
} from '../models/ListAssetsOut';
import {
    type ModelError,
    ModelErrorFromJSON,
    ModelErrorToJSON,
} from '../models/ModelError';
import {
    type ProviderType,
    ProviderTypeFromJSON,
    ProviderTypeToJSON,
} from '../models/ProviderType';
import {
    type StorageAsset,
    StorageAssetFromJSON,
    StorageAssetToJSON,
} from '../models/StorageAsset';

export interface CreateAssetRequest {
    /**
     * The file itself, at most 10 MiB. Its media type is detected from the first 512 bytes; the declared `Content-Type` is ignored. 
     */
    file: Blob;
    /**
     * 
     */
    provider?: ProviderType;
    /**
     * 
     */
    folder?: FolderType;
    /**
     * `true` stores the object in the public bucket, where its `url` is directly readable. `false`, the default, keeps it private and reachable only through a signed download URL.  An IPFS upload must be public; a private one is rejected with `400`. 
     */
    isPublic?: boolean;
    /**
     * Free-form label to store with the asset. Defaults to `default`.
     */
    tag?: string;
}

export interface DeleteAssetRequest {
    /**
     * Identifier of the asset, as returned by `POST /assets`.
     */
    assetId: string;
}

export interface DownloadAssetRequest {
    /**
     * Identifier of the asset, as returned by `POST /assets`.
     */
    assetId: string;
    /**
     * Return the asset's URL rather than redirecting to it.
     */
    noRedirect?: boolean;
}

export interface GetAssetRequest {
    /**
     * Identifier of the asset, as returned by `POST /assets`.
     */
    assetId: string;
}

export interface ListAssetsRequest {
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
    order?: ListAssetsOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
    /**
     * An asset folder — `assets`, `avatars` or `support`.
     */
    folder?: string;
    /**
     * Return only files of this kind, for example `image/png`. The type is
     * the one worked out from the file itself when it was uploaded.
     * 
     */
    type?: string;
    /**
     * Uploaded strictly after this instant.
     */
    whenCreated$gt?: Date;
    /**
     * Uploaded strictly before this instant.
     */
    whenCreated$lt?: Date;
    /**
     * Uploaded at or after this instant.
     */
    whenCreated$gte?: Date;
    /**
     * Uploaded at or before this instant.
     */
    whenCreated$lte?: Date;
}

/**
 * 
 */
export class StorageApi extends runtime.BaseAPI {

    /**
     * Creates request options for createAsset without sending the request
     */
    async createAssetRequestOpts(requestParameters: CreateAssetRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['file'] == null) {
            throw new runtime.RequiredError(
                'file',
                'Required parameter "file" was null or undefined when calling createAsset().'
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
        const consumes: runtime.Consume[] = [
            { contentType: 'multipart/form-data' },
        ];
        // @ts-ignore: canConsumeForm may be unused
        const canConsumeForm = runtime.canConsumeForm(consumes);

        let formParams: { append(param: string, value: any): any };
        let useForm = false;
        // use FormData to transmit files using content-type "multipart/form-data"
        useForm = canConsumeForm;
        if (useForm) {
            formParams = new FormData();
        } else {
            formParams = new URLSearchParams();
        }

        if (requestParameters['provider'] != null) {
            formParams.append('provider', requestParameters['provider'] as any);
        }

        if (requestParameters['folder'] != null) {
            formParams.append('folder', requestParameters['folder'] as any);
        }

        if (requestParameters['isPublic'] != null) {
            formParams.append('is_public', requestParameters['isPublic'] as any);
        }

        if (requestParameters['tag'] != null) {
            formParams.append('tag', requestParameters['tag'] as any);
        }

        if (requestParameters['file'] != null) {
            formParams.append('file', requestParameters['file'] as any);
        }


        let urlPath = `/assets`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: formParams,
        };
    }

    /**
     * Upload a file and keep it with your organization, ready to use behind an object, a template or a face. Send it as `multipart/form-data`, with the file itself in the `file` part.  **What you can upload.** Images (`gif`, `jpeg`, `png`, `webp`), PDFs, JSON and plain text, up to 10 MiB. The kind of file is worked out from its own contents, not from the type your client claims, so anything else comes back as `400`. One consequence worth knowing: an SVG or an HTML page counts as plain text, is stored as plain text, and cannot run as a page.  **Where it goes.** Choose `gcs` for ordinary storage, or `ipfs` to publish the file to the InterPlanetary File System, where its address is permanent and anyone who has it can read the file. The choice is fixed once the file is uploaded.  **Who can see it.** Private is the default: the file is reachable only through a download link that expires. Set `is_public` to make it readable by anyone with the address. Files published to IPFS have to be public, so a private IPFS upload comes back as `400`.  Requires the `storage.create` permission. 
     * Upload an asset
     */
    async createAssetRaw(requestParameters: CreateAssetRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<StorageAsset>> {
        const requestOptions = await this.createAssetRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => StorageAssetFromJSON(jsonValue));
    }

    /**
     * Upload a file and keep it with your organization, ready to use behind an object, a template or a face. Send it as `multipart/form-data`, with the file itself in the `file` part.  **What you can upload.** Images (`gif`, `jpeg`, `png`, `webp`), PDFs, JSON and plain text, up to 10 MiB. The kind of file is worked out from its own contents, not from the type your client claims, so anything else comes back as `400`. One consequence worth knowing: an SVG or an HTML page counts as plain text, is stored as plain text, and cannot run as a page.  **Where it goes.** Choose `gcs` for ordinary storage, or `ipfs` to publish the file to the InterPlanetary File System, where its address is permanent and anyone who has it can read the file. The choice is fixed once the file is uploaded.  **Who can see it.** Private is the default: the file is reachable only through a download link that expires. Set `is_public` to make it readable by anyone with the address. Files published to IPFS have to be public, so a private IPFS upload comes back as `400`.  Requires the `storage.create` permission. 
     * Upload an asset
     */
    async createAsset(requestParameters: CreateAssetRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<StorageAsset> {
        const response = await this.createAssetRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for deleteAsset without sending the request
     */
    async deleteAssetRequestOpts(requestParameters: DeleteAssetRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['assetId'] == null) {
            throw new runtime.RequiredError(
                'assetId',
                'Required parameter "assetId" was null or undefined when calling deleteAsset().'
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

        let urlPath = `/assets/{assetId}`;
        urlPath = urlPath.replace('{assetId}', encodeURIComponent(String(requestParameters['assetId'])));

        return {
            path: urlPath,
            method: 'DELETE',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Delete a file and everything recorded about it. This cannot be undone.  The call returns after both the stored file and its database record have been deleted.  Nothing warns you if the file is still in use. If a face, template or object points at it, that picture simply stops loading — check before you delete.  Requires the `storage.delete` permission. 
     * Delete an asset
     */
    async deleteAssetRaw(requestParameters: DeleteAssetRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.deleteAssetRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Delete a file and everything recorded about it. This cannot be undone.  The call returns after both the stored file and its database record have been deleted.  Nothing warns you if the file is still in use. If a face, template or object points at it, that picture simply stops loading — check before you delete.  Requires the `storage.delete` permission. 
     * Delete an asset
     */
    async deleteAsset(requestParameters: DeleteAssetRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.deleteAssetRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for downloadAsset without sending the request
     */
    async downloadAssetRequestOpts(requestParameters: DownloadAssetRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['assetId'] == null) {
            throw new runtime.RequiredError(
                'assetId',
                'Required parameter "assetId" was null or undefined when calling downloadAsset().'
            );
        }

        const queryParameters: any = {};

        if (requestParameters['noRedirect'] != null) {
            queryParameters['noRedirect'] = requestParameters['noRedirect'];
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

        let urlPath = `/assets/{assetId}/download`;
        urlPath = urlPath.replace('{assetId}', encodeURIComponent(String(requestParameters['assetId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Get a link that opens the file itself.  For an ordinary stored file the link is freshly made for you and works for fifteen minutes, whether the file is private or public. Make a new one whenever you need it rather than saving the link. For a file published to IPFS the link is its permanent public address and does not expire.  The answer is always a small JSON object; fetch the `url` inside it as a second request.  Requires the `storage.read` permission. 
     * Get a download URL
     */
    async downloadAssetRaw(requestParameters: DownloadAssetRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<AssetURL>> {
        const requestOptions = await this.downloadAssetRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => AssetURLFromJSON(jsonValue));
    }

    /**
     * Get a link that opens the file itself.  For an ordinary stored file the link is freshly made for you and works for fifteen minutes, whether the file is private or public. Make a new one whenever you need it rather than saving the link. For a file published to IPFS the link is its permanent public address and does not expire.  The answer is always a small JSON object; fetch the `url` inside it as a second request.  Requires the `storage.read` permission. 
     * Get a download URL
     */
    async downloadAsset(requestParameters: DownloadAssetRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<AssetURL> {
        const response = await this.downloadAssetRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getAsset without sending the request
     */
    async getAssetRequestOpts(requestParameters: GetAssetRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['assetId'] == null) {
            throw new runtime.RequiredError(
                'assetId',
                'Required parameter "assetId" was null or undefined when calling getAsset().'
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

        let urlPath = `/assets/{assetId}`;
        urlPath = urlPath.replace('{assetId}', encodeURIComponent(String(requestParameters['assetId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * What we know about one file: its name, what kind of file it is, how big it is, and where it is kept.  This does not fetch the file, and the `url` here does not open a private one on its own. Ask for a download link with `GET /assets/{assetId}/download`.  Requires the `storage.read` permission. 
     * Get an asset
     */
    async getAssetRaw(requestParameters: GetAssetRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<StorageAsset>> {
        const requestOptions = await this.getAssetRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => StorageAssetFromJSON(jsonValue));
    }

    /**
     * What we know about one file: its name, what kind of file it is, how big it is, and where it is kept.  This does not fetch the file, and the `url` here does not open a private one on its own. Ask for a download link with `GET /assets/{assetId}/download`.  Requires the `storage.read` permission. 
     * Get an asset
     */
    async getAsset(requestParameters: GetAssetRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<StorageAsset> {
        const response = await this.getAssetRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listAssets without sending the request
     */
    async listAssetsRequestOpts(requestParameters: ListAssetsRequest): Promise<runtime.RequestOpts> {
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

        if (requestParameters['folder'] != null) {
            queryParameters['folder'] = requestParameters['folder'];
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

        let urlPath = `/assets`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * The files your organization has uploaded, newest first, with their names, sizes and types.  Profile pictures and support attachments are kept apart and do not appear here.  This lists the files, it does not fetch them. To open one, ask for a download link with `GET /assets/{assetId}/download`.  Requires the `storage.read` permission. 
     * List assets
     */
    async listAssetsRaw(requestParameters: ListAssetsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListAssetsOut>> {
        const requestOptions = await this.listAssetsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListAssetsOutFromJSON(jsonValue));
    }

    /**
     * The files your organization has uploaded, newest first, with their names, sizes and types.  Profile pictures and support attachments are kept apart and do not appear here.  This lists the files, it does not fetch them. To open one, ask for a download link with `GET /assets/{assetId}/download`.  Requires the `storage.read` permission. 
     * List assets
     */
    async listAssets(requestParameters: ListAssetsRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListAssetsOut> {
        const response = await this.listAssetsRaw(requestParameters, initOverrides);
        return await response.value();
    }

}

/**
 * @export
 */
export const ListAssetsOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListAssetsOrderEnum = typeof ListAssetsOrderEnum[keyof typeof ListAssetsOrderEnum];
