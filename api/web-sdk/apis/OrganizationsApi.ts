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
    type ConfirmInviteOut,
    ConfirmInviteOutFromJSON,
    ConfirmInviteOutToJSON,
} from '../models/ConfirmInviteOut';
import {
    type InlineObject,
    InlineObjectFromJSON,
    InlineObjectToJSON,
} from '../models/InlineObject';
import {
    type ListMembersOut,
    ListMembersOutFromJSON,
    ListMembersOutToJSON,
} from '../models/ListMembersOut';
import {
    type ListOrganizationsOut,
    ListOrganizationsOutFromJSON,
    ListOrganizationsOutToJSON,
} from '../models/ListOrganizationsOut';
import {
    type ListRolesOut,
    ListRolesOutFromJSON,
    ListRolesOutToJSON,
} from '../models/ListRolesOut';
import {
    type LoginOut,
    LoginOutFromJSON,
    LoginOutToJSON,
} from '../models/LoginOut';
import {
    type Member,
    MemberFromJSON,
    MemberToJSON,
} from '../models/Member';
import {
    type MemberCreate,
    MemberCreateFromJSON,
    MemberCreateToJSON,
} from '../models/MemberCreate';
import {
    type MemberUpdate,
    MemberUpdateFromJSON,
    MemberUpdateToJSON,
} from '../models/MemberUpdate';
import {
    type ModelError,
    ModelErrorFromJSON,
    ModelErrorToJSON,
} from '../models/ModelError';
import {
    type Organization,
    OrganizationFromJSON,
    OrganizationToJSON,
} from '../models/Organization';
import {
    type OrganizationCreate,
    OrganizationCreateFromJSON,
    OrganizationCreateToJSON,
} from '../models/OrganizationCreate';
import {
    type OrganizationSwitch,
    OrganizationSwitchFromJSON,
    OrganizationSwitchToJSON,
} from '../models/OrganizationSwitch';
import {
    type OrganizationSwitchOut,
    OrganizationSwitchOutFromJSON,
    OrganizationSwitchOutToJSON,
} from '../models/OrganizationSwitchOut';
import {
    type OrganizationUpdate,
    OrganizationUpdateFromJSON,
    OrganizationUpdateToJSON,
} from '../models/OrganizationUpdate';
import {
    type Role,
    RoleFromJSON,
    RoleToJSON,
} from '../models/Role';
import {
    type RoleCreate,
    RoleCreateFromJSON,
    RoleCreateToJSON,
} from '../models/RoleCreate';
import {
    type RoleUpdate,
    RoleUpdateFromJSON,
    RoleUpdateToJSON,
} from '../models/RoleUpdate';
import {
    type WalletCreate,
    WalletCreateFromJSON,
    WalletCreateToJSON,
} from '../models/WalletCreate';

export interface ConfirmInviteRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
    /**
     * The one-time token from the invitation email. It appears nowhere else.
     * 
     */
    token: string;
    /**
     * The invitation being accepted, also from the email link.
     */
    memberId: string;
}

export interface CreateMemberRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
    /**
     * 
     */
    memberCreate: MemberCreate;
}

export interface CreateOrganizationRequest {
    /**
     * 
     */
    organizationCreate: OrganizationCreate;
}

export interface CreateRoleRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
    /**
     * 
     */
    roleCreate: RoleCreate;
}

export interface DeleteMemberRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
    /**
     * Identifier of the membership record, not of the member's wallet.
     */
    memberId: string;
}

export interface DeleteOrganizationRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
}

export interface DeleteRoleRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
    /**
     * Identifier of the role.
     */
    roleId: string;
}

export interface GetDefaultRoleRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
}

export interface GetMemberRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
    /**
     * Identifier of the membership record, not of the member's wallet.
     */
    memberId: string;
}

export interface GetMemberRoleRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
}

export interface GetOrganizationRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
}

export interface GetRoleRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
    /**
     * Identifier of the role.
     */
    roleId: string;
}

export interface ListMembersRequest {
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
     * Return only resources whose name matches this value exactly.
     */
    name?: string;
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
    order?: ListMembersOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
    /**
     * Return only members in this state: `pending` for invitations not yet
     * accepted, `accepted` for people who have joined, `declined` for
     * invitations turned down.
     * 
     */
    status?: string;
}

export interface ListOrganizationsRequest {
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
    order?: ListOrganizationsOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
    /**
     * Return only organizations where this person holds the named role — for
     * example only the ones they own.
     * 
     */
    roleName?: string;
    /**
     * For Dual staff only. Everyone else sees their own memberships whatever
     * this says.
     * 
     */
    all?: boolean;
}

