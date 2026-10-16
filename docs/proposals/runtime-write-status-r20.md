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

| operation       | op_id                     | target         | input                                |
| --------------- | ------------------------- | -------------- | ------------------------------------ |
| `write.status`  | the ORIGINAL write's id   | the original's | `{original_operation}`               |
| `recovery.list` | a fresh wallet-minted id  | `{}`           | `{}` or `{cursor}`                   |
| `recovery.ack`  | the ORIGINAL operation id | the original's | `{original_operation, outcome_hash}` |

`request_hash` is always `sha256:` hex of the canonical JSON
`{input, operation, operationId, target}` (the request minus the assertion),
as `runtimeRequestHash` computes it today. Canonical JSON throughout this
contract is: object keys sorted by UTF-16 code unit order, no whitespace,
strings and numbers as JSON serialises them.

## 0. Common rules

### Authenticate, then exact-match, then disclose

The runtime verifies the assertion exactly as any operation
(`assertion.verifier`) BEFORE any lookup. The lookup key of `write.status`
and `recovery.ack` is `(applicationId, op_id)`. A record is disclosed,
replayed or acknowledged only when ALL hold:

- the record's `holder`, `sub` (wallet id), `iss` (wallet host origin), `aud`
  (`<applicationId>@<origin>`) and `programme` equal the assertion's claims;
- the record's original `target` equals the assertion's `target`;
- the record's original `operation` equals `input.original_operation` (the
  assertion's own `operation` claim is `write.status` or `recovery.ack`; the
  original operation is bound through the request, and so through
  `request_hash`).

A mismatch of any of these answers exactly as "no record"
(`404 face_operation_not_found`); nothing is disclosed, including whether a
record exists.

### Immutable original, append-only outcome

The original request identity (`operation`, `target`, `request_hash`,
`holder`, `sub`, `iss`, `aud`, `programme`, `artifact`) is written once with
the record and never changed. Outcome reconciliation and acknowledgements are
appended beside it; nothing is overwritten or deleted. A record's receipt,
proof and `outcome_proof` are retained after acknowledgement.

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
outcome. `transfer.status`, `transfer.verify`, `registration.status`,
`registration.settle.status` and `write.status` answer from the historical
record and the historical action, and MUST NOT require the current owner or
state to still agree with the step once the committed outcome is recorded.
Current state is reported separately as a readback, never used to withdraw a
proved outcome.

### One canonical outcome vocabulary and `outcome_proof`

Every committed or refused outcome in this contract is one of:
`registered` (a registration or settle), `transfer_request_committed`,
`transferred` (a transfer step), `write_applied`, `write_refused` (a runtime
write). Anything not yet committed or refused is `outcome_unknown`.

Every answer that reports a committed or refused outcome (r20 `write.status`,
and, as an additive r20 field, the committed answers of `registration.status`,
`registration.settle.status`, `registration.settle.verify`, `transfer.status`
and `transfer.verify`) carries `outcome_proof` and `outcome_hash`.
`outcome_proof` is derived ONLY from the immutable record and its appended
outcome, never from current state, so two fresh reads of the same outcome
give the same bytes. Exactly these fields, per kind:

