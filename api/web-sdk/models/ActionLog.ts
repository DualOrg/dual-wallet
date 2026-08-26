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

import { mapValues } from '../runtime';
import type { ActionLogStatus } from './ActionLogStatus';
import {
    ActionLogStatusFromJSON,
    ActionLogStatusFromJSONTyped,
    ActionLogStatusToJSON,
    ActionLogStatusToJSONTyped,
} from './ActionLogStatus';
import type { ActionParams } from './ActionParams';
import {
    ActionParamsFromJSON,
    ActionParamsFromJSONTyped,
    ActionParamsToJSON,
    ActionParamsToJSONTyped,
} from './ActionParams';
import type { AffectedObject } from './AffectedObject';
import {
    AffectedObjectFromJSON,
    AffectedObjectFromJSONTyped,
    AffectedObjectToJSON,
    AffectedObjectToJSONTyped,
} from './AffectedObject';
import type { AuthBundle } from './AuthBundle';
import {
    AuthBundleFromJSON,
    AuthBundleFromJSONTyped,
    AuthBundleToJSON,
    AuthBundleToJSONTyped,
} from './AuthBundle';
import type { ActionAccess } from './ActionAccess';
import {
    ActionAccessFromJSON,
    ActionAccessFromJSONTyped,
    ActionAccessToJSON,
    ActionAccessToJSONTyped,
} from './ActionAccess';
import type { ActionPermit } from './ActionPermit';
import {
    ActionPermitFromJSON,
    ActionPermitFromJSONTyped,
    ActionPermitToJSON,
    ActionPermitToJSONTyped,
} from './ActionPermit';

/**
 * One thing that was done: what it was, who authorised it, what it affected,
 * what it cost, and where it was settled.
 * 
 * @export
 * @interface ActionLog
 */
export interface ActionLog {
    /**
     * Identifier of this action record.
     */
    id: string;
    /**
     * The batch that settled this action, once one has. Look it up with
     * `GET /batches/{batchId}`.
     * 
     */
    batchId?: string;
    /**
     * What was done — `mint`, `transfer`, `redeem` and so on.
     */
    name: string;
    /**
     * The template's own name for it, where it defines one.
     */
    alias?: string;
    /**
     * Marks an action the platform itself took, rather than one a user
     * signed. Rare, and used only for protocol maintenance.
     * 
     */
    internal?: boolean;
    /**
     * 
     */
    params: ActionParams;
    /**
     * The value that was signed to authorise this action.
     */
    messageHash: string;
    /**
     * The address the action was taken from — the wallet whose object it is.
     * 
     */
    account: string;
    /**
     * The key that actually signed. Usually the account's own; different when a
     * passkey or another authorised key signed on its behalf.
     * 
     */
    controller: string;
    /**
     * This action's fingerprint. It is what the batch commits to, so it is how
     * the action is verified against the chain.
     * 
     */
    hash: string;
    /**
     * The objects this action created, changed or destroyed.
     */
    affectedObjects: Array<AffectedObject>;
    /**
     * 
     */
    status: ActionLogStatus;
    /**
     * The fixed part of the fee, in DUAL.
     */
    baseFee: string;
    /**
     * The fixed part of the fee, in wei.
     */
    baseFeeWei: string;
    /**
     * The part that follows network cost, in DUAL.
     */
    dynamicFee: string;
    /**
     * The part that follows network cost, in wei.
     */
    dynamicFeeWei: string;
    /**
     * Any extra the template charges for this action, in DUAL.
     */
    additionalFee?: string;
    /**
     * Any extra the template charges for this action, in wei.
     */
    additionalFeeWei?: string;
    /**
     * The DUAL price the fee was worked out at.
     */
    tokenPrice: string;
    /**
     * What the action cost altogether, in DUAL.
     */
    totalFee: string;
    /**
     * What the action cost altogether, in wei.
     */
    totalFeeWei: string;
    /**
     * The wallet's action number at the time.
     */
    nonce: number;
    /**
     * 
     */
    permit?: ActionPermit;
    /**
     * 
     */
    access?: ActionAccess;
    /**
     * The signature that authorised the action, kept so that anybody can check
     * it later.
     * 
     */
    auth: AuthBundle;
    /**
     * Which record format this action uses. Everything recorded now is version
     * 2; version 1 appears only in older history.
     * 
     */
    version: ActionLogVersionEnum;
    /**
     * When the record last changed — usually when it was settled.
     */
    whenModified: Date;
    /**
     * When the action was run.
     */
    whenCreated: Date;
}