export interface ListRolesRequest {
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
    order?: ListRolesOrderEnum;
    /**
     * Field used to sort the result. Supported fields depend on the endpoint; use
     * `when_created` for chronological ordering where it is available. The default
     * is the resource identifier, and identifiers break ties so cursor paging stays
     * stable.
     * 
     */
    sortBy?: string;
}

export interface RegisterOrganizationWalletRequest {
    /**
     * 
     */
    walletCreate: WalletCreate;
}

export interface SwitchOrganizationRequest {
    /**
     * 
     */
    organizationSwitch: OrganizationSwitch;
}

export interface UpdateMemberRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
    /**
     * Identifier of the membership record, not of the member's wallet.
     */
    memberId: string;
    /**
     * 
     */
    memberUpdate: MemberUpdate;
}

export interface UpdateOrganizationRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
    /**
     * 
     */
    organizationUpdate: OrganizationUpdate;
}

export interface UpdateRoleRequest {
    /**
     * Identifier of the organization. Each endpoint states whether it must be the
     * caller's active organization or may be used without authentication.
     * 
     */
    organizationId: string;
    /**
     * Identifier of the role.
     */
    roleId: string;
    /**
     * 
     */
    roleUpdate: RoleUpdate;
}

/**
 * 
 */
export class OrganizationsApi extends runtime.BaseAPI {

