# Development interoperability with Studio's actual generated runtime (2026-10-16)

**Status:** development evidence, local fakes only. LOCAL FAKE PROVIDER:
fictional data, no live Dual, no live wallet, no credential, nothing
deployed. This record exists so the result can be assessed and re-run with the
exact version pairs below. It is not hosted acceptance and does not claim it.
Two runs are recorded: the first against Studio `a2b04b9` (the Warranty
receipt chain still held), the second against its direct child `4b20253`
(the chain proved end to end). The first is kept as it was.

## Run 1: version pair

| Side                 | Exact version                                                                                                                                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wallet (this repo)   | the commit this file is part of, branch `claude/inspiring-meitner-l94yi5-transfer-progress`, base `bc3a7b8`                                                    |
| Studio (read only)   | `DualOrg/governed-workflow-studio-app` commit `a2b04b9372a0076fa9e14dbc27526eddfa0ec2e9`, branch `claude/inspiring-meitner-l94yi5-transfer-accept`             |
| Studio runtime files | `src/product-face-runtime.mjs`, `src/product-face-cases.mjs`, `src/product-face-recovery.mjs` (`PRODUCT_FACE_RECOVERY_CONTRACT = "r20"`), contract revision 19 |
| Node                 | v22.22.0 (Studio CI uses Node 24; `package.json` pins no engine)                                                                                               |
| Studio install       | `npm ci --ignore-scripts` (no scripts run; nothing in Studio was edited)                                                                                       |

Studio's own suite for the three r20 operations at that commit,
`node --test test/product-face-write-outcome-recovery.test.mjs`: 4 tests, 4
pass.

## Run 1: what ran

