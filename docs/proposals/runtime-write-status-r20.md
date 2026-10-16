# Proposed shared contract r20: runtime write outcome, durable recovery listing and acknowledgement

Status: **PROPOSED, NOT DEPLOYED, NOT SUPPORTED by any Studio runtime
today.** Pinned wire schema for Studio (through Root). The wallet consumer
fails closed against every runtime that does not answer exactly as below: no
journal slot is freed, nothing is acknowledged, and the cookie-based retained
listing of today keeps working. The wallet tests exercise r20 only against a
labelled local fixture; that is not delivery and not interoperability.

Three host-only operations on the existing `POST /api/product-face/v1/operations`
endpoint, each with the existing `x-tig-product-face-application` routing
header and a normal wallet assertion. A face is never authorised for any of
them (`hostOnlyRuntimeOperations`); a request carrying an `Origin` header is
refused. Each has zero business writes.

| operation       | op_id                     | target         | purpose                                                |
| --------------- | ------------------------- | -------------- | ------------------------------------------------------ |
| `write.status`  | the ORIGINAL write's id   | the original's | verified outcome of one runtime write                  |
| `recovery.list` | a fresh wallet-minted id  | `{}`           | this actor's unresolved and unacknowledged operations  |
| `recovery.ack`  | the ORIGINAL operation id | the original's | idempotent record that this host delivered the outcome |

`request_hash` is always `sha256:` hex of the canonical JSON
`{input, operation, operationId, target}` (the request minus the assertion),
as `runtimeRequestHash` computes it today.

## 0. Common rules

### Authenticate, then exact-match, then disclose

The runtime verifies the assertion exactly as any operation
(`assertion.verifier`) BEFORE any lookup. A record is disclosed, replayed or
acknowledged only when ALL of the following equal the assertion's claims:
`holder`, `sub` (wallet id), `iss` (wallet host origin), `aud`
(`<applicationId>@<origin>`), `programme`, and, for `write.status` and
`recovery.ack`, the record's `operation` identity and `target`. A mismatch
answers exactly as "no record" (`404 face_operation_not_found`); nothing is
disclosed, including whether a record exists.

### Immutable original, append-only outcome

The original request identity (`operation`, `target`, `request_hash`,
`holder`, `sub`, `iss`, `aud`, `programme`, `artifact`) is written once with
the record and never changed. Outcome reconciliation and acknowledgements are
appended beside it; nothing is overwritten or deleted. A record's receipt and
proof are retained after acknowledgement.

### Artifact compatibility

