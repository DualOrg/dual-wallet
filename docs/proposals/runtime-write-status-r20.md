# Proposed contract r20: runtime write outcome read (`write.status`)

Status: **PROPOSED, NOT DEPLOYED, NOT SUPPORTED by any Studio runtime
today.** Owner of the runtime side: Studio (through Root). This is the wallet's
precise requirement. The wallet consumer that uses it fails closed: against
today's runtimes nothing is settled from it, and a full launch still needs
"Restart the application". The wallet tests exercise it only against a
labelled local fixture of this proposal; that is not delivery.

## Why it is needed

A face runtime write (`case.open`, `case.evidence.submit`,
`case.information.provide`, `case.quote.approve`, `case.quote.decline`,
`transfer.offer`, `transfer.cancel`) is sent by the face itself with a
one-time wallet assertion. The wallet never sees its answer, so its launch
journal entry stays `assertion_issued` and is never evicted
(`JOURNAL_MAX_ENTRIES` = 6). An ordinary registration, Warranty & Service and
transfer journey therefore exhausts one launch (`journal_full`, 409).

No existing contract proves such a write's outcome by its original operation
id: `case.read` and `cases.list` carry no per-operation history, write answers
do not echo the operation id, durable per-operation journals and
`face_operation_not_found` are specified only for registration, settle and
transfer steps, and the trusted-read allowlist is
`registration.settle.propose` and `case.read`
(`contracts/dual-product-face-v1.json`; `api/face-runtime.ts`).

## Operation and path

- `POST /api/product-face/v1/operations` (existing endpoint), body
  `{operation: "write.status", operationId, target, input: {}, assertion}`,
  with the existing `x-tig-product-face-application` routing header.
- Served by the runtime that served the ORIGINAL write: the linked Warranty
  runtime (`linkedRuntimes[purpose=claims-warranty]`) for `case.*`, the face's
  own runtime for `transfer.offer` and `transfer.cancel`.
- Host-only: called server to server by the wallet BFF; a face is never
  authorised for it (`hostOnlyRuntimeOperations`). A request with an `Origin`
  header is refused, as for `transfer.propose`. Zero writes.

## Assertion

A normal wallet assertion (contract `assertion.claims`) minted by the wallet
BFF for the read:

- `operation` = `write.status`; `op_id` = the ORIGINAL write's operation id;
- `target` = the ORIGINAL write's `{object_id, case_id?}` (quote fields are not
  part of it);
- `request_hash` = `sha256:` hex of the canonical JSON
  `{input: {}, operation: "write.status", operationId, target}`;
- `aud` = `<applicationId>@<origin>` of the runtime that served the original
  write; `iss` = the wallet host origin; `sub` = wallet id; `holder` = session
  wallet account address; `app_version`, `artifact`, `programme` = the face
  binding the host serves now; `jti` consumed once.

The runtime verifies it exactly as any operation (`assertion.verifier`)
BEFORE it looks anything up.

## Runtime obligations

### 1. Durable write record

Every runtime write records, atomically with its effect (same transaction as
the canonical store change, or the same outbox entry), an immutable record
keyed by `(applicationId, op_id)`:

`{operation, target, request_hash (of the write request), holder, sub, iss,
aud, programme, artifact {version, artifactHash} (the write assertion's),
outcome, receipt, unresolved, recordedAt}`

- `outcome: "applied"` only when the write's effect is committed in the
  runtime's canonical store (the Warranty case store; the transfer offer
  store). Accepted, queued or outbox-dispatched is NOT applied.
- `receipt` names the committed effect: `{kind: "case_event", case_id,
event_id}` (the case event that write appended, readable in the case store
  under that id) or `{kind: "transfer_offer", offer_id, state}`.
- `unresolved` counts outcomes of that write the runtime itself cannot yet
  decide (for example a provider or Dual write still in flight). A write that
  needs a Dual change keeps its existing canonical Dual readback requirement;
  it is applied only once that readback agrees.
- `outcome: "refused"` when definitively refused with zero writes.

### 2. Replay and reuse of an operation id

A write whose `op_id` is already recorded is answered as follows, after the
assertion is verified:

- same `holder`, `sub`, `aud`, `iss`, `programme`, `operation`, `target` and
  `request_hash` as the record: the recorded answer, with no second effect;
- anything else: `409 {status: "face_operation_conflict"}`, zero writes, and
  nothing of the record disclosed.

### 3. The read

The runtime answers `200` only when ALL hold:

