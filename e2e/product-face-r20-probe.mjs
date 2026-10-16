// LOCAL r20 INTEROPERABILITY PROBE against the real Studio product-face
// harness (scripts/qa/product-face-harness.mjs in the Studio repository). It
// drives the wallet BFF exactly as the browser host does and the ACTUAL
// generated runtimes of the harness for the holder's registered unit:
//   A. a Passport runtime write, transfer.offer, then transfer.cancel
//      (server-only effects): journal, mint, the face's own dispatch to the
//      runtime, then the wallet's status read, which settles each only from
//      the runtime's r20 write.status answer; the wallet's recovery listing
//      of the proved outcome, its acknowledgement and the idempotent replay;
//   B. two linked Warranty runtime writes, case.open and case.evidence.submit
//      (Dual-backed, r20.1), relayed by the Passport runtime. The wallet
//      holds them unless the runtime proves the receipt chain; the recovery
//      listing names them with their outcome. Nothing is ever re-sent.
// Local fakes only; fictional data; nothing live. Prints one line per step
// and exits non-zero on a failing step.
//
//   PROBE_CASE=<the harness's case id for ARC-1004> node e2e/product-face-r20-probe.mjs
//
// Expects the wallet on 127.0.0.1:3000 (tenant host demo.localhost:3000) in
// development, the fake api-v3 with MOCK_PROGRAMME_DUAL_URL, and the harness
// on 4180/4011 (see docs/external-face-integration.md, integrated mode).
import { createHash } from "node:crypto";
import http from "node:http";

const SLUG = "morrow-home";
const PASSPORT_APP = "studio.morrow-home";
const WARRANTY_APP = "studio.morrow-home.service";
const OBJECT = process.env.PROBE_OBJECT || "6ab000000000000000000004";
const CASE = process.env.PROBE_CASE || "";
const RUNTIME = "http://localhost:4180";
const TENANT = "demo.localhost:3000";
const stamp = Date.now().toString(36);
const LAUNCH = createHash("sha256")
  .update(`launch-${stamp}`)
  .digest("base64url")
  .slice(0, 32);

const jar = new Map();
const cookie = () =>
  [...jar].map(([key, value]) => `${key}=${value}`).join("; ");

function call(method, path, body, launch = LAUNCH) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const request = http.request(
      {
        host: "127.0.0.1",
        port: 3000,
        method,
        path,
        headers: {
          host: TENANT,
          origin: `http://${TENANT}`,
          "x-dual-face-launch": launch,
          "content-type": "application/json",
          cookie: cookie(),
          ...(data ? { "content-length": Buffer.byteLength(data) } : {}),
        },
      },
      (response) => {
        for (const line of response.headers["set-cookie"] ?? []) {
          const [pair] = line.split(";");
          const [key, value] = pair.split("=");
          if (value) jar.set(key, value);
          else jar.delete(key);
        }
        let raw = "";
        response.on("data", (chunk) => (raw += chunk));
        response.on("end", () => {
          let parsed = {};
          try {
            parsed = JSON.parse(raw);
          } catch {
            // Non-JSON body: reported as an empty object.
          }
          resolve({ status: response.statusCode, body: parsed });
        });
      },
    );
    request.on("error", reject);
    if (data) request.write(data);
    request.end();
  });
}

const canonical = (value) =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : value && typeof value === "object"
      ? `{${Object.keys(value)
          .filter((key) => value[key] !== undefined)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(",")}}`
      : JSON.stringify(value);
const sha256 = (text) =>
  `sha256:${createHash("sha256").update(text).digest("hex")}`;