Three local processes, from the documented integrated mode
(`docs/external-face-integration.md`, "Integrated mode with the real Studio
runtime"):

1. Studio's harness, which serves the ACTUAL emitted artifacts and the ACTUAL
   generated Passport and linked Warranty runtimes for Morrow Home and
   Tidewell on an in-process fake KV and a fake Dual:
   `node scripts/qa/product-face-harness.mjs --env-out <private file>` in the
   Studio checkout (runtime `http://localhost:4180`, fake Dual
   `http://127.0.0.1:4011`, wallet origin `http://demo.localhost:3000`, session
   holder `0x1234567890abcdef1234567890abcdef12345678`). The env file holds an
   ephemeral signing key; it was kept outside both repositories and deleted.
2. The wallet's fake api-v3, with the snippet and
   `MOCK_PROGRAMME_DUAL_URL=http://127.0.0.1:4011`: `node e2e/mock-api.mjs`.
3. The wallet in development on port 3000 (`npm run dev -- -p 3000`) with the
   snippet plus `API_URL=http://127.0.0.1:4010`, an ephemeral `SESSION_SECRET`,
   `VIEWER_BASE_DOMAIN=wallet.dual.network`,
   `DEFAULT_ORGANIZATION_ID=000000000000000000000001`,
   `NEXT_PUBLIC_APP_URL=http://demo.localhost:3000`.

One local adaptation was necessary and is itself a Studio dependency (below):
the harness snippet's registry entries name the linked Warranty runtime as
`linkedCases: {applicationId, origin}`; the wallet registry (and the shared
contract) take
`linkedRuntimes: [{purpose: "claims-warranty", applicationId, origin, instanceId}]`.
The snippet's `PRODUCT_FACE_APPLICATIONS` was rewritten to that form, with a
local `instanceId` (`tig-app-local-harness-warranty`; the wallet does not use
it operationally), before the wallet was started. Without this the registry
drops both entries fail-closed and every face answers `unknown_application`.

Harness state for the run (fresh process):

- Morrow Home: `studio.morrow-home@1.0.0`, artifact
  `sha256:ac6e10587cd31307d51f16391d12f3b3e2a730eddaf225561687a825a42d8ebe`,
  template `6abc3f71167e78a8c1419a01`; pre-set Transfer pending unit ARC-1003
  = object `6ab000000000000000000003`, registration `reg-harness-morr-0001`;
  registered unit ARC-1004 = object `6ab000000000000000000004` with an
  activated warranty case for the session holder (`clm-0ed0db7a2e098e1a` in
  this run; the id changes per harness start).
- Tidewell: `studio.tidewell@1.0.0`, artifact
  `sha256:0b00471a327031cdb50da5a6042837397628c974b266023e841a94259111253a`,
  template `7abc3f71167e78a8c1419a02`.

## Run 1, result 1: the holder's settle (G6) through the wallet, against the actual runtime

`node e2e/product-face-integrated-check.mjs` (exit 0):

```text
ok   sign in: 200
ok   artifact verified (context): 200
ok   select pending unit: 200
ok   trusted proposal read + template check: 200 psp-d85ac825c4fed9b5ed12a827
ok   journal begin: confirming
ok   journal confirm: confirmed
ok   journal submit: submitted
ok   runtime settle reservation won: won
ok   holder executes the exact proposal: 6ac000000000000000000018
ok   mint settle.verify assertion: 200
ok   runtime settle.verify: 200 registered
ok   wallet canonical status: registered {"owner_is_you":true,"state":"Authenticity verified"}
```

## Run 1, result 2: contract r20 through the wallet, against the actual runtimes

`PROBE_CASE=clm-0ed0db7a2e098e1a node e2e/product-face-r20-probe.mjs` (exit 0):

```text
ok   sign in: 200
ok   artifact verified (context): 200
ok   select registered unit: 200
ok   transfer.offer journal begin: 200 confirming
ok   transfer.offer journal confirm: 200 confirmed
ok   transfer.offer mint: 200
ok   transfer.offer dispatched by the face to the actual runtime: 200 transfer_offered
ok   wallet status read settles the offer from the runtime's write.status: 200 phase=settled status=authorized
ok   recovery.list through the wallet (actual runtime): 200 supported=true complete=true items=2 offer=write_applied ticket=yes
ok   recovery.ack of the proved outcome: 200 {"acknowledged":true,"first":true}
ok   recovery.ack replay is idempotent (first=false): 200 {"acknowledged":true,"first":false}
ok   transfer.cancel journal begin: 200 confirming
ok   transfer.cancel journal confirm: 200 confirmed
ok   transfer.cancel mint: 200
ok   transfer.cancel dispatched by the face to the actual runtime: 200 transfer_cancelled
ok   cancel settles from write.status: 200 phase=settled
ok   case.open journal begin: 200 confirming
ok   case.open journal confirm: 200 confirmed
ok   case.open mint: 200
ok   case.open dispatched by the face to the actual runtime: 200 case_updated
ok   wallet status read of case.open (two intended effects: mint + update): 200 phase=assertion_issued status=authorized
ok   case.evidence.submit journal begin: 200 confirming
ok   case.evidence.submit journal confirm: 200 confirmed
ok   case.evidence.submit mint: 200
ok   case.evidence.submit dispatched by the face to the actual runtime: 200 case_updated
ok   wallet status read of the Dual-backed write (settled only from a proved receipt chain, else held): 200 phase=assertion_issued status=authorized
ok   recovery.list names the case writes (Warranty runtime scan through the wallet): 200 supported=true complete=true open=outcome_unknown evidence=outcome_unknown ticket=no
info direct write.status without a wallet assertion: 403 face_linked_application_not_allowed
PROBE PASSED
```

## Run 1: what it showed, and what it did not

Shown against the actual generated runtime, with the wallet's own validation
(§0 echo, `contract: "r20"`, accounting at zero, identity against the
session, host and binding) on every answer:

- A Passport runtime write (`transfer.offer`, then `transfer.cancel`) is
  settled by the wallet only from the runtime's `write.status` answer
  (`write_applied`, server-only effect, fresh target readback verified).
- The wallet's recovery listing scans the Passport runtime and the linked
  Warranty runtime, lists the proved offer `write_applied` with a ticket,
  acknowledges it (`first: true`) and treats the replay as idempotent
  (`first: false`).
- Warranty case writes reach the Warranty runtime through the Passport
  runtime's relay with the wallet's Warranty-audience assertion.
- Nothing was re-sent by the wallet at any step.

Not shown (release blockers recorded by the coordinating reviewer):

- **No r20.1 proof of a Warranty write.** Both case writes stayed held and
  were listed `outcome_unknown`. For `case.open` this is Studio's known gap at
  a2b04b9 (`original_receipt_missing`: the mint's content is never observed
  between mint and update). For `case.evidence.submit` the runtime also
  answered `409 write_outcome_unknown`; the reason is not observable through
  the wallet (the 409 carries no echo and the wallet surfaces no reason), so
  the Studio owner must state it. Until a Warranty write is proved
  `write_applied` with a verified receipt chain against the actual runtime,
  the complete customer outcome (registration → service → transfer in one
  launch) is not demonstrated.
- The harness sets no `TIG_PRODUCT_FACE_WALLET_ENTRY`, so the face handover
  entry (`/products/[slug]/handover`) was not exercised against it.

## Run 1: dependencies recorded for Root (Studio side)

1. The harness snippet (`scripts/qa/product-face-harness.mjs`, line 157 at
   a2b04b9) emits `linkedCases`; the shared contract and Studio's own
   publication module (`linkedRuntimesFor` in
   `src/studio-product-face-publication.mjs`) emit `linkedRuntimes`. The
   wallet keeps the contract form.
2. The pinned r20 text says every answer carries the §0 echo. The actual
   runtime's `409 write_outcome_unknown` (and other refusals through
   `recoveryRefusal`) carry none. The wallet treats such an answer as unbound:
   it proves nothing, settles nothing and marks nothing. Root decides whether
   the text applies to refusals (a Studio change) or is amended; the wallet
   does not treat the difference as agreed compatibility.