/**
 * @export
 */
export const ActionLogVersionEnum = {
    NUMBER_1: 1,
    NUMBER_2: 2,
} as const;
export type ActionLogVersionEnum = typeof ActionLogVersionEnum[keyof typeof ActionLogVersionEnum];


/**
 * Check if a given object implements the ActionLog interface.
 */
export function instanceOfActionLog(value: object): value is ActionLog {
    if (!('id' in value) || value['id'] === undefined) return false;
    if (!('name' in value) || value['name'] === undefined) return false;
    if (!('params' in value) || value['params'] === undefined) return false;
    if ((!('messageHash' in (value as Record<string, any>)) && !('message_hash' in (value as Record<string, any>))) || ((value as Record<string, any>)['messageHash'] === undefined && (value as Record<string, any>)['message_hash'] === undefined)) return false;
    if (!('account' in value) || value['account'] === undefined) return false;
    if (!('controller' in value) || value['controller'] === undefined) return false;
    if (!('hash' in value) || value['hash'] === undefined) return false;
    if ((!('affectedObjects' in (value as Record<string, any>)) && !('affected_objects' in (value as Record<string, any>))) || ((value as Record<string, any>)['affectedObjects'] === undefined && (value as Record<string, any>)['affected_objects'] === undefined)) return false;
    if (!('status' in value) || value['status'] === undefined) return false;
    if ((!('baseFee' in (value as Record<string, any>)) && !('base_fee' in (value as Record<string, any>))) || ((value as Record<string, any>)['baseFee'] === undefined && (value as Record<string, any>)['base_fee'] === undefined)) return false;
    if ((!('baseFeeWei' in (value as Record<string, any>)) && !('base_fee_wei' in (value as Record<string, any>))) || ((value as Record<string, any>)['baseFeeWei'] === undefined && (value as Record<string, any>)['base_fee_wei'] === undefined)) return false;
    if ((!('dynamicFee' in (value as Record<string, any>)) && !('dynamic_fee' in (value as Record<string, any>))) || ((value as Record<string, any>)['dynamicFee'] === undefined && (value as Record<string, any>)['dynamic_fee'] === undefined)) return false;
    if ((!('dynamicFeeWei' in (value as Record<string, any>)) && !('dynamic_fee_wei' in (value as Record<string, any>))) || ((value as Record<string, any>)['dynamicFeeWei'] === undefined && (value as Record<string, any>)['dynamic_fee_wei'] === undefined)) return false;
    if ((!('tokenPrice' in (value as Record<string, any>)) && !('token_price' in (value as Record<string, any>))) || ((value as Record<string, any>)['tokenPrice'] === undefined && (value as Record<string, any>)['token_price'] === undefined)) return false;
    if ((!('totalFee' in (value as Record<string, any>)) && !('total_fee' in (value as Record<string, any>))) || ((value as Record<string, any>)['totalFee'] === undefined && (value as Record<string, any>)['total_fee'] === undefined)) return false;
    if ((!('totalFeeWei' in (value as Record<string, any>)) && !('total_fee_wei' in (value as Record<string, any>))) || ((value as Record<string, any>)['totalFeeWei'] === undefined && (value as Record<string, any>)['total_fee_wei'] === undefined)) return false;
    if (!('nonce' in value) || value['nonce'] === undefined) return false;
    if (!('auth' in value) || value['auth'] === undefined) return false;
    if (!('version' in value) || value['version'] === undefined) return false;
    if ((!('whenModified' in (value as Record<string, any>)) && !('when_modified' in (value as Record<string, any>))) || ((value as Record<string, any>)['whenModified'] === undefined && (value as Record<string, any>)['when_modified'] === undefined)) return false;
    if ((!('whenCreated' in (value as Record<string, any>)) && !('when_created' in (value as Record<string, any>))) || ((value as Record<string, any>)['whenCreated'] === undefined && (value as Record<string, any>)['when_created'] === undefined)) return false;
    return true;
}

