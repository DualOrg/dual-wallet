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
    type AuthChallenge,
    AuthChallengeFromJSON,
    AuthChallengeToJSON,
} from '../models/AuthChallenge';
import {
    type EoaIn,
    EoaInFromJSON,
    EoaInToJSON,
} from '../models/EoaIn';
import {
    type GoogleLinkIn,
    GoogleLinkInFromJSON,
    GoogleLinkInToJSON,
} from '../models/GoogleLinkIn';
import {
    type GoogleLoginIn,
    GoogleLoginInFromJSON,
    GoogleLoginInToJSON,
} from '../models/GoogleLoginIn';
import {
    type ListWalletSessionsOut,
    ListWalletSessionsOutFromJSON,
    ListWalletSessionsOutToJSON,
} from '../models/ListWalletSessionsOut';
import {
    type ListWalletsOut,
    ListWalletsOutFromJSON,
    ListWalletsOutToJSON,
} from '../models/ListWalletsOut';
import {
    type LoginIn,
    LoginInFromJSON,
    LoginInToJSON,
} from '../models/LoginIn';
import {
    type LoginOut,
    LoginOutFromJSON,
    LoginOutToJSON,
} from '../models/LoginOut';
import {
    type ModelError,
    ModelErrorFromJSON,
    ModelErrorToJSON,
} from '../models/ModelError';
import {
    type OrganizationWalletUpdate,
    OrganizationWalletUpdateFromJSON,
    OrganizationWalletUpdateToJSON,
} from '../models/OrganizationWalletUpdate';
import {
    type PasskeyLoginOptionsOut,
    PasskeyLoginOptionsOutFromJSON,
    PasskeyLoginOptionsOutToJSON,
} from '../models/PasskeyLoginOptionsOut';
import {
    type PasskeyLoginVerifyIn,
    PasskeyLoginVerifyInFromJSON,
    PasskeyLoginVerifyInToJSON,
} from '../models/PasskeyLoginVerifyIn';
import {
    type PasskeyRegisterOptionsOut,
    PasskeyRegisterOptionsOutFromJSON,
    PasskeyRegisterOptionsOutToJSON,
} from '../models/PasskeyRegisterOptionsOut';
import {
    type PasskeyRegisterVerifyIn,
    PasskeyRegisterVerifyInFromJSON,
    PasskeyRegisterVerifyInToJSON,
} from '../models/PasskeyRegisterVerifyIn';
import {
    type RefreshTokenOut,
    RefreshTokenOutFromJSON,
    RefreshTokenOutToJSON,
} from '../models/RefreshTokenOut';
import {
    type RequestOTPCodeIn,
    RequestOTPCodeInFromJSON,
    RequestOTPCodeInToJSON,
} from '../models/RequestOTPCodeIn';
import {
    type ResetCodeIn,
    ResetCodeInFromJSON,
    ResetCodeInToJSON,
} from '../models/ResetCodeIn';
import {
    type ResetPasswordIn,
    ResetPasswordInFromJSON,
    ResetPasswordInToJSON,
} from '../models/ResetPasswordIn';
import {
    type SetNewPasswordIn,
    SetNewPasswordInFromJSON,
    SetNewPasswordInToJSON,
} from '../models/SetNewPasswordIn';
import {
    type StatsOut,
    StatsOutFromJSON,
    StatsOutToJSON,
} from '../models/StatsOut';
import {
    type VerifyIn,
    VerifyInFromJSON,
    VerifyInToJSON,
} from '../models/VerifyIn';
import {
    type Wallet,
    WalletFromJSON,
    WalletToJSON,
} from '../models/Wallet';
import {
    type WalletCreate,
    WalletCreateFromJSON,
    WalletCreateToJSON,
} from '../models/WalletCreate';
import {
    type WalletUpdate,
    WalletUpdateFromJSON,
    WalletUpdateToJSON,
} from '../models/WalletUpdate';

export interface ConnectEoaRequest {
    /**
     * 
     */
    eoaIn: EoaIn;
}

export interface DeleteWalletByIdRequest {
    /**
     * Identifier of the wallet to delete.
     */
    id: string;
}

export interface GetOrganizationWalletStatsRequest {
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
    include?: Array<GetOrganizationWalletStatsIncludeEnum>;
    /**
     * Bucket size for a time series. It fixes how many points the series has over
     * the requested window, so a long window with a small interval is an expensive
     * request.
     * 
     */
    interval?: GetOrganizationWalletStatsIntervalEnum;
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
    groupBy?: GetOrganizationWalletStatsGroupByEnum;
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

export interface GetWalletByIdRequest {
    /**
     * Identifier of the wallet to read.
     */
    id: string;
}

export interface GoogleLoginRequest {
    /**
     * 
     */
    googleLoginIn: GoogleLoginIn;
}

export interface LinkGoogleAccountRequest {
    /**
     * 
     */
    googleLinkIn: GoogleLinkIn;
}

export interface ListOrganizationWalletsRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
    /**
     * Return only the resource with this identifier. Equivalent to fetching it by
     * path, but usable together with the other list filters.
     * 
     */
    id?: string;
    /**
     * Search the accounts by nickname, email address or on-chain address. The match
     * is case-insensitive and anywhere in the field, so `acme.com` finds everyone at
     * that domain, `ale` finds `alexf`, and a pasted `0x1234...` finds the account
     * that owns it.
     * 
     * Unlike `autocomplete` on other lists this one accepts the punctuation an email
     * address needs, because a whole address is a thing you would paste in.
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
    order?: ListOrganizationWalletsOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
}

export interface LoginWalletRequest {
    /**
     * 
     */
    loginIn: LoginIn;
}

export interface PasskeyLoginOptionsRequest {
    /**
     * 
     */
    body?: object;
}

export interface PasskeyLoginVerifyRequest {
    /**
     * 
     */
    passkeyLoginVerifyIn: PasskeyLoginVerifyIn;
}

export interface PasskeyRegisterVerifyRequest {
    /**
     * 
     */
    passkeyRegisterVerifyIn: PasskeyRegisterVerifyIn;
}

export interface RegisterWalletRequest {
    /**
     * 
     */
    walletCreate: WalletCreate;
}

export interface RequestOTPCodeRequest {
    /**
     * 
     */
    requestOTPCodeIn: RequestOTPCodeIn;
}

export interface RequestVerificationCodeRequest {
    /**
     * 
     */
    resetCodeIn: ResetCodeIn;
}

export interface ResetPasswordRequest {
    /**
     * 
     */
    resetPasswordIn: ResetPasswordIn;
}

export interface RevokeWalletSessionRequest {
    /**
     * Identifier of the login session, from `GET /wallets/sessions`.
     */
    sessionId: string;
}

export interface SetNewPasswordRequest {
    /**
     * 
     */
    setNewPasswordIn: SetNewPasswordIn;
}

export interface UpdateOrganizationWalletRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
    /**
     * Identifier of the end user's account to update.
     */
    id: string;
    /**
     * 
     */
    organizationWalletUpdate: OrganizationWalletUpdate;
}

export interface UpdateWalletRequest {
    /**
     * 
     */
    walletUpdate: WalletUpdate;
}

