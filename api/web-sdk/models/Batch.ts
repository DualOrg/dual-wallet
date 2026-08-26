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
import type { BatchStatus } from './BatchStatus';
import {
    BatchStatusFromJSON,
    BatchStatusFromJSONTyped,
    BatchStatusToJSON,
    BatchStatusToJSONTyped,
} from './BatchStatus';
import type { Proof } from './Proof';
import {
    ProofFromJSON,
    ProofFromJSONTyped,
    ProofToJSON,
    ProofToJSONTyped,
} from './Proof';
import type { AffectedActionLog } from './AffectedActionLog';
import {
    AffectedActionLogFromJSON,
    AffectedActionLogFromJSONTyped,
    AffectedActionLogToJSON,
    AffectedActionLogToJSONTyped,
} from './AffectedActionLog';

/**
 * A group of committed actions, ordered, proved and anchored on chain together.
 * Batches form a hash chain: each one's `prev_hash` is the previous batch's
 * `hash`.
 * 
 * @export
 * @interface Batch
 */
export interface Batch {
    /**
     * Identifier of the batch.
     */
    id: string;
    /**
     * Position in the batch chain. Contiguous and increasing.
     */
    sequence: number;
    /**
     * The batch's own hash. It is what the next batch chains from.
     */
    hash: string;
    /**
     * The previous batch's hash. Absent on the first batch.
     */
    prevHash?: string;
    /**
     * Sparse Merkle root of network state after this batch.
     */
    integrityRoot: string;
    /**
     * Sparse Merkle root of network state before this batch.
     */
    prevIntegrityRoot: string;
    /**
     * The address that anchored this batch on chain.
     */
    sender: string;
    /**
     * The transaction that wrote the commitment on chain.
     */
    l2TxHash?: string;
    /**
     * The transaction that finalized the batch after its challenge window.
     */
    l2FinalizationTxHash?: string;
    /**
     * The value written on chain for this batch.
     */
    commitment: string;
    /**
     * Commits to the exact list of actions in `affected_actions`.
     */
    actionsHash: string;
    /**
     * The actions this batch carried.
     */
    affectedActions: Array<AffectedActionLog>;
    /**
     * How many actions this batch carried.
     */
    actionsCount: number;
    /**
     * Total fee charged for the actions in this batch, in whole tokens.
     */
    totalFee?: string;
    /**
     * Total fee charged for the actions in this batch, in wei.
     */
    totalFeeWei?: string;
    /**
     * Batch format version. Current batches are version 2.
     */
    version: number;
    /**
     * Where the serialized proof input is pinned, so a batch can be verified
     * independently.
     * 
     */
    ipfsUrl?: string;
    /**
     * Where the batch is in the pipeline.
     */
    status: BatchStatus;
    /**
     * 
     */
    proof?: Proof;
    /**
     * The proof request this batch's proof came from.
     */
    proofId?: string;
    /**
     * Why the pipeline gave up, when the status is `failed`.
     */
    error?: string;
    /**
     * When the batch may be finalized. Its commitment can be challenged on chain
     * until then.
     * 
     */
    challengeWindowEnd?: Date;
    /**
     * When the batch reached `finalized`.
     */
    whenCompleted?: Date;
    /**
     * When the batch last advanced a stage.
     */
    whenModified?: Date;
    /**
     * When the batch was built.
     */
    whenCreated: Date;
    /**
     * Creation time in Unix seconds, as committed to by the batch commitment. Written once when the batch is built and never updated; the commitment preimage reads this rather than when_created, so that re-rendering or re-importing the human-facing timestamp cannot change a committed hash.
     */
    whenCreatedUnix?: number;
}



/**
 * Check if a given object implements the Batch interface.
 */
export function instanceOfBatch(value: object): value is Batch {
    if (!('id' in value) || value['id'] === undefined) return false;
    if (!('sequence' in value) || value['sequence'] === undefined) return false;
    if (!('hash' in value) || value['hash'] === undefined) return false;
    if ((!('integrityRoot' in (value as Record<string, any>)) && !('integrity_root' in (value as Record<string, any>))) || ((value as Record<string, any>)['integrityRoot'] === undefined && (value as Record<string, any>)['integrity_root'] === undefined)) return false;
    if ((!('prevIntegrityRoot' in (value as Record<string, any>)) && !('prev_integrity_root' in (value as Record<string, any>))) || ((value as Record<string, any>)['prevIntegrityRoot'] === undefined && (value as Record<string, any>)['prev_integrity_root'] === undefined)) return false;
    if (!('sender' in value) || value['sender'] === undefined) return false;
    if (!('commitment' in value) || value['commitment'] === undefined) return false;
    if ((!('actionsHash' in (value as Record<string, any>)) && !('actions_hash' in (value as Record<string, any>))) || ((value as Record<string, any>)['actionsHash'] === undefined && (value as Record<string, any>)['actions_hash'] === undefined)) return false;
    if ((!('affectedActions' in (value as Record<string, any>)) && !('affected_actions' in (value as Record<string, any>))) || ((value as Record<string, any>)['affectedActions'] === undefined && (value as Record<string, any>)['affected_actions'] === undefined)) return false;
    if ((!('actionsCount' in (value as Record<string, any>)) && !('actions_count' in (value as Record<string, any>))) || ((value as Record<string, any>)['actionsCount'] === undefined && (value as Record<string, any>)['actions_count'] === undefined)) return false;
    if (!('version' in value) || value['version'] === undefined) return false;
    if (!('status' in value) || value['status'] === undefined) return false;
    if ((!('whenCreated' in (value as Record<string, any>)) && !('when_created' in (value as Record<string, any>))) || ((value as Record<string, any>)['whenCreated'] === undefined && (value as Record<string, any>)['when_created'] === undefined)) return false;
    return true;
}