export function ActionLogFromJSON(json: any): ActionLog {
    return ActionLogFromJSONTyped(json, false);
}

export function ActionLogFromJSONTyped(json: any, ignoreDiscriminator: boolean): ActionLog {
    if (json == null) {
        return json;
    }
    return {
        
        'id': json['id'],
        'batchId': json['batch_id'] == null ? undefined : json['batch_id'],
        'name': json['name'],
        'alias': json['alias'] == null ? undefined : json['alias'],
        'internal': json['internal'] == null ? undefined : json['internal'],
        'params': ActionParamsFromJSON(json['params']),
        'messageHash': json['message_hash'],
        'account': json['account'],
        'controller': json['controller'],
        'hash': json['hash'],
        'affectedObjects': ((json['affected_objects'] as Array<any>).map(AffectedObjectFromJSON)),
        'status': ActionLogStatusFromJSON(json['status']),
        'baseFee': json['base_fee'],
        'baseFeeWei': json['base_fee_wei'],
        'dynamicFee': json['dynamic_fee'],
        'dynamicFeeWei': json['dynamic_fee_wei'],
        'additionalFee': json['additional_fee'] == null ? undefined : json['additional_fee'],
        'additionalFeeWei': json['additional_fee_wei'] == null ? undefined : json['additional_fee_wei'],
        'tokenPrice': json['token_price'],
        'totalFee': json['total_fee'],
        'totalFeeWei': json['total_fee_wei'],
        'nonce': json['nonce'],
        'permit': json['permit'] == null ? undefined : ActionPermitFromJSON(json['permit']),
        'access': json['access'] == null ? undefined : ActionAccessFromJSON(json['access']),
        'auth': AuthBundleFromJSON(json['auth']),
        'version': json['version'],
        'whenModified': (json['when_modified'] == null ? json['when_modified'] : new Date(json['when_modified'])),
        'whenCreated': (json['when_created'] == null ? json['when_created'] : new Date(json['when_created'])),
    };
}

export function ActionLogToJSON(json: any): ActionLog {
    return ActionLogToJSONTyped(json, false);
}

export function ActionLogToJSONTyped(value?: ActionLog | null, ignoreDiscriminator: boolean = false): any {
    if (value == null) {
        return value;
    }

    return {
        
        'id': value['id'],
        'batch_id': value['batchId'],
        'name': value['name'],
        'alias': value['alias'],
        'internal': value['internal'],
        'params': ActionParamsToJSON(value['params']),
        'message_hash': value['messageHash'],
        'account': value['account'],
        'controller': value['controller'],
        'hash': value['hash'],
        'affected_objects': ((value['affectedObjects'] as Array<any>).map(AffectedObjectToJSON)),
        'status': ActionLogStatusToJSON(value['status']),
        'base_fee': value['baseFee'],
        'base_fee_wei': value['baseFeeWei'],
        'dynamic_fee': value['dynamicFee'],
        'dynamic_fee_wei': value['dynamicFeeWei'],
        'additional_fee': value['additionalFee'],
        'additional_fee_wei': value['additionalFeeWei'],
        'token_price': value['tokenPrice'],
        'total_fee': value['totalFee'],
        'total_fee_wei': value['totalFeeWei'],
        'nonce': value['nonce'],
        'permit': ActionPermitToJSON(value['permit']),
        'access': ActionAccessToJSON(value['access']),
        'auth': AuthBundleToJSON(value['auth']),
        'version': value['version'],
        'when_modified': value['whenModified'] == null ? value['whenModified'] : value['whenModified'].toISOString(),
        'when_created': value['whenCreated'] == null ? value['whenCreated'] : value['whenCreated'].toISOString(),
    };
}