| kind           | `outcome_proof`                                                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registration` | `{kind:"registration", operation_id, object_id, action_id (string or null), status:"registered"}`                                                                                               |
| `settle`       | `{kind:"settle", operation_id (the settle operation id), proposal_id, object_id, action_id, status:"registered"}`                                                                               |
| `transfer`     | `{kind:"transfer", operation_id (the step operation id), offer_id, object_id, step, action_id, status}` with `status` `transfer_request_committed` or `transferred`                             |
| `runtime`      | `{kind:"runtime", operation_id, operation, object_id, case_id (string or null), receipt, status}` with `status` `write_applied` or `write_refused` and `receipt` as in §1 (`null` when refused) |

`outcome_hash` = `sha256:` hex of the canonical JSON of `outcome_proof`. The
wallet recomputes it and refuses an answer whose `outcome_hash` does not
match. A runtime that does not return `outcome_proof` for a committed outcome
is pre-r20 for that operation: the wallet shows nothing more than it does
today and acknowledges nothing.

### The existing resolvers' committed answers (additive r20 fields)

On a committed answer of `registration.status`, `registration.settle.status`,
`registration.settle.verify`, `transfer.status` or `transfer.verify` an r20
runtime adds, beside its existing fields: the full §0 echo (`operation_id`
of the request, `holder`, `wallet`, `issuer`, `application_id`,
`programme`, `asserting_artifact`), the accounting block below,
`outcome_proof` and `outcome_hash`. The wallet accepts such an answer as a
proved outcome only with all of them, every business counter `0`, the echo
matching, and the proof's identities equal to the listed original item:
`object_id`; `offer_id` and `step` for a transfer step; `proposal_id` for a
settle; `action_id` equal to the listed one when the listing carried it,
otherwise a well-formed action id (a reconcile may find the action only
now). A committed answer without them is pre-r20 for that operation: shown
as it is today, acknowledged never.

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

### Echoed binding, validated by the wallet

Every answer echoes `operation_id` (the request's op_id), `holder`, `wallet`
(`sub`), `issuer` (`iss`), `application_id` (the serving application),
`programme` and `asserting_artifact`. The wallet compares each against the
session (holder, wallet id), the host (its origin), the runtime it routed the
request to (application id), the face binding (programme, version, artifact
hash) and the request it sent (operation id). Nothing is taken on trust from
the endpoint having answered; a missing or different echo holds the answer.

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
is `{original_operation: "<the original write operation>"}`.

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

### Result (200 only when the record is this actor's, the original operation matches, and both artifacts are compatible)

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
  "outcome_proof": {
    "kind": "runtime",
    "operation_id": "<op_id>",
    "operation": "<op>",
    "object_id": "<24 hex>",
    "case_id": "<case id>",
    "receipt": {
      "kind": "case_event",
      "case_id": "<case id>",
      "event_id": "<id>"
    },
    "status": "write_applied"
  },
  "outcome_hash": "sha256:<hex of canonical outcome_proof>",
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
- `dual`: the server's binding of the write's ACTUAL domain effect to its
  immutable original record, in one of two truthful branches. Nothing is
  assumed: not that every runtime write is server-only, not that the signer
  is the holder, not that the effect's canonical object is the product
  target.
  - `backed: false` (a genuine server-only effect): `intended_dual_writes:
0`, a plain-code `reason` (`/^[a-z][a-z0-9_]{0,63}$/`, for example
    `server_only_effect`), and `target_readback` from a FRESH Dual read of the
    original target object at this read through the runtime's existing
    strict object resolver: `"verified"` means the object reads with the
    recorded id and template (the owner is neither required nor disclosed).
    When the object cannot be read at all the runtime answers `409 {status:
"write_outcome_unknown", reason: "target_readback_unavailable"}`. When
    it reads but no longer exists (deleted since) the runtime answers
    `write_applied` with `target_readback: "absent"`; the wallet HOLDS that
    answer (it is not the required readback) and it is flagged for Root in
    §5.
  - `backed: true` (an effect that is a Dual action): `intended_dual_writes:
n` (`n ≥ 1`, the writes the ORIGINAL intended; this read adds none) and
    `proof`, freshly verified at this read through the runtime's existing
    strict Dual action-log resolver (the one `transfer.verify` and
    `registration.settle.status` use):

    ```json
    "proof": {
      "resolver": "dual_action_log",
      "action_id": "<historical action id>",
      "object_id": "<24 hex: the canonical object the action was applied to>",
      "signer": "<the account that signed the action>",
      "expected_payload_hash": "sha256:<hex, from the immutable original record>",
      "observed_payload_hash": "sha256:<hex, from the historical action log read now>",
      "payload_match": true,
      "bound_to": { "operation_id": "<op_id>", "request_hash": "sha256:<recorded write request hash>" },
      "verified_at": "<RFC 3339 of this read>"
    }
    ```

    The server states the binding; the wallet validates the minimal bound
    proof: `payload_match: true` with `expected_payload_hash ===