export function BatchFromJSON(json: any): Batch {
    return BatchFromJSONTyped(json, false);
}

export function BatchFromJSONTyped(json: any, ignoreDiscriminator: boolean): Batch {
    if (json == null) {
        return json;
    }
    return {
        
        'id': json['id'],
        'sequence': json['sequence'],
        'hash': json['hash'],
        'prevHash': json['prev_hash'] == null ? undefined : json['prev_hash'],
        'integrityRoot': json['integrity_root'],
        'prevIntegrityRoot': json['prev_integrity_root'],
        'sender': json['sender'],
        'l2TxHash': json['l2_tx_hash'] == null ? undefined : json['l2_tx_hash'],
        'l2FinalizationTxHash': json['l2_finalization_tx_hash'] == null ? undefined : json['l2_finalization_tx_hash'],
        'commitment': json['commitment'],
        'actionsHash': json['actions_hash'],
        'affectedActions': ((json['affected_actions'] as Array<any>).map(AffectedActionLogFromJSON)),
        'actionsCount': json['actions_count'],
        'totalFee': json['total_fee'] == null ? undefined : json['total_fee'],
        'totalFeeWei': json['total_fee_wei'] == null ? undefined : json['total_fee_wei'],
        'version': json['version'],
        'ipfsUrl': json['ipfs_url'] == null ? undefined : json['ipfs_url'],
        'status': BatchStatusFromJSON(json['status']),
        'proof': json['proof'] == null ? undefined : ProofFromJSON(json['proof']),
        'proofId': json['proof_id'] == null ? undefined : json['proof_id'],
        'error': json['error'] == null ? undefined : json['error'],
        'challengeWindowEnd': json['challenge_window_end'] == null ? undefined : (new Date(json['challenge_window_end'])),
        'whenCompleted': json['when_completed'] == null ? undefined : (new Date(json['when_completed'])),
        'whenModified': json['when_modified'] == null ? undefined : (new Date(json['when_modified'])),
        'whenCreated': (json['when_created'] == null ? json['when_created'] : new Date(json['when_created'])),
        'whenCreatedUnix': json['when_created_unix'] == null ? undefined : json['when_created_unix'],
    };
}

export function BatchToJSON(json: any): Batch {
    return BatchToJSONTyped(json, false);
}

export function BatchToJSONTyped(value?: Batch | null, ignoreDiscriminator: boolean = false): any {
    if (value == null) {
        return value;
    }

    return {
        
        'id': value['id'],
        'sequence': value['sequence'],
        'hash': value['hash'],
        'prev_hash': value['prevHash'],
        'integrity_root': value['integrityRoot'],
        'prev_integrity_root': value['prevIntegrityRoot'],
        'sender': value['sender'],
        'l2_tx_hash': value['l2TxHash'],
        'l2_finalization_tx_hash': value['l2FinalizationTxHash'],
        'commitment': value['commitment'],
        'actions_hash': value['actionsHash'],
        'affected_actions': ((value['affectedActions'] as Array<any>).map(AffectedActionLogToJSON)),
        'actions_count': value['actionsCount'],
        'total_fee': value['totalFee'],
        'total_fee_wei': value['totalFeeWei'],
        'version': value['version'],
        'ipfs_url': value['ipfsUrl'],
        'status': BatchStatusToJSON(value['status']),
        'proof': ProofToJSON(value['proof']),
        'proof_id': value['proofId'],
        'error': value['error'],
        'challenge_window_end': value['challengeWindowEnd'] == null ? value['challengeWindowEnd'] : value['challengeWindowEnd'].toISOString(),
        'when_completed': value['whenCompleted'] == null ? value['whenCompleted'] : value['whenCompleted'].toISOString(),
        'when_modified': value['whenModified'] == null ? value['whenModified'] : value['whenModified'].toISOString(),
        'when_created': value['whenCreated'] == null ? value['whenCreated'] : value['whenCreated'].toISOString(),
        'when_created_unix': value['whenCreatedUnix'],
    };
}

