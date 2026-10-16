# Proposed contract r20: runtime write outcome read (`write.status`)

Status: **PROPOSED, NOT DEPLOYED, NOT SUPPORTED by any Studio runtime
today.** Owner of the runtime side: Studio (via Root). This file is the wallet's
precise requirement; the wallet consumer that uses it fails closed when a
runtime does not answer exactly as below.

## Why it is needed

A face runtime write (`case.open`, `case.evidence.submit`,
`case.information.provide`, `case.quote.approve`, `case.quote.decline`,
`transfer.offer`, `transfer.cancel`) is sent by the face itself with a
one-time wallet assertion. The wallet never sees its answer. Its launch journal
entry therefore stays `assertion_issued` and is never evicted
(`JOURNAL_MAX_ENTRIES` = 6), so a normal registration, Warranty & Service and
transfer journey exhausts one launch's journal (`journal_full`, 409).

No existing contract proves a runtime write's outcome by its original
operation id: `case.read` and `cases.list` carry no per-operation history; write
answers do not echo the operation id; `face_operation_not_found` and durable
per-operation journals are specified only for registration, settle and transfer
steps; the trusted-read allowlist is `registration.settle.propose` and
`case.read` (contracts/dual-product-face-v1.json `runtimeOperations`,
`trustedRuntimeReads`; api/face-runtime.ts).

## Operation and path

- `POST /api/product-face/v1/operations` (existing endpoint), body
  `{operation: "write.status", operationId, target, input: {}, assertion}`, with
  the existing `x-tig-product-face-application` routing header.
- Served by the runtime that served the ORIGINAL write: the linked Warranty
  runtime (`linkedRuntimes[purpose=claims-warranty]`) for `case.*`, the face's
  own runtime for `transfer.offer` / `transfer.cancel`.
- Host-only: called server to server by the wallet BFF. A face is never
  authorised to mint it (it joins `hostOnlyRuntimeOperations`). An `Origin`
  header is refused, as for `transfer.propose`.

## Assertion

A normal wallet assertion (contract `assertion.claims`), minted by the wallet
BFF:

- `operation` = `write.status`
- `op_id` = the ORIGINAL write's operation id
- `target` = the ORIGINAL write's `{object_id, case_id?}` (quote fields are not
  part of the status target)
- `request_hash` = `sha256:` hex of the canonical JSON
  `{input: {}, operation: "write.status", operationId, target}` (the existing
  `runtimeRequestHash` over the request minus the assertion)
- `aud` = `<applicationId>@<origin>` of the runtime that served the original
  write; `sub` = wallet id; `holder` = session wallet account address; `jti`
  consumed once as for every operation.

The runtime verifies it exactly as any other operation (`assertion.verifier`).

## Runtime obligations (durable write record)

1. Every runtime write records, atomically with its effect (same transaction
   or outbox), a durable record keyed by `(applicationId, op_id)`:
   `{operation, target, request_hash (of the write request), holder, sub,
programme, artifact {version, artifactHash}, outcome, recordedAt}` where
   `outcome` is `applied` (the write took effect) or `refused` (definitively
   refused with zero writes, recorded against that op id).
2. A second write with an already-recorded `op_id` performs no write and
   answers the recorded result (idempotent replay), whatever its assertion.
3. A write that has not reached the record (in flight, lost before the
   runtime, assertion never consumed) has no record.

## Result schema

`200` only when a record exists for `(applicationId, op_id)` AND its `holder`
and `sub` equal the status assertion's:

```json
{
  "ok": true,
  "status": "write_applied" | "write_refused",
  "contract": "r20",
  "operation_id": "<op_id>",
  "operation": "<recorded write operation>",
  "target": { "object_id": "<24 hex>", "case_id": "<case id, when recorded>" },
  "request_hash": "sha256:<recorded write request hash>",
  "holder": "<recorded holder>",
  "wallet": "<recorded sub>",
  "application_id": "<serving applicationId>",
  "programme": "<recorded programme>",
  "writesExecuted": 0,
  "dualWritesExecuted": 0,
  "unknownWriteOutcomes": 0,
  "secretReturned": false
}
```

Negative and unknown answers (zero writes, never a guess):

- `404 {status: "face_operation_not_found"}`: no record (unknown; in flight,
  never consumed, or lost before the runtime). Not proof of anything.
- `403 {status: "not_holder"}`: a record exists for another holder or wallet.
  It must not disclose the record.
- `409 {status: "write_outcome_unknown"}`: the runtime itself cannot decide
  (for example an outbox not yet resolved).
- An old runtime answers its existing refusal for an unknown operation
  (`400 face_request_invalid`); that is "unsupported", never an outcome.

## Wallet verification (the only path that frees a journal slot)

The wallet settles an entry (phase `settled`, which makes room) only when ALL
hold; otherwise the entry stays `assertion_issued` and keeps its slot:

- the answer is `200`, `ok: true`, `status: "write_applied"`,
  `contract: "r20"`;
- `operation_id`, `operation`, `target.object_id` and `target.case_id` (both
  absent or equal) equal the journal entry's;
- `request_hash` equals the request hash the wallet recorded at issue for that
  entry (entries issued before this change recorded none and are never
  settled from a read);
- `holder` equals the session wallet account address, `wallet` the session
  wallet id;
- `application_id` equals the applicationId of the runtime the wallet routed
  the read to, and `programme` the binding's programme on the currently active
  host configuration (the journal itself is sealed to the session, wallet,
  slug, programme and launch).

`write_refused`, `404`, `403`, `409`, any other status, a malformed or
oversized body, a timeout or an unsupported runtime: held, outcome unknown,
nothing re-sent. The wallet never re-sends a write to learn its outcome.

## Capability and version negotiation

- No deployment flag is required: the wallet tries the read only for a held
  write entry (its operation status read, or when a `begin` would otherwise be
  refused `journal_full`), and treats anything but the exact `r20` answer above
  as unsupported or unknown.
- The answer's `contract: "r20"` is mandatory; a runtime that answers without
  it is treated as unsupported.
- Studio may additionally publish support in its runtime support declaration
  (as `PRODUCT_FACE_RUNTIME_TRANSITION_SUPPORT` does); the wallet does not rely
  on it.

## Residual

- A write whose record is missing (`404`) keeps its slot until the launch
  journal prunes it (7 days); the wallet's "Restart the application" notice
  remains the escape hatch for that case.
- `write_refused` is deliberately not used to free a slot (Root rule:
  unapplied outcomes stay held).