Every answer that discloses a record carries `recorded_artifact` (the
original assertion's `{version, artifactHash}`), `asserting_artifact` (this
read's) and `artifact_compatible`, true only when both are in the runtime's
current approved compatible set for the application (contract r17 set A).
Compatibility is decided by the runtime's reviewed set, never by the host's
configuration hash. A compatible host update keeps brand, organisation,
origin and programme; it never enables a journey or capability the host has
disabled, and the wallet applies its current journey gate to every recovered
item (an item of a disabled journey is neither resolved nor acknowledged on
that host).

### Later state never invalidates proved history

Once a Dual-backed effect has been proved from the historical action log
(holder-signed action id, signer, executed payload hash), a later legitimate
change of the unit (an onward transfer, a later update) does not change that
outcome. `transfer.status`, `transfer.verify`, `registration.settle.status`
and `write.status` answer from the historical record and the historical
action, and MUST NOT require the current owner or state to still agree with
the step once the committed outcome is recorded. Current state is reported
separately as a readback, never used to withdraw a proved outcome.

### Accounting, on every answer

```json
"writesExecuted": 0,
"dualWritesExecuted": 0,
"providerWritesExecuted": 0,
"unknownWriteOutcomes": 0,
"secretReturned": false,
"bookkeeping": { "assertionsConsumed": 1, "acknowledgementsRecorded": 0 }
```

The first five are business, provider and Dual effects: exactly `0` on
`write.status`, `recovery.list` and `recovery.ack`. `bookkeeping` counts the
runtime's own authentication and recovery records honestly and separately:
the consumed `jti`, and the acknowledgement row `recovery.ack` appended (`1`
on its first call, `0` on an idempotent replay). The wallet refuses any answer
whose business counters are not exactly `0`.

### Disclosure scope

A recovered record exposes only the actor's OWN minimal original correlation
and receipt identifiers: operation id, operation, object id, case id, offer
id, proposal id, step, action id, receipt ids and hashes. Never case content,
quote content, documents, the current or new owner, the recipient, or
anything read for another holder. A former holder's private reads keep
answering `403 not_holder` and a unit that left keeps answering `404` where
they do today.

## 1. `write.status`

Served by the runtime that served the ORIGINAL write: the linked Warranty
runtime (`linkedRuntimes[purpose=claims-warranty]`) for `case.*`, the face's
own runtime for `transfer.offer` and `transfer.cancel`. `target` is the
original `{object_id, case_id?}` (quote fields are not part of it); `input`
is `{}`.

### Durable write record (runtime obligation)

Every runtime write records, atomically with its effect (same transaction as
the canonical store change, or the same outbox entry), an immutable record
keyed by `(applicationId, op_id)` holding the original request identity
above plus `outcome`, `receipt`, `dual`, `unresolved`, `recordedAt`.

- `outcome: "applied"` only when the effect is committed in the runtime's
  canonical store and, for a Dual-backed effect, the Dual proof below holds.
  Accepted, queued, or dispatched to an outbox is NOT applied.
- `outcome: "refused"`: definitively refused with zero writes. Remains HELD
  in the wallet (it frees no slot).
- `unresolved`: outcomes of that write the runtime cannot yet decide (a
  provider or Dual write in flight).

### Replay and reuse of an operation id

After verifying the assertion, a write whose `op_id` is recorded answers:

- the recorded answer, with no second effect, only when `holder`, `sub`,
  `iss`, `aud`, `programme`, `operation`, `target` and `request_hash` equal
  the record's;
- otherwise `409 {status: "face_operation_conflict"}`, zero writes, nothing
  of the record disclosed.

### Result (200 only when the record is this actor's and both artifacts are compatible)

```json
{
  "ok": true,
  "status": "write_applied",
  "contract": "r20",
  "operation_id": "<op_id>",
  "operation": "<recorded write operation>",
  "target": { "object_id": "<24 hex>", "case_id": "<when recorded>" },
  "request_hash": "sha256:<recorded write request hash>",
  "holder": "<recorded holder>",
  "wallet": "<recorded sub>",
  "issuer": "<recorded iss>",
  "application_id": "<serving applicationId>",
  "programme": "<recorded programme>",
  "recorded_artifact": { "version": "x.y.z", "artifactHash": "sha256:<hex>" },
  "asserting_artifact": { "version": "x.y.z", "artifactHash": "sha256:<hex>" },
  "artifact_compatible": true,
  "readback": "verified",
  "receipt": {
    "kind": "case_event",
    "case_id": "<case id>",
    "event_id": "<id>"
  },
  "dual": {
    "backed": false,
    "intended_dual_writes": 0,
    "reason": "server_only_effect",
    "target_readback": "verified"
  },
  "acknowledged": false,
  "writesExecuted": 0,
  "dualWritesExecuted": 0,
  "providerWritesExecuted": 0,
  "unknownWriteOutcomes": 0,
  "secretReturned": false,
  "bookkeeping": { "assertionsConsumed": 1, "acknowledgementsRecorded": 0 }
}
```

- `readback: "verified"`: the runtime re-read its canonical store at this
  read and found the receipt's effect (the case event under `event_id`; the
  offer under `offer_id`), not merely the record.
- `receipt`: `{kind: "case_event", case_id, event_id}` for a case write;
  `{kind: "transfer_offer", offer_id, state}` for an offer or its
  cancellation (`state` one of `offered`, `cancelled`). Identifiers only.
- `dual`: for a genuine server-only effect (every runtime write today):
  `backed: false`, `intended_dual_writes: 0`, a plain-code `reason`, and
  `target_readback` from a fresh Dual read of the original target object:
  `"verified"` (the object exists with the recorded id and template) or
  `"absent"` (it no longer reads). Neither value discloses the owner, and
  `"absent"` does not withdraw `write_applied` (later state never invalidates
  proved history). For a Dual-backed write, if one is ever introduced:
  `backed: true`, `intended_dual_writes: n`, and `proof: {action_id,
object_id, signer, payload_hash, verified_at}` from a fresh read of the
  historical Dual action log through the runtime's existing strict resolver
  (the same one `transfer.verify` and `registration.settle.status` use), with
  `unknownWriteOutcomes: 0`; application-store or outbox state alone is never
  the proof.