3. The Warranty r20.1 proof above.

## Run 2: version pair

| Side                 | Exact version                                                                                                                                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wallet (this repo)   | `d2f7416` (the retention repair, the listing-only discoverability gate and its race fix), plus the probe extension committed with this record                                                                                               |
| Studio (read only)   | `DualOrg/governed-workflow-studio-app` commit `4b20253de6707703ec638e16bcc30fc2cc37aa14`, direct child of `a2b04b9372a0076fa9e14dbc27526eddfa0ec2e9`, same branch                                                                           |
| Studio runtime files | changed since run 1: `api/purpose-runtime.mjs`, `src/dual-activation.mjs`, `src/product-face-cases.mjs`, `src/product-face-recovery.mjs`, `src/product-face-runtime.mjs` (no dependency change; the same `npm ci --ignore-scripts` install) |
| Node                 | v22.22.0                                                                                                                                                                                                                                    |

Studio's own suites at `4b20253`:
`node --test test/product-face-write-outcome-recovery.test.mjs`: 4 of 4
pass. `test/product-face-wallet-consumer-interop.test.mjs`, Studio's
producer/consumer test, which loads the wallet's real consumer modules
(`api/face-runtime.ts`, `api/face-artifact.ts`, `api/face-assertion.ts`,
`app/_domain/product-face.ts`) from a git checkout and validates the real
runtimes' answers with them: run with
`DUAL_WALLET_CHECKOUT=/home/user/dual-wallet DUAL_WALLET_COMMIT=d2f7416`,
1 of 1 pass (its default pin is `bc3a7b8`; it is skipped without the
checkout variable).

The same three processes as run 1, the same local adaptation of the harness
snippet (`linkedCases` → `linkedRuntimes`; the harness at `4b20253` still
writes `linkedCases`), a fresh harness per run. Harness state: Morrow Home
artifact `sha256:ac6e10587cd31307d51f16391d12f3b3e2a730eddaf225561687a825a42d8ebe`,
registered unit ARC-1004 = object `6ab000000000000000000004`, case
`clm-e80c9e0f63963302` in this run.

## Run 2, result 1: the holder's settle (G6), Studio `4b20253`

`node e2e/product-face-integrated-check.mjs` (exit 0):

```text
ok   sign in: 200
ok   artifact verified (context): 200
ok   select pending unit: 200
ok   trusted proposal read + template check: 200 psp-0c116f3e59eeeffbdc49661a
ok   journal begin: confirming
ok   journal confirm: confirmed
ok   journal submit: submitted
ok   runtime settle reservation won: won
ok   holder executes the exact proposal: 6ac000000000000000000018
ok   mint settle.verify assertion: 200
ok   runtime settle.verify: 200 registered
ok   wallet canonical status: registered {"owner_is_you":true,"state":"Authenticity verified"}
```

## Run 2, result 2: contract r20 and r20.1 through the wallet, Studio `4b20253`

`PROBE_CASE=clm-e80c9e0f63963302 node e2e/product-face-r20-probe.mjs`
(exit 0). The probe now also acknowledges both case writes and, as step C,
lists this actor again from a fresh launch (new launch id, empty journal):