observed_payload_hash`, well-formed `action_id`, `object_id` and
    `signer`, `bound_to` equal to the answer's `operation_id` and
    `request_hash`, and `verified_at` within ten minutes of the wallet's
    own clock. It does not require `signer` to equal the holder or
    `proof.object_id` to equal `target.object_id`. For a Dual-backed write
    `outcome_proof` additionally carries `dual: {action_id, object_id,
observed_payload_hash}`, so the acknowledgement binds the proved effect.

  - Either branch: `unknownWriteOutcomes: 0` and every business counter `0`
    (this read writes nothing to Dual, a provider or the store). A record
    whose branch does not pass is `409 write_outcome_unknown`, never
    `write_applied`.
- `acknowledged`: whether a `recovery.ack` row exists for this record from
  this `iss`.

Negative and unknown answers (zero writes, never a guess):

- `404 {status: "face_operation_not_found"}`: no record for this actor and
  original operation (unknown: in flight, never consumed, lost before the
  runtime, or another actor's).
- `200 {status: "write_refused", ...}`: same fields, `receipt: null`,
  `outcome_proof.status: "write_refused"`: a definitive zero-write refusal.
  HELD by the wallet.
- `409 {status: "write_outcome_unknown", reason}`: a record exists but
  `unresolved` is not `0`, the Dual proof cannot yet be read, or
  `target_readback_unavailable`.
- `409 {status: "face_operation_artifact_retired"}`: either artifact is
  outside set A.
- An older runtime answers its refusal for an unknown operation
  (`400 face_request_invalid`): unsupported, never an outcome.

### What frees a wallet journal slot

Only `200 write_applied` with `contract: "r20"`, `readback: "verified"`,
`artifact_compatible: true`, a `dual` block that passes its branch above
(`backed: false` with `target_readback: "verified"`, or `backed: true` with
the minimal bound proof validated), every business counter `0`,
`secretReturned: false`, a well-formed receipt of the right kind, a matching
`outcome_hash`, and every echoed identity field equal to the wallet's journal
entry, session, host origin, routed runtime, programme and currently served
face artifact. The wallet also requires `request_hash` to equal the hash it
recorded when it issued the write's assertion; an entry issued before the
wallet recorded one is never settled from a read. Everything else is held;
nothing is ever re-sent.

## 1a. Amendment r20.1 (PROPOSED, awaiting Root approval): `original_verified_effect_receipt_v1`, one receipt chain per intended Dual effect

Status: **PROPOSED AMENDMENT, NOT APPROVED, NOT IMPLEMENTED** on either
side. Nothing of the approved r20 wire outside §1's `dual.backed: true`
branch changes; on approval this section SUPERSEDES that branch. Neither the
wallet reader nor the fixture moves to it before Root approves this exact
text.

### Why, and what this is not

A normal linked Warranty write can intend MORE THAN ONE Dual action (a
`case.open` that mints and then updates: `intended_dual_writes: 2`). r20
carries one proof, and the wallet holds every record whose intended count is
not `1`; one proof never stands for a second effect.

This is NOT an executed-input-byte proof. The public Dual action log exposes
`params: {id, data_hash}` and not the raw update data, and it carries NO
content hash of its own; public update history omits the change; no
inspected public SDK documents how `data_hash` is derived from submitted
JSON. Submitted raw data therefore cannot be reconstructed from public logs,
so r20's `expected_payload_hash`, `observed_payload_hash` and
`payload_match` (an executed-input proof) are WITHDRAWN by this amendment: a
runtime must not answer them, the wallet holds any answer that carries them,
and none of their meaning is carried over under another name. What replaces
them is a receipt chain the server holds and corroborates: the write's
pre-dispatch intent commitment, the protected original verifier's qualifying
receipt of each effect, and a fresh historical corroboration, from the exact
state-change history entry linked to the action's affected object, of that
receipt's RAW provider content hash.

### Names, kept distinct

- **Intent commitment**: the versioned domain commitment the server made
  BEFORE dispatch, over a retained preimage, recomputed by the server at
  every read (`intent_commitment.hash`, a `sha256:` commitment of ours).
- **Original verified raw content hash**: the provider's RAW content hash of
  the effect as the protected original verifier observed it at the time
  (`original_receipt.content_hash_raw`): the provider's own value,
  preserved, never a state hash and never re-hashed.
- **Fresh historical corroboration**: the same raw provider content hash
  read now from the exact state-change history entry linked to the
  action's affected object, together with the action's terminal success,
  authority, object, scope and affected objects read from the historical
  action log (`historical_corroboration`).

SHA-256 (`sha256:<64 hex>`) is used ONLY for our own canonical commitments:
`intent_commitment.hash`, `domain_commitment`, `request_hash`,
`outcome_hash`. A provider raw hash is never hashed again and never given a
`sha256:` prefix. Only hashes and identifiers appear on the wire; never
content, raw data, private attributes or another holder's data.

### Formats

- **Provider raw content hash** (`content_hash_format:
"provider_raw_hex_v1"`): the provider's raw hash value as emitted, `0x`
  followed by exactly 64 hexadecimal digits. Normalization: the hexadecimal
  digits are lower-cased; the `0x` prefix is required and kept; nothing else
  is accepted (no `sha256:` prefix, no bare hex, no other length). Equality
  is byte-for-byte equality of the normalized strings. The value is the
  provider's bytes as a hex string; it is preserved, never derived from hex
  text by hashing it.
- **Address**: `0x` followed by exactly 40 hexadecimal digits, lower-cased
  for comparison; equality is equality of the normalized strings.
- **Our commitments**: `sha256:` followed by exactly 64 lower-case
  hexadecimal digits.

### The `dual` block under r20.1

```json
"dual": {
  "backed": true,
  "proof_kind": "original_verified_effect_receipt_v1",
  "intended_dual_writes": 2,
  "effects": [
    {
      "index": 0,
      "action_id": "<historical Dual action id, unique in this list>",
      "action_kind": "<the Dual action kind, e.g. mint | update | transfer>",
      "object_id": "<24 hex: the canonical object the action was applied to>",
      "bound_to": {
        "operation_id": "<op_id>",
        "request_hash": "sha256:<recorded write request hash>",
        "effect_index": 0
      },
      "intent_commitment": {
        "version": "v1",
        "scheme": "<plain code of the reviewed commitment scheme>",
        "hash": "sha256:<hex, recomputed now from the retained preimage>",
        "preimage_retained": true,
        "scope": {
          "event_id": "<id>",
          "outbox_id": "<id>",
          "installation_id": "<id>"
        }
      },
      "original_receipt": {
        "verifier": "<plain code: the protected original verifier's provenance>",
        "verified_at": "<RFC 3339, when the original verifier qualified it>",
        "action_kind": "<same action kind>",
        "action_id": "<same action id>",
        "object_id": "<same object id>",
        "network": "<plain code: the ORIGINAL network, pinned>",
        "api_scope": "<plain code: the ORIGINAL API scope, pinned>",
        "template_id": "<24 hex>",
        "authority": {
          "account": "0x<40 hex: the expected signing account>",
          "controller": "0x<40 hex: the declared controller>, or null: direct, no controller"
        },
        "domain_commitment": "sha256:<hex, the original domain commitment the verifier observed>",
        "projection": "full_declared",
        "content_hash_format": "provider_raw_hex_v1",
        "content_hash_raw": "0x<64 hex: the provider's RAW original content hash>",
        "content_hash_source": "raw_original_content"
      },
      "historical_corroboration": {
        "read_at": "<RFC 3339 of this read>",
        "resolver": "dual_action_log",
        "action_id": "<same action id>",
        "action_kind": "<as the log shows>",
        "object_id": "<as the log shows>",
        "network": "<as read, must equal the pinned original>",
        "api_scope": "<as read, must equal the pinned original>",
        "template_id": "<as read>",
        "execution": "succeeded",
        "status_raw": "<Dual's own status value, preserved verbatim>",
        "authority": {
          "account": "0x<40 hex: the observed signing account>",
          "controller": "0x<40 hex: the observed controller>, or null: direct, no controller"
        },
        "affected_objects": ["<24 hex>", "..."],
        "history_entry_id": "<id of the state-change history entry read>",
        "history_entry_object_id": "<24 hex: the affected object that entry belongs to>",
        "content_hash_format": "provider_raw_hex_v1",
        "content_hash_raw": "0x<64 hex: as that history entry carries it>",
        "content_hash_match": true
      },
      "effect_verdict": "verified"
    },
    { "index": 1, "...": "the second intended effect, same shape" }
  ]
}
```

### Server obligations, for EACH intended effect

1. **Intent commitment.** Before dispatch the runtime fixes, immutably, the
   actor, the request (`operation_id`, `request_hash`), the event, outbox
   and installation scope of the write, and a versioned domain commitment
   over a retained preimage. At every status read it recomputes the
   commitment from the retained preimage and answers the hash; a missing or
   unrecomputable preimage is `409 {status: "write_outcome_unknown", reason:
"intent_preimage_missing"}`.
2. **Original verified receipt.** The protected original verifier's
   qualifying receipt (effect descriptor) is retained with the record: the
   exact action kind and id, the canonical object, the ORIGINAL network and
   API scope (pinned), the template, the expected signing authority as an
   explicit `account` address and an explicit `controller` that is either a
   declared address or `null` meaning the account signed directly with no
   controller, the original domain commitment it observed (equal to the
   recomputed intent commitment hash) with the FULL declared projection, and
   the provider's RAW original content hash in `provider_raw_hex_v1` form
   with its provenance. A receipt is NOT qualifying when its content hash is,
   or falls back to, a state hash; when its controller is absent, unknown or
   unrecorded (the field must be present as an address or `null`); or when
   any of these fields is missing. A missing or non-qualifying receipt is
   `409 {status: "write_outcome_unknown", reason: "original_receipt_missing"}`.
3. **Fresh historical corroboration.** At this read, through the runtime's
   existing strict Dual action-log resolver, the runtime reads the
   historical action log entry for `action_id` and proves, against the
   protected original receipt: the exact action id and kind, the canonical
   object, the pinned ORIGINAL network and API scope, the template, the
   expected account and controller authority (the observed, normalized
   controller must EXACTLY equal the declared one, `null` included; the
   comparison is never skipped), and terminal success normalized as
   `execution: "succeeded"` (its reviewed mapping from Dual's raw status,
   preserved verbatim in `status_raw`; `pending`, `failed` or `unknown` is
   never applied). It then reads the exact STATE-CHANGE HISTORY ENTRY linked
   to that log entry's affected object (`history_entry_id`,
   `history_entry_object_id`) and takes the provider raw content hash from
   THAT entry: the public action log itself carries no content hash, and a
   match is never inferred from the equality of a response echo with the
   receipt. `content_hash_match: true` means that entry's normalized value
   equals the receipt's. `original_receipt.verified_at` must not be after
   `historical_corroboration.read_at`. A corroboration that cannot be read,
   is not terminal, differs in any of these, or does not carry the same raw
   content hash is `409 {status: "write_outcome_unknown", reason:
"effects_unproved", proved_effects: k}`.

Exact coverage: `effects.length === intended_dual_writes`; a record whose
effects are not ALL verified is never `write_applied` and never partially
applied; nothing is inferred from the effects verified. The list is ORDERED
as the original request intended (`index === i`, `bound_to.effect_index ===
i`), `action_id` is unique across the list, and every effect's `bound_to`
names this operation and recorded request hash. Later state never
invalidates proved history (§0): a later legitimate action on an affected
object changes nothing above.

Authority policy: exact comparison only. Any policy beyond exact equality
(a controller rotation, a delegated signer) is a Root decision to be pinned
explicitly; there is no wildcard and no "unknown matches anything".

### Outcome hash over the whole ordered list and the original request

For a Dual-backed write under r20.1:

```json
"outcome_proof": {
  "kind": "runtime", "operation_id": "...", "operation": "...", "object_id": "...", "case_id": "...", "receipt": {"..."}, "status": "write_applied",
  "dual": {
    "proof_kind": "original_verified_effect_receipt_v1",
    "request": { "operation_id": "<op_id>", "request_hash": "sha256:<recorded>" },
    "effects": [
      { "index": 0, "action_id": "...", "object_id": "...", "intent_commitment_hash": "sha256:...", "content_hash_raw": "0x..." },
      { "index": 1, "..." : "..." }
    ]
  }
}
```

`outcome_hash` (a `sha256:` commitment of ours over this canonical JSON)
therefore binds the ENTIRE ordered effect list AND the original request, and
`recovery.ack` acknowledges exactly that. An answer whose
`outcome_proof.dual` is not this projection of `effects` and of the answer's
`operation_id` and `request_hash` is malformed.

### Exactly one representation

Under r20.1 a Dual-backed write has one form: `proof_kind:
"original_verified_effect_receipt_v1"` with `effects`, for every intended
count including `1`. The approved r20 singular `proof` (and any
`expected_payload_hash`, `observed_payload_hash`, `payload_match` field,
anywhere in the answer) is withdrawn: its presence makes the answer malformed
and held. `backed: false` is unchanged.

### Consumer validation under r20.1 (what frees a slot or proves a recovered item)

Every §1 gate as approved, and for `backed: true`: `proof_kind ===
"original_verified_effect_receipt_v1"`; no withdrawn field present;
`effects.length === intended_dual_writes >= 1`; indices `0..n-1` in order
with `bound_to.effect_index` equal; unique, well-formed `action_id`s; per
effect: `bound_to.operation_id` and `bound_to.request_hash` equal to the
answer's; `intent_commitment` with plain-code `version` and `scheme`, a
well-formed `sha256:` `hash`, `preimage_retained === true` and non-empty
scope ids; `original_receipt` with a plain-code `verifier`, a parseable
`verified_at`, `action_kind`, `action_id` and `object_id` equal to the
effect's, plain-code `network` and `api_scope`, a well-formed `template_id`,
`authority.account` a well-formed address and `authority.controller`
present as a well-formed address or exactly `null` (absent: held),
`domain_commitment === intent_commitment.hash`, `projection ===
"full_declared"`, `content_hash_format === "provider_raw_hex_v1"`,
`content_hash_source === "raw_original_content"` and `content_hash_raw`
matching `^0x[0-9a-f]{64}$` after lower-casing; `historical_corroboration`
with `resolver === "dual_action_log"`, `action_id`, `action_kind`,
`object_id`, `network`, `api_scope` and `template_id` each equal to the
receipt's, a non-empty `history_entry_id`, `history_entry_object_id` a
well-formed object id contained in `affected_objects`, `execution ===
"succeeded"` exactly (`status_raw` a string, never interpreted),
`authority.account` equal to the receipt's normalized account and
`authority.controller` EXACTLY equal to the receipt's normalized controller
(`null` equals only `null`; the comparison is never skipped),
`affected_objects` a non-empty array of object ids containing `object_id`,
`content_hash_format === "provider_raw_hex_v1"`, normalized
`content_hash_raw` equal to the receipt's and `content_hash_match ===
true`, `Date.parse(original_receipt.verified_at) <=
Date.parse(read_at)`, and `read_at` within the existing reviewed clock
bound (ten minutes of the wallet's clock, no further future tolerance);
`effect_verdict === "verified"`; and `outcome_proof.dual` equal to the
projection above with `request` equal to the answer's `operation_id` and
`request_hash`. The wallet still does not require the authority account to
be the holder, nor any `object_id` to be the product target: it checks the
server's stated binding and the exact agreement of receipt and
corroboration. Anything else: held (the journal entry keeps its slot; a
recovered item is `outcome_unknown` without a ticket).

### What this amendment does not do

No new operation, store, status word, counter or lifetime. `recovery.list`
and `recovery.ack` are unchanged (the ack still names one `outcome_hash`,
which now covers every effect and the original request). The server-only
`backed: false` branch, the actor, host, programme, capability and artifact
isolation, the journey gate, the resolution bound, the continuation and the
ticketing are unaffected.

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
- `input`: `{}` for the first page, `{cursor: "<opaque, ≤ 512 chars>"}` for a
  following page.

### Scope

Items whose record `holder`, `sub`, `iss`, `aud` and `programme` ALL equal
the assertion's, and whose state is one of:

- `unresolved`: authority left the wallet and the runtime has no committed
  or refused outcome yet (a registration intent not settled, a won reservation
  without a verified action, a write with `unresolved > 0`);
- `completed`: a committed outcome exists and no `recovery.ack` row from this
  `iss` exists for it;
- `refused`: a definitive zero-write refusal exists and no ack row exists.

Acknowledged records are not listed. Nothing is listed for another `iss`,
`sub`, holder, application or programme.

### Scan, snapshot and cursor semantics

- The first page opens a scan: the runtime fixes `scan_id` (opaque) and
  `as_of` (RFC 3339). The scan covers exactly the records in scope with
  `recorded_at <= as_of`; records appended later belong to a later scan.
- Order is total and stable within a scan: `recorded_at` ascending, then
  `operation_id` ascending (UTF-16 code unit order). A page holds at most
  50 items. `next` is an opaque cursor for the following page of the SAME
  scan, or `null` on the last page. A cursor is bound to the scan and to the
  actor; any other use is `409 recovery_cursor_invalid`. A scan may be
  continued for 10 minutes after `as_of`; later, `409 recovery_cursor_expired`.
- `complete` is `true` on a page only when every store this runtime lists
  from was read to the end of that page's range for this scan. A store that
  could not be read makes `complete: false` on that page and on every later
  page of the same scan. A scan whose last page (`next: null`) carries
  `complete: true` is a consistent full scan of the snapshot.
- Within one scan an `operation_id` appears at most once; the wallet treats
  a repeated id within a scan, or the same id listed by two different
  runtimes, as conflicting: it resolves nothing for that id, acknowledges
  nothing, and reports it as not checked.

### What the wallet validates on a scan

Every page: the §0 echo; `contract: "r20"`; the accounting block at zero;
`scan_id` and `as_of` identical on every page of the scan; every item's
`recorded_at <= as_of`; items strictly increasing in (`recorded_at`,
`operation_id`) across the whole scan (so no repeated id and no reordering
between pages); a `next` cursor never seen before in this scan (no cycle);
at most 50 items a page and at most 20 pages followed. Any violation makes
that runtime's check incomplete: its items are shown at most as not checked
and nothing of it is acknowledged.

### Result

```json
{
  "ok": true,
  "status": "recovery_listed",
  "contract": "r20",
  "operation_id": "<the listing op_id>",
  "holder": "<assertion holder>",
  "wallet": "<assertion sub>",
  "issuer": "<assertion iss>",
  "application_id": "<serving applicationId>",
  "programme": "<assertion programme>",
  "asserting_artifact": { "version": "x.y.z", "artifactHash": "sha256:<hex>" },
  "scan_id": "<opaque>",
  "as_of": "<RFC 3339>",
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
  "writesExecuted": 0,
  "dualWritesExecuted": 0,
  "providerWritesExecuted": 0,
  "unknownWriteOutcomes": 0,
  "secretReturned": false,
  "bookkeeping": { "assertionsConsumed": 1, "acknowledgementsRecorded": 0 }
}
```

- `kind`: `registration` (operation `registration.submit`), `settle`
  (operation `registration.settle`, with `proposal_id`; its `operation_id`
  is the settle operation id), `transfer` (`transfer.request` or
  `transfer.transfer`, with `offer_id`, `step`, `proposal_id`), `runtime` (a
  write operation, with `case_id` when recorded). Each item carries only the
  fields of its kind; the rest are `null`.
- Item outcomes are NOT in the listing. The wallet resolves each item through
  the existing resolver of its kind, each of which proves the outcome from
  the historical canonical record and returns `outcome_proof`:
  - `registration` → `registrations/status` (`registration.status`);
  - `settle` → `registration.settle.status` (read-only reconcile through the
    Dual action logs), with the wallet's own canonical readback beside it;
  - `transfer` → `transfer.status` only, bound to `offer_id` and
    `step_operation_id`: the runtime's read-only reconcile through the Dual
    action logs (a won step whose holder action it finds is committed there;
    that appended outcome is bookkeeping, not a business write). The wallet
    never calls `transfer.verify` for a recovered item: it holds no action id
    of its own for it
  - `runtime` → `write.status` above.
- An item whose journey the host disables is neither resolved nor
  acknowledged on that host and stays listed.

### Negative answers

- `400 face_request_invalid`: an older runtime; unsupported.
- `409 {status: "recovery_cursor_invalid"}` / `409 {status:
"recovery_cursor_expired"}`: as above.
- `503 {status: "recovery_unavailable"}`: nothing could be scanned.

## 3. `recovery.ack`

Records, idempotently, that this host delivered a record's outcome to its
actor. It never modifies the business record, its receipt or its proof.

- `op_id`: the ORIGINAL operation id; `target`: the original's
  (`{object_id, case_id?}` for a runtime write, `{object_id}` for a
  registration, settle or transfer step); `input`: `{original_operation,
outcome_hash}` where `original_operation` is the record's operation
  (`registration.submit`, `registration.settle`, `transfer.request`,
  `transfer.transfer`, or the write operation) and `outcome_hash` is exactly
  the `outcome_hash` the resolving read returned (§0), so a stale or
  different outcome is never acknowledged as delivered.

### Result

```json
{
  "ok": true,
  "status": "recovery_acknowledged",
  "contract": "r20",
  "operation_id": "<op_id>",
  "holder": "<assertion holder>",
  "wallet": "<assertion sub>",
  "issuer": "<assertion iss>",
  "application_id": "<serving applicationId>",
  "programme": "<assertion programme>",
  "asserting_artifact": { "version": "x.y.z", "artifactHash": "sha256:<hex>" },
  "outcome_hash": "sha256:<hex>",
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

- `404 face_operation_not_found`: no record for this actor and original
  operation (as §0).
- `409 {status: "recovery_unresolved"}`: the record has no committed or
  refused outcome yet; an unresolved record is never acknowledged.
- `409 {status: "recovery_outcome_mismatch"}`: `outcome_hash` is not the hash
  of the record's `outcome_proof`; nothing is recorded.
- `400 face_request_invalid`: an older runtime; unsupported.

## 4. Wallet behaviour against this contract

- Slots: a begin that finds no room reads the two oldest held runtime writes
  with `write.status`; only a proven one makes room. The face's status read of
  a held write does the same. Otherwise `journal_full`. The listing never
  touches the journal and never frees a slot.
- Listing: on each face launch, after the bootstrap, the host lists recovery
  from the face's runtime and each linked runtime, following `next` to the
  end of each scan and validating each page (§2). A scan whose last page is
  `complete: true` and passed every validation is a complete scan. A
  `complete: false` page, a validation failure, a page follow stopped before
  `next: null`, a cursor refusal, an unavailable runtime or a runtime without
  r20 beside one with it makes the whole check INCOMPLETE.
- Resolving and showing: listed items of an enabled journey are resolved in
  listing order (oldest first) through their kind's resolver, at most 25 per
  listing; the rest are returned as not checked, with their count, so a
  larger queue drains across launches once the checked ones are
  acknowledged. A proved outcome is shown in the host's own UI (never face
  text); a held, unknown or refused one as it is; a refused runtime write is
  shown as refused only after its answer passed the same binding checks as an
  applied one. Showing never writes anything. A conflicting id (§2) is shown
  as not checked.