export interface UpdateWalletByIdRequest {
    /**
     * Identifier of the wallet to update.
     */
    id: string;
    /**
     * 
     */
    walletUpdate: WalletUpdate;
}

export interface VerifyWalletRequest {
    /**
     * 
     */
    verifyIn: VerifyIn;
}

/**
 * 
 */
export class WalletsApi extends runtime.BaseAPI {

    /**
     * Creates request options for connectEoa without sending the request
     */
    async connectEoaRequestOpts(requestParameters: ConnectEoaRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['eoaIn'] == null) {
            throw new runtime.RequiredError(
                'eoaIn',
                'Required parameter "eoaIn" was null or undefined when calling connectEoa().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';


        let urlPath = `/wallets/connect/eoa`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: EoaInToJSON(requestParameters['eoaIn']),
        };
    }

    /**
     * Let a user sign in with a crypto wallet they already own — MetaMask, Rainbow, Ledger — as their identity here. One endpoint covers both first time and every time after.  1. `GET /auth/challenge` — get a one-off string to sign. 2. Ask their wallet to sign it with `personal_sign`. 3. Send the signature here.  We recover the address from the signature, so nothing but the signature itself proves who they are. On a first connection we create their Dual wallet for them; afterwards we recognise the address and start a new session. Either way the response carries their wallet and a session.  No sign-in needed — this is the sign-in. 
     * Sign in with a crypto wallet
     */
    async connectEoaRaw(requestParameters: ConnectEoaRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<LoginOut>> {
        const requestOptions = await this.connectEoaRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => LoginOutFromJSON(jsonValue));
    }