```text
ok   sign in: 200
ok   artifact verified (context): 200
ok   select registered unit: 200
ok   transfer.offer journal begin: 200 confirming
ok   transfer.offer journal confirm: 200 confirmed
ok   transfer.offer mint: 200
ok   transfer.offer dispatched by the face to the actual runtime: 200 transfer_offered
ok   wallet status read settles the offer from the runtime's write.status: 200 phase=settled status=authorized
ok   recovery.list through the wallet (actual runtime): 200 supported=true complete=true items=2 offer=write_applied ticket=yes
ok   recovery.ack of the proved outcome: 200 {"acknowledged":true,"first":true}
ok   recovery.ack replay is idempotent (first=false): 200 {"acknowledged":true,"first":false}
ok   transfer.cancel journal begin: 200 confirming
ok   transfer.cancel journal confirm: 200 confirmed
ok   transfer.cancel mint: 200
ok   transfer.cancel dispatched by the face to the actual runtime: 200 transfer_cancelled
ok   cancel settles from write.status: 200 phase=settled
ok   case.open journal begin: 200 confirming
ok   case.open journal confirm: 200 confirmed
ok   case.open mint: 200
ok   case.open dispatched by the face to the actual runtime: 200 case_updated
ok   wallet status read of case.open (two intended effects: mint + update): 200 phase=settled status=authorized
ok   case.evidence.submit journal begin: 200 confirming
ok   case.evidence.submit journal confirm: 200 confirmed
ok   case.evidence.submit mint: 200
ok   case.evidence.submit dispatched by the face to the actual runtime: 200 case_updated
ok   wallet status read of the Dual-backed write (settled only from a proved receipt chain, else held): 200 phase=settled status=authorized
ok   recovery.list names the case writes (Warranty runtime scan through the wallet): 200 supported=true complete=true open=write_applied evidence=write_applied ticket=yes
ok   recovery.ack of the proved case.open: 200 {"acknowledged":true,"first":true}
ok   recovery.ack of the proved case.evidence.submit: 200 {"acknowledged":true,"first":true}
ok   a fresh launch's listing no longer names this probe's acknowledged writes: 200 supported=true complete=true leftover=[]
info direct write.status without a wallet assertion: 403 face_linked_application_not_allowed
PROBE PASSED
```

## Run 2: what it shows

Everything run 1 showed, and in addition, against the actual Warranty
runtime with the wallet's r20.1 reader (`api/face-runtime.ts`, every §1a
check: intent commitment recomputed from the retained preimage, one original
receipt per intended effect with the raw provider hash, historical
corroboration from the action log with the exact history entry, authority
exact, verdict verified):

- the ordinary `case.open` (two intended Dual effects, a mint and its update)
  is proved `write_applied` through both receipts and settled by the wallet
  from that answer alone;
- `case.evidence.submit` (one effect) is proved and settled the same way;
- the recovery listing names both `write_applied` with tickets; both are
  acknowledged (`first: true`), and a fresh launch's listing no longer names
  any of this probe's acknowledged writes (`leftover=[]`), so the service
  journey's recovery closes without a cookie.

With run 1, the customer path (registration and settle, service writes,
transfer offer and cancel) is therefore demonstrated against the actual
generated runtimes in development, including recovery and acknowledgement.
Not demonstrated here: hosted acceptance (Root's), the face handover entry
(the harness still sets no `TIG_PRODUCT_FACE_WALLET_ENTRY`), and a
Dual-backed write whose outcome stays unresolved for long (the fixture tests
in `api/wallet-host-brands.test.ts` cover the wallet's holding and listing
behaviour for that case).

## Remaining dependencies after run 2 (Studio side, for Root)

1. The harness snippet still emits `linkedCases` (`scripts/qa/product-face-harness.mjs`
   line 157 at `4b20253`); the local adaptation above was needed again.
2. Refusals (`409 write_outcome_unknown` through `recoveryRefusal`) still
   carry no §0 echo. The wallet reads no refusal as bound; the text question
   stays with Root.
3. Studio's consumer interop test pins `bc3a7b8` by default; the delivered
   candidate is `d2f7416` (it passes with that pin set explicitly).

## Re-running

In the Studio checkout at the recorded commit (`a2b04b9` for run 1,
`4b20253` for run 2): `npm ci --ignore-scripts`, then the harness command
above. In this repository: adapt the snippet's registry
entries as described, start the fake api-v3 and the wallet in development,
then run `node e2e/product-face-integrated-check.mjs` and
`PROBE_CASE=<the printed case id for ARC-1004> node e2e/product-face-r20-probe.mjs`.
Each harness start resets its state (a settle proposal is consumed by one
check), so start a fresh harness per run.
