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
/**
 * A signature and what kind of signature it is. What gets signed is always the
 * value `POST /ebus/prepare` returned for the action.
 * 
 * @export
 * @interface AuthBundle
 */
export interface AuthBundle {
    /**
     * Signature scheme discriminator.
     * - eoa: secp256k1 smart-account controller over the raw EIP-712 digest
     * - webauthn: passkey smart-account controller (P-256 assertion)
     * - session_key: separately authorized ephemeral controller
     * - personal_sign: secp256k1 smart-account controller over the Ethereum-wrapped digest
     * - internal: unsigned protocol action created only by trusted backend migrations
     * 
     */
    type: AuthBundleTypeEnum;
    /**
     * Optional encoded signing context. For action authorization the server
     * independently reconstructs the EIP-712 digest. A WebAuthn assertion must
     * contain that digest as its exact clientDataJSON challenge.
     * 
     */
    challenge?: string;
    /**
     * Hex-encoded 65-byte secp256k1 signature (r || s || v). `eoa` signs the
     * raw EIP-712 hash; `personal_sign` signs its Ethereum message wrapper.
     * 
     */
    signature?: string;
    /**
     * base64url-encoded credential ID returned by navigator.credentials.get().
     * Used to look up the stored (pubkey_x, pubkey_y) for verification.
     * 
     */
    credentialId?: string;
    /**
     * [type=passkey, REGISTER] Hex-encoded X coordinate of the P-256 public key
     * extracted from the COSE-encoded attestationObject.
     * Required only on first connect (registration). Omit on subsequent connects.
     * 
     */
    pubkeyX?: string;
    /**
     * [type=passkey, REGISTER] Hex-encoded Y coordinate of the P-256 public key.
     * Required only on first connect (registration). Omit on subsequent connects.
     * 
     */
    pubkeyY?: string;
    /**
     * base64url-encoded authenticatorData from the WebAuthn assertion.
     * Action verification requires the UP and UV flags.
     * 
     */
    authenticatorData?: string;
    /**
     * base64url-encoded clientDataJSON from the WebAuthn assertion.
     * Action verification requires type == "webauthn.get" and exact equality
     * between its challenge and the reconstructed action digest.
     * 
     */
    clientDataJson?: string;
    /**
     * hex-encoded r component of the P-256 (ES256) signature.
     * messageHash = sha256(authenticatorData || sha256(clientDataJSON))
     * signature = (r, s) over messageHash
     * 
     */
    signatureR?: string;
    /**
     * hex-encoded s component of the P-256 signature.
     */
    signatureS?: string;
}


/**
 * @export
 */
export const AuthBundleTypeEnum = {
    Eoa: 'eoa',
    Webauthn: 'webauthn',
    SessionKey: 'session_key',
    PersonalSign: 'personal_sign',
    Internal: 'internal',
} as const;
export type AuthBundleTypeEnum = typeof AuthBundleTypeEnum[keyof typeof AuthBundleTypeEnum];


/**
 * Check if a given object implements the AuthBundle interface.
 */
export function instanceOfAuthBundle(value: object): value is AuthBundle {
    if (!('type' in value) || value['type'] === undefined) return false;
    return true;
}

export function AuthBundleFromJSON(json: any): AuthBundle {
    return AuthBundleFromJSONTyped(json, false);
}

export function AuthBundleFromJSONTyped(json: any, ignoreDiscriminator: boolean): AuthBundle {
    if (json == null) {
        return json;
    }
    return {
        
        'type': json['type'],
        'challenge': json['challenge'] == null ? undefined : json['challenge'],
        'signature': json['signature'] == null ? undefined : json['signature'],
        'credentialId': json['credential_id'] == null ? undefined : json['credential_id'],
        'pubkeyX': json['pubkey_x'] == null ? undefined : json['pubkey_x'],
        'pubkeyY': json['pubkey_y'] == null ? undefined : json['pubkey_y'],
        'authenticatorData': json['authenticator_data'] == null ? undefined : json['authenticator_data'],
        'clientDataJson': json['client_data_json'] == null ? undefined : json['client_data_json'],
        'signatureR': json['signature_r'] == null ? undefined : json['signature_r'],
        'signatureS': json['signature_s'] == null ? undefined : json['signature_s'],
    };
}

export function AuthBundleToJSON(json: any): AuthBundle {
    return AuthBundleToJSONTyped(json, false);
}

export function AuthBundleToJSONTyped(value?: AuthBundle | null, ignoreDiscriminator: boolean = false): any {
    if (value == null) {
        return value;
    }

    return {
        
        'type': value['type'],
        'challenge': value['challenge'],
        'signature': value['signature'],
        'credential_id': value['credentialId'],
        'pubkey_x': value['pubkeyX'],
        'pubkey_y': value['pubkeyY'],
        'authenticator_data': value['authenticatorData'],
        'client_data_json': value['clientDataJson'],
        'signature_r': value['signatureR'],
        'signature_s': value['signatureS'],
    };
}