- Acknowledging: the wallet acknowledges an item only when ALL hold: every
  scoped runtime's scan was complete (the resolution bound above does not
  make a complete scan incomplete); the item's outcome was proved in that
  same launch with a matching `outcome_hash`; the item's journey is enabled
  on this host at listing and again at acknowledgement; and the person has
  seen it (the notice was dismissed). An incomplete check acknowledges
  nothing, even for items that were proved. Held, unknown, refused, not
  checked and conflicting items are never acknowledged.
- The acknowledgement ticket a listing issues is sealed to the session, the
  wallet, the face slug and programme, and the launch, and names the
  original operation id, kind, original operation, target, `outcome_hash`,
  the runtime's application id AND origin, and the face artifact (version and
  hash) the host served at listing. It is honoured for one hour and only
  while the same runtime (application and origin) is still bound and the same
  face artifact is still served; a changed linked origin, a changed artifact
  or a different host makes it invalid.
- Nothing recovered is ever re-sent, re-reserved, re-minted for the face, or
  executed. The wallet's cookie-based retained listing stays as a second
  source for runtimes without r20.

## 4a. Explicit limitations of the wallet consumer

- One intended Dual action per write, until amendment r20.1 (§1a) is
  approved: the wallet accepts `backed: true` only with
  `intended_dual_writes: 1` and the one proof naming that action. A record
  intending more than one Dual write is HELD as unsupported; the wallet
  never infers the remaining effects proved. §1a is the proposed remedy: one
  original-verified-effect receipt chain per intended effect, exact count,
  ordered, hash over the whole list and the original request.