    /**
     * Creates request options for confirmInvite without sending the request
     */
    async confirmInviteRequestOpts(requestParameters: ConfirmInviteRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling confirmInvite().'
            );
        }

        if (requestParameters['token'] == null) {
            throw new runtime.RequiredError(
                'token',
                'Required parameter "token" was null or undefined when calling confirmInvite().'
            );
        }

        if (requestParameters['memberId'] == null) {
            throw new runtime.RequiredError(
                'memberId',
                'Required parameter "memberId" was null or undefined when calling confirmInvite().'
            );
        }

        const queryParameters: any = {};

        if (requestParameters['token'] != null) {
            queryParameters['token'] = requestParameters['token'];
        }

        if (requestParameters['memberId'] != null) {
            queryParameters['member_id'] = requestParameters['memberId'];
        }

        const headerParameters: runtime.HTTPHeaders = {};


        let urlPath = `/organizations/{organizationId}/invite`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Accept an invitation to join an organization. This is the address behind the button in the invitation email; the `member_id` and `token` are already in the link.  Accepting signs the person in: the response carries their wallet and a session for the organization they have just joined. If they had no wallet yet, one is created for them here — the invitation itself proves they control the email address.  An invitation is good for seven days and can be accepted once. After that, or if it has already been accepted, ask for a new one.  No sign-in needed — the person accepting may not have an account yet. 
     * Accept an invitation
     */
    async confirmInviteRaw(requestParameters: ConfirmInviteRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ConfirmInviteOut>> {
        const requestOptions = await this.confirmInviteRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ConfirmInviteOutFromJSON(jsonValue));
    }

    /**
     * Accept an invitation to join an organization. This is the address behind the button in the invitation email; the `member_id` and `token` are already in the link.  Accepting signs the person in: the response carries their wallet and a session for the organization they have just joined. If they had no wallet yet, one is created for them here — the invitation itself proves they control the email address.  An invitation is good for seven days and can be accepted once. After that, or if it has already been accepted, ask for a new one.  No sign-in needed — the person accepting may not have an account yet. 
     * Accept an invitation
     */
    async confirmInvite(requestParameters: ConfirmInviteRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ConfirmInviteOut> {
        const response = await this.confirmInviteRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for createMember without sending the request
     */
    async createMemberRequestOpts(requestParameters: CreateMemberRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling createMember().'
            );
        }

        if (requestParameters['memberCreate'] == null) {
            throw new runtime.RequiredError(
                'memberCreate',
                'Required parameter "memberCreate" was null or undefined when calling createMember().'
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

        let urlPath = `/organizations/{organizationId}/members`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: MemberCreateToJSON(requestParameters['memberCreate']),
        };
    }

    /**
     * Invite a new member to the organization by email, with the role they should hold.  They receive an email with a link that accepts the invitation. Until they click it they appear here as `pending`, and the invitation is good for seven days. If they have no account yet, one is created when they accept.  You can only hand out a role you hold yourself: an admin cannot invite a member as an owner. Attempting it comes back as `403`.  Requires the `organizations.members.create` permission. 
     * Invite a member
     */
    async createMemberRaw(requestParameters: CreateMemberRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<InlineObject>> {
        const requestOptions = await this.createMemberRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => InlineObjectFromJSON(jsonValue));
    }

    /**
     * Invite a new member to the organization by email, with the role they should hold.  They receive an email with a link that accepts the invitation. Until they click it they appear here as `pending`, and the invitation is good for seven days. If they have no account yet, one is created when they accept.  You can only hand out a role you hold yourself: an admin cannot invite a member as an owner. Attempting it comes back as `403`.  Requires the `organizations.members.create` permission. 
     * Invite a member
     */
    async createMember(requestParameters: CreateMemberRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<InlineObject> {
        const response = await this.createMemberRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for createOrganization without sending the request
     */
    async createOrganizationRequestOpts(requestParameters: CreateOrganizationRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationCreate'] == null) {
            throw new runtime.RequiredError(
                'organizationCreate',
                'Required parameter "organizationCreate" was null or undefined when calling createOrganization().'
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

        let urlPath = `/organizations`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: OrganizationCreateToJSON(requestParameters['organizationCreate']),
        };
    }

    /**
     * Start a new organization. Whoever creates it becomes its owner straight away, with nothing to accept.  It arrives with three roles ready to use — member, admin and owner — so you can invite colleagues immediately without designing a permission scheme first. Add roles of your own later; a new role can only carry permissions its creator already holds, which is why the owner role exists from the beginning.  Any signed-in user with a verified, nonempty email can create an organization; no additional access grant or existing membership is required. Unverified, email-less or disabled accounts receive `403`.  Self-service creation is allowed only while the signed-in wallet owns no organization. The backend counts organizations whose `owner_id` matches that wallet; an existing organization returns `409`. Membership in other organizations does not count. This is a count-before-create check, not an atomic uniqueness guarantee against concurrent requests.  Operators bypass the count limit and may create multiple organizations for themselves or the same owner email. They may provision an invited owner using `owner_email` before that owner registers. Operators still need an enabled account with a verified email.
     * Create an organization
     */
    async createOrganizationRaw(requestParameters: CreateOrganizationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<InlineObject>> {
        const requestOptions = await this.createOrganizationRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => InlineObjectFromJSON(jsonValue));
    }

    /**
     * Start a new organization. Whoever creates it becomes its owner straight away, with nothing to accept.  It arrives with three roles ready to use — member, admin and owner — so you can invite colleagues immediately without designing a permission scheme first. Add roles of your own later; a new role can only carry permissions its creator already holds, which is why the owner role exists from the beginning.  Any signed-in user with a verified, nonempty email can create an organization; no additional access grant or existing membership is required. Unverified, email-less or disabled accounts receive `403`.  Self-service creation is allowed only while the signed-in wallet owns no organization. The backend counts organizations whose `owner_id` matches that wallet; an existing organization returns `409`. Membership in other organizations does not count. This is a count-before-create check, not an atomic uniqueness guarantee against concurrent requests.  Operators bypass the count limit and may create multiple organizations for themselves or the same owner email. They may provision an invited owner using `owner_email` before that owner registers. Operators still need an enabled account with a verified email.
     * Create an organization
     */
    async createOrganization(requestParameters: CreateOrganizationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<InlineObject> {
        const response = await this.createOrganizationRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for createRole without sending the request
     */
    async createRoleRequestOpts(requestParameters: CreateRoleRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling createRole().'
            );
        }

        if (requestParameters['roleCreate'] == null) {
            throw new runtime.RequiredError(
                'roleCreate',
                'Required parameter "roleCreate" was null or undefined when calling createRole().'
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

        let urlPath = `/organizations/{organizationId}/roles`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: RoleCreateToJSON(requestParameters['roleCreate']),
        };
    }

    /**
     * Define a new role — a name and the list of what it allows.  A permission names an area and what may be done in it: read, create, update, delete. A door scanner might get `objects` read and `ebus.actions` create, and nothing else.  You cannot create a role that can do more than you can. That is what keeps an admin from quietly building themselves an owner.  Role names have to be unique within the organization, ignoring case, and cannot be changed afterwards.  Requires the `organizations.roles.create` permission. 
     * Create a role
     */
    async createRoleRaw(requestParameters: CreateRoleRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<InlineObject>> {
        const requestOptions = await this.createRoleRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => InlineObjectFromJSON(jsonValue));
    }

    /**
     * Define a new role — a name and the list of what it allows.  A permission names an area and what may be done in it: read, create, update, delete. A door scanner might get `objects` read and `ebus.actions` create, and nothing else.  You cannot create a role that can do more than you can. That is what keeps an admin from quietly building themselves an owner.  Role names have to be unique within the organization, ignoring case, and cannot be changed afterwards.  Requires the `organizations.roles.create` permission. 
     * Create a role
     */
    async createRole(requestParameters: CreateRoleRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<InlineObject> {
        const response = await this.createRoleRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for deleteMember without sending the request
     */
    async deleteMemberRequestOpts(requestParameters: DeleteMemberRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling deleteMember().'
            );
        }

        if (requestParameters['memberId'] == null) {
            throw new runtime.RequiredError(
                'memberId',
                'Required parameter "memberId" was null or undefined when calling deleteMember().'
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

        let urlPath = `/organizations/{organizationId}/members/{memberId}`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));
        urlPath = urlPath.replace('{memberId}', encodeURIComponent(String(requestParameters['memberId'])));

        return {
            path: urlPath,
            method: 'DELETE',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Remove a member from the organization, or withdraw an invitation that has not been accepted.  Their wallet is untouched — they simply lose access to this organization\'s data. Anything they created stays with the organization.  The last owner who has accepted cannot be removed; promote another member first.  Requires the `organizations.members.delete` permission. 
     * Remove a member
     */
    async deleteMemberRaw(requestParameters: DeleteMemberRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.deleteMemberRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Remove a member from the organization, or withdraw an invitation that has not been accepted.  Their wallet is untouched — they simply lose access to this organization\'s data. Anything they created stays with the organization.  The last owner who has accepted cannot be removed; promote another member first.  Requires the `organizations.members.delete` permission. 
     * Remove a member
     */
    async deleteMember(requestParameters: DeleteMemberRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.deleteMemberRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for deleteOrganization without sending the request
     */
    async deleteOrganizationRequestOpts(requestParameters: DeleteOrganizationRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling deleteOrganization().'
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

        let urlPath = `/organizations/{organizationId}`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));

        return {
            path: urlPath,
            method: 'DELETE',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Delete an organization, along with its members and roles. This cannot be undone.  Only an owner, working inside the organization, can do this. Objects, templates, files and webhooks belonging to it are not removed by this call, so tidy those up first if you want them gone.  Requires the `organizations.delete` permission. 
     * Delete an organization
     */
    async deleteOrganizationRaw(requestParameters: DeleteOrganizationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.deleteOrganizationRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Delete an organization, along with its members and roles. This cannot be undone.  Only an owner, working inside the organization, can do this. Objects, templates, files and webhooks belonging to it are not removed by this call, so tidy those up first if you want them gone.  Requires the `organizations.delete` permission. 
     * Delete an organization
     */
    async deleteOrganization(requestParameters: DeleteOrganizationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.deleteOrganizationRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for deleteRole without sending the request
     */
    async deleteRoleRequestOpts(requestParameters: DeleteRoleRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling deleteRole().'
            );
        }

        if (requestParameters['roleId'] == null) {
            throw new runtime.RequiredError(
                'roleId',
                'Required parameter "roleId" was null or undefined when calling deleteRole().'
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

        let urlPath = `/organizations/{organizationId}/roles/{roleId}`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));
        urlPath = urlPath.replace('{roleId}', encodeURIComponent(String(requestParameters['roleId'])));

        return {
            path: urlPath,
            method: 'DELETE',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Delete a role.  An unassigned role can be deleted freely. A role still assigned to a member cannot be deleted; move every member to another role first.  Requires the `organizations.roles.delete` permission. 
     * Delete a role
     */
    async deleteRoleRaw(requestParameters: DeleteRoleRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.deleteRoleRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Delete a role.  An unassigned role can be deleted freely. A role still assigned to a member cannot be deleted; move every member to another role first.  Requires the `organizations.roles.delete` permission. 
     * Delete a role
     */
    async deleteRole(requestParameters: DeleteRoleRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.deleteRoleRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getDefaultRole without sending the request
     */
    async getDefaultRoleRequestOpts(requestParameters: GetDefaultRoleRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling getDefaultRole().'
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

        let urlPath = `/organizations/{organizationId}/roles/default`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * The role a brand-new organization begins with, as a starting point for designing your own. It is what `member` looks like before anybody edits it.  Requires the `organizations.roles.read` permission. 
     * Get the starting role
     */
    async getDefaultRoleRaw(requestParameters: GetDefaultRoleRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Role>> {
        const requestOptions = await this.getDefaultRoleRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => RoleFromJSON(jsonValue));
    }

    /**
     * The role a brand-new organization begins with, as a starting point for designing your own. It is what `member` looks like before anybody edits it.  Requires the `organizations.roles.read` permission. 
     * Get the starting role
     */
    async getDefaultRole(requestParameters: GetDefaultRoleRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Role> {
        const response = await this.getDefaultRoleRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getMember without sending the request
     */
    async getMemberRequestOpts(requestParameters: GetMemberRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling getMember().'
            );
        }

        if (requestParameters['memberId'] == null) {
            throw new runtime.RequiredError(
                'memberId',
                'Required parameter "memberId" was null or undefined when calling getMember().'
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

        let urlPath = `/organizations/{organizationId}/members/{memberId}`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));
        urlPath = urlPath.replace('{memberId}', encodeURIComponent(String(requestParameters['memberId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * One person\'s membership: the email they were invited at, the role they hold, and whether they have accepted.  Requires the `organizations.members.read` permission. 
     * Get a member
     */
    async getMemberRaw(requestParameters: GetMemberRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Member>> {
        const requestOptions = await this.getMemberRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => MemberFromJSON(jsonValue));
    }

    /**
     * One person\'s membership: the email they were invited at, the role they hold, and whether they have accepted.  Requires the `organizations.members.read` permission. 
     * Get a member
     */
    async getMember(requestParameters: GetMemberRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Member> {
        const response = await this.getMemberRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getMemberRole without sending the request
     */
    async getMemberRoleRequestOpts(requestParameters: GetMemberRoleRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling getMemberRole().'
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

        let urlPath = `/organizations/{organizationId}/myrole`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * What the signed-in person is allowed to do in this organization: their role and the full list of permissions behind it.  Use it to decide what to show — hide an unavailable control rather than letting the user select it and receive a `401`.  Requires the `organizations.roles.read` permission. 
     * Get my role
     */
    async getMemberRoleRaw(requestParameters: GetMemberRoleRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Role>> {
        const requestOptions = await this.getMemberRoleRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => RoleFromJSON(jsonValue));
    }

    /**
     * What the signed-in person is allowed to do in this organization: their role and the full list of permissions behind it.  Use it to decide what to show — hide an unavailable control rather than letting the user select it and receive a `401`.  Requires the `organizations.roles.read` permission. 
     * Get my role
     */
    async getMemberRole(requestParameters: GetMemberRoleRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Role> {
        const response = await this.getMemberRoleRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getOrganization without sending the request
     */
    async getOrganizationRequestOpts(requestParameters: GetOrganizationRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling getOrganization().'
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

        let urlPath = `/organizations/{organizationId}`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * One organization in full, with its members and their roles — everything a team settings page needs in a single call.  Invite tokens are never included, even for members who have not accepted yet.  Requires the `organizations.read` permission. 
     * Get an organization
     */
    async getOrganizationRaw(requestParameters: GetOrganizationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Organization>> {
        const requestOptions = await this.getOrganizationRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => OrganizationFromJSON(jsonValue));
    }

    /**
     * One organization in full, with its members and their roles — everything a team settings page needs in a single call.  Invite tokens are never included, even for members who have not accepted yet.  Requires the `organizations.read` permission. 
     * Get an organization
     */
    async getOrganization(requestParameters: GetOrganizationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Organization> {
        const response = await this.getOrganizationRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for getRole without sending the request
     */
    async getRoleRequestOpts(requestParameters: GetRoleRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling getRole().'
            );
        }

        if (requestParameters['roleId'] == null) {
            throw new runtime.RequiredError(
                'roleId',
                'Required parameter "roleId" was null or undefined when calling getRole().'
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

        let urlPath = `/organizations/{organizationId}/roles/{roleId}`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));
        urlPath = urlPath.replace('{roleId}', encodeURIComponent(String(requestParameters['roleId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * One role, with everything it allows.  Requires the `organizations.roles.read` permission. 
     * Get a role
     */
    async getRoleRaw(requestParameters: GetRoleRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Role>> {
        const requestOptions = await this.getRoleRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => RoleFromJSON(jsonValue));
    }

    /**
     * One role, with everything it allows.  Requires the `organizations.roles.read` permission. 
     * Get a role
     */
    async getRole(requestParameters: GetRoleRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Role> {
        const response = await this.getRoleRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listMembers without sending the request
     */
    async listMembersRequestOpts(requestParameters: ListMembersRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling listMembers().'
            );
        }

        const queryParameters: any = {};

        if (requestParameters['id'] != null) {
            queryParameters['id'] = requestParameters['id'];
        }

        if (requestParameters['name'] != null) {
            queryParameters['name'] = requestParameters['name'];
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

        if (requestParameters['status'] != null) {
            queryParameters['status'] = requestParameters['status'];
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

        let urlPath = `/organizations/{organizationId}/members`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Everyone in the organization, with the role each of them holds and whether they have accepted their invitation yet.  Filter by `status=pending` to find invitations still outstanding.  Requires the `organizations.members.read` permission. 
     * List members
     */
    async listMembersRaw(requestParameters: ListMembersRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListMembersOut>> {
        const requestOptions = await this.listMembersRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListMembersOutFromJSON(jsonValue));
    }

    /**
     * Everyone in the organization, with the role each of them holds and whether they have accepted their invitation yet.  Filter by `status=pending` to find invitations still outstanding.  Requires the `organizations.members.read` permission. 
     * List members
     */
    async listMembers(requestParameters: ListMembersRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListMembersOut> {
        const response = await this.listMembersRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listOrganizations without sending the request
     */
    async listOrganizationsRequestOpts(requestParameters: ListOrganizationsRequest): Promise<runtime.RequestOpts> {
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

        if (requestParameters['roleName'] != null) {
            queryParameters['role_name'] = requestParameters['roleName'];
        }

        if (requestParameters['all'] != null) {
            queryParameters['all'] = requestParameters['all'];
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

        let urlPath = `/organizations`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Every organization the signed-in person belongs to — the list behind an organization picker.  Unlike most endpoints, this is not limited to the one they are working in right now; that is the point of it. Each entry comes back with its members and roles, so a picker can show who else is there and what the person can do.  Requires the `organizations.read` permission. 
     * List organizations
     */
    async listOrganizationsRaw(requestParameters: ListOrganizationsRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListOrganizationsOut>> {
        const requestOptions = await this.listOrganizationsRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListOrganizationsOutFromJSON(jsonValue));
    }

    /**
     * Every organization the signed-in person belongs to — the list behind an organization picker.  Unlike most endpoints, this is not limited to the one they are working in right now; that is the point of it. Each entry comes back with its members and roles, so a picker can show who else is there and what the person can do.  Requires the `organizations.read` permission. 
     * List organizations
     */
    async listOrganizations(requestParameters: ListOrganizationsRequest = {}, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListOrganizationsOut> {
        const response = await this.listOrganizationsRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for listRoles without sending the request
     */
    async listRolesRequestOpts(requestParameters: ListRolesRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling listRoles().'
            );
        }

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

        let urlPath = `/organizations/{organizationId}/roles`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * The roles this organization has, and exactly what each one allows.  Every organization starts with three: `member` for everyday use, `admin` for running the place, and `owner` for the person who owns it. Add your own for anything in between — a role for read-only reporting, or one for a ticket scanner that may only redeem.  Requires the `organizations.roles.read` permission. 
     * List roles
     */
    async listRolesRaw(requestParameters: ListRolesRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<ListRolesOut>> {
        const requestOptions = await this.listRolesRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => ListRolesOutFromJSON(jsonValue));
    }

    /**
     * The roles this organization has, and exactly what each one allows.  Every organization starts with three: `member` for everyday use, `admin` for running the place, and `owner` for the person who owns it. Add your own for anything in between — a role for read-only reporting, or one for a ticket scanner that may only redeem.  Requires the `organizations.roles.read` permission. 
     * List roles
     */
    async listRoles(requestParameters: ListRolesRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<ListRolesOut> {
        const response = await this.listRolesRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for registerOrganizationWallet without sending the request
     */
    async registerOrganizationWalletRequestOpts(requestParameters: RegisterOrganizationWalletRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['walletCreate'] == null) {
            throw new runtime.RequiredError(
                'walletCreate',
                'Required parameter "walletCreate" was null or undefined when calling registerOrganizationWallet().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';


        let urlPath = `/organizations/wallets`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: WalletCreateToJSON(requestParameters['walletCreate']),
        };
    }

    /**
     * Create the standalone account that will start and own an organization. This account begins in the network scope; after signing in, call `POST /organizations` to create the organization.  Do not send `organization_id` on this route. If it is present, it is ignored. To create a member inside an existing organization, use `POST /wallets` instead.  The response starts a session immediately and a confirmation email is sent. Until the email is confirmed, `activated` remains `false`.  No sign-in needed — the person creating the account does not have one yet. 
     * Create a standalone organization account
     */
    async registerOrganizationWalletRaw(requestParameters: RegisterOrganizationWalletRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<LoginOut>> {
        const requestOptions = await this.registerOrganizationWalletRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => LoginOutFromJSON(jsonValue));
    }

    /**
     * Create the standalone account that will start and own an organization. This account begins in the network scope; after signing in, call `POST /organizations` to create the organization.  Do not send `organization_id` on this route. If it is present, it is ignored. To create a member inside an existing organization, use `POST /wallets` instead.  The response starts a session immediately and a confirmation email is sent. Until the email is confirmed, `activated` remains `false`.  No sign-in needed — the person creating the account does not have one yet. 
     * Create a standalone organization account
     */
    async registerOrganizationWallet(requestParameters: RegisterOrganizationWalletRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<LoginOut> {
        const response = await this.registerOrganizationWalletRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for switchOrganization without sending the request
     */
    async switchOrganizationRequestOpts(requestParameters: SwitchOrganizationRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationSwitch'] == null) {
            throw new runtime.RequiredError(
                'organizationSwitch',
                'Required parameter "organizationSwitch" was null or undefined when calling switchOrganization().'
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

        let urlPath = `/organizations/switch`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: OrganizationSwitchToJSON(requestParameters['organizationSwitch']),
        };
    }

    /**
     * Move the signed-in person to another of their organizations.  You get back a new access token and the organization in full. Use the new token from then on: everything else you call reads and writes inside the organization it names. The refresh token they already hold keeps working and carries the new organization too, so there is nothing else to store.  They have to already be an accepted member of the organization they are moving to. If they are not — or it does not exist — the answer is the same either way, so this cannot be used to discover organizations.  This needs a signed-in person. An API key belongs to one organization and cannot move.  Requires the `organizations.update` permission. 
     * Switch organization
     */
    async switchOrganizationRaw(requestParameters: SwitchOrganizationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<OrganizationSwitchOut>> {
        const requestOptions = await this.switchOrganizationRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => OrganizationSwitchOutFromJSON(jsonValue));
    }

    /**
     * Move the signed-in person to another of their organizations.  You get back a new access token and the organization in full. Use the new token from then on: everything else you call reads and writes inside the organization it names. The refresh token they already hold keeps working and carries the new organization too, so there is nothing else to store.  They have to already be an accepted member of the organization they are moving to. If they are not — or it does not exist — the answer is the same either way, so this cannot be used to discover organizations.  This needs a signed-in person. An API key belongs to one organization and cannot move.  Requires the `organizations.update` permission. 
     * Switch organization
     */
    async switchOrganization(requestParameters: SwitchOrganizationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<OrganizationSwitchOut> {
        const response = await this.switchOrganizationRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for updateMember without sending the request
     */
    async updateMemberRequestOpts(requestParameters: UpdateMemberRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling updateMember().'
            );
        }

        if (requestParameters['memberId'] == null) {
            throw new runtime.RequiredError(
                'memberId',
                'Required parameter "memberId" was null or undefined when calling updateMember().'
            );
        }

        if (requestParameters['memberUpdate'] == null) {
            throw new runtime.RequiredError(
                'memberUpdate',
                'Required parameter "memberUpdate" was null or undefined when calling updateMember().'
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

        let urlPath = `/organizations/{organizationId}/members/{memberId}`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));
        urlPath = urlPath.replace('{memberId}', encodeURIComponent(String(requestParameters['memberId'])));

        return {
            path: urlPath,
            method: 'PATCH',
            headers: headerParameters,
            query: queryParameters,
            body: MemberUpdateToJSON(requestParameters['memberUpdate']),
        };
    }

    /**
     * Move a member to a different role. This is the only thing about a membership that can be changed.  You can only give a role you hold yourself, so an admin cannot promote anybody to owner. And an organization always needs at least one owner who has accepted: demoting the last one is refused.  The change takes effect on new authorization checks within about 30 seconds, after the gateway\'s short permission cache expires.  Requires the `organizations.members.update` permission. 
     * Change a member\'s role
     */
    async updateMemberRaw(requestParameters: UpdateMemberRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.updateMemberRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Move a member to a different role. This is the only thing about a membership that can be changed.  You can only give a role you hold yourself, so an admin cannot promote anybody to owner. And an organization always needs at least one owner who has accepted: demoting the last one is refused.  The change takes effect on new authorization checks within about 30 seconds, after the gateway\'s short permission cache expires.  Requires the `organizations.members.update` permission. 
     * Change a member\'s role
     */
    async updateMember(requestParameters: UpdateMemberRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.updateMemberRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for updateOrganization without sending the request
     */
    async updateOrganizationRequestOpts(requestParameters: UpdateOrganizationRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling updateOrganization().'
            );
        }

        if (requestParameters['organizationUpdate'] == null) {
            throw new runtime.RequiredError(
                'organizationUpdate',
                'Required parameter "organizationUpdate" was null or undefined when calling updateOrganization().'
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

        let urlPath = `/organizations/{organizationId}`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));

        return {
            path: urlPath,
            method: 'PATCH',
            headers: headerParameters,
            query: queryParameters,
            body: OrganizationUpdateToJSON(requestParameters['organizationUpdate']),
        };
    }

    /**
     * Change an organization\'s name, description or logo. Send only what you want to change.  Members and roles are managed through their own endpoints, not here.  Requires the `organizations.update` permission. 
     * Update an organization
     */
    async updateOrganizationRaw(requestParameters: UpdateOrganizationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.updateOrganizationRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Change an organization\'s name, description or logo. Send only what you want to change.  Members and roles are managed through their own endpoints, not here.  Requires the `organizations.update` permission. 
     * Update an organization
     */
    async updateOrganization(requestParameters: UpdateOrganizationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.updateOrganizationRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for updateRole without sending the request
     */
    async updateRoleRequestOpts(requestParameters: UpdateRoleRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['organizationId'] == null) {
            throw new runtime.RequiredError(
                'organizationId',
                'Required parameter "organizationId" was null or undefined when calling updateRole().'
            );
        }

        if (requestParameters['roleId'] == null) {
            throw new runtime.RequiredError(
                'roleId',
                'Required parameter "roleId" was null or undefined when calling updateRole().'
            );
        }

        if (requestParameters['roleUpdate'] == null) {
            throw new runtime.RequiredError(
                'roleUpdate',
                'Required parameter "roleUpdate" was null or undefined when calling updateRole().'
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

        let urlPath = `/organizations/{organizationId}/roles/{roleId}`;
        urlPath = urlPath.replace('{organizationId}', encodeURIComponent(String(requestParameters['organizationId'])));
        urlPath = urlPath.replace('{roleId}', encodeURIComponent(String(requestParameters['roleId'])));

        return {
            path: urlPath,
            method: 'PATCH',
            headers: headerParameters,
            query: queryParameters,
            body: RoleUpdateToJSON(requestParameters['roleUpdate']),
        };
    }

    /**
     * Change what a role allows, or the note describing it. Send only what you want to change; a role\'s name cannot be changed once it exists.  Sending `permissions` replaces the whole list, so include everything the role should keep. You cannot give a role more than you hold yourself. Changing only the description is always allowed, even for a role that outranks you.  Everyone holding this role is affected. New authorization checks use the change within about 30 seconds, after the gateway\'s short permission cache expires.  Requires the `organizations.roles.update` permission. 
     * Update a role
     */
    async updateRoleRaw(requestParameters: UpdateRoleRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.updateRoleRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Change what a role allows, or the note describing it. Send only what you want to change; a role\'s name cannot be changed once it exists.  Sending `permissions` replaces the whole list, so include everything the role should keep. You cannot give a role more than you hold yourself. Changing only the description is always allowed, even for a role that outranks you.  Everyone holding this role is affected. New authorization checks use the change within about 30 seconds, after the gateway\'s short permission cache expires.  Requires the `organizations.roles.update` permission. 
     * Update a role
     */
    async updateRole(requestParameters: UpdateRoleRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.updateRoleRaw(requestParameters, initOverrides);
        return await response.value();
    }

}

/**
 * @export
 */
export const ListMembersOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListMembersOrderEnum = typeof ListMembersOrderEnum[keyof typeof ListMembersOrderEnum];
/**
 * @export
 */
export const ListOrganizationsOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListOrganizationsOrderEnum = typeof ListOrganizationsOrderEnum[keyof typeof ListOrganizationsOrderEnum];
/**
 * @export
 */
export const ListRolesOrderEnum = {
    Asc: 'asc',
    Desc: 'desc',
} as const;
export type ListRolesOrderEnum = typeof ListRolesOrderEnum[keyof typeof ListRolesOrderEnum];