- a record exists for `(applicationId, op_id)`;
- its `holder`, `sub`, `aud` and `target` equal the read assertion's;
- its `iss` equals the read assertion's `iss` (the same wallet host origin);
- the record's artifact and the read assertion's artifact are both in the
  runtime's current approved compatible set for the application (contract r17
  set A). This is the proof that an approved, compatible face or host
  configuration update in between does not orphan the write, and that an
  incompatible one cannot read it.

Otherwise `404 {status: "face_operation_not_found"}`, with the same body for
"no record" and "another caller's record", so nothing is disclosed.

## Result schema

```json
{
  "ok": true,
  "status": "write_applied",
  "contract": "r20",
  "readback": "verified",
  "artifact_compatible": true,
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
  "receipt": { "kind": "case_event", "case_id": "", "event_id": "" },
  "writesExecuted": 0,
  "dualWritesExecuted": 0,
  "unknownWriteOutcomes": 0,
  "secretReturned": false
}
```

- `readback: "verified"` means the runtime re-read its canonical store at this
  read and found the receipt's effect, not merely the record.
- `unknownWriteOutcomes` is the record's `unresolved`; it must be `0`.
- `status: "write_refused"` for a refused record (same fields, `receipt:
null`).

Negative and unknown answers (zero writes, never a guess):

- `404 face_operation_not_found`: no record for this caller (unknown: in
  flight, never consumed, lost before the runtime, or another caller's).
- `409 {status: "write_outcome_unknown"}`: a record exists but is unresolved.
- `409 face_operation_artifact_retired`: the record's or the read's artifact
  is outside set A.
- An old runtime answers its refusal for an unknown operation
  (`400 face_request_invalid`); that is "unsupported", never an outcome.

## Wallet verification: the only path that frees a slot

The wallet moves an entry to `settled` (which lets it make room) only when ALL
hold; otherwise it stays `assertion_issued` and keeps its slot:

- `200`, `ok: true`, `status: "write_applied"`, `contract: "r20"`,
  `readback: "verified"`, `artifact_compatible: true`,
  `unknownWriteOutcomes: 0`, `secretReturned: false`;
- `operation_id`, `operation`, `target.object_id`, `target.case_id` equal the
  journal entry's;
- `request_hash` equals the hash the wallet recorded for the entry when it
  issued the write's assertion (an entry issued before the wallet recorded
  one is never settled from a read);
- `holder` and `wallet` equal the session's; `issuer` equals this host's
  origin; `application_id` equals the runtime the wallet routed the read to;
  `programme` equals the binding's;
- `asserting_artifact` equals the face binding the host serves now (version
  and artifact hash), and `artifact_compatible` is the runtime's proof that
  the recorded artifact is compatible with it;
- `receipt` is a `case_event` for the entry's case (case writes) or a
  `transfer_offer` (transfer writes).

The journal itself is sealed to the session, wallet, face slug, programme and
launch, so a host configuration update that keeps the organisation, origin and
programme (an engine-compatible update) continues it, and one that changes
any of them reads nothing (tested in `api/wallet-host-brands.test.ts`). The
host configuration hash is deliberately not part of the binding: it changes
with every approved compatible update.

`write_refused`, `404`, `409`, any other status, a malformed or oversized
body, a timeout or an unsupported runtime: held, outcome unknown, nothing
re-sent. The wallet never re-sends a write to learn its outcome.

## When the wallet reads

- On the face's operation status read of a held write.
- When a `begin` finds no finished entry to make room: the two oldest held
  writes are read; only a proven one makes room; otherwise `journal_full`.

No deployment flag is required. The answer's `contract: "r20"` is mandatory;
anything without it is unsupported.

## Lifetime of unresolved history: what the wallet guarantees, and what needs the runtime

- The wallet never evicts an unresolved entry to make room, never ages one
  out of a journal, and never drops a launch cookie that holds one to stay
  within its four-launch budget: a new launch that would need that is refused
  `launch_capacity`.
- Each launch cookie still expires 24 hours after its own last write. That is
  a bounded lifetime of the browser's copy, not durable preservation; the
  wallet does not raise it.
- Durable preservation beyond that needs the runtime's own record (above) plus
  a holder-scoped listing, so a fresh launch or sign-in can find unresolved
  writes without the browser's copy: **dependency** `write.unresolved.list`
  (host-only, assertion target `{object_id}`, answers the holder's records for
  that unit with `unresolved > 0` or no receipt yet, bound as above). Not
  implemented in the wallet until the runtime contract exists.

## Open decisions for Root

- Whether `write_refused` (a definitive zero-write refusal, verified as above)
  may free a slot. The wallet keeps it held (Root rule: unapplied outcomes
  stay held).
- Whether `write.unresolved.list` is part of r20 or a follow-up.