- Resolution per listing page is bounded (25 items) in the contract's stable
  (`recorded_at`, `operation_id`) order. A page that leaves items unresolved
  returns a sealed, host-local continuation naming the last key it resolved
  (bound to the session, wallet, face, programme and launch, valid ten
  minutes); the next page of the same launch resolves the items after that
  key. The host follows up to eight pages per collection and keeps the
  continuation it stopped at: scan completeness (the runtimes' own full scans,
  every page read) stays separate from resolution progress, so items proved on
  complete scans remain acknowledgeable however many items remain, and the
  notice offers **Continue checking**, which resolves the next pages from the
  kept key within the same launch. Only a runtime scan reported incomplete, or
  a page the host could not read (until it is re-read), prohibits
  acknowledgement. A held or unknown prefix therefore never starves a later
  completion, every item is reached in a bounded number of continued pages,
  and no item is selected at random or by class. Nothing of this touches the
  runtime wire or any store, and no cap is raised.

## 5. Decisions for Root

- Whether a verified `write_refused` may ever free a wallet slot (the wallet
  keeps it held).
- Approval of amendment r20.1 (§1a): one `original_verified_effect_receipt_v1`
  chain per intended Dual effect, so a normal linked `case.open` intending
  two Dual actions can be proved; until then such a record is held (§4a).
- Whether a proved server-only write whose target object has since been
  deleted from Dual (`target_readback: "absent"`) may settle; the wallet holds
  it until decided.
- Whether acknowledged records should age out of the runtime store, and when
  (the wallet assumes they are retained with their original evidence).