let failures = 0;
function step(name, result, ok) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${result}`);
  if (!ok) failures += 1;
  return ok;
}

const faces = `/api/faces/${SLUG}`;

async function runtimeWrite({
  app,
  operation,
  operationId,
  target,
  input,
  contextId,
}) {
  for (const transition of ["begin", "confirm"]) {
    const result = await call(
      "POST",
      `${faces}/operations`,
      transition === "begin"
        ? {
            transition,
            kind: "runtime",
            operation,
            operation_id: operationId,
            object_id: target.object_id,
            ...(target.case_id ? { case_id: target.case_id } : {}),
            context_id: contextId,
          }
        : { transition, operation_id: operationId, context_id: contextId },
    );
    step(
      `${operation} journal ${transition}`,
      `${result.status} ${result.body.operation?.phase ?? result.body.code}`,
      result.status === 200,
    );
  }
  const requestHash = sha256(
    canonical({ operation, operationId, target, input }),
  );
  const minted = await call("POST", `${faces}/assertions`, {
    operation,
    operation_id: operationId,
    target,
    request_hash: requestHash,
    context_id: contextId,
  });
  step(
    `${operation} mint`,
    `${minted.status} ${minted.body.code ?? ""}`,
    minted.status === 200,
  );
  if (minted.status !== 200) return undefined;
  const sent = await fetch(`${RUNTIME}/api/product-face/v1/operations`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // The face's own origin: the actual runtime accepts a face request only
      // from the face it serves, and relays case.* to the linked Warranty
      // runtime itself (that runtime refuses any Origin: server to server).
      "x-tig-product-face-application": app,
      origin: RUNTIME,
    },
    body: JSON.stringify({
      operation,
      operationId,
      target,
      input,
      assertion: minted.body.assertion,
    }),
  });
  const answer = await sent.json();
  step(
    `${operation} dispatched by the face to the actual runtime`,
    `${sent.status} ${answer.status}`,
    sent.status === 200,
  );
  return answer;
}

const login = await call("POST", "/api/session/login", {
  email: "face-e2e@example.com",
  password: "correct horse battery staple",
});
step("sign in", login.status, login.status === 200);
const context = await call("GET", `${faces}/context`);
step(
  "artifact verified (context)",
  `${context.status} ${context.body.code ?? ""}`,
  context.status === 200,
);
if (context.status !== 200) process.exit(1);
const selection = await call("POST", `${faces}/selection`, {
  object_id: OBJECT,
});
const contextId = selection.body.context_id;
step(
  "select registered unit",
  `${selection.status} ${selection.body.code ?? ""}`,
  Boolean(contextId),
);
if (!contextId) process.exit(1);

// ---- A. transfer.offer on the Passport runtime (server-only effect)
const offerOp = `offer-probe-${stamp}`;
const offered = await runtimeWrite({
  app: PASSPORT_APP,
  operation: "transfer.offer",
  operationId: offerOp,
  target: { object_id: OBJECT },
  input: {},
  contextId,
});
if (offered) {
  const status = await call("GET", `${faces}/operations/${offerOp}`);
  step(
    "wallet status read settles the offer from the runtime's write.status",
    `${status.status} phase=${status.body.phase} status=${status.body.status}`,
    status.status === 200 && status.body.phase === "settled",
  );
  const listing = await call("GET", `${faces}/recovery`);
  const item = (listing.body.items ?? []).find(
    (entry) => entry.operation_id === offerOp,
  );
  step(
    "recovery.list through the wallet (actual runtime)",
    `${listing.status} supported=${listing.body.supported} complete=${listing.body.complete} items=${(listing.body.items ?? []).length} offer=${item?.outcome ?? "absent"} ticket=${item?.ticket ? "yes" : "no"}`,
    listing.status === 200 && listing.body.supported === true,
  );
  if (item?.ticket) {
    const ack = await call("POST", `${faces}/recovery/ack`, {
      operation_id: offerOp,
      ticket: item.ticket,
    });
    step(
      "recovery.ack of the proved outcome",
      `${ack.status} ${JSON.stringify(ack.body)}`,
      ack.status === 200 && ack.body.acknowledged === true,
    );
    const again = await call("POST", `${faces}/recovery/ack`, {
      operation_id: offerOp,
      ticket: item.ticket,
    });
    step(
      "recovery.ack replay is idempotent (first=false)",
      `${again.status} ${JSON.stringify(again.body)}`,
      again.status === 200 && again.body.first === false,
    );
  }
  // Tidy: cancel the offer through the same path so the unit is not left offered.
  const offerId = offered.offer?.offer_id;
  if (offerId) {
    const cancelOp = `cancel-probe-${stamp}`;
    await runtimeWrite({
      app: PASSPORT_APP,
      operation: "transfer.cancel",
      operationId: cancelOp,
      target: { object_id: OBJECT },
      input: { offer_id: offerId },
      contextId,
    });
    const status = await call("GET", `${faces}/operations/${cancelOp}`);
    step(
      "cancel settles from write.status",
      `${status.status} phase=${status.body.phase}`,
      status.body.phase === "settled",
    );
  }
}

// ---- B. case.open then case.evidence.submit on the linked Warranty runtime
// (Dual-backed, r20.1): the face posts them to its own Passport runtime, which
// relays to the Warranty runtime (server to server).
if (CASE) {
  const target = { object_id: OBJECT, case_id: CASE };
  const openOp = `case-open-probe-${stamp}`;
  const opened = await runtimeWrite({
    app: PASSPORT_APP,
    operation: "case.open",
    operationId: openOp,
    target,
    input: {
      claimType: "fault",
      problemStatement: "The base cracked after a week (fictional probe).",
    },
    contextId,
  });
  if (opened) {
    const status = await call("GET", `${faces}/operations/${openOp}`);
    step(
      "wallet status read of case.open (two intended effects: mint + update)",
      `${status.status} phase=${status.body.phase} status=${status.body.status}`,
      status.status === 200,
    );
  }
  const evidenceOp = `case-probe-${stamp}`;
  const answer = await runtimeWrite({
    app: PASSPORT_APP,
    operation: "case.evidence.submit",
    operationId: evidenceOp,
    target,
    input: {
      evidenceItems: [
        {
          requirementId: "photo",
          reference: "Photo of the base, probe-01.jpg",
        },
      ],
    },
    contextId,
  });
  if (answer) {
    const status = await call("GET", `${faces}/operations/${evidenceOp}`);
    step(
      "wallet status read of the Dual-backed write (settled only from a proved receipt chain, else held)",
      `${status.status} phase=${status.body.phase} status=${status.body.status}`,
      status.status === 200,
    );
    const listing = await call("GET", `${faces}/recovery`);
    const item = (listing.body.items ?? []).find(
      (entry) => entry.operation_id === evidenceOp,
    );
    const openItem = (listing.body.items ?? []).find(
      (entry) => entry.operation_id === openOp,
    );
    step(
      "recovery.list names the case writes (Warranty runtime scan through the wallet)",
      `${listing.status} supported=${listing.body.supported} complete=${listing.body.complete} open=${openItem?.outcome ?? "absent"} evidence=${item?.outcome ?? "absent"} ticket=${item?.ticket ? "yes" : "no"}`,
      listing.status === 200 && Boolean(item),
    );
    for (const [label, op, listedItem] of [
      ["case.open", openOp, openItem],
      ["case.evidence.submit", evidenceOp, item],
    ]) {
      if (!listedItem?.ticket) continue;
      const ack = await call("POST", `${faces}/recovery/ack`, {
        operation_id: op,
        ticket: listedItem.ticket,
      });
      step(
        `recovery.ack of the proved ${label}`,
        `${ack.status} ${JSON.stringify(ack.body)}`,
        ack.status === 200 && ack.body.acknowledged === true,
      );
    }
    // C. Service recovery closed: a fresh launch (new id, empty journal, no
    // cookie of this launch) lists this actor from the runtimes' own stores;
    // none of this probe's acknowledged writes is listed again, and nothing
    // of this probe is left unresolved.
    const freshLaunch = createHash("sha256")
      .update(`launch-fresh-${stamp}`)
      .digest("base64url")
      .slice(0, 32);
    const fresh = await call(
      "GET",
      `${faces}/recovery`,
      undefined,
      freshLaunch,
    );
    const mine = new Set([offerOp, openOp, evidenceOp]);
    const leftover = (fresh.body.items ?? []).filter((entry) =>
      mine.has(entry.operation_id),
    );
    step(
      "a fresh launch's listing no longer names this probe's acknowledged writes",
      `${fresh.status} supported=${fresh.body.supported} complete=${fresh.body.complete} leftover=${JSON.stringify(leftover.map((entry) => [entry.operation_id, entry.outcome]))}`,
      fresh.status === 200 &&
        fresh.body.supported === true &&
        leftover.length === 0,
    );
    const runtimeStatus = await fetch(
      `${RUNTIME}/api/product-face/v1/operations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tig-product-face-application": WARRANTY_APP,
        },
        body: JSON.stringify({
          operation: "write.status",
          operationId: evidenceOp,
          target,
          input: { original_operation: "case.evidence.submit" },
          assertion: "none",
        }),
      },
    );
    console.log(
      `info direct write.status without a wallet assertion: ${runtimeStatus.status} ${(await runtimeStatus.json()).status}`,
    );
  }
}

console.log(
  failures === 0 ? "PROBE PASSED" : `PROBE: ${failures} failing step(s)`,
);
process.exitCode = failures === 0 ? 0 : 1;