    /**
     * Let a user sign in with a crypto wallet they already own — MetaMask, Rainbow, Ledger — as their identity here. One endpoint covers both first time and every time after.  1. `GET /auth/challenge` — get a one-off string to sign. 2. Ask their wallet to sign it with `personal_sign`. 3. Send the signature here.  We recover the address from the signature, so nothing but the signature itself proves who they are. On a first connection we create their Dual wallet for them; afterwards we recognise the address and start a new session. Either way the response carries their wallet and a session.  No sign-in needed — this is the sign-in. 
     * Sign in with a crypto wallet
     */
    async connectEoa(requestParameters: ConnectEoaRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<LoginOut> {
        const response = await this.connectEoaRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for deleteWallet without sending the request
     */
    async deleteWalletRequestOpts(): Promise<runtime.RequestOpts> {
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

        let urlPath = `/wallets/me`;

        return {
            path: urlPath,
            method: 'DELETE',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Close the signed-in account for good. Every session ends and every API key it created is revoked, so nothing is left that can act as this person.  This cannot be undone. The account cannot be deleted while it is the owner of an organization; delete that organization first. Objects they own are not deleted, so transfer anything that matters to another account too.  Requires the `wallets.delete` permission.
     * Delete my wallet
     */
    async deleteWalletRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.deleteWalletRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Close the signed-in account for good. Every session ends and every API key it created is revoked, so nothing is left that can act as this person.  This cannot be undone. The account cannot be deleted while it is the owner of an organization; delete that organization first. Objects they own are not deleted, so transfer anything that matters to another account too.  Requires the `wallets.delete` permission.
     * Delete my wallet
     */
    async deleteWallet(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.deleteWalletRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for deleteWalletById without sending the request
     */
    async deleteWalletByIdRequestOpts(requestParameters: DeleteWalletByIdRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['id'] == null) {
            throw new runtime.RequiredError(
                'id',
                'Required parameter "id" was null or undefined when calling deleteWalletById().'
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

        let urlPath = `/wallets/{id}`;
        urlPath = urlPath.replace('{id}', encodeURIComponent(String(requestParameters['id'])));

        return {
            path: urlPath,
            method: 'DELETE',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Close one account by its identifier.  You can only close your own account this way — the same thing as `DELETE /wallets/me`, addressed differently. Anything else comes back as `403`. Every session ends and every API key is revoked. The account cannot be deleted while it owns an organization; delete that organization first. Objects the account owns are left where they are.  Requires the `wallets.delete` permission.
     * Delete a wallet by id
     */
    async deleteWalletByIdRaw(requestParameters: DeleteWalletByIdRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.deleteWalletByIdRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Close one account by its identifier.  You can only close your own account this way — the same thing as `DELETE /wallets/me`, addressed differently. Anything else comes back as `403`. Every session ends and every API key is revoked. The account cannot be deleted while it owns an organization; delete that organization first. Objects the account owns are left where they are.  Requires the `wallets.delete` permission.
     * Delete a wallet by id
     */
    async deleteWalletById(requestParameters: DeleteWalletByIdRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.deleteWalletByIdRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getAuthChallenge without sending the request
     */
    async getAuthChallengeRequestOpts(): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/auth/challenge`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Ask for a one-off random string to sign, which proves that whoever answers holds the key right now rather than replaying an old signature.  Fetch it immediately before you need it: it can be used once and expires after 60 seconds.  Sign it with the crypto wallet\'s `personal_sign` method, then send the challenge and signature to `POST /wallets/connect/eoa`.  Passkey registration and sign-in use the challenges returned by their own `/wallets/connect/passkey/_*_/options` endpoints instead.  No sign-in needed. 
     * Get a sign-in challenge
     */
    async getAuthChallengeRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<AuthChallenge>> {
        const requestOptions = await this.getAuthChallengeRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => AuthChallengeFromJSON(jsonValue));
    }

    /**
     * Ask for a one-off random string to sign, which proves that whoever answers holds the key right now rather than replaying an old signature.  Fetch it immediately before you need it: it can be used once and expires after 60 seconds.  Sign it with the crypto wallet\'s `personal_sign` method, then send the challenge and signature to `POST /wallets/connect/eoa`.  Passkey registration and sign-in use the challenges returned by their own `/wallets/connect/passkey/_*_/options` endpoints instead.  No sign-in needed. 
     * Get a sign-in challenge
     */
    async getAuthChallenge(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<AuthChallenge> {
        const response = await this.getAuthChallengeRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getOrganizationWalletStats without sending the request
     */
    async getOrganizationWalletStatsRequestOpts(requestParameters: GetOrganizationWalletStatsRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling getOrganizationWalletStats().'
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

        let urlPath = `/organizations/{organizationId}/stats/wallets`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * How many wallets belong to your organization.  Ask for `include=breakdown` to split it by one dimension, and `include=series` to get it over time; both are extra work, so the plain total is what you get by default.  You have to be a member of the organization in the path. The figures never quietly widen to the whole network if a token is missing or expired — the request fails instead, so a dashboard cannot show network numbers under your own name.  For network-wide figures, use the matching endpoint under `/public/stats/`.  Requires the `stats.wallets.read` permission. 
     * Your wallet statistics
     */
    async getOrganizationWalletStatsRaw(requestParameters: GetOrganizationWalletStatsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<StatsOut>> {
        const requestOptions = await this.getOrganizationWalletStatsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => StatsOutFromJSON(jsonValue));
    }

    /**
     * How many wallets belong to your organization.  Ask for `include=breakdown` to split it by one dimension, and `include=series` to get it over time; both are extra work, so the plain total is what you get by default.  You have to be a member of the organization in the path. The figures never quietly widen to the whole network if a token is missing or expired — the request fails instead, so a dashboard cannot show network numbers under your own name.  For network-wide figures, use the matching endpoint under `/public/stats/`.  Requires the `stats.wallets.read` permission. 
     * Your wallet statistics
     */
    async getOrganizationWalletStats(requestParameters: GetOrganizationWalletStatsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<StatsOut> {
        const response = await this.getOrganizationWalletStatsRaw(requestParameters, initOverrides);
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
     * Creates request options for getWallet without sending the request
     */
    async getWalletRequestOpts(): Promise<runtime.RequestOpts> {
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

        let urlPath = `/wallets/me`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Everything about the signed-in account: their address, the ways they can sign in, their display name and language, and whether the account is confirmed and in good standing.  Passwords and keys are never part of this. Use it to fill in a profile screen, check `activated` for account readiness, and check `email_verified` before starting an email-gated flow.  Requires the `wallets.read` permission.
     * Get my wallet
     */
    async getWalletRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Wallet>> {
        const requestOptions = await this.getWalletRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => WalletFromJSON(jsonValue));
    }

    /**
     * Everything about the signed-in account: their address, the ways they can sign in, their display name and language, and whether the account is confirmed and in good standing.  Passwords and keys are never part of this. Use it to fill in a profile screen, check `activated` for account readiness, and check `email_verified` before starting an email-gated flow.  Requires the `wallets.read` permission.
     * Get my wallet
     */
    async getWallet(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Wallet> {
        const response = await this.getWalletRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getWalletById without sending the request
     */
    async getWalletByIdRequestOpts(requestParameters: GetWalletByIdRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['id'] == null) {
            throw new runtime.RequiredError(
                'id',
                'Required parameter "id" was null or undefined when calling getWalletById().'
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

        let urlPath = `/wallets/{id}`;
        urlPath = urlPath.replace('{id}', encodeURIComponent(String(requestParameters['id'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Read one account by its identifier.  You can only read your own account this way — the same answer as `GET /wallets/me`, addressed differently. Anything else comes back as `403`.  Requires the `wallets.read` permission. 
     * Get a wallet by id
     */
    async getWalletByIdRaw(requestParameters: GetWalletByIdRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Wallet>> {
        const requestOptions = await this.getWalletByIdRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => WalletFromJSON(jsonValue));
    }

    /**
     * Read one account by its identifier.  You can only read your own account this way — the same answer as `GET /wallets/me`, addressed differently. Anything else comes back as `403`.  Requires the `wallets.read` permission. 
     * Get a wallet by id
     */
    async getWalletById(requestParameters: GetWalletByIdRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Wallet> {
        const response = await this.getWalletByIdRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for googleLogin without sending the request
     */
    async googleLoginRequestOpts(requestParameters: GoogleLoginRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['googleLoginIn'] == null) {
            throw new runtime.RequiredError(
                'googleLoginIn',
                'Required parameter "googleLoginIn" was null or undefined when calling googleLogin().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';


        let urlPath = `/auth/provider/google`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: GoogleLoginInToJSON(requestParameters['googleLoginIn']),
        };
    }

    /**
     * Exchange a Google Identity Services ID token for a Dual session. This one endpoint handles both new and returning users: the first successful request creates a wallet, and later requests sign in to that same wallet.  **Client integration:**  1. Configure Google Identity Services with your application\'s web client ID. 2. Read `credential` from the Google callback. 3. Send that value here as `id_token`. 4. Store the returned access and refresh tokens as you would for any other    Dual sign-in method.  The `credential` value is a Google **ID token**. Do not send a Google OAuth access token or authorization code. Dual verifies the token\'s signature, issuer, audience, expiry, stable Google account identifier, and verified email address before issuing a session.  Include `organization_id` when the account belongs to a particular organization. Leave it out for an account in the open network scope. The same Google account may have a separate Dual wallet in each scope.  A new wallet is active immediately because Google has already verified the email address. Google is never linked to an existing wallet by email alone: if that email belongs to a wallet using another sign-in method, this request returns `409`. Sign in through the existing method, then connect Google with `POST /auth/provider/google/link` to use either method on the same wallet.  No existing Dual session is required — this endpoint creates one.
     * Sign in or register with Google
     */
    async googleLoginRaw(requestParameters: GoogleLoginRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<LoginOut>> {
        const requestOptions = await this.googleLoginRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => LoginOutFromJSON(jsonValue));
    }

    /**
     * Exchange a Google Identity Services ID token for a Dual session. This one endpoint handles both new and returning users: the first successful request creates a wallet, and later requests sign in to that same wallet.  **Client integration:**  1. Configure Google Identity Services with your application\'s web client ID. 2. Read `credential` from the Google callback. 3. Send that value here as `id_token`. 4. Store the returned access and refresh tokens as you would for any other    Dual sign-in method.  The `credential` value is a Google **ID token**. Do not send a Google OAuth access token or authorization code. Dual verifies the token\'s signature, issuer, audience, expiry, stable Google account identifier, and verified email address before issuing a session.  Include `organization_id` when the account belongs to a particular organization. Leave it out for an account in the open network scope. The same Google account may have a separate Dual wallet in each scope.  A new wallet is active immediately because Google has already verified the email address. Google is never linked to an existing wallet by email alone: if that email belongs to a wallet using another sign-in method, this request returns `409`. Sign in through the existing method, then connect Google with `POST /auth/provider/google/link` to use either method on the same wallet.  No existing Dual session is required — this endpoint creates one.
     * Sign in or register with Google
     */
    async googleLogin(requestParameters: GoogleLoginRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<LoginOut> {
        const response = await this.googleLoginRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for linkGoogleAccount without sending the request
     */
    async linkGoogleAccountRequestOpts(requestParameters: LinkGoogleAccountRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['googleLinkIn'] == null) {
            throw new runtime.RequiredError(
                'googleLinkIn',
                'Required parameter "googleLinkIn" was null or undefined when calling linkGoogleAccount().'
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

        let urlPath = `/auth/provider/google/link`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: GoogleLinkInToJSON(requestParameters['googleLinkIn']),
        };
    }

    /**
     * Sign in with an existing method, then send a Google Identity Services ID token to add Google as another way to access the same wallet. The wallet, password, signing account, organizations, and memberships are preserved.  Requires a user access-token session. API keys cannot connect sign-in methods. The target is always the signed-in wallet, including when its session is switched into an organization; the caller cannot name a target.  The Google token must pass signature, issuer, audience, expiry, stable subject, and verified-email checks. Its normalized email must match this wallet\'s current email. Disabled wallets are refused. Successful linking also confirms this email, and returns the current wallet.  A wallet can have one Google identity. Linking the same identity again is idempotent; replacing it, or using one linked to another wallet in the same wallet scope, returns 409. The binding is atomic with respect to concurrent linking, email changes, and disabling. No accounts are merged by email.
     * Connect Google sign-in to your account
     */
    async linkGoogleAccountRaw(requestParameters: LinkGoogleAccountRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Wallet>> {
        const requestOptions = await this.linkGoogleAccountRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => WalletFromJSON(jsonValue));
    }

    /**
     * Sign in with an existing method, then send a Google Identity Services ID token to add Google as another way to access the same wallet. The wallet, password, signing account, organizations, and memberships are preserved.  Requires a user access-token session. API keys cannot connect sign-in methods. The target is always the signed-in wallet, including when its session is switched into an organization; the caller cannot name a target.  The Google token must pass signature, issuer, audience, expiry, stable subject, and verified-email checks. Its normalized email must match this wallet\'s current email. Disabled wallets are refused. Successful linking also confirms this email, and returns the current wallet.  A wallet can have one Google identity. Linking the same identity again is idempotent; replacing it, or using one linked to another wallet in the same wallet scope, returns 409. The binding is atomic with respect to concurrent linking, email changes, and disabling. No accounts are merged by email.
     * Connect Google sign-in to your account
     */
    async linkGoogleAccount(requestParameters: LinkGoogleAccountRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Wallet> {
        const response = await this.linkGoogleAccountRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listOrganizationWallets without sending the request
     */
    async listOrganizationWalletsRequestOpts(requestParameters: ListOrganizationWalletsRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling listOrganizationWallets().'
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

        let urlPath = `/organizations/{organizationId}/wallets`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Every end-user account that belongs to the organization in the path — the people who sign in, hold an address and own objects, as opposed to the team members who administer the organization. For the team, use `GET /organizations/{organizationId}/members`.  Narrow it with `autocomplete` to search by nickname, email address or on-chain address, and with `id` to fetch one account.  The list is paginated: read `next` from the response and send it back to get the following page.  You have to be a member of the organization in the path, and the scope never widens beyond it.  Requires the `organizations.wallets.read` permission — the one that covers the organization\'s end users, not `wallets`, which is an account\'s own. 
     * List the organization\'s accounts
     */
    async listOrganizationWalletsRaw(requestParameters: ListOrganizationWalletsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListWalletsOut>> {
        const requestOptions = await this.listOrganizationWalletsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListWalletsOutFromJSON(jsonValue));
    }

    /**
     * Every end-user account that belongs to the organization in the path — the people who sign in, hold an address and own objects, as opposed to the team members who administer the organization. For the team, use `GET /organizations/{organizationId}/members`.  Narrow it with `autocomplete` to search by nickname, email address or on-chain address, and with `id` to fetch one account.  The list is paginated: read `next` from the response and send it back to get the following page.  You have to be a member of the organization in the path, and the scope never widens beyond it.  Requires the `organizations.wallets.read` permission — the one that covers the organization\'s end users, not `wallets`, which is an account\'s own. 
     * List the organization\'s accounts
     */
    async listOrganizationWallets(requestParameters: ListOrganizationWalletsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListWalletsOut> {
        const response = await this.listOrganizationWalletsRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listWalletSessions without sending the request
     */
    async listWalletSessionsRequestOpts(): Promise<runtime.RequestOpts> {
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

        let urlPath = `/wallets/sessions`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Where this account is signed in — one entry per browser or device, newest first. This is the \"your devices\" list, and the way a user spots a session they do not recognise.  Sessions that have been ended or have expired are not listed. An account keeps up to ten at a time; opening an eleventh ends the oldest, so the list is always short.  End one with `DELETE /wallets/sessions/{sessionId}`, or all of them with `POST /auth/logout-all`.  Requires the `wallets.read` permission. 
     * List the wallet\'s login sessions
     */
    async listWalletSessionsRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListWalletSessionsOut>> {
        const requestOptions = await this.listWalletSessionsRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListWalletSessionsOutFromJSON(jsonValue));
    }

    /**
     * Where this account is signed in — one entry per browser or device, newest first. This is the \"your devices\" list, and the way a user spots a session they do not recognise.  Sessions that have been ended or have expired are not listed. An account keeps up to ten at a time; opening an eleventh ends the oldest, so the list is always short.  End one with `DELETE /wallets/sessions/{sessionId}`, or all of them with `POST /auth/logout-all`.  Requires the `wallets.read` permission. 
     * List the wallet\'s login sessions
     */
    async listWalletSessions(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListWalletSessionsOut> {
        const response = await this.listWalletSessionsRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for loginWallet without sending the request
     */
    async loginWalletRequestOpts(requestParameters: LoginWalletRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['loginIn'] == null) {
            throw new runtime.RequiredError(
                'loginIn',
                'Required parameter "loginIn" was null or undefined when calling loginWallet().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';


        let urlPath = `/auth/login`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: LoginInToJSON(requestParameters['loginIn']),
        };
    }

    /**
     * Sign in a user with an email address or phone number, and either their password or a one-time code.  Send `password` for the ordinary case, or `otp` after `POST /auth/otp` has emailed them a code — the second is how a person signs in without ever setting a password. Send one or the other, not both.  Include `organization_id` when the account belongs to a particular organization: the same email address can exist as a separate account in several of them, and in the open network scope. Leave it out for an account that is not tied to an organization.  You get back the wallet, an access token to use straight away, and a refresh token to keep the session going. A wrong password, a wrong code and an unknown account all give the same answer, so this cannot be used to find out who has an account.  Signing in with a one-time code also confirms the address the code was sent to.  No sign-in needed — this is the sign-in. 
     * Sign in
     */
    async loginWalletRaw(requestParameters: LoginWalletRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<LoginOut>> {
        const requestOptions = await this.loginWalletRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => LoginOutFromJSON(jsonValue));
    }

    /**
     * Sign in a user with an email address or phone number, and either their password or a one-time code.  Send `password` for the ordinary case, or `otp` after `POST /auth/otp` has emailed them a code — the second is how a person signs in without ever setting a password. Send one or the other, not both.  Include `organization_id` when the account belongs to a particular organization: the same email address can exist as a separate account in several of them, and in the open network scope. Leave it out for an account that is not tied to an organization.  You get back the wallet, an access token to use straight away, and a refresh token to keep the session going. A wrong password, a wrong code and an unknown account all give the same answer, so this cannot be used to find out who has an account.  Signing in with a one-time code also confirms the address the code was sent to.  No sign-in needed — this is the sign-in. 
     * Sign in
     */
    async loginWallet(requestParameters: LoginWalletRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<LoginOut> {
        const response = await this.loginWalletRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for logout without sending the request
     */
    async logoutRequestOpts(): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("refresh-token-auth", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }

        let urlPath = `/auth/logout`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * End the session this refresh token belongs to. It stops working immediately, so the session cannot be continued.  **Send the refresh token, not the access token**, as `Authorization: Bearer <refresh_token>` — the session is the one that token belongs to.  An access token already in hand keeps working until it expires, for up to about fifteen minutes, so throw both tokens away once this returns.  Signing out a session that has already ended succeeds, so a client retrying after a failed call has nothing special to handle.  To end every session at once, use `POST /auth/logout-all`. 
     * Sign out
     */
    async logoutRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.logoutRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * End the session this refresh token belongs to. It stops working immediately, so the session cannot be continued.  **Send the refresh token, not the access token**, as `Authorization: Bearer <refresh_token>` — the session is the one that token belongs to.  An access token already in hand keeps working until it expires, for up to about fifteen minutes, so throw both tokens away once this returns.  Signing out a session that has already ended succeeds, so a client retrying after a failed call has nothing special to handle.  To end every session at once, use `POST /auth/logout-all`. 
     * Sign out
     */
    async logout(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.logoutRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for logoutAll without sending the request
     */
    async logoutAllRequestOpts(): Promise<runtime.RequestOpts> {
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

        let urlPath = `/auth/logout-all`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Sign out everywhere, on every device at once. Use it after a lost phone or a password that may have been exposed.  Unlike ordinary sign-out, this one takes the **access token**, because it is something the signed-in person is doing rather than an act on one particular session.  Access tokens already in hand keep working until they expire, for up to about fifteen minutes. Nothing can be refreshed afterwards, so everyone has to sign in again.  To end one session and leave the rest alone, use `DELETE /wallets/sessions/{sessionId}`. 
     * Log out every session
     */
    async logoutAllRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.logoutAllRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Sign out everywhere, on every device at once. Use it after a lost phone or a password that may have been exposed.  Unlike ordinary sign-out, this one takes the **access token**, because it is something the signed-in person is doing rather than an act on one particular session.  Access tokens already in hand keep working until they expire, for up to about fifteen minutes. Nothing can be refreshed afterwards, so everyone has to sign in again.  To end one session and leave the rest alone, use `DELETE /wallets/sessions/{sessionId}`. 
     * Log out every session
     */
    async logoutAll(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.logoutAllRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for passkeyLoginOptions without sending the request
     */
    async passkeyLoginOptionsRequestOpts(requestParameters: PasskeyLoginOptionsRequest): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';


        let urlPath = `/wallets/connect/passkey/login/options`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: requestParameters['body'] as any,
        };
    }

    /**
     * Step one of signing in a user with an existing passkey.  Convert the JSON response into the binary values WebAuthn expects, then give it to the browser:  ```js const optionsJSON = await fetch(\'/wallets/connect/passkey/login/options\', { method: \'POST\' })   .then(r => r.json()); const options = PublicKeyCredential.parseRequestOptionsFromJSON(optionsJSON); const assertion = await navigator.credentials.get({ publicKey: options }); ```  Then serialize the result with `assertion.toJSON()` and send it to `POST /wallets/connect/passkey/login/verify`.  There is nothing to send here, and nothing to identify: the browser knows which passkeys it holds for us and offers the right one.  No sign-in needed — this is the sign-in. 
     * Start signing in with a passkey
     */
    async passkeyLoginOptionsRaw(requestParameters: PasskeyLoginOptionsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<PasskeyLoginOptionsOut>> {
        const requestOptions = await this.passkeyLoginOptionsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => PasskeyLoginOptionsOutFromJSON(jsonValue));
    }

    /**
     * Step one of signing in a user with an existing passkey.  Convert the JSON response into the binary values WebAuthn expects, then give it to the browser:  ```js const optionsJSON = await fetch(\'/wallets/connect/passkey/login/options\', { method: \'POST\' })   .then(r => r.json()); const options = PublicKeyCredential.parseRequestOptionsFromJSON(optionsJSON); const assertion = await navigator.credentials.get({ publicKey: options }); ```  Then serialize the result with `assertion.toJSON()` and send it to `POST /wallets/connect/passkey/login/verify`.  There is nothing to send here, and nothing to identify: the browser knows which passkeys it holds for us and offers the right one.  No sign-in needed — this is the sign-in. 
     * Start signing in with a passkey
     */
    async passkeyLoginOptions(requestParameters: PasskeyLoginOptionsRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<PasskeyLoginOptionsOut> {
        const response = await this.passkeyLoginOptionsRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for passkeyLoginVerify without sending the request
     */
    async passkeyLoginVerifyRequestOpts(requestParameters: PasskeyLoginVerifyRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['passkeyLoginVerifyIn'] == null) {
            throw new runtime.RequiredError(
                'passkeyLoginVerifyIn',
                'Required parameter "passkeyLoginVerifyIn" was null or undefined when calling passkeyLoginVerify().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';


        let urlPath = `/wallets/connect/passkey/login/verify`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: PasskeyLoginVerifyInToJSON(requestParameters['passkeyLoginVerifyIn']),
        };
    }

    /**
     * Step two of signing in a user with a passkey. Serialize what `navigator.credentials.get()` returned with `assertion.toJSON()` and send that JSON here.  We recognise the passkey, check the signature against the one we stored when it was created, and confirm it was used in this browser, for us, just now and only once. Then we sign the person in.  No sign-in needed — this is the sign-in. 
     * Finish signing in with a passkey
     */
    async passkeyLoginVerifyRaw(requestParameters: PasskeyLoginVerifyRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<LoginOut>> {
        const requestOptions = await this.passkeyLoginVerifyRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => LoginOutFromJSON(jsonValue));
    }

    /**
     * Step two of signing in a user with a passkey. Serialize what `navigator.credentials.get()` returned with `assertion.toJSON()` and send that JSON here.  We recognise the passkey, check the signature against the one we stored when it was created, and confirm it was used in this browser, for us, just now and only once. Then we sign the person in.  No sign-in needed — this is the sign-in. 
     * Finish signing in with a passkey
     */
    async passkeyLoginVerify(requestParameters: PasskeyLoginVerifyRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<LoginOut> {
        const response = await this.passkeyLoginVerifyRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for passkeyRegisterOptions without sending the request
     */
    async passkeyRegisterOptionsRequestOpts(): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/wallets/connect/passkey/register/options`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Step one of registering a user with a passkey — Face ID, Touch ID, Windows Hello or a hardware key. No password, nothing to remember, nothing to phish.  Convert the JSON response into the binary values WebAuthn expects, then give it to the browser:  ```js const optionsJSON = await fetch(\'/wallets/connect/passkey/register/options\')   .then(r => r.json()); const options = PublicKeyCredential.parseCreationOptionsFromJSON(optionsJSON); const credential = await navigator.credentials.create({ publicKey: options }); ```  Then serialize the result with `credential.toJSON()`, add the required `organization_id`, and send it to `POST /wallets/connect/passkey/register/verify`, which creates the wallet and signs them in.  No sign-in needed — this is how a new user signs up. 
     * Start creating a passkey
     */
    async passkeyRegisterOptionsRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<PasskeyRegisterOptionsOut>> {
        const requestOptions = await this.passkeyRegisterOptionsRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => PasskeyRegisterOptionsOutFromJSON(jsonValue));
    }

    /**
     * Step one of registering a user with a passkey — Face ID, Touch ID, Windows Hello or a hardware key. No password, nothing to remember, nothing to phish.  Convert the JSON response into the binary values WebAuthn expects, then give it to the browser:  ```js const optionsJSON = await fetch(\'/wallets/connect/passkey/register/options\')   .then(r => r.json()); const options = PublicKeyCredential.parseCreationOptionsFromJSON(optionsJSON); const credential = await navigator.credentials.create({ publicKey: options }); ```  Then serialize the result with `credential.toJSON()`, add the required `organization_id`, and send it to `POST /wallets/connect/passkey/register/verify`, which creates the wallet and signs them in.  No sign-in needed — this is how a new user signs up. 
     * Start creating a passkey
     */
    async passkeyRegisterOptions(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<PasskeyRegisterOptionsOut> {
        const response = await this.passkeyRegisterOptionsRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for passkeyRegisterVerify without sending the request
     */
    async passkeyRegisterVerifyRequestOpts(requestParameters: PasskeyRegisterVerifyRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['passkeyRegisterVerifyIn'] == null) {
            throw new runtime.RequiredError(
                'passkeyRegisterVerifyIn',
                'Required parameter "passkeyRegisterVerifyIn" was null or undefined when calling passkeyRegisterVerify().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';


        let urlPath = `/wallets/connect/passkey/register/verify`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: PasskeyRegisterVerifyInToJSON(requestParameters['passkeyRegisterVerifyIn']),
        };
    }

    /**
     * Step two of registering a user with a passkey. Serialize the browser credential with `credential.toJSON()`, add the organization the new wallet belongs to, and send the resulting JSON here.  We check the passkey really was made for us, in this browser, just now. Then we create the wallet, tie the passkey to it, and sign the person in — the response carries their wallet and a session, with nothing to confirm afterwards.  From then on, the same passkey signs both sign-ins and the actions they take, so nothing about the account depends on a password.  A passkey already tied to another wallet is refused.  No sign-in needed — this is how a new user signs up. 
     * Finish creating a passkey
     */
    async passkeyRegisterVerifyRaw(requestParameters: PasskeyRegisterVerifyRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<LoginOut>> {
        const requestOptions = await this.passkeyRegisterVerifyRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => LoginOutFromJSON(jsonValue));
    }

    /**
     * Step two of registering a user with a passkey. Serialize the browser credential with `credential.toJSON()`, add the organization the new wallet belongs to, and send the resulting JSON here.  We check the passkey really was made for us, in this browser, just now. Then we create the wallet, tie the passkey to it, and sign the person in — the response carries their wallet and a session, with nothing to confirm afterwards.  From then on, the same passkey signs both sign-ins and the actions they take, so nothing about the account depends on a password.  A passkey already tied to another wallet is refused.  No sign-in needed — this is how a new user signs up. 
     * Finish creating a passkey
     */
    async passkeyRegisterVerify(requestParameters: PasskeyRegisterVerifyRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<LoginOut> {
        const response = await this.passkeyRegisterVerifyRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for refreshToken without sending the request
     */
    async refreshTokenRequestOpts(): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("refresh-token-auth", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }

        let urlPath = `/auth/refresh-token`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Exchange a refresh token for a fresh access token, without asking anybody to sign in again. Call it when an access token has expired, or shortly before.  **Send the refresh token, not the access token**, as `Authorization: Bearer <refresh_token>`.  You get a new access token and a new refresh token. Store the new pair and throw the old one away: a refresh token works once. If one that has already been used turns up again we treat it as stolen and end that session everywhere, so never keep an old one as a spare.  Refreshing also re-checks the account. A user whose account was disabled or deleted since they signed in cannot refresh their way back in. 
     * Stay signed in
     */
    async refreshTokenRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<RefreshTokenOut>> {
        const requestOptions = await this.refreshTokenRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => RefreshTokenOutFromJSON(jsonValue));
    }

    /**
     * Exchange a refresh token for a fresh access token, without asking anybody to sign in again. Call it when an access token has expired, or shortly before.  **Send the refresh token, not the access token**, as `Authorization: Bearer <refresh_token>`.  You get a new access token and a new refresh token. Store the new pair and throw the old one away: a refresh token works once. If one that has already been used turns up again we treat it as stolen and end that session everywhere, so never keep an old one as a spare.  Refreshing also re-checks the account. A user whose account was disabled or deleted since they signed in cannot refresh their way back in. 
     * Stay signed in
     */
    async refreshToken(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<RefreshTokenOut> {
        const response = await this.refreshTokenRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for registerWallet without sending the request
     */
    async registerWalletRequestOpts(requestParameters: RegisterWalletRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['walletCreate'] == null) {
            throw new runtime.RequiredError(
                'walletCreate',
                'Required parameter "walletCreate" was null or undefined when calling registerWallet().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';


        let urlPath = `/wallets`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: WalletCreateToJSON(requestParameters['walletCreate']),
        };
    }

    /**
     * Create a member account with an email address and password inside an existing organization. `organization_id` is required on this route.  They are signed in straight away — the response carries the wallet and a session — and a confirmation email goes out at the same time. Until they confirm, `activated` on their wallet stays `false`; resend the code with `POST /auth/verification-code` if the first one goes astray.  The email address has to be free within that organization. The same address may belong to different organizations, but cannot identify two accounts in the same one.  For a passkey instead of a password, use `/wallets/connect/passkey/register/_*`. For a crypto wallet they already own, use `/wallets/connect/eoa`. To create a standalone account that can start an organization, use `POST /organizations/wallets`.  No sign-in needed — this is the sign-up. 
     * Sign up
     */
    async registerWalletRaw(requestParameters: RegisterWalletRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<LoginOut>> {
        const requestOptions = await this.registerWalletRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => LoginOutFromJSON(jsonValue));
    }

    /**
     * Create a member account with an email address and password inside an existing organization. `organization_id` is required on this route.  They are signed in straight away — the response carries the wallet and a session — and a confirmation email goes out at the same time. Until they confirm, `activated` on their wallet stays `false`; resend the code with `POST /auth/verification-code` if the first one goes astray.  The email address has to be free within that organization. The same address may belong to different organizations, but cannot identify two accounts in the same one.  For a passkey instead of a password, use `/wallets/connect/passkey/register/_*`. For a crypto wallet they already own, use `/wallets/connect/eoa`. To create a standalone account that can start an organization, use `POST /organizations/wallets`.  No sign-in needed — this is the sign-up. 
     * Sign up
     */
    async registerWallet(requestParameters: RegisterWalletRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<LoginOut> {
        const response = await this.registerWalletRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for requestOTPCode without sending the request
     */
    async requestOTPCodeRequestOpts(requestParameters: RequestOTPCodeRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['requestOTPCodeIn'] == null) {
            throw new runtime.RequiredError(
                'requestOTPCodeIn',
                'Required parameter "requestOTPCodeIn" was null or undefined when calling requestOTPCode().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';


        let urlPath = `/auth/otp`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: RequestOTPCodeInToJSON(requestParameters['requestOTPCodeIn']),
        };
    }

    /**
     * Email the user a short code they can sign in with, instead of a password. They then send it to `POST /auth/login` as `otp`.  This is how passwordless sign-in works, and it doubles as a way back in for a user who has forgotten their password.  The answer is always the same, whether or not an account exists at that address, so this cannot be used to find out who has one. If the account belongs to a particular organization, include `organization_id`.  No sign-in needed. 
     * Send a one-time code
     */
    async requestOTPCodeRaw(requestParameters: RequestOTPCodeRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.requestOTPCodeRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Email the user a short code they can sign in with, instead of a password. They then send it to `POST /auth/login` as `otp`.  This is how passwordless sign-in works, and it doubles as a way back in for a user who has forgotten their password.  The answer is always the same, whether or not an account exists at that address, so this cannot be used to find out who has one. If the account belongs to a particular organization, include `organization_id`.  No sign-in needed. 
     * Send a one-time code
     */
    async requestOTPCode(requestParameters: RequestOTPCodeRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.requestOTPCodeRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for requestVerificationCode without sending the request
     */
    async requestVerificationCodeRequestOpts(requestParameters: RequestVerificationCodeRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['resetCodeIn'] == null) {
            throw new runtime.RequiredError(
                'resetCodeIn',
                'Required parameter "resetCodeIn" was null or undefined when calling requestVerificationCode().'
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

        let urlPath = `/auth/verification-code`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: ResetCodeInToJSON(requestParameters['resetCodeIn']),
        };
    }

    /**
     * Send the signed-in person another code to confirm their email address — useful when the first one never arrived.  The code goes to the address on their account; the request body is not consulted. They then confirm with `POST /auth/verify`.  Only for an account that has not been confirmed yet. 
     * Resend a confirmation code
     */
    async requestVerificationCodeRaw(requestParameters: RequestVerificationCodeRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.requestVerificationCodeRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Send the signed-in person another code to confirm their email address — useful when the first one never arrived.  The code goes to the address on their account; the request body is not consulted. They then confirm with `POST /auth/verify`.  Only for an account that has not been confirmed yet. 
     * Resend a confirmation code
     */
    async requestVerificationCode(requestParameters: RequestVerificationCodeRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.requestVerificationCodeRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for resetPassword without sending the request
     */
    async resetPasswordRequestOpts(requestParameters: ResetPasswordRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['resetPasswordIn'] == null) {
            throw new runtime.RequiredError(
                'resetPasswordIn',
                'Required parameter "resetPasswordIn" was null or undefined when calling resetPassword().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';


        let urlPath = `/auth/password`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: ResetPasswordInToJSON(requestParameters['resetPasswordIn']),
        };
    }

    /**
     * Email the user a link to set a new password. The link carries a one-time token, which the page behind it sends to `POST /auth/set-password`.  The answer is always the same, whether or not an account exists at that address, so this cannot be used to find out who has one.  No sign-in needed — this is for a user who cannot sign in. 
     * Start a password reset
     */
    async resetPasswordRaw(requestParameters: ResetPasswordRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.resetPasswordRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Email the user a link to set a new password. The link carries a one-time token, which the page behind it sends to `POST /auth/set-password`.  The answer is always the same, whether or not an account exists at that address, so this cannot be used to find out who has one.  No sign-in needed — this is for a user who cannot sign in. 
     * Start a password reset
     */
    async resetPassword(requestParameters: ResetPasswordRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.resetPasswordRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for revokeWalletSession without sending the request
     */
    async revokeWalletSessionRequestOpts(requestParameters: RevokeWalletSessionRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['sessionId'] == null) {
            throw new runtime.RequiredError(
                'sessionId',
                'Required parameter "sessionId" was null or undefined when calling revokeWalletSession().'
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

        let urlPath = `/wallets/sessions/{sessionId}`;
        urlPath = urlPath.replace('{sessionId}', encodeURIComponent(String(requestParameters['sessionId'])));

        return {
            path: urlPath,
            method: 'DELETE',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Sign out one device without disturbing the others — for example, a lost phone or an unrecognized browser.  Only your own sessions can be ended. A session belonging to another user reads as missing, exactly like one that never existed, so this cannot be used to discover other people\'s sessions.  Ending the session you are calling from is allowed, and signs you out. An access token already in hand keeps working until it expires, for up to about fifteen minutes.  To end every session at once, use `POST /auth/logout-all`.  Requires the `wallets.update` permission. 
     * End one login session
     */
    async revokeWalletSessionRaw(requestParameters: RevokeWalletSessionRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.revokeWalletSessionRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Sign out one device without disturbing the others — for example, a lost phone or an unrecognized browser.  Only your own sessions can be ended. A session belonging to another user reads as missing, exactly like one that never existed, so this cannot be used to discover other people\'s sessions.  Ending the session you are calling from is allowed, and signs you out. An access token already in hand keeps working until it expires, for up to about fifteen minutes.  To end every session at once, use `POST /auth/logout-all`.  Requires the `wallets.update` permission. 
     * End one login session
     */
    async revokeWalletSession(requestParameters: RevokeWalletSessionRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.revokeWalletSessionRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for setNewPassword without sending the request
     */
    async setNewPasswordRequestOpts(requestParameters: SetNewPasswordRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['setNewPasswordIn'] == null) {
            throw new runtime.RequiredError(
                'setNewPasswordIn',
                'Required parameter "setNewPasswordIn" was null or undefined when calling setNewPassword().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';


        let urlPath = `/auth/set-password`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: SetNewPasswordInToJSON(requestParameters['setNewPasswordIn']),
        };
    }

    /**
     * Set a new password using the one-time token from the reset email.  Resetting a password signs the account out everywhere. That is the point of it: whoever knew the old password loses access immediately, on every device. The person resetting will need to sign in again with their new password.  The token can be used once. If something goes wrong the whole reset is undone, so the same link can simply be tried again.  No sign-in needed — this is for a user who cannot sign in. 
     * Finish a password reset
     */
    async setNewPasswordRaw(requestParameters: SetNewPasswordRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.setNewPasswordRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Set a new password using the one-time token from the reset email.  Resetting a password signs the account out everywhere. That is the point of it: whoever knew the old password loses access immediately, on every device. The person resetting will need to sign in again with their new password.  The token can be used once. If something goes wrong the whole reset is undone, so the same link can simply be tried again.  No sign-in needed — this is for a user who cannot sign in. 
     * Finish a password reset
     */
    async setNewPassword(requestParameters: SetNewPasswordRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.setNewPasswordRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for updateOrganizationWallet without sending the request
     */
    async updateOrganizationWalletRequestOpts(requestParameters: UpdateOrganizationWalletRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling updateOrganizationWallet().'
            );
        }

        if (requestParameters['id'] == null) {
            throw new runtime.RequiredError(
                'id',
                'Required parameter "id" was null or undefined when calling updateOrganizationWallet().'
            );
        }

        if (requestParameters['organizationWalletUpdate'] == null) {
            throw new runtime.RequiredError(
                'organizationWalletUpdate',
                'Required parameter "organizationWalletUpdate" was null or undefined when calling updateOrganizationWallet().'
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

        let urlPath = `/organizations/{organizationId}/wallets/{id}`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));
        urlPath = urlPath.replace('{id}', encodeURIComponent(String(requestParameters['id'])));

        return {
            path: urlPath,
            method: 'PATCH',
            headers: headerParameters,
            query: queryParameters,
            body: OrganizationWalletUpdateToJSON(requestParameters['organizationWalletUpdate']),
        };
    }

    /**
     * Change one end-user account belonging to the organization in the path: their display name, phone number, language or avatar, and whether the account is switched off.  Sending `disabled: true` locks the person out at once — every session they hold ends with the write, so a token already in flight stops working rather than lasting out its quarter of an hour. `disabled: false` lets them sign in again, without restoring those sessions.  The account has to belong to that organization. One that belongs to another reads as `404`, the same as an identifier that does not exist, so this cannot be used to find out where an account lives.  The email address and the password are not here on purpose. They are how the person signs in, and only the account holder changes them, on `PATCH /wallets/me` with the password in force now. An administrator who could set them could take the account over.  Requires the `organizations.wallets.update` permission — the one that covers the organization\'s end users, not `wallets`, which is an account\'s own. 
     * Update an end user\'s account
     */
    async updateOrganizationWalletRaw(requestParameters: UpdateOrganizationWalletRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.updateOrganizationWalletRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Change one end-user account belonging to the organization in the path: their display name, phone number, language or avatar, and whether the account is switched off.  Sending `disabled: true` locks the person out at once — every session they hold ends with the write, so a token already in flight stops working rather than lasting out its quarter of an hour. `disabled: false` lets them sign in again, without restoring those sessions.  The account has to belong to that organization. One that belongs to another reads as `404`, the same as an identifier that does not exist, so this cannot be used to find out where an account lives.  The email address and the password are not here on purpose. They are how the person signs in, and only the account holder changes them, on `PATCH /wallets/me` with the password in force now. An administrator who could set them could take the account over.  Requires the `organizations.wallets.update` permission — the one that covers the organization\'s end users, not `wallets`, which is an account\'s own. 
     * Update an end user\'s account
     */
    async updateOrganizationWallet(requestParameters: UpdateOrganizationWalletRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.updateOrganizationWalletRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for updateWallet without sending the request
     */
    async updateWalletRequestOpts(requestParameters: UpdateWalletRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['walletUpdate'] == null) {
            throw new runtime.RequiredError(
                'walletUpdate',
                'Required parameter "walletUpdate" was null or undefined when calling updateWallet().'
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

        let urlPath = `/wallets/me`;

        return {
            path: urlPath,
            method: 'PATCH',
            headers: headerParameters,
            query: queryParameters,
            body: WalletUpdateToJSON(requestParameters['walletUpdate']),
        };
    }

    /**
     * Change the signed-in account\'s display name, language, avatar, phone number or onboarding state. Send only what you want to change. The email address is the account\'s immutable identity and cannot be changed.  **Changing the password.** Send `password` together with `current_password`. Knowing the current password is what proves it is really them, rather than an attacker who obtained a token. Once changed, every other session on the account ends — including on their other devices — so anyone who had the old password loses access. The session making the change carries on.  A user who has never set a password — an invited colleague setting their first one — does not need to send `current_password`.  Only for the signed-in person\'s own account, with a signed-in session rather than an API key. Requires the `wallets.update` permission. 
     * Update my wallet
     */
    async updateWalletRaw(requestParameters: UpdateWalletRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.updateWalletRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Change the signed-in account\'s display name, language, avatar, phone number or onboarding state. Send only what you want to change. The email address is the account\'s immutable identity and cannot be changed.  **Changing the password.** Send `password` together with `current_password`. Knowing the current password is what proves it is really them, rather than an attacker who obtained a token. Once changed, every other session on the account ends — including on their other devices — so anyone who had the old password loses access. The session making the change carries on.  A user who has never set a password — an invited colleague setting their first one — does not need to send `current_password`.  Only for the signed-in person\'s own account, with a signed-in session rather than an API key. Requires the `wallets.update` permission. 
     * Update my wallet
     */
    async updateWallet(requestParameters: UpdateWalletRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.updateWalletRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for updateWalletById without sending the request
     */
    async updateWalletByIdRequestOpts(requestParameters: UpdateWalletByIdRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['id'] == null) {
            throw new runtime.RequiredError(
                'id',
                'Required parameter "id" was null or undefined when calling updateWalletById().'
            );
        }

        if (requestParameters['walletUpdate'] == null) {
            throw new runtime.RequiredError(
                'walletUpdate',
                'Required parameter "walletUpdate" was null or undefined when calling updateWalletById().'
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

        let urlPath = `/wallets/{id}`;
        urlPath = urlPath.replace('{id}', encodeURIComponent(String(requestParameters['id'])));

        return {
            path: urlPath,
            method: 'PATCH',
            headers: headerParameters,
            query: queryParameters,
            body: WalletUpdateToJSON(requestParameters['walletUpdate']),
        };
    }

    /**
     * Change one account by its identifier.  You can only change your own account this way — the same thing as `PATCH /wallets/me`, addressed differently. Anything else comes back as `403`. Email is not an update field. Send `current_password` with a new `password`; a password change ends every other session on the account.  Requires the `wallets.update` permission. 
     * Update a wallet by id
     */
    async updateWalletByIdRaw(requestParameters: UpdateWalletByIdRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.updateWalletByIdRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Change one account by its identifier.  You can only change your own account this way — the same thing as `PATCH /wallets/me`, addressed differently. Anything else comes back as `403`. Email is not an update field. Send `current_password` with a new `password`; a password change ends every other session on the account.  Requires the `wallets.update` permission. 
     * Update a wallet by id
     */
    async updateWalletById(requestParameters: UpdateWalletByIdRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.updateWalletByIdRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for verifyWallet without sending the request
     */
    async verifyWalletRequestOpts(requestParameters: VerifyWalletRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['verifyIn'] == null) {
            throw new runtime.RequiredError(
                'verifyIn',
                'Required parameter "verifyIn" was null or undefined when calling verifyWallet().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';


        let urlPath = `/auth/verify`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: VerifyInToJSON(requestParameters['verifyIn']),
        };
    }

    /**
     * Confirm an account with the code sent to its email address, which activates it for full use.  Send the same email address the code went to, along with the code, plus `organization_id` if the account belongs to a particular organization — the code is checked against that one account rather than against every outstanding code.  Signing in with a one-time code confirms an address too, so an account that goes that route never needs this.  No sign-in needed — this is part of signing up. 
     * Confirm an email address
     */
    async verifyWalletRaw(requestParameters: VerifyWalletRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.verifyWalletRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Confirm an account with the code sent to its email address, which activates it for full use.  Send the same email address the code went to, along with the code, plus `organization_id` if the account belongs to a particular organization — the code is checked against that one account rather than against every outstanding code.  Signing in with a one-time code confirms an address too, so an account that goes that route never needs this.  No sign-in needed — this is part of signing up. 
     * Confirm an email address
     */
    async verifyWallet(requestParameters: VerifyWalletRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.verifyWalletRaw(requestParameters, initOverrides);
        return await response.value();
    }

}

/**
 * @export
 */
export const GetOrganizationWalletStatsIncludeEnum = {
    Breakdown: 'breakdown',
    Series: 'series',
} as const;
export type GetOrganizationWalletStatsIncludeEnum = typeof GetOrganizationWalletStatsIncludeEnum[keyof typeof GetOrganizationWalletStatsIncludeEnum];
/**
 * @export
 */
export const GetOrganizationWalletStatsIntervalEnum = {
    Hour: 'hour',
    Day: 'day',
    Week: 'week',
    Month: 'month',
    Year: 'year',
} as const;
export type GetOrganizationWalletStatsIntervalEnum = typeof GetOrganizationWalletStatsIntervalEnum[keyof typeof GetOrganizationWalletStatsIntervalEnum];
/**
 * @export
 */
export const GetOrganizationWalletStatsGroupByEnum = {
    Activated: 'activated',
} as const;
export type GetOrganizationWalletStatsGroupByEnum = typeof GetOrganizationWalletStatsGroupByEnum[keyof typeof GetOrganizationWalletStatsGroupByEnum];
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
export const ListOrganizationWalletsOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListOrganizationWalletsOrderEnum = typeof ListOrganizationWalletsOrderEnum[keyof typeof ListOrganizationWalletsOrderEnum];