- `acknowledged`: whether a `recovery.ack` row exists for this record from
  this `iss`.

Negative and unknown answers (zero writes, never a guess):

- `404 {status: "face_operation_not_found"}`: no record for this actor
  (unknown: in flight, never consumed, lost before the runtime, or another
  actor's).
- `200 {status: "write_refused", ...}` same fields, `receipt: null`: a
  definitive zero-write refusal. HELD by the wallet.
- `409 {status: "write_outcome_unknown"}`: a record exists but `unresolved`
  is not `0`, or the Dual proof cannot yet be read.
- `409 {status: "face_operation_artifact_retired"}`: either artifact is
  outside set A.
- An older runtime answers its refusal for an unknown operation
  (`400 face_request_invalid`): unsupported, never an outcome.

### What frees a wallet journal slot

Only `200 write_applied` with `contract: "r20"`, `readback: "verified"`,
`artifact_compatible: true`, every business counter `0`, `secretReturned:
false`, a well-formed receipt of the right kind, a well-formed `dual` block,
and every identity field equal to the wallet's journal entry, session, host
origin, routed runtime, programme and currently served face artifact. The
wallet also requires `request_hash` to equal the hash it recorded when it
issued the write's assertion; an entry issued before the wallet recorded one
is never settled from a read. Everything else is held; nothing is ever
re-sent.

## 2. `recovery.list`

The durable discovery of this actor's operations whose outcome the wallet may
not have seen, without a remembered object id and without any browser cookie:
after lost cookies, cookie expiry, logout, a sign-in on another browser, or an
account switch back. Served by each runtime for ITS OWN existing durable
stores only (no new store): registration intents and outbox, settle
reservations, transfer offers, transfer reservations and steps, and the r20
write records. The wallet asks the face's own runtime and each linked
runtime.

- `op_id`: a fresh wallet-minted listing id (`^[a-z0-9-]{8,64}$`), not a
  business operation; the runtime records nothing for it beyond the `jti`.
- `target`: `{}`.
- `input`: `{}` or `{cursor: "<opaque, ≤ 512 chars>"}` from a previous page.

### Scope

Items whose record `holder`, `sub`, `iss`, `aud` and `programme` ALL equal
the assertion's, and whose state is one of:

- `unresolved`: authority left the wallet and the runtime has no committed
  or refused outcome yet (a registration intent not settled, a won reservation
  without a verified action, a write with `unresolved > 0`);
- `completed`: a committed or applied outcome exists and no `recovery.ack`
  row from this `iss` exists for it;
- `refused`: a definitive zero-write refusal exists and no ack row exists.

Acknowledged records are not listed. Nothing is listed for another `iss`,
`sub`, holder, application or programme.

### Result

```json
{
  "ok": true,
  "status": "recovery_listed",
  "contract": "r20",
  "application_id": "<serving applicationId>",
  "programme": "<assertion programme>",
  "items": [
    {
      "kind": "transfer",
      "operation_id": "<original step operation id>",
      "operation": "transfer.transfer",
      "object_id": "<24 hex>",
      "case_id": null,
      "offer_id": "pto-<24 hex>",
      "proposal_id": "<id or null>",
      "step": "transfer",
      "action_id": "<holder action id or null>",
      "state": "completed",
      "recorded_at": "<RFC 3339>",
      "recorded_artifact": {
        "version": "x.y.z",
        "artifactHash": "sha256:<hex>"
      },
      "artifact_compatible": true
    }
  ],
  "next": null,
  "complete": true,
  "asserting_artifact": { "version": "x.y.z", "artifactHash": "sha256:<hex>" },
  "writesExecuted": 0,
  "dualWritesExecuted": 0,
  "providerWritesExecuted": 0,
  "unknownWriteOutcomes": 0,
  "secretReturned": false,
  "bookkeeping": { "assertionsConsumed": 1, "acknowledgementsRecorded": 0 }
}
```

- `kind`: `registration` (operation `registration.submit`), `settle`
  (operation `registration.settle`, with `proposal_id`), `transfer`
  (`transfer.request` or `transfer.transfer`, with `offer_id`, `step`,
  `proposal_id`), `runtime` (a write operation, with `case_id` when
  recorded). Each item carries only the fields of its kind; the rest are
  `null`.
- Items are ordered by `recorded_at` ascending, then `operation_id`; a page
  holds at most 50; `next` is an opaque cursor for the following page or
  `null` on the last.
- `complete`: `true` only when every store this runtime lists from was
  scanned to the end for this page. A store that could not be read makes
  `complete: false`; the items returned are still exact. The wallet treats an
  incomplete listing as fail-closed: it may resolve and show the items it
  received, but reports that not every request could be checked and never
  concludes that nothing is outstanding.

Item outcomes are NOT in the listing. The wallet resolves each item through
the existing resolver of its kind, which proves the outcome from the
historical canonical record:

- `registration` → `registrations/status` (`registration.status`);
- `settle` → the wallet's own canonical readback plus
  `registration.settle.status` where the wallet uses it;
- `transfer` → `transfer.verify` with the recorded `action_id`, else
  `transfer.status`, both bound to `offer_id` and `step_operation_id`;
- `runtime` → `write.status` above.

An item whose journey the host disables is neither resolved nor acknowledged
on that host and stays listed.

### Negative answers

- `400 face_request_invalid`: an older runtime; unsupported.
- `409 {status: "recovery_cursor_invalid"}`: a cursor not issued by this
  runtime for this actor.
- `503 {status: "recovery_unavailable"}`: nothing could be scanned; the
  wallet reports an incomplete check and acknowledges nothing.

## 3. `recovery.ack`

Records, idempotently, that this host delivered a record's outcome to its
actor. It never modifies the business record, its receipt or its proof.

- `op_id`: the ORIGINAL operation id; `target`: the original's
  (`{object_id, case_id?}`, `{object_id}` for a transfer step or
  registration); `input`: `{outcome_hash: "sha256:<hex>"}`, the hash of the
  canonical JSON of the outcome the wallet verified (for a runtime write the
  `receipt`; for a transfer step `{offer_id, step_operation_id, action_id,
status}`; for a registration `{operationId, status}`), so a stale or
  different outcome is never acknowledged as delivered.

### Result

```json
{
  "ok": true,
  "status": "recovery_acknowledged",
  "contract": "r20",
  "operation_id": "<op_id>",
  "first": true,
  "acknowledged_at": "<RFC 3339 of the first acknowledgement>",
  "writesExecuted": 0,
  "dualWritesExecuted": 0,
  "providerWritesExecuted": 0,
  "unknownWriteOutcomes": 0,
  "secretReturned": false,
  "bookkeeping": { "assertionsConsumed": 1, "acknowledgementsRecorded": 1 }
}
```

- `first: true` and `acknowledgementsRecorded: 1` on the call that appended
  the row; `first: false` and `0` on any replay. A replay changes nothing.
- The row holds `{iss, sub, holder, outcome_hash, at}` beside the record.

### Negative answers

- `404 face_operation_not_found`: no record for this actor (as above).
- `409 {status: "recovery_unresolved"}`: the record has no committed or
  refused outcome yet; an unresolved record is never acknowledged.
- `409 {status: "recovery_outcome_mismatch"}`: `outcome_hash` is not the hash
  of the record's current outcome; nothing is recorded.
- `400 face_request_invalid`: an older runtime; unsupported.

## 4. Wallet behaviour against this contract

- A begin that finds no room reads the two oldest held runtime writes with
  `write.status`; only a proven one makes room. The face's status read of a
  held write does the same. Otherwise `journal_full`.
- On each face launch, after the bootstrap, the host lists recovery from the
  face's runtime and each linked runtime, follows `next` to the end (bounded;
  an unfinished follow is reported as incomplete), resolves each item of an
  enabled journey through its kind's resolver, shows the outcomes it proved in
  its own UI (never face text), and acknowledges an item only after showing a
  proved outcome, with that outcome's hash. Held and unknown items are shown
  as still being confirmed and are not acknowledged. Items of a disabled
  journey are not read.
- Nothing recovered is ever re-sent, re-reserved, re-minted for the face, or
  executed. The wallet's cookie-based retained listing stays as a second
  source for runtimes without r20.
- `write_refused`, any `404`/`409`, an incomplete scan, a mismatched identity,
  an unhashed legacy entry, a foreign record or a tampered field: held, no
  slot freed, no acknowledgement.

## 5. Decisions for Root

- Whether a verified `write_refused` may ever free a wallet slot (the wallet
  keeps it held).
- Whether acknowledged records should age out of the runtime store, and when
  (the wallet assumes they are retained with their original evidence).
